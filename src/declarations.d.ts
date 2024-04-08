declare module 'argparse'
declare module 'fs-extra'
declare module 'path'
declare module 'puppeteer-core'
declare module 'tmp'
declare module 'xvfb'

type Url = string | null
type FilePath = string
type ErrorMsg = string
type DebugLevel = 'none' | 'debug' | 'verbose'

interface CrawlArgs {
  executablePath: FilePath
  outputPath: FilePath
  urls: Url[]
  recursiveDepth: number
  withShieldsUp: boolean
  debugLevel: DebugLevel
  seconds: number
  existingProfilePath?: FilePath
  persistProfilePath?: FilePath
  interactive: boolean
  userAgent?: string
  proxyServer?: URL
  extraArgs?: string[]
  crawlDuplicates: boolean
  screenshot: boolean
}

type ValidationResult = [boolean, CrawlArgs | ErrorMsg]

interface LoggerFunc {
  (message?: string, ...optional: any[]): void
}

interface Logger {
  debug: LoggerFunc
  verbose: LoggerFunc
}

interface TearDownEnvFunc {
  (): void
}

interface EnvHandle {
  close: TearDownEnvFunc
}

interface LaunchRetryOptions {
  retries?: number
  computeTimeout?: (tryCount: number) => number
}

interface TargetCrashedEvent {
  targetId: string
  status: string
  errorCode: number
}

interface FinalPageGraphEvent {
  frameId: string
  data: string
}
