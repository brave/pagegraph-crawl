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
import * as fsLib from 'fs-extra';
import * as puppeteerLib from 'puppeteer-core';
import * as xvfbLib from 'xvfb';
import { getLogger } from './debug';
import * as bravePuppeteerLib from './puppeteer';
const isNotHTMLPageGraphError = (error) => {
    return error.message.indexOf('No Page Graph for this Document') >= 0;
};
export const graphForUrl = (args, url) => __awaiter(void 0, void 0, void 0, function* () {
    const puppeteerArgs = bravePuppeteerLib.configForArgs(args);
    const logger = getLogger(args);
    logger('Creating Xvfb environment');
    xvfbLib.startSync();
    let pageGraphText;
    try {
        logger('Launching puppeteer with args: ', puppeteerArgs);
        const browser = yield puppeteerLib.launch(puppeteerArgs);
        const page = yield browser.newPage();
        logger(`Navigating to ${url}`);
        yield page.goto(url);
        const waitTimeMs = args.seconds * 1000;
        logger(`Waiting for ${waitTimeMs}ms`);
        page.waitFor(waitTimeMs);
        try {
            logger('Requesting PageGraph data');
            const client = yield page.target().createCDPSession();
            const pageGraphRs = yield client.send('Page.generatePageGraph');
            pageGraphText = pageGraphRs.data;
            logger(`Received response of length: ${pageGraphText.length}`);
        }
        catch (error) {
            if (isNotHTMLPageGraphError(error)) {
                const currentUrl = page.url();
                logger(`Was not able to fetch PageGraph data for ${currentUrl}`);
                throw new Error(`Wrong protocol for ${url}`);
            }
            throw error;
        }
        finally {
            logger('Closing the browser');
            yield browser.close();
        }
    }
    finally {
        logger('Tearing down the Xvbf environment');
        xvfbLib.stopSync();
    }
    return pageGraphText;
});
export const writeGraphsForCrawl = (args) => __awaiter(void 0, void 0, void 0, function* () {
    const url = args.urls[0];
    const pageGraphText = graphForUrl(args, url);
    yield fsLib.writeFile(args.outputPath, pageGraphText);
    return 1;
});
