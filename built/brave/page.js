import { asHTTPUrl } from './checks.js';
const selectRandomChildUrl = async (page, logger) => {
    const mainFrameUrl = asHTTPUrl(page.url());
    let rawLinks;
    try {
        rawLinks = await page.$$('a[href]');
    }
    catch (e) {
        logger.info('Unable to look for child links, page closed: ', String(e));
        return undefined;
    }
    const links = [];
    for (const link of rawLinks) {
        const hrefHandle = await link.getProperty('href');
        const hrefValue = await hrefHandle.jsonValue();
        try {
            const hrefUrl = asHTTPUrl(hrefValue.trim(), mainFrameUrl);
            if (hrefUrl === undefined) {
                continue;
            }
            links.push(hrefUrl);
        }
        catch (ignore) {
            continue;
        }
    }
    // https://stackoverflow.com/a/4550514
    const randomLink = links[Math.floor(Math.random() * links.length)];
    return randomLink;
};
export { selectRandomChildUrl };
