/* eslint-env mocha */

import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { rmSync, existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'

import app from './test_server.js'

// Check filename with .startsWith()
const getExpectedFilename = (url) => {
  return `page_graph_${url?.replace(/[^\w]/g, '_')}`
}
// Check filename with .endsWith()
const graphMlExtension = '.graphml'

const DEBUG = process.env.DEBUG
const port = process.env.PAGEGRAPH_CRAWL_TEST_PORT || 3000
const baseUrl = process.env.PAGEGRAPH_CRAWL_TEST_BASE_URL || 'http://localhost'

const testBaseUrl = `${baseUrl}:${port}`
const simpleUrl = `${testBaseUrl}/simple.html`
const expectedFilenameSimple = getExpectedFilename(simpleUrl)

if (DEBUG) {
  console.log(`simpleUrl: ${simpleUrl}`)
  console.log(`expectedFilenameSimple: ${expectedFilenameSimple}`)
}

const createTempOutputDir = () => {
  const tempDirPath = mkdtempSync(join(tmpdir(), 'pagegraph-crawl-test-'))
  if (DEBUG) {
    console.log(`Created temporary directory: ${tempDirPath}`)
  }
  return tempDirPath
}

const cleanupTempOutputDir = (outputPath) => {
  if (DEBUG) {
    console.log(`Removing temporary directory: ${outputPath}`)
  }
  if (existsSync(outputPath)) {
    rmSync(outputPath, { recursive: true, force: true })
  }
}

const readCrawlResults = (outputPath) => {
  if (!DEBUG) {
    return
  }
  const files = readdirSync(outputPath)
  console.log('readCrawlResults:')
  console.log(`Contents of ${outputPath}: ${JSON.stringify(files)}`)
  return files
}

const validateHAR = (har) => {
  let parsedHAR
  try {
    parsedHAR = JSON.parse(har)
  } catch (err) {
    throw new Error(`Invalid JSON in file: ${har}`)
  }

  assert.equal(typeof parsedHAR, 'object')
  assert.ok(parsedHAR.log.pages !== undefined)
  assert.ok(parsedHAR.log.entries !== undefined)

  const entries = parsedHAR.log.entries
  assert.ok(Array.isArray(entries))
  assert.ok(entries.length > 0)

  for (const entry of entries) {
    assert.ok(entry.request !== undefined)
    assert.ok(entry.response !== undefined)
    assert.ok(entry.timings !== undefined)

    const request = entry.request
    assert.ok(request.method !== undefined)
    assert.ok(request.url !== undefined)
    assert.ok(request.headers !== undefined)
    assert.ok(Array.isArray(request.headers))
    assert.ok(request.headers.length > 0)

    const response = entry.response
    assert.ok(response.status !== undefined)
    assert.equal(typeof response.status, 'number')
    assert.ok(response.content !== undefined)
    assert.ok(response.content.mimeType !== undefined)
    assert.ok(response.content.size !== undefined)

    const timings = entry.timings
    assert.ok(timings.blocked !== undefined)
    assert.ok(timings.dns !== undefined)
    assert.ok(timings.connect !== undefined)
    assert.ok(timings.send !== undefined)
    assert.ok(timings.wait !== undefined)
    assert.ok(timings.receive !== undefined)
  }

  return parsedHAR
}

describe('PageGraph Crawl CLI', () => {
  // Setup and teardown for the test suite.
  let server
  before((done) => {
    server = app.listen(port, () => {
      done()
    })
  })
  after((done) => {
    server.close(done)
    if (DEBUG) {
      console.log('Test server has closed')
    }
  })

  const doCrawl = (url, outputDir, args) => {
    const crawlCommand = ['run', 'crawl', '--']
    const crawlFlags = {
      '-u': url,
      '-t': 5,
      '-o': outputDir
    }

    if (process.env.PAGEGRAPH_CRAWL_TEST_BINARY_PATH) {
      crawlFlags['--binary'] = process.env.PAGEGRAPH_CRAWL_TEST_BINARY_PATH
    }

    if (DEBUG) {
      crawlFlags['--logging'] = 'info'
    }

    if (args !== undefined) {
      for (const [key, value] of Object.entries(args)) {
        crawlFlags[key] = value
      }
    }

    for (const [cmdKey, cmdValue] of Object.entries(crawlFlags)) {
      crawlCommand.push(cmdKey)
      if (cmdValue) {
        crawlCommand.push(cmdValue)
      }
    }

    if (DEBUG) {
      console.log('Launching crawl child process: npm ' + crawlCommand.join(' '))
    }

    const crawlProcess = spawn('npm', crawlCommand, {
      stdio: DEBUG ? 'inherit' : 'ignore'
    })

    return new Promise(resolve => {
      crawlProcess.on('exit', code => {
        resolve(code)
      })
    })
  }

  // === SIMPLE TESTS ===
  it('works for simple case', async () => {
    const testDir = createTempOutputDir()
    try {
      await doCrawl(simpleUrl, testDir)
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 1)

      const file = files[0]
      assert.ok(file.startsWith(expectedFilenameSimple))
      assert.ok(file.endsWith(graphMlExtension))

      const graphml = readFileSync(join(testDir, file), 'UTF-8')
      assert.ok(graphml.includes('hJc9ZK1sGr'))
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  // === REDIRECT TESTS ===
  it('works for redirect case (same-site)', async () => {
    const initialUrl = `${testBaseUrl}/redirect-js-same-site.html`
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    if (DEBUG) {
      console.log(`initialUrl: ${initialUrl}`)
      console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)
    }

    const testDir = createTempOutputDir()
    try {
      await doCrawl(initialUrl, testDir)
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 2)

      for (const file of files) {
        assert.ok(file.endsWith(graphMlExtension))
        assert.ok(file.startsWith(expectedFilenameSimple) ||
          file.startsWith(expectedFilenameInitial))

        const graphml = readFileSync(join(testDir, file), 'UTF-8')
        if (file.startsWith(expectedFilenameSimple)) {
          assert.ok(graphml.includes('hJc9ZK1sGr'))
          assert.ok(graphml.includes('W0XNNnar') === false)
        } else {
          assert.ok(graphml.includes('W0XNNnar'))
          assert.ok(graphml.includes('hJc9ZK1sGr') === false)
        }
      }
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  it('works for multiple redirect case', async () => {
    const initialUrl = `${testBaseUrl}/multiple-redirects-js-same-site.html`
    const secondUrl = `${testBaseUrl}/redirect-js-same-site.html`
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameSecond = getExpectedFilename(secondUrl)
    if (DEBUG) {
      console.log(`initialUrl: ${initialUrl}`)
      console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)
      console.log(`secondUrl: ${secondUrl}`)
      console.log(`expectedFilenameSecond: ${expectedFilenameSecond}`)
    }

    const testDir = createTempOutputDir()
    try {
      await doCrawl(initialUrl, testDir)
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 3)

      for (const file of files) {
        assert.ok(file.endsWith(graphMlExtension))
        assert.ok(file.startsWith(expectedFilenameSimple) ||
          file.startsWith(expectedFilenameInitial) ||
          file.startsWith(expectedFilenameSecond))

        const graphml = readFileSync(join(testDir, file), 'UTF-8')
        if (file.startsWith(expectedFilenameSimple)) {
          assert.ok(graphml.includes('hJc9ZK1sGr'))
          assert.ok(graphml.includes('W0XNNnar') === false)
          assert.ok(graphml.includes('NsybZB0LO4') === false)
        } else if (file.startsWith(expectedFilenameInitial)) {
          assert.ok(graphml.includes('NsybZB0LO4'))
          assert.ok(graphml.includes('W0XNNnar') === false)
          assert.ok(graphml.includes('hJc9ZK1sGr') === false)
        } else if (file.startsWith(expectedFilenameSecond)) {
          assert.ok(graphml.includes('W0XNNnar'))
          assert.ok(graphml.includes('NsybZB0LO4') === false)
          assert.ok(graphml.includes('hJc9ZK1sGr') === false)
        }
      }
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  it('works for redirect case (cross-site)', async () => {
    // Crawl with one redirect, cross-site.
    const initialUrl = `${testBaseUrl}/redirect-js-cross-site.html`
    // This has to be hard-coded because it's being set in redirect-js-cross-site.html
    const finalUrl = 'http://127.0.0.1:3000/simple.html'
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameFinal = getExpectedFilename(finalUrl)
    if (DEBUG) {
      console.log(`initialUrl: ${initialUrl}`)
      console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)
    }

    const testDir = createTempOutputDir()
    try {
      await doCrawl(initialUrl, testDir)
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 2)

      for (const file of files) {
        assert.ok(file.endsWith(graphMlExtension))
        assert.ok(file.startsWith(expectedFilenameFinal) ||
          file.startsWith(expectedFilenameInitial))
        const graphml = readFileSync(join(testDir, file), 'UTF-8')
        if (file.startsWith(expectedFilenameInitial)) {
          assert.ok(graphml.includes('Zym8MZp'))
          assert.ok(graphml.includes('hJc9ZK1sGr') === false)
        } else {
          assert.ok(graphml.includes('hJc9ZK1sGr'))
          assert.ok(graphml.includes('Zym8MZp') === false)
        }
      }
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  it('works for redirect chain case (A->B->A)', async () => {
    // Crawl with recursive redirects, cross-site.
    const initialUrl = `${testBaseUrl}/redirect-chain-A.html`
    // This has to be hard-coded because it's being set in redirect-chain-A.html
    const finalUrl = 'http://127.0.0.1:3000/redirect-chain-B.html'
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameFinal = getExpectedFilename(finalUrl)
    if (DEBUG) {
      console.log(`initialUrl: ${initialUrl}`)
      console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)
    }

    const testDir = createTempOutputDir()
    try {
      await doCrawl(initialUrl, testDir)
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 2)

      files.forEach((file) => {
        assert.ok(file.endsWith(graphMlExtension))
        assert.ok(file.startsWith(expectedFilenameFinal) ||
          file.startsWith(expectedFilenameInitial))
        const graphml = readFileSync(join(testDir, file), 'UTF-8')
        if (file.startsWith(expectedFilenameInitial)) {
          assert.ok(graphml.includes('Jro8qF9KOg'))
          assert.ok(graphml.includes('Ec9Z5dlgA5') === false)
        } else {
          assert.ok(graphml.includes('Ec9Z5dlgA5'))
          assert.ok(graphml.includes('Jro8qF9KOg') === false)
        }
      })
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  it('HAR works for simple case', async () => {
    const testDir = createTempOutputDir()
    try {
      await doCrawl(simpleUrl, testDir, { '--har': null })
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 2)

      const harFile = files.find(file => file.endsWith('.har'))
      assert.ok(harFile !== undefined)

      const har = readFileSync(join(testDir, harFile), 'UTF-8')
      assert.ok(har.includes('hJc9ZK1sGr') === false)
      const parsedHAR = validateHAR(har)

      assert.equal(parsedHAR.log.entries.length, 2)
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  it('HAR body works for simple case', async () => {
    const testDir = createTempOutputDir()
    try {
      await doCrawl(simpleUrl, testDir, { '--har': null, '--har-body': null })
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 2)

      const harFile = files.find(file => file.endsWith('.har'))
      assert.ok(harFile !== undefined)

      const har = readFileSync(join(testDir, harFile), 'UTF-8')
      assert.ok(har.includes('hJc9ZK1sGr'))
      const parsedHAR = validateHAR(har)

      assert.equal(parsedHAR.log.entries.length, 2)
    } finally {
      cleanupTempOutputDir(testDir)
    }
  })

  it('HAR body works for resources case', async () => {
    const resourcesUrl = `${testBaseUrl}/resources.html`

    const testDir = createTempOutputDir()
    try {
      await doCrawl(resourcesUrl, testDir, {
        '--har': null,
        '--har-body': null
      })
      const files = readCrawlResults(testDir)
      assert.equal(files.length, 2)

      const harFile = files.find(file => file.endsWith('.har'))
      assert.ok(harFile !== undefined)

      const har = readFileSync(join(testDir, harFile), 'UTF-8')
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
      cleanupTempOutputDir(testDir)
    }
  })
})
