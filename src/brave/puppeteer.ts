import * as pathLib from 'path'

import fsExtraLib from 'fs-extra'
import tmpLib from 'tmp'
import puppeteerLib from 'puppeteer-core'

import { getLogger } from './debug.js'

const profilePathForArgs = (args: CrawlArgs): { path: FilePath, shouldClean: boolean } => {
  const logger = getLogger(args)

  // The easiest case is if we've been told to use an existing profile.
  // In this case, just return the given path.
  if (args.existingProfilePath) {
    logger.debug(`Crawling with profile at ${args.existingProfilePath}.`)
    return { path: args.existingProfilePath, shouldClean: false }
  }

  // Next, figure out which existing profile we're going to use as the
  // template / starter profile for the new crawl.
  const resourcesDirPath = pathLib.join(process.cwd(), 'resources')
  const templateProfile = args.withShieldsUp
    ? pathLib.join(resourcesDirPath, 'shields-up-profile')
    : pathLib.join(resourcesDirPath, 'shields-down-profile')

  // Finally, either copy the above profile to the destination path
  // that was specified, or figure out a temporary location for it.
  const destProfilePath = args.persistProfilePath
    ? args.persistProfilePath
    : tmpLib.dirSync({ prefix: 'pagegraph-profile-' }).name

  const shouldClean = !args.persistProfilePath

  fsExtraLib.copySync(templateProfile, destProfilePath)
  logger.debug(`Crawling with profile at ${destProfilePath}.`)
  return { path: destProfilePath, shouldClean }
}

export const puppeteerConfigForArgs = (args: CrawlArgs): any => {
  const { path: pathForProfile, shouldClean } = profilePathForArgs(args)

  process.env.PAGEGRAPH_OUT_DIR = args.outputPath

  const puppeteerArgs = {
    defaultViewport: null,
    args: [
      '--disable-brave-update',
      '--user-data-dir=' + pathForProfile,
      '--disable-site-isolation-trials',
      '--enable-features=PageGraph'
    ],
    executablePath: args.executablePath,
    ignoreDefaultArgs: [
      '--disable-sync'
    ],
    dumpio: args.debugLevel !== 'none',
    headless: false
  }

  if (args.debugLevel === 'debug') {
    puppeteerArgs.args.push('--enable-logging=stderr')
    puppeteerArgs.args.push('--vmodule=page_graph*=1')
  } else if (args.debugLevel === 'verbose') {
    puppeteerArgs.args.push('--enable-logging=stderr')
    puppeteerArgs.args.push('--vmodule=page_graph*=2')
  }

  if (args.proxyServer) {
    puppeteerArgs.args.push(`--proxy-server=${args.proxyServer.toString()}`)
    if (args.proxyServer.protocol === 'socks5') {
      puppeteerArgs.args.push(`--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${args.proxyServer.hostname}`)
    }
  }

  if (args.extraArgs) {
    puppeteerArgs.args.push(...args.extraArgs)
  }

  return { puppeteerArgs, pathForProfile, shouldClean }
}

const asyncSleep = (millis: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, millis))
}

export const launchWithRetry = async (puppeteerArgs: any, logger: Logger, options?: LaunchRetryOptions): Promise<any> /* puppeteer Browser */ => {
  // default to 3 retries with a base-2 exponential-backoff delay between each retry (1s, 2s, 4s, ...)
  const {
    retries = 3,
    computeTimeout = (tryIndex: number) => Math.pow(2, tryIndex - 1) * 1000
  } = options || {}

  try {
    return await puppeteerLib.launch(puppeteerArgs)
  } catch (err) {
    logger.debug(`Failed to launch browser (${err}): ${retries} left...`)
  }

  for (let i = 1; i <= retries; ++i) {
    await asyncSleep(computeTimeout(i))
    try {
      return await puppeteerLib.launch(puppeteerArgs)
    } catch (err) {
      logger.debug(`Failed to launch browser (${err}): ${retries - i} left...`)
    }
  }

  throw new Error(`Unable to launch browser after ${retries} retries!`)
}
