'use strict';

function decodeEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function parseAttributes(source) {
  const attrs = {};
  const re = /([:\w.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = re.exec(source))) attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? '');
  return attrs;
}

function pushText(stack, text) {
  if (!stack.length || !text) return;
  stack[stack.length - 1].text += text;
}

function openNode(stack, token) {
  const selfClosing = /\/\s*>$/.test(token);
  const inner = token.slice(1, selfClosing ? -2 : -1).trim();
  const nameMatch = inner.match(/^([^\s/>]+)/);
  if (!nameMatch) return null;
  const node = { name: nameMatch[1], attrs: parseAttributes(inner), children: [], text: '' };
  if (stack.length) stack[stack.length - 1].children.push(node);
  if (!selfClosing) stack.push(node);
  return node;
}

function parseXml(xml) {
  const source = String(xml || '').replace(/^\uFEFF/, '');
  if (/<!DOCTYPE/i.test(source)) throw new Error('DOCTYPE is not supported');
  const tokens = source.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[^>]*\?>|<[^>]+>|[^<]+/g) || [];
  const stack = [];
  let root = null;
  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;
    if (token.startsWith('<![CDATA[')) { pushText(stack, token.slice(9, -3)); continue; }
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<')) {
      const node = openNode(stack, token);
      if (node && !root) root = node;
      continue;
    }
    pushText(stack, decodeEntities(token));
  }
  if (!root) throw new Error('XML root element missing');
  return root;
}

function child(node, name) {
  return node?.children?.find((item) => item.name === name) || null;
}

function children(node, name) {
  return (node?.children || []).filter((item) => item.name === name);
}

function trimmedText(node) {
  return String(node?.text || '').trim();
}

module.exports = { decodeEntities, parseXml, child, children, trimmedText };
