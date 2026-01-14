/* global describe, before, after, it */

import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import kill from 'tree-kill'

import {
  startServer, createTempOutputDir, cleanupTempOutputDir,
  validateHAR, crawlUrl, readCrawlResults, getExpectedFilename
} from './utils.js'

const DEBUG = process.env.DEBUG || false
const testServerPort = process.env.PAGEGRAPH_CRAWL_TEST_PORT || 3000
const baseUrl = process.env.PAGEGRAPH_CRAWL_TEST_BASE_URL || 'http://127.0.0.1'
const binaryPath = process.env.PAGEGRAPH_CRAWL_TEST_BINARY_PATH || null

const graphMlExtension = '.graphml'
const testBaseUrl = `${baseUrl}:${testServerPort}`
const simpleUrl = `${testBaseUrl}/simple.html`
const makeTestUrl = (htmlFile) => `${testBaseUrl}/${htmlFile}`
const expectedFilenameSimple = getExpectedFilename(simpleUrl)

const _crawlUrl = async (url, outputDir, args) => {
  return await crawlUrl(url, outputDir, args, binaryPath, DEBUG)
}
const _readCrawlResults = async (outputPath) => {
  return await readCrawlResults(outputPath, DEBUG)
}
const _createTempOutputDir = createTempOutputDir.bind(undefined, DEBUG)
const _cleanupTempOutputDir = async (outputPath) => {
  return await cleanupTempOutputDir(outputPath, DEBUG)
}

describe('PageGraph Crawl CLI', () => {
  let serverProcessHandle
  before(async () => {
    serverProcessHandle = await startServer(testServerPort, DEBUG)
  })
  after((done) => {
    kill(serverProcessHandle.pid, 'SIGTERM', (error) => {
      if (error) {
        console.error(error)
      }
      if (DEBUG) {
        console.log('Test server has closed')
      }
      done()
    })
  })

  describe('single page', () => {
    it('single static page', async () => {
      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(simpleUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 1)

        const file = files[0]
        assert.ok(file.startsWith(expectedFilenameSimple))
        assert.ok(file.endsWith(graphMlExtension))

        const graphML = await readFile(join(testDir, file), 'UTF-8')
        assert.ok(graphML.includes('hJc9ZK1sGr'))
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })
    it('single static page with gzip', async () => {
      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(simpleUrl, testDir, { '--compress': null })
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 1)

        const file = files[0]
        assert.ok(file.startsWith(expectedFilenameSimple))
        assert.ok(file.endsWith(graphMlExtension + '.gz'))

        const graphMLCompressed = await readFile(join(testDir, file))
        const graphML = await gunzipSync(graphMLCompressed)
        assert.ok(graphML.includes('hJc9ZK1sGr'))
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })
  })

  describe('redirection', () => {
    it('same-site (A->A)', async () => {
      const initialUrl = `${testBaseUrl}/redirect-js-same-site.html`
      const expectedFilenameInitial = getExpectedFilename(initialUrl)

      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(initialUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 2)

        for (const file of files) {
          assert.ok(file.endsWith(graphMlExtension))
          assert.ok(file.startsWith(expectedFilenameSimple) ||
            file.startsWith(expectedFilenameInitial))

          const graphML = await readFile(join(testDir, file), 'UTF-8')
          if (file.startsWith(expectedFilenameSimple)) {
            assert.ok(graphML.includes('hJc9ZK1sGr'))
            assert.ok(graphML.includes('W0XNNnar') === false)
          } else {
            assert.ok(graphML.includes('W0XNNnar'))
            assert.ok(graphML.includes('hJc9ZK1sGr') === false)
          }
        }
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })

    it('multiple same-site (A->A->A)', async () => {
      const initialUrl = `${testBaseUrl}/multiple-redirects-js-same-site.html`
      const secondUrl = `${testBaseUrl}/redirect-js-same-site.html`
      const expectedFilenameInitial = getExpectedFilename(initialUrl)
      const expectedFilenameSecond = getExpectedFilename(secondUrl)

      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(initialUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 3)

        for (const file of files) {
          assert.ok(file.endsWith(graphMlExtension))
          assert.ok(file.startsWith(expectedFilenameSimple) ||
            file.startsWith(expectedFilenameInitial) ||
            file.startsWith(expectedFilenameSecond))

          const graphML = await readFile(join(testDir, file), 'UTF-8')
          if (file.startsWith(expectedFilenameSimple)) {
            assert.ok(graphML.includes('hJc9ZK1sGr'))
            assert.ok(graphML.includes('W0XNNnar') === false)
            assert.ok(graphML.includes('NsybZB0LO4') === false)
          } else if (file.startsWith(expectedFilenameInitial)) {
            assert.ok(graphML.includes('NsybZB0LO4'))
            assert.ok(graphML.includes('W0XNNnar') === false)
            assert.ok(graphML.includes('hJc9ZK1sGr') === false)
          } else if (file.startsWith(expectedFilenameSecond)) {
            assert.ok(graphML.includes('W0XNNnar'))
            assert.ok(graphML.includes('NsybZB0LO4') === false)
            assert.ok(graphML.includes('hJc9ZK1sGr') === false)
          }
        }
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })

    it('cross-site (A->B)', async () => {
      // Crawl with one redirect, cross-site.
      const initialUrl = `${testBaseUrl}/redirect-js-cross-site.html`
      // This has to be hard-coded because it's being set in redirect-js-cross-site.html
      const finalUrl = 'http://127.0.0.1:3000/simple.html'
      const expectedFilenameInitial = getExpectedFilename(initialUrl)
      const expectedFilenameFinal = getExpectedFilename(finalUrl)

      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(initialUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 2)

        for (const file of files) {
          assert.ok(file.endsWith(graphMlExtension))
          assert.ok(file.startsWith(expectedFilenameFinal) ||
            file.startsWith(expectedFilenameInitial))
          const graphML = await readFile(join(testDir, file), 'UTF-8')
          if (file.startsWith(expectedFilenameInitial)) {
            assert.ok(graphML.includes('Zym8MZp'))
            assert.ok(graphML.includes('hJc9ZK1sGr') === false)
          } else {
            assert.ok(graphML.includes('hJc9ZK1sGr'))
            assert.ok(graphML.includes('Zym8MZp') === false)
          }
        }
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })

    it('cross-site chain (A->B->A)', async () => {
      // Crawl with recursive redirects, cross-site.
      const initialUrl = `${testBaseUrl}/redirect-chain-A.html`
      // This has to be hard-coded because it's being set in redirect-chain-A.html
      const finalUrl = 'http://127.0.0.1:3000/redirect-chain-B.html'
      const expectedFilenameInitial = getExpectedFilename(initialUrl)
      const expectedFilenameFinal = getExpectedFilename(finalUrl)

      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(initialUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 2)

        for (const file of files) {
          assert.ok(file.endsWith(graphMlExtension))
          assert.ok(file.startsWith(expectedFilenameFinal) ||
            file.startsWith(expectedFilenameInitial))
          const graphML = await readFile(join(testDir, file), 'UTF-8')
          if (file.startsWith(expectedFilenameInitial)) {
            assert.ok(graphML.includes('Jro8qF9KOg'))
            assert.ok(graphML.includes('Ec9Z5dlgA5') === false)
          } else {
            assert.ok(graphML.includes('Ec9Z5dlgA5'))
            assert.ok(graphML.includes('Jro8qF9KOg') === false)
          }
        }
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })
  })

  describe('cookies', () => {
    it('request cookies', async () => {
      const testDir = await _createTempOutputDir()
      try {
        const cookiesTestUrl = makeTestUrl('cookies.html')
        await _crawlUrl(cookiesTestUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 1)

        const file = files[0]
        const graphML = await readFile(join(testDir, file), 'UTF-8')

        // First check and make sure we only see one the below string
        // once, which will appear in the cookie header.
        const cookieHeader = graphML.match(/test-cookie=value-[0-9]+/g) || []
        assert.equal(cookieHeader.length, 1)
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })
  })

  describe('requests and header rewriting', () => {
    const workerTestUrl = `${testBaseUrl}/worker.html`
    it('requests made in worker script', async () => {
      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(workerTestUrl, testDir)
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 1)

        const file = files[0]
        const graphML = await readFile(join(testDir, file), 'UTF-8')
        assert.ok(!graphML.includes('interception-job-'))
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })
  })

  describe('HAR recording', () => {
    it('without response bodies', async () => {
      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(simpleUrl, testDir, { '--har': null })
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 2)

        const harFile = files.find(file => file.endsWith('.har'))
        assert.ok(harFile !== undefined)

        const har = await readFile(join(testDir, harFile), 'UTF-8')
        assert.ok(har.includes('hJc9ZK1sGr') === false)
        const parsedHAR = validateHAR(har)

        assert.equal(parsedHAR.log.entries.length, 2)
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })

    it('with response bodies', async () => {
      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(simpleUrl, testDir, {
          '--har': null,
          '--har-body': null
        })
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 2)

        const harFile = files.find(file => file.endsWith('.har'))
        assert.ok(harFile !== undefined)

        const har = await readFile(join(testDir, harFile), 'UTF-8')
        assert.ok(har.includes('hJc9ZK1sGr'))
        const parsedHAR = validateHAR(har)

        assert.equal(parsedHAR.log.entries.length, 2)
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })

    it('with subresources', async () => {
      const resourcesUrl = `${testBaseUrl}/resources.html`

      const testDir = await _createTempOutputDir()
      try {
        await _crawlUrl(resourcesUrl, testDir, {
          '--har': null,
          '--har-body': null
        })
        const files = await _readCrawlResults(testDir)
        assert.equal(files.length, 2)

        const harFile = files.find(file => file.endsWith('.har'))
        assert.ok(harFile !== undefined)

        const har = await readFile(join(testDir, harFile), 'UTF-8')
        const parsedHAR = validateHAR(har)
        assert.equal(parsedHAR.log.entries.length, 5)

        const firstLogEntry = parsedHAR.log.entries[1]
        const secondLogEntry = parsedHAR.log.entries[2]
        const thirdLogEntry = parsedHAR.log.entries[3]

        assert.ok(firstLogEntry.request.url.endsWith('resources/script.js'))
        assert.equal(firstLogEntry.response.status, 200)

        assert.ok(secondLogEntry.request.url.includes('g7823rbhifgu12.org'))
        assert.equal(secondLogEntry.response.status, 404)

        assert.ok(thirdLogEntry.request.url.endsWith('resources/document.svg'))
        assert.ok(thirdLogEntry.response.content.text.includes('<circle'))
      } finally {
        await _cleanupTempOutputDir(testDir)
      }
    })
  })
})
