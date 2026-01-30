var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _RequestMetadataTracker_instances, _RequestMetadataTracker_requestMetadata, _RequestMetadataTracker_responseMetadata, _RequestMetadataTracker_logger, _RequestMetadataTracker_log, _RequestMetadataTracker_logVerbose, _RequestMetadataTracker_error, _RequestMetadataTracker_addMetadata, _RequestMetadataTracker_simplifyRequestId;
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import XmlStream from 'xml-stream';
import { GraphMLModifier } from './graphml.js';
import { request } from 'node:https';
var UpdateType;
(function (UpdateType) {
    UpdateType["ADD"] = "ADD";
    UpdateType["REDUNDANT"] = "REDUNDANT";
    UpdateType["UPDATE"] = "UPDATE";
})(UpdateType || (UpdateType = {}));
const edgeAttrNameEdgeType = 'edge type';
const edgeAttrNameRequestId = 'request id';
const edgeAttrNameHeaders = 'headers';
const edgeAttrNameSize = 'size';
const requestIdPatternWorker = /interception-job-([0-9]+)\.0/;
const requestIdPatternNavigation = /^[A-Z0-9]{32}$/;
const requestIdPatternSubRequest = /^[0-9]+\.([0-9]+)$/;
const bodySizeForRequest = async (request) => {
    const requestBody = await request.fetchPostData();
    return requestBody ? requestBody.length : 0;
};
const bodySizeForResponse = async (response) => {
    const body = await response.buffer();
    return body.size;
};
const headerSortFunc = (a, b) => {
    if (a.name !== b.name) {
        return a.name < b.name ? -1 : 1;
    }
    return a.value < b.value ? -1 : 1;
};
export class RequestMetadataTracker {
    constructor(logger) {
        _RequestMetadataTracker_instances.add(this);
        _RequestMetadataTracker_requestMetadata.set(this, {});
        _RequestMetadataTracker_responseMetadata.set(this, {});
        _RequestMetadataTracker_logger.set(this, void 0);
        __classPrivateFieldSet(this, _RequestMetadataTracker_logger, logger, "f");
    }
    async addMetadataFromRequest(request) {
        const requestId = __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_simplifyRequestId).call(this, request.id);
        const bodySize = await bodySizeForRequest(request);
        const collection = __classPrivateFieldGet(this, _RequestMetadataTracker_requestMetadata, "f");
        return __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_addMetadata).call(this, requestId, request, bodySize, collection);
    }
    async addMetadataFromResponse(response) {
        const rawRequestId = response.request().id;
        const requestId = __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_simplifyRequestId).call(this, rawRequestId);
        const bodySize = await bodySizeForResponse(request);
        const collection = __classPrivateFieldGet(this, _RequestMetadataTracker_responseMetadata, "f");
        return __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_addMetadata).call(this, requestId, request, bodySize, collection);
    }
    toJSON() {
        return JSON.stringify({
            requests: __classPrivateFieldGet(this, _RequestMetadataTracker_requestMetadata, "f"),
            responses: __classPrivateFieldGet(this, _RequestMetadataTracker_responseMetadata, "f"),
        });
    }
    async fromJSONFile(fromPath) {
        const jsonText = await readFile(fromPath, { encoding: 'utf8' });
        const data = JSON.parse(jsonText);
        if (typeof data.requests !== 'object') {
            __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_error).call(this, `JSON from "${fromPath}" is missing "requests" property.\n${jsonText}`);
        }
        __classPrivateFieldSet(this, _RequestMetadataTracker_requestMetadata, data.requests, "f");
        if (typeof data.responses !== 'object') {
            __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_error).call(this, `JSON from "${fromPath}" is missing "responses" property.\n${jsonText}`);
        }
        __classPrivateFieldSet(this, _RequestMetadataTracker_responseMetadata, data.responses, "f");
    }
    rewriteGraphML(graphMLPath, toPath) {
        const rewriter = new GraphMLModifier();
        const inputStream = fs.createReadStream(graphMLPath, { encoding: 'utf8' });
        const outputStream = fs.createWriteStream(toPath);
        return new Promise((resolve) => {
            const xml = new XmlStream(inputStream, 'utf8');
            // We mostly use this input stream indirectly, by passing it to the
            // XmlStream API (to rewrite the XML as we stream it), but as best I can
            // tell, there is no straightforward way to capture the XML declaration
            // using xml-stream, so we just capture it directly with a separate,
            // one shot event.
            inputStream.prependOnceListener('data', (data) => {
                const xmlDeclarationPattern = /^(<\?xml.+?\?>)/;
                const xmlDeclarationMatch = data.match(xmlDeclarationPattern);
                if (xmlDeclarationMatch) {
                    const xmlDeclaration = xmlDeclarationMatch[0];
                    outputStream.write(xmlDeclaration + '\n');
                }
            });
            xml.on('data', (data) => {
                outputStream.write(data);
            });
            xml.on('startElement: key', (elm) => {
                rewriter.processKeyElm(elm);
            });
            xml.collect('data');
            xml.on('updateElement: edge', (elm) => {
                const attrsQuery = [
                    edgeAttrNameEdgeType,
                    edgeAttrNameHeaders,
                    edgeAttrNameRequestId,
                    edgeAttrNameSize,
                ];
                const queryResult = rewriter.attrsForEdge(elm, ...attrsQuery);
                const edgeType = queryResult[edgeAttrNameEdgeType];
                if (edgeType === null) {
                    __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_error).call(this, `Could not determine "edge type" for edge.\n${JSON.stringify(elm)}`);
                }
                let metadataCollection;
                switch (edgeType) {
                    case 'request start':
                    case 'request redirect':
                        metadataCollection = __classPrivateFieldGet(this, _RequestMetadataTracker_requestMetadata, "f");
                        break;
                    case 'request error':
                    case 'request complete':
                        metadataCollection = __classPrivateFieldGet(this, _RequestMetadataTracker_responseMetadata, "f");
                        break;
                    default:
                        // This is some kind of request other than a request, so we
                        // wen't make any changes.
                        return;
                }
                const requestId = queryResult[edgeAttrNameRequestId];
                if (requestId === null) {
                    __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_error).call(this, `No request id for edge.\n${JSON.stringify(elm)}`);
                }
                const metadata = metadataCollection[requestId];
                if (metadata === undefined) {
                    return;
                }
                const numHeaders = metadata.headers.length;
                const headersAsJSON = JSON.stringify(metadata.headers);
                __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_log).call(this, 'rewriteGraphML', `RequestId #${requestId} "${edgeType}": num_headers=${numHeaders}, `
                    + `size=${bodySizeForRequest}`);
                rewriter.setAttrForEdge(elm, edgeAttrNameHeaders, headersAsJSON);
                rewriter.setAttrForEdge(elm, edgeAttrNameSize, metadata.size);
            });
            xml.on('end', () => {
                resolve();
            });
        });
    }
}
_RequestMetadataTracker_requestMetadata = new WeakMap(), _RequestMetadataTracker_responseMetadata = new WeakMap(), _RequestMetadataTracker_logger = new WeakMap(), _RequestMetadataTracker_instances = new WeakSet(), _RequestMetadataTracker_log = function _RequestMetadataTracker_log(methodName, msg) {
    if (!__classPrivateFieldGet(this, _RequestMetadataTracker_logger, "f")) {
        return;
    }
    __classPrivateFieldGet(this, _RequestMetadataTracker_logger, "f").info(`RequestMetadataTracker.${methodName}) `, msg);
}, _RequestMetadataTracker_logVerbose = function _RequestMetadataTracker_logVerbose(methodName, msg) {
    if (!__classPrivateFieldGet(this, _RequestMetadataTracker_logger, "f")) {
        return;
    }
    __classPrivateFieldGet(this, _RequestMetadataTracker_logger, "f").verbose(`RequestMetadataTracker.${methodName}) `, msg);
}, _RequestMetadataTracker_error = function _RequestMetadataTracker_error(msg) {
    throw new Error(msg);
}, _RequestMetadataTracker_addMetadata = function _RequestMetadataTracker_addMetadata(requestId, reqOrRes, bodySize, collection) {
    const headers = [];
    for (const headerEntry of Object.entries(reqOrRes.headers())) {
        headers.push({
            name: headerEntry[0],
            value: headerEntry[1],
        });
    }
    headers.sort(headerSortFunc);
    const metadata = {
        headers: headers,
        size: bodySize,
    };
    const typeName = (collection === __classPrivateFieldGet(this, _RequestMetadataTracker_requestMetadata, "f"))
        ? 'request'
        : 'response';
    __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_logVerbose).call(this, 'addMetadata', `RequestId=${requestId} (${typeName}): ${JSON.stringify(metadata)}`);
    // Seeing a repeated request id can happen when the page redirects
    // during the crawl (e.g., the page makes requests 1, 2, and 3; the browser
    // is redirected to a new page; that new page also makes requests 1,
    // 2, and 3). When this happens, overwrite the older request's headers
    // with the new ones, since the most recent request will always be
    // the one depicted in the page-graph file.
    const prevMetadata = collection[requestId];
    const isFirstTimeSeeingRequestId = (prevMetadata === undefined);
    if (!isFirstTimeSeeingRequestId) {
        const previousMetadataJSON = JSON.stringify(prevMetadata);
        const currentMetadataJSON = JSON.stringify(metadata);
        const areSame = previousMetadataJSON === currentMetadataJSON;
        if (areSame) {
            // If the headers for this request are the same
            // as for the previously seen request, and so no changes needed.
            __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_log).call(this, 'addMetadata', `RequestId=${requestId} (${typeName}): same as previous.`);
            return UpdateType.REDUNDANT;
        }
        __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_log).call(this, 'addMetadata', `RequestId=${requestId} (${typeName}): set new value.`);
        collection[requestId] = metadata;
        return UpdateType.UPDATE;
    }
    collection[requestId] = metadata;
    return UpdateType.ADD;
}, _RequestMetadataTracker_simplifyRequestId = function _RequestMetadataTracker_simplifyRequestId(rawRequestId) {
    const interceptRequestMatchRs = rawRequestId.match(requestIdPatternWorker);
    if (interceptRequestMatchRs !== null) {
        const requestId = parseInt(interceptRequestMatchRs[1], 10);
        __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_log).call(this, 'simplifyRequestId', `RequestId: ${requestId} ("intercept", from ${rawRequestId})`);
        return requestId;
    }
    const subRequestMatchRs = rawRequestId.match(requestIdPatternSubRequest);
    if (subRequestMatchRs !== null) {
        const requestIdParts = rawRequestId.split('.');
        const requestId = parseInt(requestIdParts[1], 10);
        __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_log).call(this, 'simplifyRequestId', `RequestId: ${requestId} ("subrequest", from ${rawRequestId})`);
        return requestId;
    }
    const navRequestMatchRs = rawRequestId.match(requestIdPatternNavigation);
    if (navRequestMatchRs !== null) {
        __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_log).call(this, 'simplifyRequestId', `RequestId: ${rawRequestId} ("navigation")`);
        return rawRequestId;
    }
    __classPrivateFieldGet(this, _RequestMetadataTracker_instances, "m", _RequestMetadataTracker_error).call(this, `RequestId does not have a known format: "${rawRequestId}"`);
};
