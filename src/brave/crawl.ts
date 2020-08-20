'use strict'

import * as osLib from 'os'

import fsExtraLib from 'fs-extra'
import pathLib from 'path'
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

const isSessionClosedError = (error: Error): boolean => {
  return error.message.indexOf('Session closed. Most likely the page has been closed.') >= 0
}

export const writeGraphsForCrawl = async (args: CrawlArgs): Promise<void> => {
  const logger = getLogger(args)
  const url: Url = args.urls[0]

  const { puppeteerArgs, pathForProfile, shouldClean } = puppeteerConfigForArgs(args)

  const envHandle = setupEnv(args)

  try {
    logger.debug('Launching puppeteer with args: ', puppeteerArgs)
    const browser = await puppeteerLib.launch(puppeteerArgs)
    try {
      // turn target-crashed events (e.g., a page or remote iframe crashed) into crawl-fatal errors
      const bcdp = await browser.target().createCDPSession()
      bcdp.on('Target.targetCrashed', (event: TargetCrashedEvent) => {
        logger.debug(`ERROR Target.targetCrashed { targetId: ${event.targetId}, status: "${event.status}", errorCode: ${event.errorCode} }`)
        throw new Error(event.status)
      })

      // track frame IDs to provide sequence numbers (root frame IDs last longer than individual documents)
      const frameCounts = Object.create(null)
      const nextFrameSeq = (frameId: string) => {
        const seqNum = frameCounts[frameId] = (frameId in frameCounts ? frameCounts[frameId] : -1) + 1
        return seqNum
      }

      // track the creation/destruction of page targets and listen for PG data events on each new page
      const pageMap = new Map()
      browser.on('targetcreated', async (target: any) => {
        if (target.type() === 'page') {
          const page = await target.page()
          pageMap.set(target, page)
          page.on('error', (err: Error) => {
            throw err
          })

          // On PG data event, write to frame-id-tagged GraphML file in output directory
          const client = await target.createCDPSession()
          client.on('Page.finalPageGraph', (event: FinalPageGraphEvent) => {
            logger.debug(`finalpageGraph { frameId: ${event.frameId}, size: ${event.data.length}}`)
            const seqNum = nextFrameSeq(event.frameId)
            const outputFilename = pathLib.join(args.outputPath, `page_graph_${event.frameId}.${seqNum}.graphml`)
            fsExtraLib.writeFile(outputFilename, event.data).catch((err: Error) => {
              console.error('ERROR saving Page.finalPageGraph output:', err)
            })
          })
        }
      })
      browser.on('targetdestroyed', async (target: any) => {
        if (target.type() === 'page') {
          pageMap.delete(target)
        }
      })

      // create new page, update UA if needed, navigate to target URL, and wait for idle time
      const page = await browser.newPage()

      if (args.userAgent) {
        await page.setUserAgent(args.userAgent)
      }

      logger.debug(`Navigating to ${url}`)
      await page.goto(url)

      const waitTimeMs = args.seconds * 1000
      logger.debug(`Waiting for ${waitTimeMs}ms`)
      await page.waitFor(waitTimeMs)

      // tear down by navigating all open pages to about:blank (to force PG data flushes)
      try {
        await Promise.all(Array.from(pageMap.values()).map((page: any /* puppeteer Page */) => page.goto('about:blank')))
      } catch (error) {
        if (isSessionClosedError(error)) {
          logger.debug('WARNING: session dropped (page unexpectedly closed?)')
        // EAT IT and carry on
        } else if (isNotHTMLPageGraphError(error)) {
          logger.debug('WARNING: was not able to fetch PageGraph data from target')
        // EAT IT and carry on
        } else {
          logger.debug('ERROR flushing PageGraph data:', error)
          throw error
        }
      }
      await page.close()
    } catch (err) {
      console.error('ERROR runtime fiasco from browser/page:', err)
    } finally {
      logger.debug('Closing the browser')
      await browser.close()
    }
  } catch (err) {
    console.error('ERROR runtime fiasco from infrastructure:', err)
  } finally {
    envHandle.close()

    if (shouldClean) {
      fsExtraLib.remove(pathForProfile)
    }
  }
}
