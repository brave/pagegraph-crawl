// This file is just going to be simple checks ot make the crawl.ts code
// easier to read and maintain.
import { existsSync, lstatSync, statSync, constants } from 'node:fs'
import { join, sep } from 'node:path'

import type { HTTPRequest } from 'puppeteer-core'
import puppeteerLib from 'puppeteer-core'
const TimeoutError = puppeteerLib.errors.TimeoutError

type HTTPRequestType = typeof HTTPRequest

export const asHTTPUrl = (possibleUrl: string | URL,
                          baseUrl?: URL): URL | undefined => {
  try {
    const url = (typeof possibleUrl === 'string')
      ? new URL(possibleUrl, baseUrl)
      : possibleUrl

    if (!url.protocol.startsWith('http')) {
      return undefined
    }

    if (url.pathname === '/' && String(url).endsWith('/') === false) {
      url.pathname += '/'
    }

    return url
  }
  catch (e) {
    return undefined
  }
}

export const isExecFile = (path: string): boolean => {
  const fileStats = statSync(path, { throwIfNoEntry: false })
  if (fileStats === null) {
    return false
  }

  return !!(fileStats!.mode & constants.S_IXUSR) // eslint-disable-line
}

export const isDir = (path: string): boolean => {
  if (!existsSync(path)) {
    return false
  }

  const pathStats = lstatSync(path)
  if (pathStats.isDirectory()) {
    return true
  }

  if (pathStats.isSymbolicLink()) {
    return isDir(join(path, sep))
  }

  return false
}

export const isTopLevelPageNavigation = (request: HTTPRequestType): boolean => {
  if (request.isNavigationRequest() === false) {
    return false
  }

  // Check to see if this is a navigation to an error page.
  if (request.frame() === null) {
    return false
  }

  // Check to make sure this is the top level frame
  if (request.frame().parentFrame() !== null) {
    return false
  }

  return true
}

export const isTimeoutError = (error: any): boolean => {
  if (error instanceof TimeoutError) {
    return true
  }

  if (typeof error.name !== 'string') {
    return false
  }

  return error.name === 'TimeoutError'
}
