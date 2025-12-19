type XmlStreamElm = any
type AttrName = string
type AttrId = string
type AttrMap = Record<AttrName, AttrId>

type AttrValue = string
type AttrQueryResult = Record<AttrName, AttrValue | null>

enum GraphMLElmType {
  EDGE = 'edge',
  NODE = 'node',
}

enum AddAttributeResult {
  INSERT,
  SET,
}

export class GraphMLModifier {
  #attrsEdge: AttrMap = {}
  #attrsNode: AttrMap = {}

  processKeyElm (elm: XmlStreamElm): boolean {
    const attributes = elm.$
    let attrMap: AttrMap | undefined
    switch (attributes.for) {
    case 'edge':
      attrMap = this.#attrsEdge
      break
    case 'node':
      attrMap = this.#attrsNode
      break
    default:
      throw new Error(`Key is "for" unknown type: "${attributes.for}"`)
    }

    const attrName = attributes['attr.name'] as string
    const attrId = attributes.id
    if (attrMap[attrName] !== undefined) {
      throw new Error(
        `Found redundant definition for attr "${attrName}": `
        + `Prev id: "${attrMap[attrName]}", new id: "${attrId}"`)
    }

    attrMap[attrName] = attrId
    return true
  }

  #attrsForType (type: GraphMLElmType): AttrMap {
    switch (type) {
    case GraphMLElmType.EDGE:
      return this.#attrsEdge
    case GraphMLElmType.NODE:
      return this.#attrsNode
    }
  }

  #attrIdForType (name: AttrName, type: GraphMLElmType): AttrId {
    const attrMap = this.#attrsForType(type)
    const attrId = attrMap[name]
    if (attrId === undefined) {
      throw new Error(`Attribute "${name}" defined for element type ${type}`)
    }
    return attrId
  }

  attrIdForEdge (attrName: AttrName): AttrId {
    const attrId = this.#attrIdForType(attrName, GraphMLElmType.EDGE)
    return attrId
  }

  attrIdForNode (attrName: AttrName): AttrId {
    const attrId = this.#attrIdForType(attrName, GraphMLElmType.NODE)
    return attrId
  }

  #attrsForElm (elm: XmlStreamElm, type: GraphMLElmType,
                ...attrNames: AttrName[]): AttrQueryResult {
    const result: AttrQueryResult = {}

    const reverseAttrMap: Record<AttrId, AttrName> = {}
    const numQueryAttrs = attrNames.length
    for (const anAttrName of attrNames) {
      const attrId = this.#attrIdForType(anAttrName, type)
      reverseAttrMap[attrId] = anAttrName
      result[anAttrName] = null
    }

    let numQueryAttrsFound = 0
    for (const elmData of elm.data) {
      const elmAttrId = elmData.$.key

      // This attribute wasn't in the query, so ignore it and keep going.
      if (reverseAttrMap[elmAttrId] === undefined) {
        continue
      }

      const elmAttrName = reverseAttrMap[elmAttrId]
      const elmAttrValue = elmData.$text
      result[elmAttrName] = elmAttrValue
      numQueryAttrsFound += 1

      // If we've now satisfied all the attributes in the query,
      // we can exit iterating over the element's attributes early.
      if (numQueryAttrsFound === numQueryAttrs) {
        break
      }
    }

    return result
  }

  attrForEdge (edge: XmlStreamElm, attr: AttrName): string | null {
    const query = this.#attrsForElm(edge, GraphMLElmType.EDGE, attr)
    return query[attr]
  }

  attrsForEdge (edge: XmlStreamElm, ...attrs: AttrName[]): AttrQueryResult {
    return this.#attrsForElm(edge, GraphMLElmType.EDGE, ...attrs)
  }

  attrForNode (node: XmlStreamElm, attr: AttrName): string | null {
    const query = this.#attrsForElm(node, GraphMLElmType.NODE, attr)
    return query[attr]
  }

  attrsForNode (node: XmlStreamElm, ...attrs: AttrName[]): AttrQueryResult {
    return this.#attrsForElm(node, GraphMLElmType.NODE, ...attrs)
  }

  // Returns "true" if an attribute was updated, and otherwise "false",
  // meaning changes were made.
  #updateAttrForElm (elm: XmlStreamElm, type: GraphMLElmType,
                     attrName: AttrName, value: AttrValue): boolean {
    const attrId = this.#attrIdForType(attrName, type)
    for (const elmData of elm.data) {
      const elmDataAttrId = elmData.$.key
      if (elmDataAttrId !== attrId) {
        continue
      }

      elmData.$text = value
      return true
    }

    return false
  }

  updateAttrForEdge (edge: XmlStreamElm, attrName: AttrName,
                     value: AttrValue): boolean {
    return this.#updateAttrForElm(edge, GraphMLElmType.EDGE, attrName, value)
  }

  updateAttrForNode (node: XmlStreamElm, attrName: AttrName,
                     value: AttrValue): boolean {
    return this.#updateAttrForElm(node, GraphMLElmType.NODE, attrName, value)
  }

  #addAttrForElm (elm: XmlStreamElm, type: GraphMLElmType, attrName: AttrName,
                  value: AttrValue): void {
    const attrId = this.#attrIdForType(attrName, type)
    elm.data.push({
      $: {
        key: attrId,
      },
      $text: value,
      $name: 'data',
    })
  }

  addAttrForEdge (edge: XmlStreamElm, attrName: AttrName,
                  value: AttrValue): void {
    return this.#addAttrForElm(edge, GraphMLElmType.EDGE, attrName, value)
  }

  addAttrForNode (node: XmlStreamElm, attrName: AttrName,
                  value: AttrValue): void {
    return this.#addAttrForElm(node, GraphMLElmType.NODE, attrName, value)
  }

  #setAttrForElm (elm: XmlStreamElm, type: GraphMLElmType, attrName: AttrName,
                  value: AttrValue): AddAttributeResult {
    if (this.#updateAttrForElm(elm, type, attrName, value)) {
      return AddAttributeResult.SET
    }
    this.#addAttrForElm(elm, type, attrName, value)
    return AddAttributeResult.INSERT
  }

  setAttrForEdge (edge: XmlStreamElm, attrName: AttrName,
                  value: AttrValue): AddAttributeResult {
    return this.#setAttrForElm(edge, GraphMLElmType.EDGE, attrName, value)
  }

  setAttrForNode (node: XmlStreamElm, attrName: AttrName,
                  value: AttrValue): AddAttributeResult {
    return this.#setAttrForElm(node, GraphMLElmType.NODE, attrName, value)
  }
}
