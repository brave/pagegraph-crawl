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
import puppeteerLib from 'puppeteer-core';
import Xvbf from 'xvfb';
import { getLogger } from './debug.js';
import { puppeteerConfigForArgs } from './puppeteer.js';
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
const isNotHTMLPageGraphError = (error) => {
    return error.message.indexOf('No Page Graph for this Document') >= 0;
};
const isSessionClosedError = (error) => {
    return error.message.indexOf('Session closed. Most likely the page has been closed.') >= 0;
};
export const writeGraphsForCrawl = (args) => __awaiter(void 0, void 0, void 0, function* () {
    const logger = getLogger(args);
    const url = args.urls[0];
    const { puppeteerArgs, pathForProfile, shouldClean } = puppeteerConfigForArgs(args);
    const envHandle = setupEnv(args);
    try {
        logger.debug('Launching puppeteer with args: ', puppeteerArgs);
        const browser = yield puppeteerLib.launch(puppeteerArgs);
        try {
            // turn target-crashed events (e.g., a page or remote iframe crashed) into crawl-fatal errors
            const bcdp = yield browser.target().createCDPSession();
            bcdp.on('Target.targetCrashed', (event) => {
                logger.debug(`ERROR Target.targetCrashed { targetId: ${event.targetId}, status: "${event.status}", errorCode: ${event.errorCode} }`);
                throw new Error(event.status);
            });
            // track frame IDs to provide sequence numbers (root frame IDs last longer than individual documents)
            const frameCounts = Object.create(null);
            const nextFrameSeq = (frameId) => {
                const seqNum = frameCounts[frameId] = (frameId in frameCounts ? frameCounts[frameId] : -1) + 1;
                return seqNum;
            };
            // track the creation/destruction of page targets and listen for PG data events on each new page
            const pageMap = new Map();
            browser.on('targetcreated', (target) => __awaiter(void 0, void 0, void 0, function* () {
                if (target.type() === 'page') {
                    const page = yield target.page();
                    pageMap.set(target, page);
                    page.on('error', (err) => {
                        throw err;
                    });
                    // On PG data event, write to frame-id-tagged GraphML file in output directory
                    const client = yield target.createCDPSession();
                    client.on('Page.finalPageGraph', (event) => {
                        logger.verbose(`finalpageGraph { frameId: ${event.frameId}, size: ${event.data.length}}`);
                        const seqNum = nextFrameSeq(event.frameId);
                        const outputFilename = pathLib.join(args.outputPath, `page_graph_${event.frameId}.${seqNum}.graphml`);
                        fsExtraLib.writeFile(outputFilename, event.data).catch((err) => {
                            logger.debug('ERROR saving Page.finalPageGraph output:', err);
                        });
                    });
                }
            }));
            browser.on('targetdestroyed', (target) => __awaiter(void 0, void 0, void 0, function* () {
                if (target.type() === 'page') {
                    pageMap.delete(target);
                }
            }));
            // create new page, update UA if needed, navigate to target URL, and wait for idle time
            const page = yield browser.newPage();
            if (args.userAgent) {
                yield page.setUserAgent(args.userAgent);
            }
            logger.debug(`Navigating to ${url}`);
            yield page.goto(url, { waitUntil: 'domcontentloaded' });
            const waitTimeMs = args.seconds * 1000;
            logger.debug(`Waiting for ${waitTimeMs}ms`);
            yield page.waitFor(waitTimeMs);
            // tear down by navigating all open pages to about:blank (to force PG data flushes)
            try {
                yield Promise.all(Array.from(pageMap.values()).map((page /* puppeteer Page */) => page.goto('about:blank')));
            }
            catch (error) {
                if (isSessionClosedError(error)) {
                    logger.debug('WARNING: session dropped (page unexpectedly closed?)');
                    // EAT IT and carry on
                }
                else if (isNotHTMLPageGraphError(error)) {
                    logger.debug('WARNING: was not able to fetch PageGraph data from target');
                    // EAT IT and carry on
                }
                else {
                    logger.debug('ERROR flushing PageGraph data:', error);
                    throw error;
                }
            }
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
});
