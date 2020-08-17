import * as fsLib from 'fs';
import * as pathLib from 'path';
import * as urlLib from 'url';
import { getLoggerForLevel } from './debug.js';
const isUrl = (possibleUrl) => {
    try {
        (new urlLib.URL(possibleUrl)); // eslint-disable-line
        return true;
    }
    catch (_) {
        return false;
    }
};
const isFile = (path) => {
    return fsLib.existsSync(path) && fsLib.lstatSync(path).isFile();
};
const isDir = (path) => {
    if (!fsLib.existsSync(path)) {
        return false;
    }
    const pathStats = fsLib.lstatSync(path);
    if (pathStats.isDirectory()) {
        return true;
    }
    if (pathStats.isSymbolicLink()) {
        return isDir(pathLib.join(path, pathLib.sep));
    }
    return false;
};
const looksWriteable = (path) => {
    const pathDir = pathLib.dirname(path);
    if (!isDir(pathDir)) {
        return false;
    }
    if (isDir(path)) {
        return false;
    }
    return true;
};
export const validate = (rawArgs) => {
    const logger = getLoggerForLevel(rawArgs.debug);
    logger.debug('Received arguments: ', rawArgs);
    if (!isFile(rawArgs.binary)) {
        return [false, `Invalid path to Brave binary: ${rawArgs.binary}`];
    }
    const executablePath = rawArgs.binary;
    if (!looksWriteable(rawArgs.output)) {
        return [false, `Invalid path to write results to: ${rawArgs.output}`];
    }
    const outputPath = rawArgs.output;
    const passedUrlArgs = rawArgs.url;
    if (!passedUrlArgs.every(isUrl)) {
        return [false, `Found invalid URL: ${passedUrlArgs.join(', ')}`];
    }
    const urls = passedUrlArgs;
    const secs = rawArgs.secs;
    const interactive = rawArgs.interactive;
    const userAgent = rawArgs.user_agent;
    const validatedArgs = {
        executablePath,
        outputPath,
        urls,
        seconds: secs,
        withShieldsUp: (rawArgs.shields === 'up'),
        debugLevel: rawArgs.debug,
        existingProfilePath: undefined,
        persistProfilePath: undefined,
        interactive,
        userAgent
    };
    if (rawArgs.proxy_server) {
        try {
            validatedArgs.proxyServer = new URL(rawArgs.proxy_server);
        }
        catch (err) {
            return [false, `invalid proxy-server: ${err.toString()}`];
        }
    }
    if (rawArgs.extra_args) {
        try {
            validatedArgs.extraArgs = JSON.parse(rawArgs.extra_args);
        }
        catch (err) {
            return [false, `invalid JSON array of extra-args: ${err.toString()}`];
        }
    }
    if (rawArgs.existing_profile && rawArgs.persist_profile) {
        return [false, 'Cannot specify both that you want to use an existing ' +
                'profile, and that you want to persist a new profile.'];
    }
    if (rawArgs.existing_profile) {
        if (!isDir(rawArgs.existing_profile)) {
            return [false, 'Provided existing profile path is not a directory: ' +
                    `${rawArgs.existing_profile}.`];
        }
        validatedArgs.existingProfilePath = rawArgs.existing_profile;
    }
    if (rawArgs.persist_profile) {
        if (isDir(rawArgs.persist_profile) || isFile(rawArgs.persist_profile)) {
            return [false, 'File already exists at path for persisting a ' +
                    `profile: ${rawArgs.persist_profile}.`];
        }
        validatedArgs.persistProfilePath = rawArgs.persist_profile;
    }
    logger.debug('Running with settings: ', validatedArgs);
    return [true, Object.freeze(validatedArgs)];
};
