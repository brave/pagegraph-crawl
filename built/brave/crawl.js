import * as osLib from 'os';
import { harFromMessages } from 'chrome-har';
import Xvbf from 'xvfb';
import { isTopLevelPageNavigation, isTimeoutError } from './checks.js';
import { asHTTPUrl } from './checks.js';
import { createScreenshotPath, deleteAtPath } from './files.js';
import { writeGraphML } from './files.js';
import { writeHAR, writeHeadersLog } from './files.js';
import { getLogger } from './logging.js';
import { makeNavigationTracker } from './navigation_tracker.js';
import { selectRandomChildUrl } from './page.js';
import { puppeteerConfigForArgs, launchWithRetry } from './puppeteer.js';
import { HeadersLogger } from './headers.js';
const xvfbPlatforms = new Set(['linux', 'openbsd']);
const setupEnv = (args) => {
    const logger = getLogger(args);
    const platformName = osLib.platform();
    let xvfbHandle;
    const closeFunc = () => {
        if (xvfbHandle !== undefined) {
            logger.info('Tearing down Xvfb');
            xvfbHandle.stopSync();
        }
    };
    if (args.interactive) {
        logger.info('Interactive mode, skipping Xvfb');
    }
    else if (xvfbPlatforms.has(platformName)) {
        logger.info(`Running on ${platformName}, starting Xvfb`);
        xvfbHandle = new Xvbf({
            // ensure 24-bit color depth or rendering might choke
            xvfb_args: ['-screen', '0', '1024x768x24'],
        });
        xvfbHandle.startSync();
    }
    else {
        logger.info(`Running on ${platformName}, Xvfb not supported`);
    }
    return {
        close: closeFunc,
    };
};
// Returns true if returned be of the func, and false if returned by timeout
const waitUntilUnless = (secs, unlessFunc, intervalMs = 500) => {
    const totalMs = secs * 1000;
    const endTime = Date.now() + totalMs;
    return new Promise((resolve) => {
        const timerId = setInterval(() => {
            const hasTimePassed = Date.now() > endTime;
            const unlessFuncRs = unlessFunc();
            const shouldEnd = hasTimePassed === true || unlessFuncRs === true;
            if (shouldEnd === true) {
                clearTimeout(timerId);
                const returnedBcTimeout = hasTimePassed === true;
                resolve(returnedBcTimeout);
            }
        }, intervalMs);
    });
};
const prepareHARGenerator = async (client, networkEvents, pageEvents, storeHarBody, responseBodies, logger) => {
    await client.send('Page.enable');
    await client.send('Network.enable');
    const networkMethods = [
        'Network.requestWillBeSent',
        'Network.requestServedFromCache',
        'Network.dataReceived',
        'Network.responseReceived',
        'Network.resourceChangedPriority',
        'Network.loadingFinished',
        'Network.loadingFailed',
    ];
    const pageMethods = [
        'Page.loadEventFired',
        'Page.domContentEventFired',
        'Page.frameStartedLoading',
        'Page.frameAttached',
        'Page.frameScheduledNavigation',
    ];
    networkMethods.forEach((method) => {
        client.on(method, (params) => {
            networkEvents.push({ method, params });
            if (storeHarBody && method == 'Network.loadingFinished') {
                const responseParams = params;
                const requestId = responseParams.requestId;
                client.send('Network.getResponseBody', { requestId: requestId })
                    .then((responseBody) => {
                    responseBodies.set(requestId.toString(), responseBody);
                }, (reason) => {
                    logger.error('LoadingFinishedError: ' + reason);
                });
            }
        });
    });
    pageMethods.forEach((method) => {
        client.on(method, (params) => {
            pageEvents.push({ method, params });
        });
    });
};
const generatePageGraph = async (seconds, page, client, waitFunc, 
// eslint-disable-next-line max-len
logger) => {
    logger.info(`Waiting for ${seconds}s`);
    await waitUntilUnless(seconds, waitFunc);
    logger.info('calling generatePageGraph');
    const response = await client.send('Page.generatePageGraph');
    const responseLen = response.data.length;
    logger.info('generatePageGraph { size: ', responseLen, ' }');
    return response;
};
export const doCrawl = async (args, previouslySeenUrls) => {
    const logger = getLogger(args);
    const urlToCrawl = asHTTPUrl(args.url);
    logger.info([
        'Starting crawl with URL: ', urlToCrawl,
        ' and with previously seen urls: [', previouslySeenUrls, ']',
    ]);
    const navTracker = makeNavigationTracker(urlToCrawl, previouslySeenUrls);
    const depth = Math.max(args.recursiveDepth, 1);
    let randomChildUrl;
    let shouldRedirectToUrl;
    const puppeteerConfig = await puppeteerConfigForArgs(args);
    const { launchOptions } = puppeteerConfig;
    const envHandle = setupEnv(args);
    let shouldStopWaitingFlag = false;
    const shouldStopWaitingFunc = () => {
        return shouldStopWaitingFlag;
    };
    try {
        logger.verbose([
            'Launching puppeteer with args: ',
            JSON.stringify(launchOptions),
        ]);
        const browser = await launchWithRetry(launchOptions, puppeteerConfig.shouldStealthMode, logger);
        const pages = await browser.pages();
        if (pages.length > 0) {
            logger.info('Closing ', pages.length, ' pages that are already open.');
            for (const aPage of pages) {
                logger.info('  - closing tab with url ', aPage.url());
                await aPage.close();
            }
        }
        try {
            // create new page, update UA if needed, navigate to target URL,
            // and wait for idle time.
            const page = await browser.newPage();
            const client = await page.target().createCDPSession();
            const networkEvents = [];
            const pageEvents = [];
            const responseBodies = new Map();
            if (args.storeHar) {
                await prepareHARGenerator(client, networkEvents, pageEvents, args.storeHarBody, responseBodies, logger);
            }
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
            const headersLogger = new HeadersLogger(logger);
            await page.setRequestInterception(true);
            // First load is not a navigation redirect, so we need to skip it.
            page.on('request', async (request) => {
                // We know the given URL will be a valid URL, bc of the puppeteer API
                const requestedUrl = asHTTPUrl(request.url());
                headersLogger.addHeadersFromRequest(request);
                // Only capture parent frame navigation requests.
                if (isTopLevelPageNavigation(request) === false) {
                    logger.verbose('Allowing request to ', request.url(), ', not ', 'a top level navigation.');
                    request.continue();
                    return;
                }
                const hasUrlBeenSeen = navTracker.isInHistory(requestedUrl);
                const isCurrentNavUrl = navTracker.isCurrentUrl(requestedUrl);
                if (isCurrentNavUrl === true) {
                    logger.info('Loading ', requestedUrl, ' bc it is the first top frame page load');
                    request.continue();
                    return;
                }
                if (hasUrlBeenSeen === false) {
                    logger.info('Detected redirect to ', requestedUrl, ' so stopping page load and moving on');
                    shouldRedirectToUrl = requestedUrl;
                    shouldStopWaitingFlag = true;
                    const client = await page.createCDPSession();
                    await client.send('Page.stopLoading');
                    request.continue();
                    return;
                }
                if (args.crawlDuplicates === true) {
                    logger.info('Loading ', requestedUrl, ' bc was instructed to crawl duplicates');
                    request.continue();
                    return;
                }
                // Otherwise, we're in a redirect loop, so stop recording
                // the pagegraph, but continue.
                logger.info('Quitting bc we\'re in a redirect loop');
                shouldStopWaitingFlag = true;
                const client = await page.createCDPSession();
                await client.send('Page.stopLoading');
                request.continue();
                return;
            });
            page.on('response', (response) => {
                headersLogger.addHeadersFromResponse(response);
            });
            logger.info('Navigating to ', urlToCrawl);
            try {
                await page.goto(urlToCrawl, { waitUntil: 'domcontentloaded' });
            }
            catch (e) {
                if (isTimeoutError(e) === true) {
                    logger.info('Navigation timeout exceeded.');
                }
                else {
                    throw e;
                }
            }
            logger.info('Loaded ', String(urlToCrawl));
            const response = await generatePageGraph(args.seconds, page, client, shouldStopWaitingFunc, logger);
            if (args.saveRequestHeaders) {
                await writeHeadersLog(args, urlToCrawl, headersLogger.toJSON(), logger);
            }
            await writeGraphML(args, urlToCrawl, response, headersLogger, logger);
            // Store HAR
            if (args.storeHar) {
                logger.verbose('Beginning HAR export');
                await Promise.all(responseBodies);
                for (const event of networkEvents) {
                    if (!args.storeHarBody) {
                        break;
                    }
                    if (event.method !== 'Network.responseReceived') {
                        continue;
                    }
                    const requestId = event.params.requestId;
                    const responseBody = responseBodies.get(requestId.toString());
                    const responseParams = event.params;
                    if (!responseBody) {
                        responseParams.response.body = undefined;
                        continue;
                    }
                    const responseBodyEncoding = responseBody.base64Encoded
                        ? 'base64'
                        : undefined;
                    const responseBodyBuffer = Buffer.from(responseBody.body, responseBodyEncoding);
                    responseParams.response.body = responseBodyBuffer.toString();
                }
                const allEvents = pageEvents
                    .concat(networkEvents);
                const har = harFromMessages(allEvents, {
                    includeTextFromResponseBody: args.storeHarBody,
                });
                await writeHAR(args, urlToCrawl, har, logger);
            }
            if (depth > 1) {
                randomChildUrl = await selectRandomChildUrl(page, logger);
            }
            logger.info('Closing page');
            if (args.screenshot) {
                const screenshotPath = createScreenshotPath(args, urlToCrawl);
                logger.info(`About to write screenshot to ${screenshotPath}`);
                await page.screenshot({ type: 'png', path: screenshotPath });
                logger.info('Screenshot recorded');
            }
            await page.close();
        }
        catch (err) {
            logger.info('ERROR runtime fiasco from browser/page:', err);
        }
        finally {
            logger.info('Closing the browser');
            await browser.close();
        }
    }
    catch (err) {
        logger.info('ERROR runtime fiasco from infrastructure:', err);
    }
    finally {
        envHandle.close();
        if (puppeteerConfig.shouldClean === true) {
            await deleteAtPath(puppeteerConfig.profilePath);
        }
    }
    if (shouldRedirectToUrl !== undefined) {
        const newArgs = { ...args };
        newArgs.url = shouldRedirectToUrl;
        logger.info('Doing new crawl with redirected URL: ', shouldRedirectToUrl);
        await doCrawl(newArgs, navTracker.toHistory());
        return;
    }
    if (randomChildUrl !== undefined) {
        const newArgs = { ...args };
        newArgs.url = randomChildUrl;
        newArgs.recursiveDepth = depth - 1;
        await doCrawl(newArgs, navTracker.toHistory());
    }
};
