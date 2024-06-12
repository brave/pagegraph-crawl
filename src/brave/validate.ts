import * as fsLib from 'fs'
import * as osLib from 'os'
import * as pathLib from 'path'
import * as urlLib from 'url'

import * as hasBinLib from 'hasbin'

import { getLoggerForLevel } from './debug.js'

const isUrl = (possibleUrl: string): boolean => {
  try {
    (new urlLib.URL(possibleUrl))  // eslint-disable-line
    return true
  } catch (_) {
    return false
  }
}

export const isFile = (path: string): boolean => {
  return fsLib.existsSync(path) && fsLib.lstatSync(path).isFile()
}

export const isDir = (path: string): boolean => {
  if (!fsLib.existsSync(path)) {
    return false
  }

  const pathStats = fsLib.lstatSync(path)
  if (pathStats.isDirectory()) {
    return true
  }

  if (pathStats.isSymbolicLink()) {
    return isDir(pathLib.join(path, pathLib.sep))
  }

  return false
}

const guessBinary = (): string | boolean => {
  // If we're on MacOS, first see if there is a version of Brave
  // we can use in the typical locations.  Prefer Brave nightly, and then Brave
  // stable.
  if (osLib.type() === 'Darwin') {
    const possibleBraveBinaryPaths = [
      '/Applications/Brave Browser Nightly.app/Contents/MacOS/Brave Browser Nightly',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    ]
    for (const aPossibleBinaryPath of possibleBraveBinaryPaths) {
      if (isFile(aPossibleBinaryPath)) {
        return aPossibleBinaryPath
      }
    }
  }

  // Otherwise, see if we can find a Brave binary in the path
  const possibleBraveBinaryNames = ['brave-browser-nightly',
    'brave-browser-beta', 'brave-browser-stable', 'brave-browser']
  const firstBraveBinary = hasBinLib.first.sync(possibleBraveBinaryNames)
  if (firstBraveBinary === false) {
    return false
  }
  return firstBraveBinary
}

export const validate = (rawArgs: any): ValidationResult => {
  const logger = getLoggerForLevel(rawArgs.debug)
  logger.debug('Received arguments: ', rawArgs)

  let executablePath: FilePath | undefined

  if (rawArgs.binary === null || rawArgs.binary === undefined) {
    const possibleBinary = guessBinary()
    if (possibleBinary === false) {
      return [false, 'No binary specified, and could not guess one']
    }
    executablePath = possibleBinary as FilePath
  } else {
    if (!isFile(rawArgs.binary)) {
      return [false, `Invalid path to Brave binary: ${rawArgs.binary}`]
    }
    executablePath = rawArgs.binary
  }

  // The output path either needs to be a directory, or a filename in
  // an existing directory.
  if (!isDir(rawArgs.output)) {
    const outputPathParts = pathLib.parse(rawArgs.output)
    if (!isDir(outputPathParts.dir)) {
      return [false, `Invalid path to write results to: ${rawArgs.output}`]
    }
  }
  const outputPath: FilePath = rawArgs.output

  const passedUrlArgs: string[] = rawArgs.url
  if (!passedUrlArgs.every(isUrl)) {
    return [false, `Found invalid URL: ${passedUrlArgs.join(', ')}`]
  }
  const urls: Url[] = passedUrlArgs
  const secs: number = rawArgs.secs
  const recursiveDepth: number = rawArgs.recursive_depth
  const interactive: boolean = rawArgs.interactive
  const userAgent: string | undefined = rawArgs.user_agent
  const crawlDuplicates: boolean = rawArgs.crawl_duplicates
  const screenshot: boolean = rawArgs.screenshot
  const validatedArgs: CrawlArgs = {
    executablePath: String(executablePath),
    outputPath,
    urls,
    recursiveDepth,
    seconds: secs,
    withShieldsUp: (rawArgs.shields === 'up'),
    debugLevel: rawArgs.debug,
    existingProfilePath: undefined,
    persistProfilePath: undefined,
    extensionsPath: undefined,
    interactive,
    userAgent,
    crawlDuplicates,
    screenshot
  }

  if (rawArgs.proxy_server) {
    try {
      validatedArgs.proxyServer = new URL(rawArgs.proxy_server)
    } catch (err) {
      return [false, `invalid proxy-server: ${err.toString()}`]
    }
  }

  if (rawArgs.extra_args) {
    try {
      validatedArgs.extraArgs = JSON.parse(rawArgs.extra_args)
    } catch (err) {
      return [false, `invalid JSON array of extra-args: ${err.toString()}`]
    }
  }

  if (rawArgs.existing_profile && rawArgs.persist_profile) {
    return [false, 'Cannot specify both that you want to use an existing ' +
                   'profile, and that you want to persist a new profile.']
  }

  if (rawArgs.existing_profile) {
    if (!isDir(rawArgs.existing_profile)) {
      return [false, 'Provided existing profile path is not a directory: ' +
                     `${rawArgs.existing_profile}.`]
    }
    validatedArgs.existingProfilePath = rawArgs.existing_profile
  }

  if (rawArgs.persist_profile) {
    if (isDir(rawArgs.persist_profile) || isFile(rawArgs.persist_profile)) {
      return [false, 'File already exists at path for persisting a ' +
                     `profile: ${rawArgs.persist_profile}.`]
    }
    validatedArgs.persistProfilePath = rawArgs.persist_profile
  }

  if (rawArgs.extensions_path) {
    if (!isDir(rawArgs.extensions_path)) {
      return [false, 'Provided extensions path is not a directory: ' +
                     `${rawArgs.extensions_path}.`]
    }
    validatedArgs.extensionsPath = rawArgs.extensions_path
  }

  logger.debug('Running with settings: ', validatedArgs)
  return [true, Object.freeze(validatedArgs)]
}
