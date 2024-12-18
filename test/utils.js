import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { createTempDir } from '../built/brave/files.js'

export const crawlUrl = (url, outputDir, args = null, binaryPath = null, debug = false) => {
  const crawlCommand = ['run', 'crawl', '--']
  const crawlFlags = {
    '-u': url,
    '-t': 5,
    '-o': outputDir
  }

  if (binaryPath !== null) {
    crawlFlags['--binary'] = binaryPath
  }

  if (debug === true) {
    crawlFlags['--logging'] = 'info'
  }

  if (args !== null) {
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

  if (debug) {
    console.log('Launching crawl child process: npm ' + crawlCommand.join(' '))
  }

  const crawlProcess = spawn('npm', crawlCommand, {
    stdio: debug ? 'inherit' : 'ignore'
  })

  return new Promise(resolve => {
    crawlProcess.on('exit', code => {
      resolve(code)
    })
  })
}

export const createTempOutputDir = async (debug = false) => {
  const tempDirPath = await createTempDir()
  if (debug) {
    console.log(`Created temporary directory: ${tempDirPath}`)
  }
  return tempDirPath
}

export const cleanupTempOutputDir = async (outputPath, debug = false) => {
  if (debug) {
    console.log(`Removing temporary directory: ${outputPath}`)
  }
  return await rm(outputPath, { recursive: true, force: true })
}

export const readCrawlResults = async (outputPath, debug = false) => {
  const files = await readdir(outputPath)
  if (debug) {
    const fileNames = JSON.stringify(files)
    console.log(`readCrawlResults: Contents of ${outputPath}: ${fileNames}`)
  }
  return files
}

export const startServer = (port = 8080, debug = false) => {
  const testPagesPath = join(new URL('.', import.meta.url).pathname, 'pages')
  const httpServerCmd = ['http-server', testPagesPath, '-p', port]

  const spawnOptions = {
    stdio: ['ignore', 'pipe', 'inherit']
  }
  if (debug === false) {
    // This is kinda a lot, but unless we're in debug mode, we suppress
    // all warnings from the http-server, in order to suppress
    // the not-helpful-at-all deprecation error.
    const currentEnv = JSON.parse(JSON.stringify(process.env))
    currentEnv.NODE_NO_WARNINGS = '1'
    spawnOptions.env = currentEnv
  }

  const serverProcess = spawn('npx', httpServerCmd, spawnOptions)

  return new Promise((resolve) => {
    let hasResolved = false
    const bootMsg = 'Hit CTRL-C to stop the server'

    serverProcess.stdout.on('data', data => {
      const msg = data.toString()
      const isFirstBootMsg = msg.includes(bootMsg)
      if (debug) {
        process.stdout.write(msg)
      }
      if (isFirstBootMsg && hasResolved === false) {
        hasResolved = true
        resolve(serverProcess)
      }
    })
  })
}

export const validateHAR = (har) => {
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

export const getExpectedFilename = (url) => {
  const fileNameSafeUrl = url?.replace(/[^\w]/g, '_')
  return `page_graph_${fileNameSafeUrl}`
}
