#!/usr/bin/env node

import { ArgumentParser } from 'argparse'

import { doCrawl } from './brave/crawl.js'
import { validate } from './brave/validate.js'

const defaultCrawlSecs = 30
const defaultShieldsSetting = 'down'
const defaultLoggingSetting = 'info'

const parser = new ArgumentParser({
  add_help: true,
  description: 'CLI tool for crawling and recording websites with PageGraph',
})
parser.add_argument('-v', '--version', {
  action: 'version',
  version: '0.3',
})
parser.add_argument('-b', '--binary', {
  help: 'Path to the PageGraph enabled build of Brave. If not provided, '
    + 'try to guess where the binary is, or if its in $PATH',
})
parser.add_argument('-r', '--recursive-depth', {
  default: 1,
  help: 'If provided, choose a link at random on page and do another crawl '
    + 'to this depth. Default: 1 (no recursion).',
})
parser.add_argument('-o', '--output', {
  help: 'Path to write to. If a directory is provided, then results are '
    + 'written to a file in that directory. If a full path is given, '
    + 'then results are written to that path.',
  required: true,
})
parser.add_argument('-u', '--url', {
  help: 'The URLs to record.',
  required: true,
})
parser.add_argument('-e', '--existing-profile', {
  help: 'The chromium profile to use when crawling. Cannot '
    + 'be used with "--persist-profile"',
})
parser.add_argument('-p', '--persist-profile', {
  help: 'If provided, the user profile will be saved at this path. Cannot '
    + 'be used with "--existing-profile"',
  default: false,
  action: 'store_true',
})
parser.add_argument('--extensions-path', {
  help: 'If provided, start browser with the provided extensions installed.',
  default: undefined,
})
parser.add_argument('-s', '--shields', {
  help: 'Whether to measure with shields up or down. Ignored when using '
    + `"--existing-profile".  Default: ${defaultShieldsSetting}`,
  choices: ['up', 'down'],
  default: defaultShieldsSetting,
})
parser.add_argument('-t', '--secs', {
  help: `The dwell time in seconds. Defaults: ${defaultCrawlSecs} sec.`,
  type: 'int',
  default: defaultCrawlSecs,
})
parser.add_argument('--logging', {
  help: `Logging level. Default: ${defaultLoggingSetting}.`,
  choices: ['none', 'info', 'verbose'],
  default: defaultLoggingSetting,
})
parser.add_argument('-i', '--interactive', {
  help: 'Suppress use of Xvfb to allow interaction with spawned '
    + 'browser instance',
  action: 'store_true',
  default: false,
})
parser.add_argument('-a', '--user-agent', {
  help: 'Override the browser\'s UserAgent string to USER_AGENT',
  metavar: 'USER_AGENT',
})
parser.add_argument('--proxy-server', {
  help: 'Use an HTTP/SOCKS proxy at URL for all navigations',
  metavar: 'URL',
})
parser.add_argument('-x', '--extra-args', {
  help: 'Pass JSON_ARRAY as extra CLI argument to the browser '
    + 'instance launched.',
  metavar: 'JSON_ARRAY',
})
parser.add_argument('-c', '--crawl-duplicates', {
  help: 'Enable crawls for redirected URLs that are already present in '
    + 'the redirection chain.',
  action: 'store_true',
  default: false,
})
parser.add_argument('--screenshot', {
  help: 'Record a screenshot of the page at the end of the crawl.',
  action: 'store_true',
  dest: 'screenshot',
  default: false,
})
// parser.add_argument('--no-stealth', {
//   help: 'Do not enable the "puppeteer-extra-plugin-stealth" extension.',
//   default: false,
//   action: 'store_true',
// })

const rawArgs = parser.parse_args()
const [isValid, errorOrArgs] = validate(rawArgs)
if (!isValid) {
  console.error('Invalid arguments!\n\n')
  console.error(errorOrArgs)
  process.exit(1)
}

const crawlArgs = errorOrArgs as CrawlArgs
await (async () => {
  await doCrawl(crawlArgs, [])
})()
