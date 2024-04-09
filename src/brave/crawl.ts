'use strict'

import * as osLib from 'os'

import fsExtraLib from 'fs-extra'
import pathLib from 'path'
import Xvbf from 'xvfb'

import { getLogger } from './debug.js'
import { puppeteerConfigForArgs, launchWithRetry } from './puppeteer.js'
import { isDir } from './validate.js'

const xvfbPlatforms = new Set(['linux', 'openbsd'])

const setupEnv = (args: CrawlArgs): EnvHandle => {
  const logger = getLogger(args)
  const platformName = osLib.platform()

  let closeFunc

  if (args.interactive) {
    logger.debug('Interactive mode, skipping Xvfb')
    closeFunc = () => { }
  } else if (xvfbPlatforms.has(platformName)) {
    logger.debug(`Running on ${platformName}, starting Xvfb`)
    const xvfbHandle = new Xvbf({
      // ensure 24-bit color depth or rendering might choke
      xvfb_args: ['-screen', '0', '1024x768x24']
    })
    xvfbHandle.startSync()
    closeFunc = () => {
      logger.debug('Tearing down Xvfb')
      xvfbHandle.stopSync()
    }
  } else {
    logger.debug(`Running on ${platformName}, Xvfb not supported`)
    closeFunc = () => {}
  }

  return {
    close: closeFunc
  }
}

async function generatePageGraph (seconds: number, page: any, client: any, logger: Logger) {
  const waitTimeMs = seconds * 1000
  logger.debug(`Waiting for ${waitTimeMs}ms`)
  await page.waitFor(waitTimeMs)
  logger.debug('calling generatePageGraph')
  const response = await client.send('Page.generatePageGraph')
  logger.debug(`generatePageGraph { size: ${response.data.length} }`)
  return response
}

function createFilename (url: Url): FilePath {
  return `page_graph_${url?.replace(/[^\w]/g, '_')}_${Math.floor(Date.now() / 1000)}.graphml`
}

function createGraphMLPath (args: CrawlArgs, url: Url): FilePath {
  return isDir(args.outputPath)
    ? pathLib.join(args.outputPath, createFilename(url))
    : args.outputPath
}

function createScreenshotPath (args: CrawlArgs, url: Url): FilePath {
  const outputPath = createGraphMLPath(args, url)
  const pathParts = pathLib.parse(outputPath)
  return pathParts.dir + '/' + pathParts.name + '.png'
}

function writeGraphML (args: CrawlArgs, url: Url, response: any, logger: Logger) {
  const outputFilename = createGraphMLPath(args, url)
  fsExtraLib.writeFile(outputFilename, response.data).catch((err: Error) => {
    logger.debug('ERROR saving Page.generatePageGraph output:', err)
  })
}

export const doCrawl = async (args: CrawlArgs, redirectChain: Url[] = []): Promise<void> => {
  const logger = getLogger(args)
  const url: Url = args.urls[0]
  const depth = args.recursiveDepth || 1
  let randomChildUrl: Url = null
  let redirectedUrl: Url = null
  redirectChain = url && !redirectChain.includes(url) ? [...redirectChain, new URL(url)?.pathname === '/' && !url.endsWith('/') ? url + '/' : url] : redirectChain

  const { puppeteerArgs, pathForProfile, shouldClean } = puppeteerConfigForArgs(args)

  const envHandle = setupEnv(args)

  try {
    logger.debug('Launching puppeteer with args: ', puppeteerArgs)
    const browser = await launchWithRetry(puppeteerArgs, logger)
    try {
      // create new page, update UA if needed, navigate to target URL, and wait for idle time
      const page = await browser.newPage()
      const client = await page.target().createCDPSession()
      client.on('Target.targetCrashed', (event: TargetCrashedEvent) => {
        logger.debug(`ERROR Target.targetCrashed { targetId: ${event.targetId}, status: "${event.status}", errorCode: ${event.errorCode} }`)
        throw new Error(event.status)
      })

      if (args.userAgent) {
        await page.setUserAgent(args.userAgent)
      }

      await page.setRequestInterception(true)
      // First load is not a navigation redirect, so we need to skip it.
      let firstLoad: boolean = true
      page.on('request', async (request: any) => {
        // Only capture parent frame navigation requests.
        logger.verbose(`Request intercepted: ${request.url()}, first load: ${firstLoad}`)
        if (!firstLoad && request.isNavigationRequest() && request.frame() !== null && request.frame().parentFrame() === null) {
          logger.debug('Page is redirecting...')

          if (args.crawlDuplicates || !redirectChain.includes(request.url())) {
            redirectedUrl = request.url()
            // Add the redirected URL to the redirection chain
            redirectChain.push(redirectedUrl)
          }
          // Stop page load
          logger.debug(`Stopping page load of ${url}`)
          await page._client.send('Page.stopLoading')
        }
        firstLoad = false
        request.continue()
      })

      logger.debug(`Navigating to ${url}`)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      logger.debug(`Loaded ${url}`)
      const response = await generatePageGraph(args.seconds, page, client, logger)
      writeGraphML(args, url, response, logger)
      if (depth > 1) {
        randomChildUrl = await getRandomLinkFromPage(page, logger)
      }
      logger.debug('Closing page')

      if (args.screenshot) {
        const screenshotPath = createScreenshotPath(args, url)
        logger.debug(`About to write screenshot to ${screenshotPath}`)
        await page.screenshot({ type: 'png', path: screenshotPath })
        logger.debug('Screenshot recorded')
      }
      await page.close()
    } catch (err) {
      logger.debug('ERROR runtime fiasco from browser/page:', err)
    } finally {
      logger.debug('Closing the browser')
      await browser.close()
    }
  } catch (err) {
    logger.debug('ERROR runtime fiasco from infrastructure:', err)
  } finally {
    envHandle.close()
    if (shouldClean) {
      fsExtraLib.remove(pathForProfile)
    }
  }
  if (redirectedUrl) {
    const newArgs = { ...args }
    newArgs.urls = [redirectedUrl]
    logger.debug(`Doing new crawl with redirected URL: ${redirectedUrl}`)
    await doCrawl(newArgs, redirectChain)
  }
  if (randomChildUrl) {
    const newArgs = { ...args }
    newArgs.urls = [randomChildUrl]
    newArgs.recursiveDepth = depth - 1
    await doCrawl(newArgs, redirectChain)
  }
}

const getRandomLinkFromPage = async (page: any, logger: Logger): Promise<Url> /* puppeteer Page */ => {
  let rawLinks
  try {
    rawLinks = await page.$$('a[href]')
  } catch (e) {
    logger.debug(`Unable to look for child links, page closed: ${e.toString()}`)
    return null
  }
  const links = []
  for (const link of rawLinks) {
    const hrefHandle = await link.getProperty('href')
    const hrefValue = await hrefHandle.jsonValue()
    try {
      const hrefUrl = new URL(hrefValue.trim())
      hrefUrl.hash = ''
      hrefUrl.search = ''
      if (hrefUrl.protocol !== 'http:' && hrefUrl.protocol !== 'https:') {
        continue
      }
      const childUrlString = hrefUrl.toString()
      if (!childUrlString || childUrlString.length === 0) {
        continue
      }
      links.push(childUrlString)
    } catch (_) {
      continue
    }
  }
  // https://stackoverflow.com/a/4550514
  const randomLink = links[Math.floor(Math.random() * links.length)]
  return randomLink
}
