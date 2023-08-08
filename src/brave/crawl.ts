'use strict'

import * as osLib from 'os'

import fsExtraLib from 'fs-extra'
import pathLib from 'path'
import Xvbf from 'xvfb'

import { getLogger } from './debug.js'
import { puppeteerConfigForArgs, launchWithRetry } from './puppeteer.js'

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

export const writeGraphsForCrawl = async (args: CrawlArgs): Promise<void> => {
  const logger = getLogger(args)
  const url: Url = args.urls[0]
  const depth = args.recursiveDepth || 1
  let randomChildUrl: Url = null

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

      logger.debug(`Navigating to ${url}`)
      await page.goto(url, { waitUntil: 'domcontentloaded' })

      const waitTimeMs = args.seconds * 1000
      logger.debug(`Waiting for ${waitTimeMs}ms`)
      await page.waitFor(waitTimeMs)

      logger.debug('calling generatePageGraph')
      const response = await client.send('Page.generatePageGraph')
      logger.debug(`generatePageGraph { size: ${response.data.length} }`)
      const outputFilename = pathLib.join(
        args.outputPath,
        `page_graph_${url?.replace(/[^\w]/g, '_')}_${Math.floor(
          Date.now() / 1000
        )}.graphml`
      )
      fsExtraLib.writeFile(outputFilename, response.data).catch((err: Error) => {
        logger.debug('ERROR saving Page.generatePageGraph output:', err)
      })
      if (depth > 1) {
        randomChildUrl = await getRandomLinkFromPage(page, logger)
      }
      logger.debug('Closing page')
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
  if (randomChildUrl) {
    const newArgs = { ...args }
    newArgs.urls = [randomChildUrl]
    newArgs.recursiveDepth = depth - 1
    await writeGraphsForCrawl(newArgs)
  }
}

const getRandomLinkFromPage = async (page: any, logger: Logger) : Promise<Url> /* puppeteer Page */ => {
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
