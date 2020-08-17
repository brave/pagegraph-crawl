'use strict'

import * as osLib from 'os'

import fsExtraLib from 'fs-extra'
import puppeteerLib from 'puppeteer-core'
import Xvbf from 'xvfb'

import { getLogger } from './debug.js'
import { puppeteerConfigForArgs } from './puppeteer.js'

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
    const xvfbHandle = new Xvbf()
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

const isNotHTMLPageGraphError = (error: Error): boolean => {
  return error.message.indexOf('No Page Graph for this Document') >= 0
}

export const graphForUrl = async (args: CrawlArgs, url: Url): Promise<string> => {
  const logger = getLogger(args)
  const { puppeteerArgs, pathForProfile, shouldClean } = puppeteerConfigForArgs(args)

  const envHandle = setupEnv(args)
  let pageGraphText: string

  try {
    logger.debug('Launching puppeteer with args: ', puppeteerArgs)
    const browser = await puppeteerLib.launch(puppeteerArgs)
    const page = await browser.newPage()

    if (args.userAgent) {
      await page.setUserAgent(args.userAgent)
    }

    logger.debug(`Navigating to ${url}`)
    await page.goto(url)

    const waitTimeMs = args.seconds * 1000
    logger.debug(`Waiting for ${waitTimeMs}ms`)
    await page.waitFor(waitTimeMs)

    try {
      logger.debug('Requesting PageGraph data')
      const client = await page.target().createCDPSession()
      const pageGraphRs = await client.send('Page.generatePageGraph')
      pageGraphText = pageGraphRs.data
      logger.debug(`Received response of length: ${pageGraphText.length}`)
    } catch (error) {
      if (isNotHTMLPageGraphError(error)) {
        const currentUrl = page.url()
        logger.debug(`Was not able to fetch PageGraph data for ${currentUrl}`)
        throw new Error(`Wrong protocol for ${url}`)
      }

      throw error
    } finally {
      logger.debug('Closing the browser')
      await browser.close()
    }
  } finally {
    envHandle.close()

    if (shouldClean) {
      fsExtraLib.remove(pathForProfile)
    }
  }

  return pageGraphText
}

export const writeGraphsForCrawl = async (args: CrawlArgs): Promise<number> => {
  const logger = getLogger(args)
  const url: Url = args.urls[0]
  const pageGraphText = await graphForUrl(args, url)
  logger.debug(`Writing result to ${args.outputPath}`)
  await fsExtraLib.writeFile(args.outputPath, pageGraphText)
  return 1
}
