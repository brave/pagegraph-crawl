var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _GraphMLModifier_instances, _GraphMLModifier_attrsEdge, _GraphMLModifier_attrsNode, _GraphMLModifier_attrsForType, _GraphMLModifier_attrIdForType, _GraphMLModifier_attrsForElm, _GraphMLModifier_updateAttrForElm, _GraphMLModifier_addAttrForElm, _GraphMLModifier_setAttrForElm;
var GraphMLElmType;
(function (GraphMLElmType) {
    GraphMLElmType["EDGE"] = "edge";
    GraphMLElmType["NODE"] = "node";
})(GraphMLElmType || (GraphMLElmType = {}));
var AddAttributeResult;
(function (AddAttributeResult) {
    AddAttributeResult[AddAttributeResult["INSERT"] = 0] = "INSERT";
    AddAttributeResult[AddAttributeResult["SET"] = 1] = "SET";
})(AddAttributeResult || (AddAttributeResult = {}));
export class GraphMLModifier {
    constructor() {
        _GraphMLModifier_instances.add(this);
        _GraphMLModifier_attrsEdge.set(this, {});
        _GraphMLModifier_attrsNode.set(this, {});
    }
    processKeyElm(elm) {
        const attributes = elm.$;
        let attrMap;
        switch (attributes.for) {
            case 'edge':
                attrMap = __classPrivateFieldGet(this, _GraphMLModifier_attrsEdge, "f");
                break;
            case 'node':
                attrMap = __classPrivateFieldGet(this, _GraphMLModifier_attrsNode, "f");
                break;
            default:
                throw new Error(`Key is "for" unknown type: "${attributes.for}"`);
        }
        const attrName = attributes['attr.name'];
        const attrId = attributes.id;
        if (attrMap[attrName] !== undefined) {
            throw new Error(`Found redundant definition for attr "${attrName}": `
                + `Prev id: "${attrMap[attrName]}", new id: "${attrId}"`);
        }
        attrMap[attrName] = attrId;
        return true;
    }
    attrIdForEdge(attrName) {
        const attrId = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrIdForType).call(this, attrName, GraphMLElmType.EDGE);
        return attrId;
    }
    attrIdForNode(attrName) {
        const attrId = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrIdForType).call(this, attrName, GraphMLElmType.NODE);
        return attrId;
    }
    attrForEdge(edge, attr) {
        const query = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrsForElm).call(this, edge, GraphMLElmType.EDGE, attr);
        return query[attr];
    }
    attrsForEdge(edge, ...attrs) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrsForElm).call(this, edge, GraphMLElmType.EDGE, ...attrs);
    }
    attrForNode(node, attr) {
        const query = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrsForElm).call(this, node, GraphMLElmType.NODE, attr);
        return query[attr];
    }
    attrsForNode(node, ...attrs) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrsForElm).call(this, node, GraphMLElmType.NODE, ...attrs);
    }
    updateAttrForEdge(edge, attrName, value) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_updateAttrForElm).call(this, edge, GraphMLElmType.EDGE, attrName, value);
    }
    updateAttrForNode(node, attrName, value) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_updateAttrForElm).call(this, node, GraphMLElmType.NODE, attrName, value);
    }
    addAttrForEdge(edge, attrName, value) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_addAttrForElm).call(this, edge, GraphMLElmType.EDGE, attrName, value);
    }
    addAttrForNode(node, attrName, value) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_addAttrForElm).call(this, node, GraphMLElmType.NODE, attrName, value);
    }
    setAttrForEdge(edge, attrName, value) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_setAttrForElm).call(this, edge, GraphMLElmType.EDGE, attrName, value);
    }
    setAttrForNode(node, attrName, value) {
        return __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_setAttrForElm).call(this, node, GraphMLElmType.NODE, attrName, value);
    }
}
_GraphMLModifier_attrsEdge = new WeakMap(), _GraphMLModifier_attrsNode = new WeakMap(), _GraphMLModifier_instances = new WeakSet(), _GraphMLModifier_attrsForType = function _GraphMLModifier_attrsForType(type) {
    switch (type) {
        case GraphMLElmType.EDGE:
            return __classPrivateFieldGet(this, _GraphMLModifier_attrsEdge, "f");
        case GraphMLElmType.NODE:
            return __classPrivateFieldGet(this, _GraphMLModifier_attrsNode, "f");
    }
}, _GraphMLModifier_attrIdForType = function _GraphMLModifier_attrIdForType(name, type) {
    const attrMap = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrsForType).call(this, type);
    const attrId = attrMap[name];
    if (attrId === undefined) {
        throw new Error(`Attribute "${name}" defined for element type ${type}`);
    }
    return attrId;
}, _GraphMLModifier_attrsForElm = function _GraphMLModifier_attrsForElm(elm, type, ...attrNames) {
    const result = {};
    const reverseAttrMap = {};
    const numQueryAttrs = attrNames.length;
    for (const anAttrName of attrNames) {
        const attrId = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrIdForType).call(this, anAttrName, type);
        reverseAttrMap[attrId] = anAttrName;
        result[anAttrName] = null;
    }
    let numQueryAttrsFound = 0;
    for (const elmData of elm.data) {
        const elmAttrId = elmData.$.key;
        // This attribute wasn't in the query, so ignore it and keep going.
        if (reverseAttrMap[elmAttrId] === undefined) {
            continue;
        }
        const elmAttrName = reverseAttrMap[elmAttrId];
        const elmAttrValue = elmData.$text;
        result[elmAttrName] = elmAttrValue;
        numQueryAttrsFound += 1;
        // If we've now satisfied all the attributes in the query,
        // we can exit iterating over the element's attributes early.
        if (numQueryAttrsFound === numQueryAttrs) {
            break;
        }
    }
    return result;
}, _GraphMLModifier_updateAttrForElm = function _GraphMLModifier_updateAttrForElm(elm, type, attrName, value) {
    const attrId = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrIdForType).call(this, attrName, type);
    for (const elmData of elm.data) {
        const elmDataAttrId = elmData.$.key;
        if (elmDataAttrId !== attrId) {
            continue;
        }
        elmData.$text = value;
        return true;
    }
    return false;
}, _GraphMLModifier_addAttrForElm = function _GraphMLModifier_addAttrForElm(elm, type, attrName, value) {
    const attrId = __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_attrIdForType).call(this, attrName, type);
    elm.data.push({
        $: {
            key: attrId,
        },
        $text: value,
        $name: 'data',
    });
}, _GraphMLModifier_setAttrForElm = function _GraphMLModifier_setAttrForElm(elm, type, attrName, value) {
    if (__classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_updateAttrForElm).call(this, elm, type, attrName, value)) {
        return AddAttributeResult.SET;
    }
    __classPrivateFieldGet(this, _GraphMLModifier_instances, "m", _GraphMLModifier_addAttrForElm).call(this, elm, type, attrName, value);
    return AddAttributeResult.INSERT;
};
