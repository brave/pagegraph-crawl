declare module 'fs-extra'
declare module 'puppeteer-core'
declare module 'xvfb'
declare module 'tmp'
declare module 'argparse'

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

type ValidationResult = [boolean, CrawlArgs | ErrorMsg]

interface LoggerFunc {
  (message?: string, ...optional: any[]): void;
}
