const fs = require('fs');
const path = require('path');

const runtimeTag = '<script src="/shared/benchmark-capability-runtime.js"></script>';
const worldIds = ['voxel-world', 'ai3d-voxel-city', 'survival', 'world-sharabass', 'dark-void-scene'];

for (const id of worldIds) {
  const file = path.join('apps', id, 'index.html');
  if (!fs.existsSync(file)) throw new Error(`Missing world index: ${file}`);
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('/shared/benchmark-capability-runtime.js')) {
    if (!/<\/body>/i.test(html)) throw new Error(`No </body> in ${file}`);
    html = html.replace(/<\/body>/i, `${runtimeTag}\n</body>`);
    fs.writeFileSync(file, html, 'utf8');
  }
}

const registryPath = path.join('data', 'app-release-registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
registry.apps['benchmark-convergence-world'] = {
  title: 'Мир Схождения — Нулевая Погода',
  visible: true,
  status: 'certified',
  kind: 'experience',
  goldenStandard: 'v2',
  required: ['desktop-controls', 'mobile-controls', 'render'],
  worldMenu: {
    show: true,
    headline: 'ПОЧЕМУ ЗДЕСЬ ДОЖДЬ ИНОГДА ПАДАЕТ ВВЕРХ?',
    lore: 'На стыке миров чужие законы физики начинают смешиваться. Игрок ищет семь сигналов и решает — стабилизировать границы или открыть Схождение.',
    history: 'Мир возник как место, где сервер впервые научился не просто хранить разные технологии, а соединять их в одной игровой реальности.',
    familyId: 'benchmark-convergence-world',
    connections: [
      { targetId: 'voxel-world', story: 'Первый Куб появляется здесь как один из семи сигналов.' },
      { targetId: 'world-sharabass', story: 'Последовательность сигналов совпадает с Песней Шарабаса.' },
      { targetId: 'dark-void-navigator-live', story: 'Семь сигналов вспыхивают теми же огнями, что ведут через Dark Void.' }
    ]
  }
};
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

const lorePath = path.join('data', 'world-lore-v2.json');
const lore = JSON.parse(fs.readFileSync(lorePath, 'utf8'));
const allElements = [...lore.requiredElements];
lore.worlds['benchmark-convergence-world'] = {
  headline: 'ПОЧЕМУ ЗДЕСЬ ДОЖДЬ ИНОГДА ПАДАЕТ ВВЕРХ — И КТО ВКЛЮЧАЕТ КАТАСТРОФЫ?',
  lore: 'На стыке всех миров существует Нулевая Погода — место, куда просачиваются чужие законы: кубы помнят форму, вода становится стеной, ветер поднимает обломки, свет гнётся вокруг пустоты, лес отвечает на импульс, а звёзды двигаются как часы. Смотритель Штормов оставил семь сигналов, и каждый запускает опасное правило соседнего мира. Игрок должен собрать все семь и решить — стабилизировать границы или открыть Схождение, рискуя смешать миры навсегда. Поворот: последовательность сигналов совпадает и с Песней Шарабаса, и с семью огнями Dark Void. Возможно, катастрофы — не нападение, а попытка самого сервера научиться соединять законы миров. Но кто научил его выбирать, какие законы полезны?',
  history: 'Сначала это была пустая диагностическая зона. После сотен экспериментов в ней одновременно проявились ветер из одного мира, куб из другого и свет из третьего. Впервые разные технологии перестали быть отдельными демо и стали частью одной истории.',
  elements: allElements,
  connections: [
    { targetId: 'voxel-world', story: 'Первый Куб здесь служит одним из семи маяков и реагирует на ударные волны.' },
    { targetId: 'ai3d-voxel-city', story: 'Башня Ветра повторяет аэродинамический рисунок улиц самостроящегося города.' },
    { targetId: 'survival', story: 'Стена Воды приносит тот же холодный туман, который приходит на седьмую ночь.' },
    { targetId: 'world-sharabass', story: 'Семь сигналов складываются в музыкальную фразу языка Шарабаса.' },
    { targetId: 'dark-void-navigator-live', story: 'Тёмная Линза окружена семью огнями Навигатора.' },
    { targetId: 'improve-world-experiment-100', story: 'Журналы Лаборатории 100 называют Схождение первым устойчивым опытом, где несколько законов физики действуют одновременно.' }
  ]
};

function addConnection(sourceId, story) {
  const world = lore.worlds[sourceId];
  if (!world) return;
  world.connections = Array.isArray(world.connections) ? world.connections : [];
  if (!world.connections.some(x => x.targetId === 'benchmark-convergence-world')) {
    world.connections.push({ targetId: 'benchmark-convergence-world', story });
  }
}
addConnection('voxel-world', 'Во время грозы некоторые координаты Первого Куба открывают проход в Нулевую Погоду.');
addConnection('ai3d-voxel-city', 'Нулевой перекрёсток города иногда продолжает улицу прямо в Башню Ветра Схождения.');
addConnection('survival', 'Холодная Буря оставляет на горизонте водяную стену из Нулевой Погоды.');
addConnection('world-sharabass', 'Одна из забытых нот Песни открывает семь сигналов Нулевой Погоды.');
addConnection('dark-void-navigator-live', 'Седьмой огонь иногда превращается в Тёмную Линзу и выводит к Схождению.');
addConnection('improve-world-experiment-100', 'Эксперимент №101 мог создать Нулевую Погоду как испытательный полигон для смешанных законов.');
fs.writeFileSync(lorePath, `${JSON.stringify(lore, null, 2)}\n`, 'utf8');

console.log(`Benchmark capability runtime wired into ${worldIds.length} existing internal worlds.`);
console.log('Added certified world: benchmark-convergence-world');
