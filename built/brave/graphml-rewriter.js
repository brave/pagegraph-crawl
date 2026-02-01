// This file handles rewriting PageGraph format graphml files
// using the xml-stream-editor library. This is all used by
// RequestMetadataTracker instances to write those captured values
// into a PageGraph file.
import assert from 'node:assert';
import { pipeline } from 'node:stream/promises';
import { createXMLEditor, newElement } from 'xml-stream-editor';
const attrElmsSelector = 'graphml key';
const nodeElmsSelector = 'graphml graph node';
const edgeElmsSelector = 'graphml graph edge';
export const logElm = (elm) => {
    let msg = `<${elm.name}`;
    for (const [attrName, attrValue] of Object.entries(elm.attributes)) {
        msg += ` ${attrName}="${attrValue}"`;
    }
    msg += '>';
    if (elm.text) {
        msg += elm.text;
    }
    if (elm.children.length > 0) {
        msg += `\n    - num children: ${elm.children.length}\n`;
    }
    msg += `</${elm.name}>`;
    console.log(msg);
};
export class PageGraphXMLRewriter {
    #nodeAttrIds = new Map();
    #edgeAttrIds = new Map();
    // Optional, user provided functions that'll be called for each
    // <node> or <edge> element in the graph.
    #nodeEditFunc;
    #edgeEditFunc;
    setEdgeEditor(func) {
        this.#edgeEditFunc = func;
    }
    setNodeEditor(func) {
        this.#nodeEditFunc = func;
    }
    #attrMapForElm(elm) {
        assert.ok(elm.name === 'node' || elm.name === 'edge');
        switch (elm.name) {
            case 'edge':
                return this.#edgeAttrIds;
            case 'node':
                return this.#nodeAttrIds;
        }
    }
    setAttr(elm, attrName, value) {
        const attrMap = this.#attrMapForElm(elm);
        const attrId = attrMap.get(attrName);
        if (attrId === undefined) {
            return false;
        }
        // Find the <data> element for this <node> or <edge> that encodes
        // the specified attribute (i.e., the one where the value of the "key"
        // attribute matches the "id" attribute on the <key> element with the
        // "attr.name" attribute matching `attrName`.
        for (const dataElm of elm.children) {
            assert.equal(dataElm.name, 'data');
            if (dataElm.attributes.key === attrId) {
                dataElm.text = value.toString();
                return true;
            }
        }
        // However, if we've gotten this far, it means we couldn't find a
        // <data> element that encodes the attribute we wanted, in which case
        // we need to create a new data element.
        const newDataElm = newElement('data');
        newDataElm.attributes.key = attrId;
        newDataElm.text = value.toString();
        elm.children.push(newDataElm);
        return true;
    }
    getAttr(elm, attrName) {
        const attrMap = this.#attrMapForElm(elm);
        const attrId = attrMap.get(attrName);
        if (attrId === undefined) {
            return;
        }
        for (const dataElm of elm.children) {
            assert.equal(dataElm.name, 'data');
            if (dataElm.attributes.key === attrId) {
                return dataElm.text;
            }
        }
    }
    getAttrs(elm, ...attrNames) {
        const attrMap = this.#attrMapForElm(elm);
        const attrValues = {};
        const attrIdToAttrValue = {};
        for (const anAttrName of attrNames) {
            const attrId = attrMap.get(anAttrName);
            if (attrId !== undefined) {
                attrIdToAttrValue[attrId] = anAttrName;
            }
        }
        for (const dataElm of elm.children) {
            assert.equal(dataElm.name, 'data');
            const dataAttrId = dataElm.attributes.key;
            const dataAttrName = attrIdToAttrValue[dataAttrId];
            if (dataAttrName !== undefined) {
                assert(dataAttrName);
                attrValues[dataAttrName] = dataElm.text ?? '';
            }
        }
        return attrValues;
    }
    #makeCollectAttrIdsFunc() {
        return (elm) => {
            assert.equal(elm.name, 'key');
            const attrs = elm.attributes;
            const attrFor = attrs.for;
            const attrName = attrs['attr.name'];
            const attrId = attrs.id;
            let attrCollection;
            switch (attrFor) {
                case 'edge':
                    attrCollection = this.#edgeAttrIds;
                    break;
                case 'node':
                    attrCollection = this.#nodeAttrIds;
                    break;
                default:
                    throw new Error(`Unexpected "for" value on a <key> elm: "${attrFor}"`);
            }
            assert.ok(attrCollection);
            attrCollection.set(attrName, attrId);
            return elm;
        };
    }
    #makeEditingFunc(func) {
        return (elm) => func(elm, this);
    }
    async rewriteTo(input, output) {
        const editRules = {
            [attrElmsSelector]: this.#makeCollectAttrIdsFunc(),
        };
        if (this.#edgeEditFunc !== undefined) {
            editRules[edgeElmsSelector] = this.#makeEditingFunc(this.#edgeEditFunc);
        }
        if (this.#nodeEditFunc !== undefined) {
            editRules[nodeElmsSelector] = this.#makeEditingFunc(this.#nodeEditFunc);
        }
        await pipeline(input, createXMLEditor(editRules), output);
    }
}
