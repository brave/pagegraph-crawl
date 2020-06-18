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
const path = require('path');
const am = require('am');
const sleep = require('await-sleep');
const fs = require('fs-extra');
const puppeteer = require('puppeteer-core');
const PromisePool = require('@supercharge/promise-pool');
const Xvfb = require('xvfb');
const enableBrowserLogging = true;
const runInHeadlessMode = false;
const maxNetworkErrorRetries = 3;
const networkErrorRetryDelay = 1000 * 5;
const pageSettleDelay = 1000 * 30;
const urls = require('./urls.json');
const promiseWithTimeout = promise => {
    let timeoutId;
    const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error('Still didn\'t finish after 60 seconds, aborted'));
        }, 60000);
    });
    return {
        promiseOrTimeout: Promise.race([promise, timeoutPromise]),
        timeoutId
    };
};
let numSkipped = 0;
am(() => __awaiter(void 0, void 0, void 0, function* () {
    const xvfb = new Xvfb();
    xvfb.startSync();
    const errors = yield runForUrls(urls).errors;
    xvfb.stopSync();
    console.log(errors);
    console.log('Finished with ' + errors.length + ' errors.');
    console.log('Skipped ' + numSkipped + ' URLs due to network issues.');
}));
function runForUrls(urlList) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield PromisePool.for(urlList).process((targetUrl) => __awaiter(this, void 0, void 0, function* () {
            const { promiseOrTimeout, timeoutId } = promiseWithTimeout(runFor(targetUrl));
            let result;
            try {
                result = yield promiseOrTimeout;
            }
            finally {
                clearTimeout(timeoutId);
            }
            return result;
        }));
    });
}
function runFor(targetUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Launching browser...');
        const browser = yield puppeteer.launch({
            executablePath: path.join(__dirname, 'brave-browser-page-graph', 'brave'),
            args: [
                ...(enableBrowserLogging ? ['--enable-logging', '--v=0'] : []),
                '--disable-brave-update',
                '--single-process',
                ...(enableBrowserLogging ? ['--enable-logging=stderr'] : [])
            ],
            ignoreDefaultArgs: [
                '--disable-sync',
                // ^ crashes headless mode
                '--enable-features=NetworkService,NetworkServiceInProcess'
                // ^ breaks Brave Shields
            ],
            dumpio: enableBrowserLogging,
            headless: runInHeadlessMode
        });
        try {
            console.log('Opening new tab...');
            const page = yield browser.newPage();
            page.on('error', error => {
                // Some errors may bubble through the `page` object's `error` event. Don't
                // forget to handle them.
                throw error;
            });
            console.log(`Navigating to "${targetUrl}"...`);
            // Retry page loads a few times if they fail with a (potentially temporary)
            // network error.
            let navigationAttempts = 0;
            while (true) {
                try {
                    // Navigate to the target URL and wait until the page finishes loading
                    // (approximately).
                    yield page.goto(targetUrl);
                    break;
                }
                catch (error) {
                    if (error.message.indexOf('net::') >= 0) {
                        if (++navigationAttempts < maxNetworkErrorRetries) {
                            console.error('Network error:', error.stack);
                            console.log('Pausing...');
                            yield sleep(networkErrorRetryDelay);
                            console.log('Retrying navigation...');
                        }
                        else {
                            numSkipped += 1;
                            return;
                        }
                    }
                    else if (error.name === 'TimeoutError') {
                        // Puppeteer will wait up to 30 seconds to detect when the page finishes
                        // loading; if it exceeds that threshold, it throws a TimeoutError.
                        break;
                    }
                    else {
                        console.log('Throwing unclassified error');
                        throw error;
                    }
                }
            }
            console.log('Waiting...');
            // Give the page a little more time to "settle" after the initial load.
            yield sleep(pageSettleDelay);
            console.log('Generating page graph...');
            const client = yield page.target().createCDPSession();
            let pageGraphData;
            try {
                const generatePageGraphResponse = yield client.send('Page.generatePageGraph');
                pageGraphData = generatePageGraphResponse.data;
            }
            catch (error) {
                if (error.message.indexOf('No Page Graph for this Document') >= 0) {
                    console.log('Wrong protocol for ' + targetUrl + ', ignoring');
                    numSkipped += 1;
                    return;
                }
            }
            let filename = path.join('results', targetUrl.replace(/\//g, '_') + '.graphml');
            while (filename.length > 0) {
                // Some URLs are too long to be filenames, so truncate them until they work
                try {
                    yield fs.writeFile(path.join('results', targetUrl.replace(/\//g, '_') + '.graphml'), pageGraphData);
                    break;
                }
                catch (error) {
                    filename = filename.slice(0, filename.length - 1);
                }
            }
        }
        finally {
            console.log('Closing browser...');
            try {
                yield browser.close();
            }
            catch (error) {
                console.error('Error closing browser:', error.stack);
            }
        }
    });
}
