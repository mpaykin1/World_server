'use strict';

const crypto = require('crypto');
const { parseXml, child, children, trimmedText } = require('./roblox-xml');

const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript']);

function scalar(node) {
  const value = trimmedText(node);
  if (node.name === 'bool') return value === 'true';
  if (['int', 'int64', 'float', 'double'].includes(node.name)) return Number(value);
  if (node.name === 'token') return Number.isFinite(Number(value)) ? Number(value) : value;
  if (node.name === 'BinaryString') return value ? { encoding: 'base64', byteLengthApprox: Math.floor(value.length * .75) } : '';
  if (node.name === 'Content') return contentValue(node);
  return value;
}

function contentValue(node) {
  const nested = (node.children || []).find((item) => ['url', 'null'].includes(item.name));
  if (!nested || nested.name === 'null') return '';
  return trimmedText(nested);
}

function objectValue(node) {
  const out = {};
  for (const item of node.children || []) {
    const raw = scalar(item);
    const numeric = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    out[item.name] = Number.isFinite(numeric) ? numeric : raw;
  }
  return out;
}


function propertyValue(node) {
  if (!node) return null;
  if (['Vector2', 'Vector3', 'Color3', 'CFrame', 'CoordinateFrame', 'NumberRange', 'Rect2D', 'UDim', 'UDim2'].includes(node.name)) return objectValue(node);
  if (node.children?.length && node.name !== 'Content') return objectValue(node);
  return scalar(node);
}

function parseProperties(item) {
  const props = child(item, 'Properties');
  const out = {};
  if (!props) return out;
  for (const node of props.children || []) {
    const name = node.attrs?.name;
    if (name) out[name] = propertyValue(node);
  }
  return out;
}

function scriptRecord(instance) {
  const source = String(instance.properties.Source || '');
  return {
    referent: instance.referent,
    className: instance.className,
    name: instance.name,
    source,
    bytes: Buffer.byteLength(source, 'utf8'),
    sha256: crypto.createHash('sha256').update(source, 'utf8').digest('hex')
  };
}

function parseItem(node, parentReferent = null) {
  const properties = parseProperties(node);
  const instance = {
    referent: node.attrs?.referent || null,
    parentReferent,
    className: node.attrs?.class || 'Unknown',
    name: String(properties.Name || node.attrs?.class || 'Unnamed'),
    properties,
    children: []
  };
  instance.children = children(node, 'Item').map((item) => parseItem(item, instance.referent));
  return instance;
}

function walk(instances, visit) {
  for (const instance of instances) {
    visit(instance);
    walk(instance.children, visit);
  }
}

function summarize(instances) {
  const classes = {};
  const scripts = [];
  const remotes = [];
  walk(instances, (instance) => {
    classes[instance.className] = (classes[instance.className] || 0) + 1;
    if (SCRIPT_CLASSES.has(instance.className)) scripts.push(scriptRecord(instance));
    if (instance.className === 'RemoteEvent') remotes.push({ name: instance.name, referent: instance.referent });
  });
  return { instanceCount: Object.values(classes).reduce((a, b) => a + b, 0), classes, scripts, remotes };
}

function parseRbxlx(xml) {
  const root = parseXml(xml);
  if (root.name !== 'roblox') throw new Error(`Expected <roblox>, got <${root.name}>`);
  const instances = children(root, 'Item').map((item) => parseItem(item));
  const summary = summarize(instances);
  return { format: 'rbxlx', version: root.attrs?.version || null, instances, ...summary };
}

module.exports = { SCRIPT_CLASSES, parseRbxlx, parseProperties, propertyValue, walk };
