// This file handles rewriting PageGraph format graphml files
// using the xml-stream-editor library. This is all used by
// RequestMetadataTracker instances to write those captured values
// into a PageGraph file.

import assert from 'node:assert'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { createXMLEditor, EditingRules, EditorFunc, Element,
  newElement } from 'xml-stream-editor'

type AttrScope = 'edge' | 'node'
type AttrName = string
type AttrId = string
type AttrValue = string
type AttrIdCollection = Map<AttrName, AttrId>
type EditorFuncWithEditor = (
  elm: Element, editor: PageGraphXMLRewriter) => Element | undefined

const attrElmsSelector = 'graphml key'
const nodeElmsSelector = 'graphml graph node'
const edgeElmsSelector = 'graphml graph edge'

export const logElm = (elm: Element): void => {
  let msg = `<${elm.name}`
  for (const [attrName, attrValue] of Object.entries(elm.attributes)) {
    msg += ` ${attrName}="${attrValue}"`
  }
  msg += '>'
  if (elm.text) {
    msg += elm.text
  }
  if (elm.children.length > 0) {
    msg += `\n    - num children: ${elm.children.length}\n`
  }
  msg += `</${elm.name}>`
  console.log(msg)
}

export class PageGraphXMLRewriter {
  #nodeAttrIds: AttrIdCollection = new Map<AttrName, AttrId>()
  #edgeAttrIds: AttrIdCollection = new Map<AttrName, AttrId>()

  // Optional, user provided functions that'll be called for each
  // <node> or <edge> element in the graph.
  #nodeEditFunc: EditorFuncWithEditor | undefined
  #edgeEditFunc: EditorFuncWithEditor | undefined

  setEdgeEditor (func: EditorFuncWithEditor) {
    this.#edgeEditFunc = func
  }

  setNodeEditor (func: EditorFuncWithEditor) {
    this.#nodeEditFunc = func
  }

  #attrMapForElm (elm: Element): AttrIdCollection {
    assert.ok(elm.name === 'node' || elm.name === 'edge')
    switch (elm.name) {
    case 'edge':
      return this.#edgeAttrIds
    case 'node':
      return this.#nodeAttrIds
    }
  }

  setAttr (elm: Element, attrName: AttrName, value: any): boolean {
    const attrMap = this.#attrMapForElm(elm)
    const attrId = attrMap.get(attrName)
    if (attrId === undefined) {
      return false
    }

    // Find the <data> element for this <node> or <edge> that encodes
    // the specified attribute (i.e., the one where the value of the "key"
    // attribute matches the "id" attribute on the <key> element with the
    // "attr.name" attribute matching `attrName`.
    for (const dataElm of elm.children) {
      assert.equal(dataElm.name, 'data')
      if (dataElm.attributes.key === attrId) {
        dataElm.text = value.toString()
        return true
      }
    }

    // However, if we've gotten this far, it means we couldn't find a
    // <data> element that encodes the attribute we wanted, in which case
    // we need to create a new data element.
    const newDataElm = newElement('data')
    newDataElm.attributes.key = attrId
    newDataElm.text = value.toString()
    elm.children.push(newDataElm)

    return true
  }

  getAttr (elm: Element, attrName: AttrName): AttrValue | undefined {
    const attrMap = this.#attrMapForElm(elm)
    const attrId = attrMap.get(attrName)
    if (attrId === undefined) {
      return
    }
    for (const dataElm of elm.children) {
      assert.equal(dataElm.name, 'data')
      if (dataElm.attributes.key === attrId) {
        return dataElm.text
      }
    }
  }

  getAttrs (elm: Element,
            ...attrNames: AttrName[]): Record<AttrName, AttrValue> {
    const attrMap = this.#attrMapForElm(elm)
    const attrValues: Record<AttrName, AttrValue> = {}
    const attrIdToAttrValue: Record<AttrId, AttrName> = {}

    for (const anAttrName of attrNames) {
      const attrId = attrMap.get(anAttrName)
      if (attrId !== undefined) {
        attrIdToAttrValue[attrId] = anAttrName
      }
    }

    for (const dataElm of elm.children) {
      assert.equal(dataElm.name, 'data')
      const dataAttrId = dataElm.attributes.key
      const dataAttrName = attrIdToAttrValue[dataAttrId]
      if (dataAttrName !== undefined) {
        assert(dataAttrName)
        attrValues[dataAttrName] = dataElm.text ?? ''
      }
    }

    return attrValues
  }

  #makeCollectAttrIdsFunc (): EditorFunc {
    return (elm: Element) => {
      assert.equal(elm.name, 'key')

      const attrs = elm.attributes
      const attrFor = attrs.for as AttrScope
      const attrName = attrs['attr.name']
      const attrId = attrs.id

      let attrCollection: AttrIdCollection | undefined
      switch (attrFor) {
      case 'edge':
        attrCollection = this.#edgeAttrIds
        break
      case 'node':
        attrCollection = this.#nodeAttrIds
        break
      default:
        throw new Error(
          `Unexpected "for" value on a <key> elm: "${attrFor}"`)
      }
      assert.ok(attrCollection)
      attrCollection.set(attrName, attrId)
      return elm
    }
  }

  #makeEditingFunc (func: EditorFuncWithEditor): EditorFunc {
    return (elm: Element) => func(elm, this)
  }

  async rewriteTo (input: Readable, output: Writable): Promise<void> {
    const editRules: EditingRules = {
      [attrElmsSelector]: this.#makeCollectAttrIdsFunc(),
    }

    if (this.#edgeEditFunc !== undefined) {
      editRules[edgeElmsSelector] = this.#makeEditingFunc(this.#edgeEditFunc)
    }

    if (this.#nodeEditFunc !== undefined) {
      editRules[nodeElmsSelector] = this.#makeEditingFunc(this.#nodeEditFunc)
    }

    await pipeline(input, createXMLEditor(editRules), output)
  }
}
