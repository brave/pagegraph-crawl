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
const puppeteerLib = require('puppeteer-core');
const xvfbLib = require('xvfb');
const bravePuppeteerLib = require('./puppeteer');
const forUrl = (args) => __awaiter(void 0, void 0, void 0, function* () {
    const puppeteerArgs = bravePuppeteerLib.configForArgs(args);
    const urlToCrawl = args.urls[0];
    const browser = yield puppeteerLib.launch(puppeteerArgs);
    const page = yield browser.newPage();
    yield page.goto(urlToCrawl);
    page.waitFor(args.seconds * 1000);
    const client = yield page.target().createCDPSession();
    try {
        const pageGraphRs = yield client.send('Page.generatePageGraph');
        const pageGraphText = pageGraphRs.data;
    }
    catch (error) {
        if (error.message.indexOf('No Page Graph for this Document') >= 0) {
            throw `Wrong protocol for ${urlToCrawl}`;
        }
    }
    return true;
});
module.exports = {
    forUrl
};
