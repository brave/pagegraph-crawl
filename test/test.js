
import { execSync } from 'child_process'
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs'
import { expect } from 'chai'
import { resolve, join } from 'path'
import { config } from './config.js'

// Check filename with .startsWith()
const getExpectedFilename = (url) => {
  return `page_graph_${url?.replace(/[^\w]/g, '_')}`
}
// Check filename with .endsWith()
const graphMlExtension = '.graphml'

const DEBUG = process.env.DEBUG || config.debug
const pagegraphBinaryPath = process.env.PAGEGRAPH || config.pagegraph
DEBUG && console.log(`pagegraphBinaryPath: ${pagegraphBinaryPath}`)
// Check if pagegraph binary is set
if (!pagegraphBinaryPath) {
  throw new Error('PAGEGRAPH BINARY PATH environment variable not set')
}
const baseUrl = process.env.BASE_URL || config.baseUrl
const simpleUrl = `${baseUrl}/simple.html`
const expectedFilenameSimple = getExpectedFilename(simpleUrl)

// This gets passed to the pagegraph crawl script as --debug
const debugArg = DEBUG ? '--debug debug' : ''

const outputDir = resolve(join('test', 'output'))
DEBUG && console.log(`outputDir: ${outputDir}`)
DEBUG && console.log(`simpleUrl: ${simpleUrl}`)
DEBUG && console.log(`expectedFilenameSimple: ${expectedFilenameSimple}`)

beforeEach('Create output directory', () => {
  mkdirSync(outputDir, { recursive: true })
})

afterEach('Clean up output directory', () => {
  if (!DEBUG) {
    rmSync(outputDir, { recursive: true, force: true })
  }
})

describe('PageGraph Crawl CLI', () => {
  it('works for simple case', () => {
    execSync(
      `npm run crawl -- -b ${pagegraphBinaryPath} -u ${simpleUrl} -t 5 -o ${outputDir}  ${debugArg}`,
      {
        stdio: 'inherit'
      }
    )
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

  it('works for redirect case (same-site)', () => {
    // Crawl with one redirect, same-site.
    const initialUrl = `${baseUrl}/redirect-js-same-site.html`
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)

    execSync(
      `npm run crawl -- -b ${pagegraphBinaryPath} -u ${initialUrl} -t 5 -o ${outputDir}  ${debugArg}`,
      {
        stdio: 'inherit'
      }
    )
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
      } else {
        expect(graphml).to.contain('W0XNNnar')
      }
    })
  })

  it('works for multiple redirect case', () => {
    // Crawl with multiple redirects, same-site.
    const initialUrl = `${baseUrl}/multiple-redirects-js-same-site.html`
    const secondUrl = `${baseUrl}/redirect-js-same-site.html`
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameSecond = getExpectedFilename(secondUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)
    DEBUG && console.log(`secondUrl: ${secondUrl}`)
    DEBUG && console.log(`expectedFilenameSecond: ${expectedFilenameSecond}`)

    execSync(
      `npm run crawl -- -b ${pagegraphBinaryPath} -u ${initialUrl} -t 5 -o ${outputDir}  ${debugArg}`,
      {
        stdio: 'inherit'
      }
    )
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
      } else if (file.startsWith(expectedFilenameInitial)) {
        expect(graphml).to.contain('NsybZB0LO4')
      } else if (file.startsWith(expectedFilenameSecond)) {
        expect(graphml).to.contain('W0XNNnar')
      }
    })
  })

  it('works for redirect case (cross-site)', () => {
    // Crawl with one redirect, cross-site.
    const initialUrl = `${baseUrl}/redirect-js-cross-site.html`
    const finalUrl = 'https://brave.com'
    const expectedFilenameInitial = getExpectedFilename(initialUrl)
    const expectedFilenameFinal = getExpectedFilename(finalUrl)
    DEBUG && console.log(`initialUrl: ${initialUrl}`)
    DEBUG && console.log(`expectedFilenameInitial: ${expectedFilenameInitial}`)

    execSync(
      `npm run crawl -- -b ${pagegraphBinaryPath} -u ${initialUrl} -t 5 -o ${outputDir}  ${debugArg}`,
      {
        stdio: 'inherit'
      }
    )
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
      }
    })
  })
})
