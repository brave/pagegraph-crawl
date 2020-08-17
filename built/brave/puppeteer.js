import * as pathLib from 'path';
import fsExtraLib from 'fs-extra';
import tmpLib from 'tmp';
import { getLogger } from './debug.js';
const profilePathForArgs = (args) => {
    const logger = getLogger(args);
    // The easiest case is if we've been told to use an existing profile.
    // In this case, just return the given path.
    if (args.existingProfilePath) {
        logger.debug(`Crawling with profile at ${args.existingProfilePath}.`);
        return { path: args.existingProfilePath, shouldClean: false };
    }
    // Next, figure out which existing profile we're going to use as the
    // template / starter profile for the new crawl.
    const resourcesDirPath = pathLib.join(process.cwd(), 'resources');
    const templateProfile = args.withShieldsUp
        ? pathLib.join(resourcesDirPath, 'shields-up-profile')
        : pathLib.join(resourcesDirPath, 'shields-down-profile');
    // Finally, either copy the above profile to the destination path
    // that was specified, or figure out a temporary location for it.
    const destProfilePath = args.persistProfilePath
        ? args.persistProfilePath
        : tmpLib.dirSync({ prefix: 'pagegraph-profile-' }).name;
    const shouldClean = !args.persistProfilePath;
    fsExtraLib.copySync(templateProfile, destProfilePath);
    logger.debug(`Crawling with profile at ${destProfilePath}.`);
    return { path: destProfilePath, shouldClean };
};
export const puppeteerConfigForArgs = (args) => {
    const { path: pathForProfile, shouldClean } = profilePathForArgs(args);
    const puppeteerArgs = {
        defaultViewport: null,
        args: [
            '--disable-brave-update',
            '--user-data-dir=' + pathForProfile
        ],
        executablePath: args.executablePath,
        ignoreDefaultArgs: [
            '--disable-sync'
        ],
        dumpio: args.debugLevel === 'verbose',
        headless: false
    };
    if (args.debugLevel === 'verbose') {
        puppeteerArgs.args.push('--enable-logging');
        puppeteerArgs.args.push('--v=0');
    }
    if (args.proxyServer) {
        puppeteerArgs.args.push(`--proxy-server=${args.proxyServer.toString()}`);
        if (args.proxyServer.protocol === 'socks5') {
            puppeteerArgs.args.push(`--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${args.proxyServer.hostname}`);
        }
    }
    if (args.extraArgs) {
        puppeteerArgs.args.push(...args.extraArgs);
    }
    return { puppeteerArgs, pathForProfile, shouldClean };
};
