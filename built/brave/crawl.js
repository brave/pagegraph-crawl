import * as osLib from 'os';
import Xvbf from 'xvfb';
import { isTopLevelPageNavigation, isTimeoutError } from './checks.js';
import { asHTTPUrl } from './checks.js';
import { createScreenshotPath, writeGraphML, deleteAtPath } from './files.js';
import { getLogger } from './debug.js';
import { selectRandomChildUrl } from './page.js';
import { puppeteerConfigForArgs, launchWithRetry } from './puppeteer.js';
const xvfbPlatforms = new Set(['linux', 'openbsd']);
const setupEnv = (args) => {
    const logger = getLogger(args);
    const platformName = osLib.platform();
    let xvfbHandle;
    const closeFunc = () => {
        if (xvfbHandle !== undefined) {
            logger.debug('Tearing down Xvfb');
            xvfbHandle.stopSync();
        }
    };
    if (args.interactive) {
        logger.debug('Interactive mode, skipping Xvfb');
    }
    else if (xvfbPlatforms.has(platformName)) {
        logger.debug(`Running on ${platformName}, starting Xvfb`);
        xvfbHandle = new Xvbf({
            // ensure 24-bit color depth or rendering might choke
            xvfb_args: ['-screen', '0', '1024x768x24'],
        });
        xvfbHandle.startSync();
    }
    else {
        logger.debug(`Running on ${platformName}, Xvfb not supported`);
    }
    return {
        close: closeFunc,
    };
};
const generatePageGraph = async (seconds, page, client, logger) => {
    const waitTimeMs = seconds * 1000;
    logger.debug(`Waiting for ${waitTimeMs}ms`);
    await page.waitFor(waitTimeMs);
    logger.debug('calling generatePageGraph');
    const response = await client.send('Page.generatePageGraph');
    const responseLen = response.data.length;
    logger.debug('generatePageGraph { size: ', responseLen, ' }');
    return response;
};
const doesURLArrayIncludeURL = (prevURLs, url) => {
    for (const aPrevUrl of prevURLs) {
        if (aPrevUrl.toString() === url.toString()) {
            return true;
        }
    }
    return false;
};
export const doCrawl = async (args, redirectChain = []) => {
    const logger = getLogger(args);
    const urlToCrawl = asHTTPUrl(args.url);
    logger.debug([
        'Starting crawl with URL: ', urlToCrawl,
        ' and with redirection chain: [', redirectChain, ']',
    ]);
    const isRedirectedUrl = doesURLArrayIncludeURL.bind(undefined, redirectChain);
    const depth = Math.max(args.recursiveDepth, 1);
    let randomChildUrl;
    let redirectedUrl;
    const puppeteerConfig = puppeteerConfigForArgs(args);
    const { launchOptions } = puppeteerConfig;
    const envHandle = setupEnv(args);
    if (!redirectChain.includes(urlToCrawl)) {
        redirectChain.push(urlToCrawl);
    }
    try {
        logger.verbose('Launching puppeteer with args: ', JSON.stringify(launchOptions));
        const browser = await launchWithRetry(launchOptions, logger);
        const pages = await browser.pages();
        if (pages.length > 0) {
            logger.debug('Closing ', pages.length, ' pages that are already open.');
            for (const aPage of pages) {
                logger.debug('  - closing tab with url ', aPage.url());
                await aPage.close();
            }
        }
        try {
            // create new page, update UA if needed, navigate to target URL,
            // and wait for idle time.
            const page = await browser.newPage();
            const client = await page.target().createCDPSession();
            client.on('Target.targetCrashed', (event) => {
                const logMsg = {
                    targetId: event.targetId,
                    status: event.status,
                    errorCode: event.errorCode,
                };
                logger.error(`Target.targetCrashed ${JSON.stringify(logMsg)}`);
                throw new Error(event.status);
            });
            if (args.userAgent !== undefined) {
                await page.setUserAgent(args.userAgent);
            }
            await page.setRequestInterception(true);
            // First load is not a navigation redirect, so we need to skip it.
            let firstLoad = false;
            page.on('request', async (request) => {
                // We know the given URL will be a valid URL, bc of the puppeteer API
                const requestedUrl = asHTTPUrl(request.url());
                logger.verbose('Request intercepted: ', request.url(), ', first load: ', firstLoad);
                if (!firstLoad) {
                    request.continue();
                    return;
                }
                firstLoad = true;
                // Only capture parent frame navigation requests.
                if (isTopLevelPageNavigation(request) === false) {
                    return;
                }
                logger.debug('Page is redirecting...');
                if (args.crawlDuplicates || !isRedirectedUrl(requestedUrl)) {
                    // Add the redirected URL to the redirection chain
                    logger.debug('Adding ', requestedUrl, ' to redirection chain');
                    redirectedUrl = requestedUrl;
                    redirectChain.push(requestedUrl);
                }
                // Stop page load
                logger.debug('Stopping page load of ', urlToCrawl);
                await page._client.send('Page.stopLoading');
            });
            logger.debug('Navigating to ', urlToCrawl);
            try {
                await page.goto(urlToCrawl, { waitUntil: 'domcontentloaded' });
            }
            catch (e) {
                if (isTimeoutError(e) === true) {
                    logger.debug('Navigation timeout exceeded.');
                }
                else {
                    throw e;
                }
            }
            logger.debug('Loaded ', String(urlToCrawl));
            const response = await generatePageGraph(args.seconds, page, client, logger);
            await writeGraphML(args, urlToCrawl, response, logger);
            if (depth > 1) {
                randomChildUrl = await selectRandomChildUrl(page, logger);
            }
            logger.debug('Closing page');
            if (args.screenshot) {
                const screenshotPath = createScreenshotPath(args, urlToCrawl);
                logger.debug(`About to write screenshot to ${screenshotPath}`);
                await page.screenshot({ type: 'png', path: screenshotPath });
                logger.debug('Screenshot recorded');
            }
            await page.close();
        }
        catch (err) {
            logger.debug('ERROR runtime fiasco from browser/page:', err);
        }
        finally {
            logger.debug('Closing the browser');
            await browser.close();
        }
    }
    catch (err) {
        logger.debug('ERROR runtime fiasco from infrastructure:', err);
    }
    finally {
        envHandle.close();
        if (puppeteerConfig.shouldClean === true) {
            await deleteAtPath(puppeteerConfig.profilePath);
        }
    }
    if (redirectedUrl !== undefined) {
        const newArgs = { ...args };
        newArgs.url = redirectedUrl;
        logger.debug('Doing new crawl with redirected URL: ', redirectedUrl);
        await doCrawl(newArgs, redirectChain);
    }
    if (randomChildUrl !== undefined) {
        const newArgs = { ...args };
        newArgs.url = randomChildUrl;
        newArgs.recursiveDepth = depth - 1;
        await doCrawl(newArgs, redirectChain);
    }
};
