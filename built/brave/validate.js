'use strict';
const fsLib = require('fs');
const urlLib = require('url');
const isUrl = (possibleUrl) => {
    try {
        (new urlLib.URL(possibleUrl));
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
    return fsLib.existsSync(path) && fsLib.lstatSync(path).isDirectory();
};
const validate = (rawArgs) => {
    if (!isFile(rawArgs.binary)) {
        return [false, `invalid path to Brave binary: ${rawArgs.binary}`];
    }
    const executablePath = rawArgs.binary;
    if (!isDir(rawArgs.output)) {
        return [false, `invalid path to write results to: ${rawArgs.output}`];
    }
    const outputPath = rawArgs.output;
    const passedUrlArgs = rawArgs.url;
    if (!passedUrlArgs.every(isUrl)) {
        return [false, `found invalid URL: ${passedUrlArgs.join(", ")}`];
    }
    const urls = passedUrlArgs;
    const secs = rawArgs.secs;
    const validatedArgs = {
        executablePath,
        outputPath,
        urls,
        seconds: secs,
        withShieldsUp: rawArgs.shields,
        verbose: rawArgs.verbose,
        existingProfilePath: undefined,
        persistProfilePath: undefined
    };
    if (rawArgs.existingProfilePath && rawArgs.persistProfilePath) {
        return [false, 'Cannot specify both that you want to use an existing ' +
                'profile, and that you want to persist a new profile.'];
    }
    if (rawArgs.existingProfile) {
        if (!isDir(rawArgs.existingProfile)) {
            return [false, `Provided existing profile path is not a directory`];
        }
        validatedArgs.existingProfilePath = rawArgs.existingProfile;
    }
    if (rawArgs.persistProfilePath) {
        if (isDir(rawArgs.persistProfilePath) || isFile(rawArgs.persistProfilePath)) {
            return [false, `File already exists at path given for persisting a profile.`];
        }
        validatedArgs.persistProfilePath = rawArgs.persistProfilePath;
    }
    return [true, Object.freeze(validatedArgs)];
};
module.exports = {
    validate
};
