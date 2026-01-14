import fs from 'node:fs'
import { readFile } from 'node:fs/promises'

import type { HTTPRequest, HTTPResponse } from 'puppeteer-core'
import XmlStream from 'xml-stream'

import { GraphMLModifier } from './graphml.js'

type HTTPRequestType = typeof HTTPRequest
type HTTPResponseType = typeof HTTPResponse

type PuppeteerRequestId = string
type RequestId = number | string
type RequestToHeadersMap = Record<RequestId, HTTPHeader[]>

interface HTTPHeader {
  name: string
  value: string
}

enum AddHeadersResult {
  ADDED,
  REDUNDANT,
  OVERWRITE,
}

const edgeAttrNameEdgeType = 'edge type'
const edgeAttrNameRequestId = 'request id'
const edgeAttrNameHeaders = 'headers'

const requestIdPatternWorker = /interception-job-([0-9]+)\.0/
const requestIdPatternNavigation = /^[A-Z0-9]{32}$/
const requestIdPatternSubRequest = /^[0-9]+\.([0-9]+)$/

export class HeadersLogger {
  #requestHeaders: RequestToHeadersMap = {}
  #responseHeaders: RequestToHeadersMap = {}
  #logger: Logger | undefined
  #strict: boolean

  constructor (logger?: Logger, strict = true) {
    this.#logger = logger
    this.#strict = strict
  }

  #log (methodName: string, msg: any): void {
    if (!this.#logger) {
      return
    }
    this.#logger.verbose(`HeadersLogger.${methodName}) `, msg)
  }

  #error (msg: string): never {
    throw new Error(msg)
  }

  #addHeaders (requestId: RequestId,
               reqOrRes: HTTPRequestType | HTTPResponseType,
               collection: RequestToHeadersMap): AddHeadersResult {
    const newHeaders: HTTPHeader[] = []
    for (const headerEntry of Object.entries(reqOrRes.headers())) {
      const headerName: string = headerEntry[0] as string
      const headerValue: string = headerEntry[1] as string
      newHeaders.push({
        name: headerName,
        value: headerValue,
      })
    }
    newHeaders.sort((a, b) => {
      if (a.name !== b.name) {
        return a.name < b.name ? -1 : 1
      }
      return a.value < b.value ? -1 : 1
    })

    // If we're strictly checking things, the if we've already seen a request
    // with this RequestId, then make sure they have identical headers.
    // Otherwise, in strict mode, we throw an exception. Otherwise, we use
    // the most recent headers (which indicates something has gone wrong
    // in the recording, so it is not default behavior).
    const prevHeaders = collection[requestId]
    const isFirstTimeSeeingRequestId = !prevHeaders
    if (!isFirstTimeSeeingRequestId) {
      const previousHeadersJSON = JSON.stringify(prevHeaders)
      const currentHeadersJSON = JSON.stringify(newHeaders)
      const areSame = previousHeadersJSON === currentHeadersJSON

      if (areSame) {
        // If the headers for this request are the same
        // as for the previously seen request, and so no changes needed.
        return AddHeadersResult.REDUNDANT
      }

      if (this.#strict) {
        this.#error(
          `Received requests with id "${requestId}" but different headers:\n`
          + `Previously headers: ${previousHeadersJSON}\n`
          + `New headers: ${currentHeadersJSON}`,
        )
      }

      collection[requestId] = newHeaders
      return AddHeadersResult.OVERWRITE
    }

    collection[requestId] = newHeaders
    return AddHeadersResult.ADDED
  }

  // Request ids in puppeteer are in three formats.
  // 1. requests made in workers: "interception-job-<int>.0"
  // 2. sub-resource requests: "<int (process id)>.<int (request id)>"
  // 3. top level navigation requests: 32 alpha num characters
  //
  // Since PageGraph runs in single process mode, we can discard the process
  // id for this second category of requests.
  #simplifyRequestId (rawRequestId: PuppeteerRequestId): RequestId {
    const interceptRequestMatchRs = rawRequestId.match(requestIdPatternWorker)
    if (interceptRequestMatchRs !== null) {
      const requestId = parseInt(interceptRequestMatchRs[1], 10)
      this.#log(
        'simplifyRequestId',
        `RequestId: ${requestId} ("intercept", from ${rawRequestId})`)
      return requestId
    }

    const subRequestMatchRs = rawRequestId.match(requestIdPatternSubRequest)
    if (subRequestMatchRs !== null) {
      const requestIdParts = rawRequestId.split('.')
      const requestId = parseInt(requestIdParts[1], 10)
      this.#log(
        'simplifyRequestId',
        `RequestId: ${requestId} ("subrequest", from ${rawRequestId})`)
      return requestId
    }

    const navRequestMatchRs = rawRequestId.match(requestIdPatternNavigation)
    if (navRequestMatchRs !== null) {
      this.#log(
        'simplifyRequestId',
        `RequestId: ${rawRequestId} ("navigation")`)
      return rawRequestId
    }

    this.#error(`RequestId does not have a known format: "${rawRequestId}"`)
  }

  addHeadersFromRequest (request: HTTPRequestType): AddHeadersResult {
    const requestId = this.#simplifyRequestId(request.id)
    return this.#addHeaders(requestId, request, this.#requestHeaders)
  }

  addHeadersFromResponse (response: HTTPResponseType): AddHeadersResult {
    const rawRequestId = response.request().id
    const requestId = this.#simplifyRequestId(rawRequestId)
    return this.#addHeaders(requestId, response, this.#responseHeaders)
  }

  toJSON (): string {
    return JSON.stringify({
      requests: this.#requestHeaders,
      responses: this.#responseHeaders,
    })
  }

  async fromJSONFile (fromPath: FilePath): Promise<void> {
    const jsonText = await readFile(fromPath, { encoding: 'utf8' })
    const data = JSON.parse(jsonText)
    if (typeof data.requests !== 'object') {
      this.#error(
        `JSON from "${fromPath}" is missing "requests" property.\n${jsonText}`)
    }
    this.#requestHeaders = data.requests as RequestToHeadersMap

    if (typeof data.responses !== 'object') {
      this.#error(
        `JSON from "${fromPath}" is missing "responses" property.\n${jsonText}`)
    }
    this.#responseHeaders = data.responses as RequestToHeadersMap
  }

  rewriteGraphML (graphMLPath: FilePath, toPath: FilePath): Promise<void> {
    const rewriter = new GraphMLModifier()
    const inputStream = fs.createReadStream(graphMLPath, { encoding: 'utf8' })
    const outputStream = fs.createWriteStream(toPath)

    return new Promise((resolve) => {
      const xml = new XmlStream(inputStream, 'utf8')

      // We mostly use this input stream indirectly, by passing it to the
      // XmlStream API (to rewrite the XML as we stream it), but as best I can
      // tell, there is no straightforward way to capture the XML declaration
      // using xml-stream, so we just capture it directly with a separate,
      // one shot event.
      inputStream.prependOnceListener('data', (data: string) => {
        const xmlDeclarationPattern = /^(<\?xml.+?\?>)/
        const xmlDeclarationMatch = data.match(xmlDeclarationPattern)
        if (xmlDeclarationMatch) {
          const xmlDeclaration = xmlDeclarationMatch[0]
          outputStream.write(xmlDeclaration + '\n')
        }
      })

      xml.on('data', (data: any) => {
        outputStream.write(data)
      })
      xml.on('startElement: key', (elm: any) => {
        rewriter.processKeyElm(elm)
      })
      xml.collect('data')
      xml.on('updateElement: edge', (elm: any) => {
        const attrsQuery = [
          edgeAttrNameEdgeType,
          edgeAttrNameHeaders,
          edgeAttrNameRequestId,
        ]
        const queryResult = rewriter.attrsForEdge(elm, ...attrsQuery)
        const edgeType = queryResult[edgeAttrNameEdgeType]
        if (edgeType === null) {
          this.#error(
            `Could not determine "edge type" for edge.\n${JSON.stringify(elm)}`)
        }

        let headersCollection: RequestToHeadersMap | undefined
        switch (edgeType) {
        case 'request start':
        case 'request redirect':
          headersCollection = this.#requestHeaders
          break
        case 'request error':
        case 'request complete':
          headersCollection = this.#responseHeaders
          break
        default:
          // This is some kind of request other than a request, so we
          // wen't make any changes.
          return
        }

        const requestId = queryResult[edgeAttrNameRequestId]
        if (requestId === null) {
          this.#error(`No request id for edge.\n${JSON.stringify(elm)}`)
        }

        const headersForRequest = headersCollection[requestId]
        if (headersForRequest === undefined) {
          if (this.#strict) {
            this.#error(`No headers in request log for Request Id ${requestId}`)
          }
          return
        }

        const numHeaders = headersForRequest.length
        const headersAsJSON = JSON.stringify(headersForRequest)
        this.#log(
          'rewriteGraphML',
          `RequestId #${requestId} "${edgeType}": ${numHeaders} headers`)
        rewriter.setAttrForEdge(elm, edgeAttrNameHeaders, headersAsJSON)
      })
      xml.on('end', () => {
        resolve()
      })
    })
  }
}
