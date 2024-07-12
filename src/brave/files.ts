import { writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'

import { remove } from 'fs-extra'

import { isDir } from './checks.js'

const createFilename = (url: URL): FilePath => {
  const fileSafeUrl = String(url).replace(/[^\w]/g, '_')
  const dateTimeStamp = Math.floor(Date.now() / 1000)
  return ['page_graph_', fileSafeUrl, '_', dateTimeStamp, '.graphml'].join('')
}

const createGraphMLPath = (args: CrawlArgs, url: URL): FilePath => {
  return (isDir(args.outputPath) === true)
    ? join(args.outputPath, createFilename(url))
    : args.outputPath
}

export const createScreenshotPath = (args: CrawlArgs, url: URL): FilePath => {
  const outputPath = createGraphMLPath(args, url)
  const pathParts = parse(outputPath)
  return pathParts.dir + '/' + pathParts.name + '.png'
}

export const writeGraphML = async (args: CrawlArgs, url: URL,
                                   response: FinalPageGraphEvent,
                                   logger: Logger): Promise<undefined> => {
  try {
    const outputFilename = createGraphMLPath(args, url)
    await writeFile(outputFilename, response.data)
    logger.info('Writing PageGraph file to: ', outputFilename)
  }
  catch (err) {
    logger.error('saving Page.generatePageGraph output: ', String(err))
  }
}

export const deleteAtPath = async (path: FilePath): Promise<undefined> => {
  await remove(path)
}
