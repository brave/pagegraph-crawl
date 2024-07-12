import * as osLib from 'os'

import Xvbf from 'xvfb'
import type { CDPSession, HTTPRequest, Page } from 'puppeteer-core'

import { isTopLevelPageNavigation, isTimeoutError } from './checks.js'
import { asHTTPUrl } from './checks.js'
import { createScreenshotPath, writeGraphML, deleteAtPath } from './files.js'
import { getLogger } from './logging.js'
import { makeNavigationTracker } from './navigation_tracker.js'
import { selectRandomChildUrl } from './page.js'
import { puppeteerConfigForArgs, launchWithRetry } from './puppeteer.js'

type CDPSessionType = typeof CDPSession
type HTTPRequestType = typeof HTTPRequest
type PageType = typeof Page
type XvbfType = typeof Xvbf

const xvfbPlatforms = new Set(['linux', 'openbsd'])

const setupEnv = (args: CrawlArgs): EnvHandle => {
  const logger = getLogger(args)
  const platformName = osLib.platform()

  let xvfbHandle: XvbfType | undefined
  const closeFunc = () => {
    if (xvfbHandle !== undefined) {
      logger.info('Tearing down Xvfb')
      xvfbHandle.stopSync()
    }
  }

  if (args.interactive) {
    logger.info('Interactive mode, skipping Xvfb')
  }
  else if (xvfbPlatforms.has(platformName)) {
    logger.info(`Running on ${platformName}, starting Xvfb`)
    xvfbHandle = new Xvbf({
      // ensure 24-bit color depth or rendering might choke
      xvfb_args: ['-screen', '0', '1024x768x24'],
    })
    xvfbHandle.startSync()
  }
  else {
    logger.info(`Running on ${platformName}, Xvfb not supported`)
  }

  return {
    close: closeFunc,
  }
}

// Returns true if returned be of the func, and false if returned by timeout
const waitUntilUnless = (secs: number,
                         unlessFunc: () => boolean,
                         intervalMs = 500): Promise<boolean> => {
  const totalMs = secs * 1000
  const endTime = Date.now() + totalMs
  return new Promise((resolve) => {
    const timerId = setInterval(() => {
      const hasTimePassed = Date.now() > endTime
      const unlessFuncRs = unlessFunc()
      const shouldEnd = hasTimePassed === true || unlessFuncRs === true
      if (shouldEnd === true) {
        clearTimeout(timerId)
        const returnedBcTimeout = hasTimePassed === true
        resolve(returnedBcTimeout)
      }
    }, intervalMs)
  })
}

const generatePageGraph = async (seconds: number,
                                 page: PageType,
                                 client: CDPSessionType,
                                 waitFunc: () => boolean,
                                 // eslint-disable-next-line max-len
                                 logger: Logger): Promise<FinalPageGraphEvent> => {
  logger.info(`Waiting for ${seconds}s`)
  await waitUntilUnless(seconds, waitFunc)

  logger.info('calling generatePageGraph')
  const response = await client.send('Page.generatePageGraph')

  const responseLen = response.data.length
  logger.info('generatePageGraph { size: ', responseLen, ' }')
  return response
}

export const doCrawl = async (args: CrawlArgs,
                              previouslySeenUrls: URL[]): Promise<void> => {
  const logger = getLogger(args)
  const urlToCrawl = asHTTPUrl(args.url) as URL
  logger.info([
    'Starting crawl with URL: ', urlToCrawl,
    ' and with previously seen urls: [', previouslySeenUrls, ']',
  ])

  const navTracker = makeNavigationTracker(urlToCrawl, previouslySeenUrls)
  const depth = Math.max(args.recursiveDepth, 1)
  let randomChildUrl: URL | undefined
  let shouldRedirectToUrl: URL | undefined

  const puppeteerConfig = puppeteerConfigForArgs(args)
  const { launchOptions } = puppeteerConfig
  const envHandle = setupEnv(args)

  let shouldStopWaitingFlag = false
  const shouldStopWaitingFunc = () => {
    return shouldStopWaitingFlag
  }

  try {
    logger.verbose([
      'Launching puppeteer with args: ',
      JSON.stringify(launchOptions),
    ])
    const browser = await launchWithRetry(launchOptions,
                                          puppeteerConfig.shouldStealthMode,
                                          logger)

    const pages = await browser.pages()
    if (pages.length > 0) {
      logger.info('Closing ', pages.length, ' pages that are already open.')
      for (const aPage of pages) {
        logger.info('  - closing tab with url ', aPage.url())
        await aPage.close()
      }
    }

    try {
      // create new page, update UA if needed, navigate to target URL,
      // and wait for idle time.
      const page = await browser.newPage()
      const client = await page.target().createCDPSession()
      client.on('Target.targetCrashed', (event: TargetCrashedEvent) => {
        const logMsg = {
          targetId: event.targetId,
          status: event.status,
          errorCode: event.errorCode,
        }
        logger.error(`Target.targetCrashed ${JSON.stringify(logMsg)}`)
        throw new Error(event.status)
      })

      if (args.userAgent !== undefined) {
        await page.setUserAgent(args.userAgent)
      }

      await page.setRequestInterception(true)
      // First load is not a navigation redirect, so we need to skip it.
      page.on('request', async (request: HTTPRequestType) => {
        // We know the given URL will be a valid URL, bc of the puppeteer API
        const requestedUrl = asHTTPUrl(request.url()) as URL

        // Only capture parent frame navigation requests.
        if (isTopLevelPageNavigation(request) === false) {
          logger.verbose('Allowing request to ', request.url(), ', not ',
                         'a top level navigation.')
          request.continue()
          return
        }

        const hasUrlBeenSeen = navTracker.isInHistory(requestedUrl)
        const isCurrentNavUrl = navTracker.isCurrentUrl(requestedUrl)
        if (isCurrentNavUrl === true) {
          logger.info('Loading ', requestedUrl,
                      ' bc it is the first top frame page load')
          request.continue()
          return
        }

        if (hasUrlBeenSeen === false) {
          logger.info('Detected redirect to ', requestedUrl,
                      ' so stopping page load and moving on')
          shouldRedirectToUrl = requestedUrl
          shouldStopWaitingFlag = true
          await page._client.send('Page.stopLoading')
          request.continue()
          return
        }

        if (args.crawlDuplicates === true) {
          logger.info('Loading ', requestedUrl,
                      ' bc was instructed to crawl duplicates')
          request.continue()
          return
        }

        // Otherwise, we're in a redirect loop, so stop recording
        // the pagegraph, but continue.
        logger.error('Quitting bc we\'re in a redirect loop')
        shouldStopWaitingFlag = true
        await page._client.send('Page.stopLoading')
        request.continue()
        return
      })

      logger.info('Navigating to ', urlToCrawl)
      try {
        await page.goto(urlToCrawl, { waitUntil: 'domcontentloaded' })
      }
      catch (e: unknown) {
        if (isTimeoutError(e) === true) {
          logger.info('Navigation timeout exceeded.')
        }
        else {
          throw e
        }
      }

      logger.info('Loaded ', String(urlToCrawl))
      const response = await generatePageGraph(args.seconds, page, client,
                                               shouldStopWaitingFunc, logger)
      await writeGraphML(args, urlToCrawl, response, logger)
      if (depth > 1) {
        randomChildUrl = await selectRandomChildUrl(page, logger)
      }
      logger.info('Closing page')

      if (args.screenshot) {
        const screenshotPath = createScreenshotPath(args, urlToCrawl)
        logger.info(`About to write screenshot to ${screenshotPath}`)
        await page.screenshot({ type: 'png', path: screenshotPath })
        logger.info('Screenshot recorded')
      }
      await page.close()
    }
    catch (err) {
      logger.info('ERROR runtime fiasco from browser/page:', err)
    }
    finally {
      logger.info('Closing the browser')
      await browser.close()
    }
  }
  catch (err) {
    logger.info('ERROR runtime fiasco from infrastructure:', err)
  }
  finally {
    envHandle.close()
    if (puppeteerConfig.shouldClean === true) {
      await deleteAtPath(puppeteerConfig.profilePath)
    }
  }

  if (shouldRedirectToUrl !== undefined) {
    const newArgs = { ...args }
    newArgs.url = shouldRedirectToUrl
    logger.info('Doing new crawl with redirected URL: ', shouldRedirectToUrl)
    await doCrawl(newArgs, navTracker.toHistory())
    return
  }

  if (randomChildUrl !== undefined) {
    const newArgs = { ...args }
    newArgs.url = randomChildUrl
    newArgs.recursiveDepth = depth - 1
    await doCrawl(newArgs, navTracker.toHistory())
  }
}
