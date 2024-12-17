import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, cpSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { expect } from 'chai'
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
const pageGraphBinaryPath = process.env.PAGEGRAPH_CRAWL_TEST_BINARY_PATH

const testBaseUrl = `${baseUrl}:${port}`
const simpleUrl = `${testBaseUrl}/simple.html`
const expectedFilenameSimple = getExpectedFilename(simpleUrl)

const outputDir = resolve(join('test', 'output'))
const debugOutputDir = resolve(join('test', 'debug_output'))

if (DEBUG) {
  console.log(`outputDir: ${outputDir}`)
  console.log(`debugOutputDir: ${debugOutputDir}`)
  console.log(`simpleUrl: ${simpleUrl}`)
  console.log(`expectedFilenameSimple: ${expectedFilenameSimple}`)
}

describe('PageGraph Crawl CLI', () => {
  // Setup and teardown for the test suite.
  let server
  beforeEach('Create output directory', () => {
    rmSync(outputDir, { recursive: true, force: true })
    mkdirSync(outputDir, { recursive: true })
  })
  afterEach('Clean up output directory', () => {
    if (DEBUG) {
      // Copy over test files to debug output directory for manual inspection.
      if (!existsSync(debugOutputDir)) {
        mkdirSync(debugOutputDir, { recursive: true })
      }
      cpSync(outputDir, debugOutputDir, {recursive: true});
    }
    rmSync(outputDir, { recursive: true, force: true })
  })
  before((done) => {
    server = app.listen(port, () => {
      done()
    })
  })
  after((done) => {
    server.close(done)
    DEBUG && console.log('Test server has closed')
  })

  const doCrawl = (url, args) => {
    const crawlCommand = ['run', 'crawl', '--']
    const crawlFlags = {
      '-u': url,
      '-t': 5,
      '-o': outputDir,
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
    await doCrawl(simpleUrl)
    // Check output/
    expect(existsSync(outputDir)).to.be.true
    // Check output/page_graph_simple_html.graphml
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(1)
    const file = files[0]
    expect(file.startsWith(expectedFilenameSimple)).to.be.true
    expect(file.endsWith(graphMlExtension)).to.be.true
    // Check contents.
    const graphml = readFileSync(join(outputDir, file), 'UTF-8')
    expect(graphml).to.contain('hJc9ZK1sGr')
  })

  // === REDIRECT TESTS ===
  it('works for redirect case (same-site)', async () => {
    // Crawl with one redirect, same-site.
    const initialUrl = `${testBaseUrl}/redirect-js-same-site.html`
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)

    await doCrawl(initialUrl)
    // Check output/
    expect(existsSync(outputDir)).to.be.true
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(2)
    files.forEach((file) => {
      expect(file.endsWith(graphMlExtension)).to.be.true
      expect(file.startsWith(expectedFilenameSimple) || file.startsWith(expectedFilenameInitial)).to.be.true
      const graphml = readFileSync(join(outputDir, file), 'UTF-8')
      if (file.startsWith(expectedFilenameSimple)) {
        expect(graphml).to.contain('hJc9ZK1sGr')
        expect(graphml).to.not.contain('W0XNNnar')
      } else {
        expect(graphml).to.contain('W0XNNnar')
        expect(graphml).to.not.contain('hJc9ZK1sGr')
      }
    })
  })

  it('works for multiple redirect case', async () => {
    // Crawl with multiple redirects, same-site.
    const initialUrl = `${testBaseUrl}/multiple-redirects-js-same-site.html`
    const secondUrl = `${testBaseUrl}/redirect-js-same-site.html`
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameSecond = getExpectedFilename(secondUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)
    DEBUG && console.log(`secondUrl: ${secondUrl}`)
    DEBUG && console.log(`expectedFilenameSecond: ${expectedFilenameSecond}`)

    await doCrawl(initialUrl)
    // Check output/
    expect(existsSync(outputDir)).to.be.true
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(3)
    files.forEach((file) => {
      expect(file.endsWith(graphMlExtension)).to.be.true
      expect(file.startsWith(expectedFilenameSimple) || file.startsWith(expectedFilenameInitial) || file.startsWith(expectedFilenameSecond)).to.be.true
      const graphml = readFileSync(join(outputDir, file), 'UTF-8')
      if (file.startsWith(expectedFilenameSimple)) {
        expect(graphml).to.contain('hJc9ZK1sGr')
        expect(graphml).to.not.contain('W0XNNnar')
        expect(graphml).to.not.contain('NsybZB0LO4')
      } else if (file.startsWith(expectedFilenameInitial)) {
        expect(graphml).to.contain('NsybZB0LO4')
        expect(graphml).to.not.contain('W0XNNnar')
        expect(graphml).to.not.contain('hJc9ZK1sGr')
      } else if (file.startsWith(expectedFilenameSecond)) {
        expect(graphml).to.contain('W0XNNnar')
        expect(graphml).to.not.contain('NsybZB0LO4')
        expect(graphml).to.not.contain('hJc9ZK1sGr')
      }
    })
  })

  it('works for redirect case (cross-site)', async () => {
    // Crawl with one redirect, cross-site.
    const initialUrl = `${testBaseUrl}/redirect-js-cross-site.html`
    // This has to be hard-coded because it's being set in redirect-js-cross-site.html
    const finalUrl = 'http://127.0.0.1:3000/simple.html'
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameFinal = getExpectedFilename(finalUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)

    await doCrawl(initialUrl)

    // Check output/
    expect(existsSync(outputDir)).to.be.true
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(2)
    files.forEach((file) => {
      expect(file.endsWith(graphMlExtension)).to.be.true
      expect(file.startsWith(expectedFilenameFinal) || file.startsWith(expectedFilenameInitial)).to.be.true
      const graphml = readFileSync(join(outputDir, file), 'UTF-8')
      if (file.startsWith(expectedFilenameInitial)) {
        expect(graphml).to.contain('Zym8MZp')
        expect(graphml).to.not.contain('hJc9ZK1sGr')
      } else {
        expect(graphml).to.contain('hJc9ZK1sGr')
        expect(graphml).to.not.contain('Zym8MZp')
      }
    })
  })

  it('works for redirect chain case (A->B->A)', async () => {
    // Crawl with recursive redirects, cross-site.
    const initialUrl = `${testBaseUrl}/redirect-chain-A.html`
    // This has to be hard-coded because it's being set in redirect-chain-A.html
    const finalUrl = 'http://127.0.0.1:3000/redirect-chain-B.html'
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameFinal = getExpectedFilename(finalUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)

    await doCrawl(initialUrl)

    // Check output/
    expect(existsSync(outputDir)).to.be.true
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(2)
    files.forEach((file) => {
      expect(file.endsWith(graphMlExtension)).to.be.true
      expect(file.startsWith(expectedFilenameFinal) || file.startsWith(expectedFilenameInitial)).to.be.true
      const graphml = readFileSync(join(outputDir, file), 'UTF-8')
      if (file.startsWith(expectedFilenameInitial)) {
        expect(graphml).to.contain('Jro8qF9KOg')
        expect(graphml).to.not.contain('Ec9Z5dlgA5')
      } else {
        expect(graphml).to.contain('Ec9Z5dlgA5')
        expect(graphml).to.not.contain('Jro8qF9KOg')
      }
    })
  })

  // === HAR TESTS ===
  const validateHAR = (har) => {
      let parsedHAR
      try {
        parsedHAR = JSON.parse(har)
      } catch (err) {
          throw new Error(`Invalid JSON in file: ${harFile}`)
      }

      expect(parsedHAR).to.be.an('object')
      expect(parsedHAR.log).to.have.property('pages')
      expect(parsedHAR.log).to.have.property('entries')

      const entries = parsedHAR.log.entries
      expect(entries).to.be.an('array')
      expect(entries).to.have.length.greaterThan(0)
      
      entries.forEach(entry => {
        expect(entry).to.have.property('request')
        expect(entry).to.have.property('response')
        expect(entry).to.have.property('timings')

        // Request Checks
        const request = entry.request;
        expect(request).to.have.property('method')
        expect(request).to.have.property('url')
        expect(request).to.have.property('headers')
        expect(request.headers).to.be.an('array')
        expect(request.headers).to.have.length.greaterThan(0)

        // Response Checks
        const response = entry.response;
        expect(response).to.have.property('status')
        expect(response.status).to.be.a('number')
        expect(response).to.have.property('content')
        expect(response.content).to.have.property('mimeType')
        expect(response.content).to.have.property('size')

        // Timing Checks
        const timings = entry.timings;
        expect(timings).to.have.property('blocked')
        expect(timings).to.have.property('dns')
        expect(timings).to.have.property('connect')
        expect(timings).to.have.property('send')
        expect(timings).to.have.property('wait')
        expect(timings).to.have.property('receive')
      })

      return parsedHAR;
  }

  it('HAR works for simple case', async () => {
    await doCrawl(simpleUrl, {"--har": null})
    // Check output/
    expect(existsSync(outputDir)).to.be.true
    // Check output/page_graph_simple_html.graphml
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(2)
    const harFile = files.find(file => file.endsWith('.har'));
    expect(harFile).to.not.be.undefined;
    // Check contents.
    const har = readFileSync(join(outputDir, harFile), 'UTF-8')
    expect(har).to.not.contain('hJc9ZK1sGr')    
    const parsedHAR = validateHAR(har)
    // Check number of requests. Should have intial and favicon
    expect(parsedHAR.log.entries.length).to.equal(2)
  })

  it('HAR body works for simple case', async () => {
    await doCrawl(simpleUrl, {"--har": null, "--har-body": null})
    // Check output/
    expect(existsSync(outputDir)).to.be.true
    // Check output/page_graph_simple_html.graphml
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(2)
    const harFile = files.find(file => file.endsWith('.har'));
    expect(harFile).to.not.be.undefined;
    // Check contents.
    const har = readFileSync(join(outputDir, harFile), 'UTF-8')
    expect(har).to.contain('hJc9ZK1sGr')      
    const parsedHAR = validateHAR(har)
    // Check number of requests. Should have intial and favicon
    expect(parsedHAR.log.entries.length).to.equal(2)
  })

  it('HAR body works for resources case', async () => {
    const resourcesUrl = `${testBaseUrl}/resources.html`
    await doCrawl(resourcesUrl, {"--har": null, "--har-body": null})
    // Check output/
    expect(existsSync(outputDir)).to.be.true
    // Check output/page_graph_simple_html.graphml
    const files = readdirSync(outputDir)
    expect(files.length).to.equal(2)
    const harFile = files.find(file => file.endsWith('.har'));
    expect(harFile).to.not.be.undefined;
    // Check contents.
    const har = readFileSync(join(outputDir, harFile), 'UTF-8')   
    const parsedHAR = validateHAR(har)
    expect(parsedHAR.log.entries.length).to.equal(5)
    expect(parsedHAR.log.entries[1].request.url).to.contain('resources-example.js')
    expect(parsedHAR.log.entries[1].response.status).to.equal(200)
    expect(parsedHAR.log.entries[2].request.url).to.contain('g7823rbhifgu12.org')
    expect(parsedHAR.log.entries[2].response.status).to.equal(404)
    expect(parsedHAR.log.entries[3].request.url).to.contain('resources-example.svg')
    expect(parsedHAR.log.entries[3].response.content.text).to.contain('<circle')
  })
})
