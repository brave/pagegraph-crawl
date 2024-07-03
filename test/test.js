
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, cpSync } from 'fs'
import { expect } from 'chai'
import { resolve, join } from 'path'
import { config } from './config.js'
import app from './test_server.js'
import util from 'util' // Import the server instance
import { exec } from 'child_process'
const execPromise = util.promisify(exec)
// Check filename with .startsWith()
const getExpectedFilename = (url) => {
  return `page_graph_${url?.replace(/[^\w]/g, '_')}`
}
// Check filename with .endsWith()
const graphMlExtension = '.graphml'

const DEBUG = process.env.DEBUG || config.debug
const port = process.env.PORT || config.port
const pagegraphBinaryPath = process.env.PAGEGRAPH || config.pagegraph
DEBUG && console.log(`pagegraphBinaryPath: ${pagegraphBinaryPath}`)
// Check if pagegraph binary is set
if (!pagegraphBinaryPath) {
  throw new Error('PAGEGRAPH BINARY PATH environment variable not set')
}
const baseUrl = `${process.env.BASE_URL || config.baseUrl}:${port}`

const simpleUrl = `${baseUrl}/simple.html`
const expectedFilenameSimple = getExpectedFilename(simpleUrl)

// This gets passed to the pagegraph crawl script as --debug
const debugArg = DEBUG ? '--debug debug' : ''

const outputDir = resolve(join('test', 'output'))
const debugOutputDir = resolve(join('test', 'debug_output'))
DEBUG && console.log(`outputDir: ${outputDir}`)
DEBUG && console.log(`debugOutputDir: ${debugOutputDir}`)
DEBUG && console.log(`simpleUrl: ${simpleUrl}`)
DEBUG && console.log(`expectedFilenameSimple: ${expectedFilenameSimple}`)

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

  const doCrawl = (url) => {
    const crawlPromise = execPromise(
      `npm run crawl -- -b ${pagegraphBinaryPath} -u ${url} -t 5 -o ${outputDir} ${debugArg}`
    )
    DEBUG && crawlPromise.child.stdout.on('data', function (data) {
      console.log(data)
    })
    return crawlPromise
  }

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

  it('works for redirect case (same-site)', async () => {
    // Crawl with one redirect, same-site.
    const initialUrl = `${baseUrl}/redirect-js-same-site.html`
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
    const initialUrl = `${baseUrl}/multiple-redirects-js-same-site.html`
    const secondUrl = `${baseUrl}/redirect-js-same-site.html`
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
    const initialUrl = `${baseUrl}/redirect-js-cross-site.html`
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
    const initialUrl = `${baseUrl}/redirect-chain-A.html`
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
})
