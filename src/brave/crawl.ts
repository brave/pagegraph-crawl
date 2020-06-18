'use strict'

const puppeteerLib = require('puppeteer-core')
const xvfbLib = require('xvfb')

const bravePuppeteerLib = require('./puppeteer')

const forUrl = async (args: CrawlArgs): Promise<boolean> => {
  const puppeteerArgs = bravePuppeteerLib.configForArgs(args)
  const urlToCrawl = args.urls[0]

  xvfbLib.startSync()
  try {
    const browser = await puppeteerLib.launch(puppeteerArgs)
    const page = await browser.newPage()
    await page.goto(urlToCrawl)
    page.waitFor(args.seconds * 1000)

    const client = await page.target().createCDPSession()
    try {
      const pageGraphRs = await client.send('Page.generatePageGraph')
      const pageGraphText = pageGraphRs.data
    } catch (error) {
      if (error.message.indexOf('No Page Graph for this Document') >= 0) {
        throw new Error(`Wrong protocol for ${urlToCrawl}`)
      }
    }
  } finally {
    xvfbLib.stopSync()
  }

  return true
}

module.exports = {
  forUrl
}
