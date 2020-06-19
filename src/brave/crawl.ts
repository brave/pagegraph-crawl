'use strict'

import * as fsLib from 'fs-extra'
import * as puppeteerLib from 'puppeteer-core'
import * as xvfbLib from 'xvfb'

import { getLogger } from './debug'
import * as bravePuppeteerLib from './puppeteer'

const isNotHTMLPageGraphError = (error: Error): boolean => {
  return error.message.indexOf('No Page Graph for this Document') >= 0
}

export const graphForUrl = async (args: CrawlArgs, url: Url): Promise<string> => {
  const puppeteerArgs = bravePuppeteerLib.configForArgs(args)
  const logger = getLogger(args)

  logger('Creating Xvfb environment')
  xvfbLib.startSync()

  let pageGraphText: string

  try {
    logger('Launching puppeteer with args: ', puppeteerArgs)
    const browser = await puppeteerLib.launch(puppeteerArgs)
    const page = await browser.newPage()

    logger(`Navigating to ${url}`)
    await page.goto(url)

    const waitTimeMs = args.seconds * 1000
    logger(`Waiting for ${waitTimeMs}ms`)
    page.waitFor(waitTimeMs)

    try {
      logger('Requesting PageGraph data')
      const client = await page.target().createCDPSession()
      const pageGraphRs = await client.send('Page.generatePageGraph')
      pageGraphText = pageGraphRs.data
      logger(`Received response of length: ${pageGraphText.length}`)
    } catch (error) {
      if (isNotHTMLPageGraphError(error)) {
        const currentUrl = page.url()
        logger(`Was not able to fetch PageGraph data for ${currentUrl}`)
        throw new Error(`Wrong protocol for ${url}`)
      }

      throw error
    } finally {
      logger('Closing the browser')
      await browser.close()
    }
  } finally {
    logger('Tearing down the Xvbf environment')
    xvfbLib.stopSync()
  }

  return pageGraphText
}

export const writeGraphsForCrawl = async (args: CrawlArgs): Promise<number> => {
  const url: Url = args.urls[0]
  const pageGraphText = graphForUrl(args, url)
  await fsLib.writeFile(args.outputPath, pageGraphText)
  return 1
}
