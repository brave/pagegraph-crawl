'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as osLib from 'os';
import fsExtraLib from 'fs-extra';
import pathLib from 'path';
import Xvbf from 'xvfb';
import { getLogger } from './debug.js';
import { puppeteerConfigForArgs, launchWithRetry } from './puppeteer.js';
import { isDir } from './validate.js';
const xvfbPlatforms = new Set(['linux', 'openbsd']);
const setupEnv = (args) => {
    const logger = getLogger(args);
    const platformName = osLib.platform();
    let closeFunc;
    if (args.interactive) {
        logger.debug('Interactive mode, skipping Xvfb');
        closeFunc = () => { };
    }
    else if (xvfbPlatforms.has(platformName)) {
        logger.debug(`Running on ${platformName}, starting Xvfb`);
        const xvfbHandle = new Xvbf({
            // ensure 24-bit color depth or rendering might choke
            xvfb_args: ['-screen', '0', '1024x768x24']
        });
        xvfbHandle.startSync();
        closeFunc = () => {
            logger.debug('Tearing down Xvfb');
            xvfbHandle.stopSync();
        };
    }
    else {
        logger.debug(`Running on ${platformName}, Xvfb not supported`);
        closeFunc = () => { };
    }
    return {
        close: closeFunc
    };
};
function generatePageGraph(seconds, page, client, logger) {
    return __awaiter(this, void 0, void 0, function* () {
        const waitTimeMs = seconds * 1000;
        logger.debug(`Waiting for ${waitTimeMs}ms`);
        yield page.waitFor(waitTimeMs);
        logger.debug('calling generatePageGraph');
        const response = yield client.send('Page.generatePageGraph');
        logger.debug(`generatePageGraph { size: ${response.data.length} }`);
        return response;
    });
}
function createFilename(url) {
    return `page_graph_${url === null || url === void 0 ? void 0 : url.replace(/[^\w]/g, '_')}_${Math.floor(Date.now() / 1000)}.graphml`;
}
function writeToFile(args, url, response, logger) {
    return __awaiter(this, void 0, void 0, function* () {
        const outputFilename = isDir(args.outputPath)
            ? pathLib.join(args.outputPath, createFilename(url))
            : args.outputPath;
        fsExtraLib.writeFile(outputFilename, response.data).catch((err) => {
            logger.debug('ERROR saving Page.generatePageGraph output:', err);
        });
    });
}
export const doCrawl = (args) => __awaiter(void 0, void 0, void 0, function* () {
    const logger = getLogger(args);
    const url = args.urls[0];
    const depth = args.recursiveDepth || 1;
    let randomChildUrl = null;
    let redirectedUrl = null;
    const { puppeteerArgs, pathForProfile, shouldClean } = puppeteerConfigForArgs(args);
    const envHandle = setupEnv(args);
    try {
        logger.debug('Launching puppeteer with args: ', puppeteerArgs);
        const browser = yield launchWithRetry(puppeteerArgs, logger);
        try {
            // create new page, update UA if needed, navigate to target URL, and wait for idle time
            const page = yield browser.newPage();
            const client = yield page.target().createCDPSession();
            client.on('Target.targetCrashed', (event) => {
                logger.debug(`ERROR Target.targetCrashed { targetId: ${event.targetId}, status: "${event.status}", errorCode: ${event.errorCode} }`);
                throw new Error(event.status);
            });
            if (args.userAgent) {
                yield page.setUserAgent(args.userAgent);
            }
            yield page.setRequestInterception(true);
            // First load is not a navigation redirect, so we need to skip it.
            let firstLoad = true;
            page.on('request', (request) => __awaiter(void 0, void 0, void 0, function* () {
                // Only capture parent frame navigation requests.
                logger.debug(`Request intercepted: ${request.url()}, first load: ${firstLoad}`);
                if (!firstLoad && request.isNavigationRequest() && request.frame() !== null && request.frame().parentFrame() === null) {
                    logger.debug('Page is redirecting...');
                    redirectedUrl = request.url();
                    // Stop page load
                    logger.debug(`Stopping page load of ${url}`);
                    yield page._client.send('Page.stopLoading');
                }
                firstLoad = false;
                request.continue();
            }));
            logger.debug(`Navigating to ${url}`);
            yield page.goto(url, { waitUntil: 'load' });
            logger.debug(`Loaded ${url}`);
            const response = yield generatePageGraph(args.seconds, page, client, logger);
            writeToFile(args, url, response, logger);
            if (depth > 1) {
                randomChildUrl = yield getRandomLinkFromPage(page, logger);
            }
            logger.debug('Closing page');
            yield page.close();
        }
        catch (err) {
            logger.debug('ERROR runtime fiasco from browser/page:', err);
        }
        finally {
            logger.debug('Closing the browser');
            yield browser.close();
        }
    }
    catch (err) {
        logger.debug('ERROR runtime fiasco from infrastructure:', err);
    }
    finally {
        envHandle.close();
        if (shouldClean) {
            fsExtraLib.remove(pathForProfile);
        }
    }
    if (redirectedUrl) {
        const newArgs = Object.assign({}, args);
        newArgs.urls = [redirectedUrl];
        logger.debug(`Doing new crawl with redirected URL: ${redirectedUrl}`);
        yield doCrawl(newArgs);
    }
    if (randomChildUrl) {
        const newArgs = Object.assign({}, args);
        newArgs.urls = [randomChildUrl];
        newArgs.recursiveDepth = depth - 1;
        yield doCrawl(newArgs);
    }
});
const getRandomLinkFromPage = (page, logger) => __awaiter(void 0, void 0, void 0, function* () {
    let rawLinks;
    try {
        rawLinks = yield page.$$('a[href]');
    }
    catch (e) {
        logger.debug(`Unable to look for child links, page closed: ${e.toString()}`);
        return null;
    }
    const links = [];
    for (const link of rawLinks) {
        const hrefHandle = yield link.getProperty('href');
        const hrefValue = yield hrefHandle.jsonValue();
        try {
            const hrefUrl = new URL(hrefValue.trim());
            hrefUrl.hash = '';
            hrefUrl.search = '';
            if (hrefUrl.protocol !== 'http:' && hrefUrl.protocol !== 'https:') {
                continue;
            }
            const childUrlString = hrefUrl.toString();
            if (!childUrlString || childUrlString.length === 0) {
                continue;
            }
            links.push(childUrlString);
        }
        catch (_) {
            continue;
        }
    }
    // https://stackoverflow.com/a/4550514
    const randomLink = links[Math.floor(Math.random() * links.length)];
    return randomLink;
});
