declare module 'argparse'
declare module 'puppeteer-core'
declare module 'xvfb'
declare module 'chrome-har'

type FilePath = string
type ErrorMsg = string
type LoggingLevel = 'none' | 'info' | 'verbose'

interface CrawlArgs {
  executablePath: FilePath
  outputPath: FilePath
  url: URL
  recursiveDepth: number
  withShieldsUp: boolean
  loggingLevel: LoggingLevel
  seconds: number
  existingProfilePath?: FilePath
  persistProfilePath?: FilePath
  extensionsPath?: FilePath
  interactive: boolean
  userAgent?: string
  proxyServer?: URL
  extraArgs?: string[]
  crawlDuplicates: boolean
  screenshot: boolean
  stealth: boolean
  storeHar: boolean
  storeHarBody: boolean
  compress: boolean
}

type ValidationResult = [boolean, CrawlArgs | ErrorMsg]

type LoggerFunc = (...message: any[]) => void

interface Logger {
  error: LoggerFunc
  info: LoggerFunc
  verbose: LoggerFunc
}

type TearDownEnvFunc = () => void

interface EnvHandle {
  close: TearDownEnvFunc
}

interface LaunchRetryOptions {
  retries: number
  computeTimeout: (tryCount: number) => number
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

interface PuppeteerConfig {
  launchOptions: LaunchOptions
  profilePath: FilePath
  shouldClean: boolean
  shouldStealthMode: boolean
}

type RunPuppeteerFunc = (options: LaunchOptionsType) => Promise<ProcessType>
