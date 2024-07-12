import * as fsLib from 'fs';
import * as osLib from 'os';
import * as pathLib from 'path';
import * as hasBinLib from 'hasbin';
import { asHTTPUrl, isDir, isExecFile } from './checks.js';
import { getLoggerForLevel } from './logging.js';
const possibleBraveBinaryPaths = [
    '/Applications/Brave Browser Nightly.app/Contents/MacOS/Brave Browser Nightly',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
const guessBinary = () => {
    // If we're on MacOS, first see if there is a version of Brave
    // we can use in the typical locations.  Prefer Brave nightly, and then Brave
    // stable.
    if (osLib.type() === 'Darwin') {
        for (const aPossibleBinaryPath of possibleBraveBinaryPaths) {
            if (isExecFile(aPossibleBinaryPath)) {
                return aPossibleBinaryPath;
            }
        }
    }
    // Otherwise, see if we can find a Brave binary in the path
    const possibleBraveBinaryNames = [
        'brave-browser-nightly',
        'brave-browser-beta',
        'brave-browser-stable',
        'brave-browser',
    ];
    const firstBraveBinary = hasBinLib.first.sync(possibleBraveBinaryNames);
    if (firstBraveBinary === false) {
        return false;
    }
    return firstBraveBinary;
};
export const validate = (rawArgs) => {
    const logger = getLoggerForLevel(rawArgs.logging);
    logger.info('Received arguments: ', rawArgs);
    let executablePath;
    if (rawArgs.binary === null || rawArgs.binary === undefined) {
        const possibleBinary = guessBinary();
        if (possibleBinary === false) {
            return [false, 'No binary specified, and could not guess one'];
        }
        executablePath = possibleBinary;
    }
    else {
        if (!isExecFile(rawArgs.binary)) {
            return [false, `Invalid path to Brave binary: ${String(rawArgs.binary)}`];
        }
        executablePath = rawArgs.binary;
    }
    // The output path either needs to be a directory, or a filename in
    // an existing directory.
    if (!isDir(rawArgs.output)) {
        const outputPathParts = pathLib.parse(rawArgs.output);
        if (!isDir(outputPathParts.dir)) {
            try {
                const logMsg = [
                    'Output path: ',
                    rawArgs.output,
                    ' does not exist. Creating directory.',
                ];
                logger.info(logMsg);
                fsLib.mkdirSync(rawArgs.output);
            }
            catch (e) {
                return [false, 'Invalid path to write results to and unable to create the directory:\n' + String(e)];
            }
        }
    }
    const outputPath = rawArgs.output;
    const passedUrl = asHTTPUrl(rawArgs.url);
    if (passedUrl === undefined) {
        return [false, `Found invalid URL: ${String(passedUrl)}`];
    }
    const url = passedUrl;
    const secs = rawArgs.secs;
    const recursiveDepth = rawArgs.recursive_depth;
    const interactive = rawArgs.interactive;
    const userAgent = rawArgs.user_agent;
    const crawlDuplicates = rawArgs.crawl_duplicates;
    const screenshot = rawArgs.screenshot;
    const validatedArgs = {
        executablePath: String(executablePath),
        outputPath,
        url,
        recursiveDepth,
        seconds: secs,
        withShieldsUp: (rawArgs.shields === 'up'),
        loggingLevel: rawArgs.logging,
        existingProfilePath: undefined,
        persistProfilePath: undefined,
        extensionsPath: undefined,
        stealth: false,
        interactive,
        userAgent,
        crawlDuplicates,
        screenshot,
    };
    if (rawArgs.proxy_server !== undefined) {
        try {
            validatedArgs.proxyServer = new URL(rawArgs.proxy_server);
        }
        catch (err) {
            return [false, `invalid proxy-server: ${String(err)}`];
        }
    }
    if (rawArgs.extra_args !== undefined) {
        try {
            validatedArgs.extraArgs = JSON.parse(rawArgs.extra_args);
        }
        catch (err) {
            return [false, `invalid JSON array of extra-args: ${String(err)}`];
        }
    }
    const isPersistProfile = rawArgs.persist_profile === true;
    if (rawArgs.existing_profile === undefined && isPersistProfile) {
        return [
            false,
            'Cannot specify both that you want to use an existing profile, and that you want to persist a new profile.',
        ];
    }
    if (rawArgs.existing_profile !== undefined) {
        if (!isDir(rawArgs.existing_profile)) {
            return [
                false,
                'Provided existing profile path is not a directory: ' + String(rawArgs.existing_profile),
            ];
        }
        validatedArgs.existingProfilePath = rawArgs.existing_profile;
    }
    if (rawArgs.persist_profile === true) {
        if (isDir(rawArgs.persist_profile) || isExecFile(rawArgs.persist_profile)) {
            return [false, 'File already exists at path for persisting a '
                    + `profile: ${String(rawArgs.persist_profile)}.`];
        }
        validatedArgs.persistProfilePath = rawArgs.persist_profile;
    }
    if (rawArgs.extensions_path !== undefined) {
        if (!isDir(rawArgs.extensions_path)) {
            return [false, 'Provided extensions path is not a directory: '
                    + `${String(rawArgs.extensions_path)}.`];
        }
        validatedArgs.extensionsPath = rawArgs.extensions_path;
    }
    logger.info('Running with settings: ', JSON.stringify(validatedArgs));
    return [true, Object.freeze(validatedArgs)];
};
