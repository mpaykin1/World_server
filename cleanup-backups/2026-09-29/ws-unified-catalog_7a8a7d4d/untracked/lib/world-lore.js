'use strict';
const fs = require('fs');
const path = require('path');

const ROOT_STORY = 'Осколки Improve World';
const motifs = [
  'память, которую мир пытается переписать',
  'город, который строится из решений игроков',
  'зона, где страх превращается в ресурс',
  'архив исчезнувших версий реальности',
  'сон, который продолжает себя за горизонтом',
  'машина, собирающая мир из человеческих историй',
  'граница между чужими и собственными воспоминаниями',
  'осколок мира, который знает о других осколках'
];
const hooks = [
  'Этот мир знает, что он не единственный',
  'Здесь спрятан след, меняющий соседние реальности',
  'То, что ты сделаешь здесь, отзовётся в других мирах',
  'Мир продолжает строиться, пока ты идёшь вперёд',
  'Навигатор считает это место ключом к восстановлению реальности',
  'Карта врёт: за краем всегда появляется следующий чанк'
];
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick(list, seed, offset=0) { return list[(seed + offset) % list.length]; }
function cleanTitle(item) { return String(item.title || item.id || 'Безымянный мир').trim(); }
function roleFor(item) {
  const id = `${item.id || ''} ${item.kind || ''}`.toLowerCase();
  if (id.includes('dark') || id.includes('navigator')) return 'Проводник и память о целом мире';
  if (id.includes('survival')) return 'Проверка того, что игрок готов унести дальше';
  if (id.includes('dream')) return 'Слой сна, где возникают будущие события';
  if (id.includes('ink') || id.includes('glyph')) return 'Алфавит, которым мир переписывает сам себя';
  if (id.includes('voxel')) return 'Материальный слой общей реальности';
  if (id.includes('catalog') || id.includes('home') || id.includes('hub')) return 'Перекрёсток между осколками';
  return 'Отдельный осколок общей истории';
}
function previewFor(root, item) {
  if (item.external) return { video:'', poster:'' };
  const base = path.join(root, 'shared', 'world-previews', item.id || '');
  const video = fs.existsSync(`${base}.webm`) ? `/shared/world-previews/${item.id}.webm` : '';
  const poster = fs.existsSync(`${base}.jpg`) ? `/shared/world-previews/${item.id}.jpg` : '';
  return { video, poster };
}
function enrichInventory(root, items) {
  const base = items.map((x, index) => ({...x, _index:index}));
  return base.map((item, index) => {
    const seed = hash(item.id || item.title || index);
    const others = base.filter(x => x.id !== item.id);
    const connections = [];
    if (others.length) {
      for (let n=0; n<Math.min(3, others.length); n++) {
        const target = others[(seed + n * 7) % others.length];
        if (!connections.some(c => c.id === target.id)) connections.push({id:target.id,title:cleanTitle(target),url:target.url || ''});
      }
    }
    const title = cleanTitle(item);
    const hook = pick(hooks, seed, 3);
    const motif = pick(motifs, seed, 11);
    const headline = `${hook}: что скрывает «${title}»`;
    const story = `${title} — глава истории «${ROOT_STORY}». Здесь игрок сталкивается с ${motif}. ` +
      `Каждое действие оставляет след, который может проявиться в связанных мирах. ` +
      `Если идти дальше, пространство не заканчивается: система должна продолжать его чанками.`;
    const preview = previewFor(root, item);
    return {
      ...item,
      lore:{rootStory:ROOT_STORY,chapter:index+1,headline,story,role:roleFor(item),connections},
      preview
    };
  }).map(({_index,...item})=>item);
}

module.exports = { ROOT_STORY, enrichInventory };
