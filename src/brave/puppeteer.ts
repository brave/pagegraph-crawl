import * as pathLib from 'path'

import * as fsExtraLib from 'fs-extra'
import * as tmpLib from 'tmp'

const profilePathForArgs = (args: CrawlArgs): FilePath => {
  // The easiest case is if we've been told to use an existing profile.
  // In this case, just return the given path.
  if (args.existingProfilePath) {
    return args.existingProfilePath
  }

  // Next, figure out which existing profile we're going to use as the
  // template / starter profile for the new crawl.
  const resourcesDirPath = pathLib.join(__dirname, '..', '..', 'resources')
  const templateProfile = args.withShieldsUp
    ? pathLib.join(resourcesDirPath, 'shields-up-profile')
    : pathLib.join(resourcesDirPath, 'shields-down-profile')

  // Finally, either copy the above profile to the destination path
  // that was specified, or figure out a temporary location for it.
  const destProfilePath = args.persistProfilePath
    ? args.persistProfilePath
    : tmpLib.dirSync({ prefix: 'pagegraph-profile-' }).name

  fsExtraLib.copySync(templateProfile, destProfilePath)
  return destProfilePath
}

export const configForArgs = (args: CrawlArgs): any => {
  const pathForProfile = profilePathForArgs(args)

  const puppeteerArgs = {
    args: [
      '--disable-brave-update',
      '--user-data-dir=' + pathForProfile
    ],
    executablePath: args.executablePath,
    ignoreDefaultArgs: [
      '--disable-sync'
    ],
    dumpio: args.verbose,
    headless: false
  }

  if (args.verbose) {
    puppeteerArgs.args.push('--enable-logging')
    puppeteerArgs.args.push('--v=0')
  }
}
