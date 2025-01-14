import { rm, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { gzip } from 'node-gzip';
import { isDir } from './checks.js';
const dateTimeStamp = Math.floor(Date.now() / 1000);
const createFilename = (url) => {
    const fileSafeUrl = String(url).replace(/[^\w]/g, '_');
    return ['page_graph_', fileSafeUrl, '_', dateTimeStamp].join('');
};
const createOutputPath = (args, url) => {
    if (isDir(args.outputPath) === true) {
        return join(args.outputPath, createFilename(url));
    }
    else {
        const pathParts = parse(args.outputPath);
        return pathParts.dir + '/' + pathParts.name;
    }
};
const createGraphMLPath = (args, url) => {
    let outputPath = join(createOutputPath(args, url) + '.graphml');
    if (args.compress === true) {
        outputPath = outputPath + '.gz';
    }
    return outputPath;
};
const createHARPath = (args, url) => {
    const outputPath = join(createOutputPath(args, url) + '.har');
    return outputPath;
};
export const createScreenshotPath = (args, url) => {
    const outputPath = join(createOutputPath(args, url) + '.png');
    return outputPath;
};
export const writeGraphML = async (args, url, response, logger) => {
    try {
        const outputFilename = createGraphMLPath(args, url);
        logger.info('Writing PageGraph file to: ', outputFilename);
        const data = args.compress
            ? await gzip(response.data)
            : response.data;
        await writeFile(outputFilename, data);
    }
    catch (err) {
        logger.error('saving Page.generatePageGraph output: ', String(err));
    }
};
export const writeHAR = async (args, url, har, logger) => {
    try {
        const outputFilename = createHARPath(args, url);
        logger.info('Writing HAR file to: ', outputFilename);
        await writeFile(outputFilename, JSON.stringify(har, null, 4));
    }
    catch (err) {
        logger.error('saving HAR file: ', String(err));
    }
};
export const deleteAtPath = async (path) => {
    await rm(path, {
        recursive: true,
        force: true,
    });
};
export const createTempDir = async (dirPrefix = 'pagegraph-crawl-') => {
    return await mkdtemp(join(tmpdir(), dirPrefix));
};
