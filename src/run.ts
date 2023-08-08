#!/usr/bin/env node

import argparseLib from 'argparse'

import { writeGraphsForCrawl } from './brave/crawl.js'
import { validate } from './brave/validate.js'

const defaultCrawlSecs = 30
const defaultShieldsSetting = 'down'
const defaultDebugSetting = 'none'

const parser = new argparseLib.ArgumentParser({
  version: 0.1,
  addHelp: true,
  description: 'CLI tool for crawling and recording websites with PageGraph'
})
parser.addArgument(['-b', '--binary'], {
  required: true,
  help: 'Path to the PageGraph enabled build of Brave.'
})
parser.addArgument(['-r', '--recursive-depth'], {
  defaultValue: 1,
  help: 'If provided and > 1, choose a link at random on page and do another crawl to this depth.'
})
parser.addArgument(['-o', '--output'], {
  help: 'Path (directory) to write graphs to.',
  required: true
})
parser.addArgument(['-u', '--url'], {
  help: 'The URLs(s) to record, in desired order (currently only crawls the ' +
        'first URL)',
  required: true,
  nargs: '+'
})
parser.addArgument(['-e', '--existing-profile'], {
  help: 'The chromium profile to use when crawling. Cannot ' +
        'be used with "--persist-profile"'
})
parser.addArgument(['-p', '--persist-profile'], {
  help: 'If provided, the user profile will be saved at this path. Cannot ' +
        'be used with "--existing-profile"'
})
parser.addArgument(['-s', '--shields'], {
  help: 'Whether to measure with shields up or down. Ignored when using ' +
        `"--existing-profile".  Default: ${defaultShieldsSetting}`,
  choices: ['up', 'down'],
  defaultValue: defaultShieldsSetting
})
parser.addArgument(['-t', '--secs'], {
  help: `The dwell time in seconds. Defaults: ${defaultCrawlSecs} sec.`,
  type: 'int',
  defaultValue: defaultCrawlSecs
})
parser.addArgument(['--debug'], {
  help: `Print debugging information. Default: ${defaultDebugSetting}.`,
  choices: ['none', 'debug', 'verbose'],
  defaultValue: defaultDebugSetting
})
parser.addArgument(['-i', '--interactive'], {
  help: 'Suppress use of Xvfb to allow interaction with spawned browser instance',
  action: 'storeTrue',
  defaultValue: false
})
parser.addArgument(['-a', '--user-agent'], {
  help: 'Override the browser\'s UserAgent string to USER_AGENT',
  metavar: 'USER_AGENT'
})
parser.addArgument(['--proxy-server'], {
  help: 'Use an HTTP/SOCKS proxy at URL for all navigations',
  metavar: 'URL'
})
parser.addArgument(['-x', '--extra-args'], {
  help: 'Pass JSON_ARRAY as extra CLI argument to the browser instance launched',
  metavar: 'JSON_ARRAY'
})

const rawArgs = parser.parseArgs()
const [isValid, errorOrArgs] = validate(rawArgs)
if (!isValid) {
  throw errorOrArgs
}

const crawlArgs = errorOrArgs as CrawlArgs
writeGraphsForCrawl(crawlArgs)
