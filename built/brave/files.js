import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
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
export const createScreenshotPath = (args, url) => {
    const outputPath = join(createOutputPath(args, url) + '.png');
    return outputPath;
};
const createHeadersLogPath = (args, url) => {
    const extension = args.compress ? '.headers.json.gz' : '.headers.json';
    const outputPath = join(createOutputPath(args, url) + extension);
    return outputPath;
};
export const writeHeadersLog = async (args, url, headersJSON, logger) => {
    try {
        const outputFilename = createHeadersLogPath(args, url);
        logger.info('Writing headers log to: ', outputFilename);
        const data = args.compress ? await gzip(headersJSON) : headersJSON;
        await writeFile(outputFilename, data);
    }
    catch (err) {
        logger.error('writing headers log output: ', String(err));
    }
};
const createGraphMLPath = (args, url) => {
    const outputPath = join(createOutputPath(args, url) + '.graphml');
    return outputPath;
};
export const writeGraphML = async (args, url, response, headersLogger, logger) => {
    try {
        const finalOutputFilename = createGraphMLPath(args, url);
        const intermediateFilename = finalOutputFilename + '.tmp';
        const data = response.data;
        logger.info('Writing PageGraph file to: ', intermediateFilename);
        await writeFile(intermediateFilename, data);
        logger.info('... and stitching request headers to: ', finalOutputFilename);
        await headersLogger.rewriteGraphML(intermediateFilename, finalOutputFilename);
        logger.info('but here though...');
        await unlink(intermediateFilename);
        if (args.compress) {
            return await compressAtPath(finalOutputFilename);
        }
        return finalOutputFilename;
    }
    catch (err) {
        logger.error('saving Page.generatePageGraph output: ', String(err));
        return null;
    }
};
const createHARPath = (args, url) => {
    const outputPath = join(createOutputPath(args, url) + '.har');
    return outputPath;
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
export const compressAtPath = async (fromPath) => {
    const toPath = fromPath + '.gz';
    // This is absurd and should be rewritten to stream.
    // But for the time being...
    const buffer = await readFile(fromPath);
    const compressedBuffer = await gzip(buffer);
    await writeFile(toPath, compressedBuffer);
    await unlink(fromPath);
    return toPath;
};
