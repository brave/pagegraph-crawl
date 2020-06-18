'use strict'

const fsLib = require('fs')
const urlLib = require('url')

type Url = string
type FilePath = string
type ErrorMsg = string

interface CrawlArgs {
  executablePath: FilePath,
  outputPath: FilePath,
  urls: Url[],
  withShieldsUp: boolean,
  verbose: boolean,
  seconds: number,
  existingProfilePath?: FilePath,
  persistProfilePath?: FilePath
}

const isUrl = (possibleUrl: string): boolean => {
  try {
    (new urlLib.URL(possibleUrl))  // eslint-disable-line
    return true
  } catch (_) {
    return false
  }
}

const isFile = (path: string): boolean => {
  return fsLib.existsSync(path) && fsLib.lstatSync(path).isFile()
}

const isDir = (path: string): boolean => {
  return fsLib.existsSync(path) && fsLib.lstatSync(path).isDirectory()
}

const validate = (rawArgs: any): [boolean, CrawlArgs | ErrorMsg] => {
  if (!isFile(rawArgs.binary)) {
    return [false, `invalid path to Brave binary: ${rawArgs.binary}`]
  }
  const executablePath: FilePath = rawArgs.binary

  if (!isDir(rawArgs.output)) {
    return [false, `invalid path to write results to: ${rawArgs.output}`]
  }
  const outputPath: FilePath = rawArgs.output

  const passedUrlArgs: string[] = rawArgs.url
  if (!passedUrlArgs.every(isUrl)) {
    return [false, `found invalid URL: ${passedUrlArgs.join(', ')}`]
  }
  const urls: Url[] = passedUrlArgs
  const secs: number = rawArgs.secs

  const validatedArgs = {
    executablePath,
    outputPath,
    urls,
    seconds: secs,
    withShieldsUp: (rawArgs.shields === 'up'),
    verbose: rawArgs.verbose,
    existingProfilePath: undefined,
    persistProfilePath: undefined
  }

  if (rawArgs.existingProfilePath && rawArgs.persistProfilePath) {
    return [false, 'Cannot specify both that you want to use an existing ' +
                   'profile, and that you want to persist a new profile.']
  }

  if (rawArgs.existingProfile) {
    if (!isDir(rawArgs.existingProfile)) {
      return [false, 'Provided existing profile path is not a directory']
    }
    validatedArgs.existingProfilePath = rawArgs.existingProfile
  }

  if (rawArgs.persistProfilePath) {
    if (isDir(rawArgs.persistProfilePath) || isFile(rawArgs.persistProfilePath)) {
      return [false, 'File already exists at path given for persisting a profile.']
    }
    validatedArgs.persistProfilePath = rawArgs.persistProfilePath
  }

  return [true, Object.freeze(validatedArgs)]
}

module.exports = {
  validate
}
