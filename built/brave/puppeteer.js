'use strict';
const pathLib = require('path');
const fsExtraLib = require('fs-extra');
const tmpLib = require('tmp');
const profilePathForArgs = (args) => {
    // The easiest case is if we've been told to use an existing profile.
    // In this case, just return the given path.
    if (args.existingProfilePath) {
        return args.existingProfilePath;
    }
    // Next, figure out which existing profile we're going to use as the
    // template / starter profile for the new crawl.
    const resourcesDirPath = pathLib.join(__dirname, '..', '..', 'resources');
    const templateProfile = args.withShieldsUp
        ? pathLib.join(resourcesDirPath, 'shields-up-profile')
        : pathLib.join(resourcesDirPath, 'shields-down-profile');
    // Finally, either copy the above profile to the destination path
    // that was specified, or figure out a temporary location for it.
    const destProfilePath = args.persistProfilePath
        ? args.persistProfilePath
        : tmpLib.dirSync({ prefix: 'pagegraph-profile-' }).name;
    fsExtraLib.copySync(templateProfile, destProfilePath);
    return destProfilePath;
};
const configForArgs = (args) => {
    const pathForProfile = profilePathForArgs(args);
    const puppeteerArgs = {
        args: [
            '--disable-brave-update',
            '--user-data-dir=' + pathForProfile
        ],
        executablePath: args.executablePath,
        ignoreDefaultArgs: [
            '--disable-sync',
        ],
        dumpio: args.verbose,
        headless: false
    };
    if (args.verbose) {
        puppeteerArgs.args.push('--enable-logging');
        puppeteerArgs.args.push('--v=0');
    }
};
module.exports = {
    configForArgs
};
