import fs from 'node:fs'
import { readFile } from 'node:fs/promises'

import type { HTTPRequest, HTTPResponse } from 'puppeteer-core'
import XmlStream from 'xml-stream'

import { GraphMLModifier } from './graphml.js'

interface HTTPHeader {
  name: string
  value: string
}

interface Metadata {
  headers: HTTPHeader[]
  size: number
}

enum RequestIdParseType {
  NAVIGATION,
  SUB_REQUEST,
  INTERCEPTION,
}

interface RequestIdParse {
  id: RequestId
  type: RequestIdParseType
}

type RequestType = typeof HTTPRequest
type ResponseType = typeof HTTPResponse
type PuppeteerRequestId = string
type RequestId = number | string
type RequestToMetadataMap = Record<RequestId, Metadata>

enum UpdateType {
  ADD = 'ADD',
  REDUNDANT = 'REDUNDANT',
  UPDATE = 'UPDATE',
}

const edgeAttrNameEdgeType = 'edge type'
const edgeAttrNameRequestId = 'request id'
const edgeAttrNameHeaders = 'headers'
const edgeAttrNameSize = 'size'

const requestIdPatternWorker = /interception-job-([0-9]+)\.0/
const requestIdPatternNavigation = /^[A-Z0-9]{32}$/
const requestIdPatternSubRequest = /^[0-9]+\.([0-9]+)$/

const headerSortFunc = (a: HTTPHeader, b: HTTPHeader) => {
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1
  }
  return a.value < b.value ? -1 : 1
}

export class RequestMetadataTracker {
  #requestMetadata: RequestToMetadataMap = {}
  #responseMetadata: RequestToMetadataMap = {}
  #logger: Logger | undefined

  constructor (logger?: Logger) {
    this.#logger = logger
  }

  #log (methodName: string, msg: any): void {
    if (!this.#logger) {
      return
    }
    this.#logger.info(`RequestMetadataTracker.${methodName}) `, msg)
  }

  #logVerbose (methodName: string, msg: any): void {
    if (!this.#logger) {
      return
    }
    this.#logger.verbose(`RequestMetadataTracker.${methodName}) `, msg)
  }

  #error (msg: string): never {
    throw new Error(msg)
  }

  #requestBodySize = async (request: RequestType): Promise<number> => {
    try {
      const requestBody = await request.fetchPostData()
      return requestBody ? requestBody.length : 0
    }
    catch {
      this.#log('#requestBodySize',
                'No content for response: ' + request.url())
      return 0
    }
  }

  #responseBodySize = async (response: ResponseType): Promise<number> => {
    try {
      const body = await response.content()
      return body.length
    }
    catch {
      this.#log('#responseBodySize',
                'No content for response: ' + response.url())
      return 0
    }
  }

  #addMetadata (requestId: RequestId,
                reqOrRes: RequestType | ResponseType,
                bodySize: number,
                collection: RequestToMetadataMap): UpdateType {
    const headers: HTTPHeader[] = []
    for (const headerEntry of Object.entries(reqOrRes.headers())) {
      headers.push({
        name: headerEntry[0] as string,
        value: headerEntry[1] as string,
      })
    }
    headers.sort(headerSortFunc)

    const metadata: Metadata = {
      headers: headers,
      size: bodySize,
    }
    const typeName = (collection === this.#requestMetadata)
      ? 'request'
      : 'response'
    this.#logVerbose(
      'addMetadata',
      `RequestId=${requestId} (${typeName}): size=${bodySize}, `
      + `headers=${JSON.stringify(metadata)}`)
    // Seeing a repeated request id can happen when the page redirects
    // during the crawl (e.g., the page makes requests 1, 2, and 3; the browser
    // is redirected to a new page; that new page also makes requests 1,
    // 2, and 3). When this happens, overwrite the older request's headers
    // with the new ones, since the most recent request will always be
    // the one depicted in the page-graph file.
    const prevMetadata = collection[requestId]
    const isFirstTimeSeeingRequestId = (prevMetadata === undefined)
    if (!isFirstTimeSeeingRequestId) {
      const previousMetadataJSON = JSON.stringify(prevMetadata)
      const currentMetadataJSON = JSON.stringify(metadata)
      const areSame = previousMetadataJSON === currentMetadataJSON

      if (areSame) {
        // If the headers for this request are the same
        // as for the previously seen request, and so no changes needed.
        this.#log(
          'addMetadata',
          `RequestId=${requestId} (${typeName}): same as previous.`)
        return UpdateType.REDUNDANT
      }

      this.#log(
        'addMetadata',
        `RequestId=${requestId} (${typeName}): set new value.`)
      collection[requestId] = metadata
      return UpdateType.UPDATE
    }

    collection[requestId] = metadata
    return UpdateType.ADD
  }

  // Request ids in puppeteer are in three formats.
  // 1. requests made in workers: "interception-job-<int>.0"
  // 2. sub-resource requests: "<int (process id)>.<int (request id)>"
  // 3. top level navigation requests: 32 alpha num characters
  //
  // Since PageGraph runs in single process mode, we can discard the process
  // id for this second category of requests.
  #simplifyRequestId (rawRequestId: PuppeteerRequestId): RequestIdParse {
    const interceptRequestMatchRs = rawRequestId.match(requestIdPatternWorker)
    if (interceptRequestMatchRs !== null) {
      const requestId = parseInt(interceptRequestMatchRs[1], 10)
      this.#log(
        'simplifyRequestId',
        `RequestId: ${requestId} ("intercept", from ${rawRequestId})`)
      return { id: requestId, type: RequestIdParseType.INTERCEPTION }
    }

    const subRequestMatchRs = rawRequestId.match(requestIdPatternSubRequest)
    if (subRequestMatchRs !== null) {
      const requestIdParts = rawRequestId.split('.')
      const requestId = parseInt(requestIdParts[1], 10)
      this.#log(
        'simplifyRequestId',
        `RequestId: ${requestId} ("subrequest", from ${rawRequestId})`)
      return { id: requestId, type: RequestIdParseType.SUB_REQUEST }
    }

    const navRequestMatchRs = rawRequestId.match(requestIdPatternNavigation)
    if (navRequestMatchRs !== null) {
      this.#log(
        'simplifyRequestId',
        `RequestId: ${rawRequestId} ("navigation")`)
      return { id: rawRequestId, type: RequestIdParseType.NAVIGATION }
    }

    this.#error(`RequestId does not have a known format: "${rawRequestId}"`)
  }

  async addMetadataFromRequest (request: RequestType): Promise<UpdateType> {
    const parseResult = this.#simplifyRequestId(request.id)
    const bodySize = (parseResult.type === RequestIdParseType.NAVIGATION)
      ? -1
      : await this.#requestBodySize(request)
    const collection = this.#requestMetadata
    return this.#addMetadata(parseResult.id, request, bodySize, collection)
  }

  async addMetadataFromResponse (response: ResponseType): Promise<UpdateType> {
    const rawRequestId = response.request().id
    const parseResult = this.#simplifyRequestId(rawRequestId)
    const bodySize = await this.#responseBodySize(response)
    const collection = this.#responseMetadata
    return this.#addMetadata(parseResult.id, response, bodySize, collection)
  }

  toJSON (): string {
    return JSON.stringify({
      requests: this.#requestMetadata,
      responses: this.#responseMetadata,
    })
  }

  async fromJSONFile (fromPath: FilePath): Promise<void> {
    const jsonText = await readFile(fromPath, { encoding: 'utf8' })
    const data = JSON.parse(jsonText)
    if (typeof data.requests !== 'object') {
      this.#error(
        `JSON from "${fromPath}" is missing "requests" property.\n${jsonText}`)
    }
    this.#requestMetadata = data.requests as RequestToMetadataMap

    if (typeof data.responses !== 'object') {
      this.#error(
        `JSON from "${fromPath}" is missing "responses" property.\n${jsonText}`)
    }
    this.#responseMetadata = data.responses as RequestToMetadataMap
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
          edgeAttrNameSize,
        ]
        const queryResult = rewriter.attrsForEdge(elm, ...attrsQuery)
        const edgeType = queryResult[edgeAttrNameEdgeType]
        if (edgeType === null) {
          this.#error(
            `Could not determine "edge type" for edge.\n${JSON.stringify(elm)}`)
        }

        let metadataCollection: RequestToMetadataMap | undefined
        switch (edgeType) {
        case 'request start':
        case 'request redirect':
          metadataCollection = this.#requestMetadata
          break
        case 'request error':
        case 'request complete':
          metadataCollection = this.#responseMetadata
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

        const metadata = metadataCollection[requestId]
        if (metadata === undefined) {
          return
        }

        const numHeaders = metadata.headers.length
        const headersAsJSON = JSON.stringify(metadata.headers)
        this.#log(
          'rewriteGraphML',
          `RequestId #${requestId} "${edgeType}": `
          + `num_headers=${numHeaders}, size=${metadata.size}`)
        rewriter.setAttrForEdge(elm, edgeAttrNameHeaders, headersAsJSON)
        rewriter.setAttrForEdge(elm, edgeAttrNameSize, metadata.size)
      })
      xml.on('end', () => {
        resolve()
      })
    })
  }
}
