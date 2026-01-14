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
var _HeadersLogger_instances, _HeadersLogger_requestHeaders, _HeadersLogger_responseHeaders, _HeadersLogger_logger, _HeadersLogger_strict, _HeadersLogger_log, _HeadersLogger_error, _HeadersLogger_addHeaders, _HeadersLogger_simplifyRequestId;
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import XmlStream from 'xml-stream';
import { GraphMLModifier } from './graphml.js';
var AddHeadersResult;
(function (AddHeadersResult) {
    AddHeadersResult[AddHeadersResult["ADDED"] = 0] = "ADDED";
    AddHeadersResult[AddHeadersResult["REDUNDANT"] = 1] = "REDUNDANT";
    AddHeadersResult[AddHeadersResult["OVERWRITE"] = 2] = "OVERWRITE";
})(AddHeadersResult || (AddHeadersResult = {}));
const edgeAttrNameEdgeType = 'edge type';
const edgeAttrNameRequestId = 'request id';
const edgeAttrNameHeaders = 'headers';
const requestIdPatternWorker = /interception-job-([0-9]+)\.0/;
const requestIdPatternNavigation = /^[A-Z0-9]{32}$/;
const requestIdPatternSubRequest = /^[0-9]+\.([0-9]+)$/;
export class HeadersLogger {
    constructor(logger, strict = true) {
        _HeadersLogger_instances.add(this);
        _HeadersLogger_requestHeaders.set(this, {});
        _HeadersLogger_responseHeaders.set(this, {});
        _HeadersLogger_logger.set(this, void 0);
        _HeadersLogger_strict.set(this, void 0);
        __classPrivateFieldSet(this, _HeadersLogger_logger, logger, "f");
        __classPrivateFieldSet(this, _HeadersLogger_strict, strict, "f");
    }
    addHeadersFromRequest(request) {
        const requestId = __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_simplifyRequestId).call(this, request.id);
        return __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_addHeaders).call(this, requestId, request, __classPrivateFieldGet(this, _HeadersLogger_requestHeaders, "f"));
    }
    addHeadersFromResponse(response) {
        const rawRequestId = response.request().id;
        const requestId = __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_simplifyRequestId).call(this, rawRequestId);
        return __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_addHeaders).call(this, requestId, response, __classPrivateFieldGet(this, _HeadersLogger_responseHeaders, "f"));
    }
    toJSON() {
        return JSON.stringify({
            requests: __classPrivateFieldGet(this, _HeadersLogger_requestHeaders, "f"),
            responses: __classPrivateFieldGet(this, _HeadersLogger_responseHeaders, "f"),
        });
    }
    async fromJSONFile(fromPath) {
        const jsonText = await readFile(fromPath, { encoding: 'utf8' });
        const data = JSON.parse(jsonText);
        if (typeof data.requests !== 'object') {
            __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `JSON from "${fromPath}" is missing "requests" property.\n${jsonText}`);
        }
        __classPrivateFieldSet(this, _HeadersLogger_requestHeaders, data.requests, "f");
        if (typeof data.responses !== 'object') {
            __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `JSON from "${fromPath}" is missing "responses" property.\n${jsonText}`);
        }
        __classPrivateFieldSet(this, _HeadersLogger_responseHeaders, data.responses, "f");
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
                ];
                const queryResult = rewriter.attrsForEdge(elm, ...attrsQuery);
                const edgeType = queryResult[edgeAttrNameEdgeType];
                if (edgeType === null) {
                    __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `Could not determine "edge type" for edge.\n${JSON.stringify(elm)}`);
                }
                let headersCollection;
                switch (edgeType) {
                    case 'request start':
                    case 'request redirect':
                        headersCollection = __classPrivateFieldGet(this, _HeadersLogger_requestHeaders, "f");
                        break;
                    case 'request error':
                    case 'request complete':
                        headersCollection = __classPrivateFieldGet(this, _HeadersLogger_responseHeaders, "f");
                        break;
                    default:
                        // This is some kind of request other than a request, so we
                        // wen't make any changes.
                        return;
                }
                const requestId = queryResult[edgeAttrNameRequestId];
                if (requestId === null) {
                    __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `No request id for edge.\n${JSON.stringify(elm)}`);
                }
                const headersForRequest = headersCollection[requestId];
                if (headersForRequest === undefined) {
                    if (__classPrivateFieldGet(this, _HeadersLogger_strict, "f")) {
                        __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `No headers in request log for Request Id ${requestId}`);
                    }
                    return;
                }
                const numHeaders = headersForRequest.length;
                const headersAsJSON = JSON.stringify(headersForRequest);
                __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_log).call(this, 'rewriteGraphML', `RequestId #${requestId} "${edgeType}": ${numHeaders} headers`);
                rewriter.setAttrForEdge(elm, edgeAttrNameHeaders, headersAsJSON);
            });
            xml.on('end', () => {
                resolve();
            });
        });
    }
}
_HeadersLogger_requestHeaders = new WeakMap(), _HeadersLogger_responseHeaders = new WeakMap(), _HeadersLogger_logger = new WeakMap(), _HeadersLogger_strict = new WeakMap(), _HeadersLogger_instances = new WeakSet(), _HeadersLogger_log = function _HeadersLogger_log(methodName, msg) {
    if (!__classPrivateFieldGet(this, _HeadersLogger_logger, "f")) {
        return;
    }
    __classPrivateFieldGet(this, _HeadersLogger_logger, "f").verbose(`HeadersLogger.${methodName}) `, msg);
}, _HeadersLogger_error = function _HeadersLogger_error(msg) {
    throw new Error(msg);
}, _HeadersLogger_addHeaders = function _HeadersLogger_addHeaders(requestId, reqOrRes, collection) {
    const newHeaders = [];
    for (const headerEntry of Object.entries(reqOrRes.headers())) {
        const headerName = headerEntry[0];
        const headerValue = headerEntry[1];
        newHeaders.push({
            name: headerName,
            value: headerValue,
        });
    }
    newHeaders.sort((a, b) => {
        if (a.name !== b.name) {
            return a.name < b.name ? -1 : 1;
        }
        return a.value < b.value ? -1 : 1;
    });
    // If we're strictly checking things, the if we've already seen a request
    // with this RequestId, then make sure they have identical headers.
    // Otherwise, in strict mode, we throw an exception. Otherwise, we use
    // the most recent headers (which indicates something has gone wrong
    // in the recording, so it is not default behavior).
    const prevHeaders = collection[requestId];
    const isFirstTimeSeeingRequestId = !prevHeaders;
    if (!isFirstTimeSeeingRequestId) {
        const previousHeadersJSON = JSON.stringify(prevHeaders);
        const currentHeadersJSON = JSON.stringify(newHeaders);
        const areSame = previousHeadersJSON === currentHeadersJSON;
        if (areSame) {
            // If the headers for this request are the same
            // as for the previously seen request, and so no changes needed.
            return AddHeadersResult.REDUNDANT;
        }
        if (__classPrivateFieldGet(this, _HeadersLogger_strict, "f")) {
            __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `Received requests with id "${requestId}" but different headers:\n`
                + `Previously headers: ${previousHeadersJSON}\n`
                + `New headers: ${currentHeadersJSON}`);
        }
        collection[requestId] = newHeaders;
        return AddHeadersResult.OVERWRITE;
    }
    collection[requestId] = newHeaders;
    return AddHeadersResult.ADDED;
}, _HeadersLogger_simplifyRequestId = function _HeadersLogger_simplifyRequestId(rawRequestId) {
    const interceptRequestMatchRs = rawRequestId.match(requestIdPatternWorker);
    if (interceptRequestMatchRs !== null) {
        const requestId = parseInt(interceptRequestMatchRs[1], 10);
        __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_log).call(this, 'simplifyRequestId', `RequestId: ${requestId} ("intercept", from ${rawRequestId})`);
        return requestId;
    }
    const subRequestMatchRs = rawRequestId.match(requestIdPatternSubRequest);
    if (subRequestMatchRs !== null) {
        const requestIdParts = rawRequestId.split('.');
        const requestId = parseInt(requestIdParts[1], 10);
        __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_log).call(this, 'simplifyRequestId', `RequestId: ${requestId} ("subrequest", from ${rawRequestId})`);
        return requestId;
    }
    const navRequestMatchRs = rawRequestId.match(requestIdPatternNavigation);
    if (navRequestMatchRs !== null) {
        __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_log).call(this, 'simplifyRequestId', `RequestId: ${rawRequestId} ("navigation")`);
        return rawRequestId;
    }
    __classPrivateFieldGet(this, _HeadersLogger_instances, "m", _HeadersLogger_error).call(this, `RequestId does not have a known format: "${rawRequestId}"`);
};
