import { writeFile } from 'node:fs/promises';
import { join, parse } from 'node:path';
import { remove } from 'fs-extra';
import { isDir } from './checks.js';
const createFilename = (url) => {
    const fileSafeUrl = String(url).replace(/[^\w]/g, '_');
    const dateTimeStamp = Math.floor(Date.now() / 1000);
    return ['page_graph_', fileSafeUrl, '_', dateTimeStamp, '.graphml'].join('');
};
const createGraphMLPath = (args, url) => {
    return (isDir(args.outputPath) === true)
        ? join(args.outputPath, createFilename(url))
        : args.outputPath;
};
export const createScreenshotPath = (args, url) => {
    const outputPath = createGraphMLPath(args, url);
    const pathParts = parse(outputPath);
    return pathParts.dir + '/' + pathParts.name + '.png';
};
export const writeGraphML = async (args, url, response, logger) => {
    try {
        const outputFilename = createGraphMLPath(args, url);
        await writeFile(outputFilename, response.data);
        logger.info('Writing PageGraph file to: ', outputFilename);
    }
    catch (err) {
        logger.error('saving Page.generatePageGraph output: ', String(err));
    }
};
export const deleteAtPath = async (path) => {
    await remove(path);
};
