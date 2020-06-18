#!/usr/bin/env node
'use strict';
const argparseLib = require('argparse');
const braveValidateLib = require('./brave/validate');
const parser = new argparseLib.ArgumentParser({
    version: 0.1,
    addHelp: true,
    description: 'CLI tool for crawling and recording websites with PageGraph'
});
parser.addArgument(['-b', '--binary'], {
    required: true,
    help: 'Path to the PageGraph enabled build of Brave.'
});
parser.addArgument(['-o', '--output'], {
    help: 'Path to write graphs to.',
    required: true
});
parser.addArgument(['-u', '--url'], {
    help: 'The URLs(s) to record, in desired order.',
    required: true,
    nargs: '+'
});
parser.addArgument(['-e', '--existing-profile'], {
    help: 'The chromium profile to use when crawling. Cannot ' +
        'be used with "--persist-profile"'
});
parser.addArgument(['-p', '--persist-profile'], {
    help: 'If provided, the user profile will be saved at this path. Cannot ' +
        'be used with "--existing-profile"'
});
parser.addArgument(['-s', '--shields'], {
    help: 'Whether to measure with shields up or down. Cannot be used with ' +
        '"--existing-profile"',
    choices: ['up', 'down'],
    default: 'down'
});
parser.addArgument(['-t', '--secs'], {
    help: 'The dwell time, per page, in seconds.',
    type: 'int',
    defaultValue: 30
});
const rawArgs = parser.parseArgs();
const crawlArgs = braveValidateLib.validate(rawArgs);
console.log(crawlArgs);
