import * as pathLib from 'path';
import fsExtraLib from 'fs-extra';
import tmpLib from 'tmp';
import puppeteerLib from 'puppeteer-core';
import { getLogger } from './logging.js';
const disabledBraveFeatures = [
    'Speedreader',
    'Playlist',
    'BraveVPN',
    'AIRewriter',
    'AIChat',
    'BravePlayer',
    'BraveDebounce',
    'BraveRewards',
    'BraveSearchOmniboxBanner',
    'BraveGoogleSignInPermission',
    'BraveNTPBrandedWallpaper',
    'AdEvent',
    'NewTabPageAds',
    'CustomNotificationAds',
    'InlineContentAds',
    'PromotedContentAds',
    'TextClassification',
    'SiteVisit',
];
const disabledChromeFeatures = [
    'IPH_SidePanelGenericMenuFeature',
];
const disabledFeatures = disabledBraveFeatures.concat(disabledChromeFeatures);
const profilePathForArgs = (args) => {
    const logger = getLogger(args);
    // The easiest case is if we've been told to use an existing profile.
    // In this case, just return the given path.
    if (args.existingProfilePath !== undefined) {
        logger.verbose(`Crawling with profile at ${args.existingProfilePath}.`);
        return { profilePath: args.existingProfilePath, shouldClean: false };
    }
    // Next, figure out which existing profile we're going to use as the
    // template / starter profile for the new crawl.
    const resourcesDirPath = pathLib.join(process.cwd(), 'resources');
    const templateProfile = args.withShieldsUp
        ? pathLib.join(resourcesDirPath, 'shields-up-profile')
        : pathLib.join(resourcesDirPath, 'shields-down-profile');
    // Finally, either copy the above profile to the destination path
    // that was specified, or figure out a temporary location for it.
    const destProfilePath = args.persistProfilePath !== undefined
        ? args.persistProfilePath
        : tmpLib.dirSync({ prefix: 'pagegraph-profile-' }).name;
    const shouldClean = args.persistProfilePath === undefined;
    fsExtraLib.copySync(templateProfile, destProfilePath);
    logger.verbose(`Crawling with profile at ${String(destProfilePath)}.`);
    return { profilePath: destProfilePath, shouldClean };
};
export const puppeteerConfigForArgs = (args) => {
    const { profilePath, shouldClean } = profilePathForArgs(args);
    process.env.PAGEGRAPH_OUT_DIR = args.outputPath;
    const chromeArgs = [
        '--ash-no-nudges',
        '--deny-permission-prompts',
        '--disable-brave-update',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-component-update',
        '--disable-features=' + disabledFeatures.join(','),
        '--disable-first-run-ui',
        '--disable-infobars',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-renderer-backgrounding',
        '--disable-site-isolation-trials',
        '--disable-sync',
        '--enable-features=PageGraph',
        '--mute-audio',
        '--no-first-run',
        '--user-data-dir=' + profilePath,
    ];
    const puppeteerArgs = {
        defaultViewport: null,
        args: chromeArgs,
        executablePath: args.executablePath,
        dumpio: args.loggingLevel === 'verbose',
        headless: false,
    };
    if (args.loggingLevel === 'verbose') {
        chromeArgs.push('--enable-logging=stderr');
        chromeArgs.push('--vmodule=page_graph*=2');
    }
    if (args.extensionsPath !== undefined) {
        chromeArgs.push('--disable-extensions-except=' + args.extensionsPath);
        chromeArgs.push('--load-extension=' + args.extensionsPath);
    }
    if (args.proxyServer != null) {
        chromeArgs.push(`--proxy-server=${args.proxyServer.toString()}`);
        if (args.proxyServer.protocol === 'socks5') {
            const socksProxyRule = '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ' + args.proxyServer.hostname;
            chromeArgs.push(socksProxyRule);
        }
    }
    if (args.extraArgs != null) {
        chromeArgs.push(...args.extraArgs);
    }
    return {
        launchOptions: puppeteerArgs,
        shouldStealthMode: args.stealth,
        profilePath,
        shouldClean,
    };
};
const asyncSleep = async (millis) => {
    return await new Promise(resolve => setTimeout(resolve, millis));
};
const defaultComputeTimeout = (tryIndex) => {
    return Math.pow(2, tryIndex - 1) * 1000;
};
// const makeLaunchPuppeteerFunc = (shouldStealth: boolean,
//                                  logger: Logger): VanillaPuppeteer => {
//   if (shouldStealth === true) {
//     logger.info('Running with puppeteer-extra-plugin-stealth')
//     const puppeteerExtra = new PuppeteerExtra(puppeteerLib, undefined)
//     puppeteerExtra.use(stealthPluginLib())
//     return puppeteerExtra
//   }
//   return puppeteerLib
// }
export const launchWithRetry = async (launchOptions, stealthMode, logger, 
// eslint-disable-next-line max-len
retryOptions) => {
    // default to 3 retries with a base-2 exponential-backoff delay
    // between each retry (1s, 2s, 4s, ...)
    const retries = retryOptions === undefined
        ? 3
        : +retryOptions.retries;
    const computeTimeout = retryOptions !== undefined
        ? retryOptions.computeTimeout
        : defaultComputeTimeout;
    // const puppeteerLib = makeLaunchPuppeteerFunc(stealthMode, logger)
    try {
        return puppeteerLib.launch(launchOptions);
    }
    catch (err) {
        logger.info('Failed to launch: ', err, '. ', retries, ' left…');
    }
    for (let i = 1; i <= retries; ++i) {
        await asyncSleep(computeTimeout(i));
        try {
            return puppeteerLib.launch(launchOptions);
        }
        catch (err) {
            logger.info('Failed to launch: ', err, '. ', (retries - i), ' left…');
        }
    }
    throw new Error(`Unable to launch after ${retries} retries!`);
};
