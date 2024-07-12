import type { Page } from 'puppeteer-core'

import { asHTTPUrl } from './checks.js'

type PageType = typeof Page

const selectRandomChildUrl = async (page: PageType,
                                    logger: Logger): Promise<URL | undefined> => {  // eslint-disable-line
  const mainFrameUrl = asHTTPUrl(page.url())

  let rawLinks
  try {
    rawLinks = await page.$$('a[href]')
  }
  catch (e) {
    logger.info('Unable to look for child links, page closed: ', String(e))
    return undefined
  }

  const links: URL[] = []
  for (const link of rawLinks) {
    const hrefHandle = await link.getProperty('href')
    const hrefValue = await hrefHandle.jsonValue()
    try {
      const hrefUrl = asHTTPUrl(hrefValue.trim(), mainFrameUrl)
      if (hrefUrl === undefined) {
        continue
      }
      links.push(hrefUrl)
    }
    catch (_) {
      continue
    }
  }
  // https://stackoverflow.com/a/4550514
  const randomLink = links[Math.floor(Math.random() * links.length)]
  return randomLink
}

export { selectRandomChildUrl }
