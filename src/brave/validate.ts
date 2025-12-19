import * as fsLib from 'fs'
import * as osLib from 'os'
import * as pathLib from 'path'

import which from 'which'

import { asHTTPUrl, isDir, isExecFile } from './checks.js'
import { getLoggerForLevel } from './logging.js'

const possibleBraveBinaryPaths = [
  '/Applications/Brave Browser Nightly.app/Contents/MacOS/Brave Browser Nightly',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
]

const guessBinary = (): string | boolean => {
  // If we're on MacOS, first see if there is a version of Brave
  // we can use in the typical locations.  Prefer Brave nightly, and then Brave
  // stable.
  if (osLib.type() === 'Darwin') {
    for (const aPossibleBinaryPath of possibleBraveBinaryPaths) {
      if (isExecFile(aPossibleBinaryPath)) {
        return aPossibleBinaryPath
      }
    }
  }

  // Otherwise, see if we can find a Brave binary in the path
  const possibleBraveBinaryNames = [
    'brave-browser-nightly',
    'brave-browser-beta',
    'brave-browser-stable',
    'brave-browser',
  ]
  for (const aBinaryName of possibleBraveBinaryNames) {
    const binaryPath = which.sync(aBinaryName, { nothrow: true })
    if (binaryPath) {
      return binaryPath
    }
  }
  return false
}

export const validate = (rawArgs: any): ValidationResult => {  // eslint-disable-line
  const logger = getLoggerForLevel(rawArgs.logging)
  logger.info('Received arguments: ', rawArgs)

  let executablePath: FilePath | undefined

  if (rawArgs.binary === null || rawArgs.binary === undefined) {
    const possibleBinary = guessBinary()
    if (possibleBinary === false) {
      return [false, 'No binary specified, and could not guess one']
    }
    executablePath = possibleBinary as FilePath
  }
  else {
    if (!isExecFile(rawArgs.binary)) {
      return [false, `Invalid path to Brave binary: ${String(rawArgs.binary)}`]
    }
    executablePath = rawArgs.binary
  }

  // The output path either needs to be a directory, or a filename in
  // an existing directory.
  if (!isDir(rawArgs.output)) {
    const outputPathParts = pathLib.parse(rawArgs.output)
    if (!isDir(outputPathParts.dir)) {
      try {
        const logMsg = [
          'Output path: ',
          rawArgs.output,
          ' does not exist. Creating directory.',
        ]
        logger.info(logMsg)
        fsLib.mkdirSync(rawArgs.output)
      }
      catch (e) {
        return [
          false,
          'Invalid path to write results to; unable to create the directory:\n'
          + String(e)]
      }
    }
  }
  const outputPath: FilePath = rawArgs.output

  const passedUrl = asHTTPUrl(rawArgs.url)
  if (passedUrl === undefined) {
    return [false, `Found invalid URL: ${String(passedUrl)}`]
  }
  const url: URL = passedUrl
  const secs: number = rawArgs.secs
  const recursiveDepth: number = rawArgs.recursive_depth
  const interactive: boolean = rawArgs.interactive
  const userAgent: string | undefined = rawArgs.user_agent
  const crawlDuplicates: boolean = rawArgs.crawl_duplicates
  const screenshot: boolean = rawArgs.screenshot
  const storeHar: boolean = rawArgs.store_har
  const storeHarBody: boolean = rawArgs.store_har_body
  const compress: boolean = rawArgs.compress
  const validatedArgs: CrawlArgs = {
    executablePath: String(executablePath),
    outputPath,
    url,
    recursiveDepth,
    seconds: secs,
    withShieldsUp: (rawArgs.shields === 'up'),
    loggingLevel: rawArgs.logging,
    existingUserDataDirPath: undefined,
    persistUserDataDirPath: undefined,
    extensionsPath: undefined,
    stealth: false,
    saveRequestHeaders: true,
    interactive,
    userAgent,
    crawlDuplicates,
    screenshot,
    storeHar,
    storeHarBody,
    compress,
  }

  if (rawArgs.proxy_server !== undefined) {
    try {
      validatedArgs.proxyServer = new URL(rawArgs.proxy_server)
    }
    catch (err) {
      return [false, `invalid proxy-server: ${String(err)}`]
    }
  }

  if (rawArgs.extra_args !== undefined) {
    try {
      validatedArgs.extraArgs = JSON.parse(rawArgs.extra_args)
    }
    catch (err) {
      return [false, `invalid JSON array of extra-args: ${String(err)}`]
    }
  }

  const isPersistUserDataDir = rawArgs.persist_user_data_dir === true
  if (rawArgs.existing_user_data_dir === undefined && isPersistUserDataDir) {
    return [
      false,
      'Cannot specify both that you want to use an existing user data dir, '
      + 'and that you want to persist a new user data dir.',
    ]
  }

  if (rawArgs.existing_user_data_dir !== undefined) {
    if (!isDir(rawArgs.existing_user_data_dir)) {
      return [
        false,
        'Provided existing profile path is not a directory: '
        + String(rawArgs.existing_user_data_dir),
      ]
    }
    validatedArgs.existingUserDataDirPath = rawArgs.existing_user_data_dir
  }

  if (rawArgs.persist_user_data_dir === true) {
    const userDataPathIsDir = isDir(rawArgs.persist_user_data_dir)
    const userDataPathIsExec = isExecFile(rawArgs.persist_user_data_dir)
    if (userDataPathIsDir || userDataPathIsExec) {
      return [false, 'File already exists at path for persisting a '
        + `profile: ${String(rawArgs.persist_user_data_dir)}.`]
    }
    validatedArgs.persistUserDataDirPath = rawArgs.persist_user_data_dir
  }

  if (rawArgs.extensions_path !== undefined) {
    if (!isDir(rawArgs.extensions_path)) {
      return [false, 'Provided extensions path is not a directory: '
        + `${String(rawArgs.extensions_path)}.`]
    }
    validatedArgs.extensionsPath = rawArgs.extensions_path
  }

  logger.info('Running with settings: ', JSON.stringify(validatedArgs))
  return [true, Object.freeze(validatedArgs)]
}
