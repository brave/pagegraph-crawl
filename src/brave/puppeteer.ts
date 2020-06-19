import * as pathLib from 'path'

import fsExtraLib from 'fs-extra'
import tmpLib from 'tmp'

import { getLogger } from './debug.js'

const profilePathForArgs = (args: CrawlArgs): FilePath => {
  const logger = getLogger(args)

  // The easiest case is if we've been told to use an existing profile.
  // In this case, just return the given path.
  if (args.existingProfilePath) {
    logger.debug(`Crawling with profile at ${args.existingProfilePath}.`)
    return args.existingProfilePath
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

  fsExtraLib.copySync(templateProfile, destProfilePath)
  logger.debug(`Crawling with profile at ${destProfilePath}.`)
  return destProfilePath
}

export const puppeteerConfigForArgs = (args: CrawlArgs): any => {
  const pathForProfile = profilePathForArgs(args)
  const puppeteerArgs = {
    defaultViewport: null,
    args: [
      '--disable-brave-update',
      '--user-data-dir=' + pathForProfile
    ],
    executablePath: args.executablePath,
    ignoreDefaultArgs: [
      '--disable-sync'
    ],
    dumpio: args.debugLevel === 'verbose',
    headless: false
  }

  if (args.debugLevel === 'verbose') {
    puppeteerArgs.args.push('--enable-logging')
    puppeteerArgs.args.push('--v=0')
  }

  return puppeteerArgs
}
