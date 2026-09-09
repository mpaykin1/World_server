(() => {
  'use strict';
  const shell = document.createElement('div');
  shell.id = 'worldShell';
  shell.innerHTML = '<strong>🧬 Лаборатория существ</strong><button id="editorToggle" type="button">Скрыть</button><button id="loreToggle" type="button">Тайна</button><a href="/apps/catalog/">Миры</a>';
  document.body.appendChild(shell);

  const lore = document.createElement('div');
  lore.id = 'worldLore';
  lore.innerHTML = '<div id="worldLoreCard"><h2>Лаборатория Миметики</h2><p>Здесь существа не рисуются — они выращиваются из параметров. Но некоторые новые формы появляются до того, как исследователь нажимает «Создать».</p><p><b>Цель:</b> собрать существо, способное пройти через нестабильную Дверь Видов. <b>Опасность:</b> неудачная комбинация оставляет «эхо» — форму, которая продолжает мутировать сама.</p><p><b>Правило мира:</b> внешний вид, анатомия, движение и материал являются одним геномом. Экспортированное существо может перейти в другие миры World Server.</p><p>Среди записей найден профиль с подписью самого игрока, датированной завтрашним днём. Кто создал его первым?</p><button id="loreClose" type="button">Вернуться в редактор</button></div>';
  document.body.appendChild(lore);

  const status = document.createElement('div');
  status.id = 'worldStatus';
  document.body.appendChild(status);
  const showStatus = (message, sticky = false) => {
    status.textContent = message;
    status.classList.add('show');
    if (!sticky) setTimeout(() => status.classList.remove('show'), 3500);
  };
  const editorToggle = shell.querySelector('#editorToggle');
  editorToggle.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('editor-collapsed');
    editorToggle.textContent = collapsed ? 'Редактор' : 'Скрыть';
  });
  shell.querySelector('#loreToggle').addEventListener('click', () => lore.classList.add('open'));
  lore.querySelector('#loreClose').addEventListener('click', () => lore.classList.remove('open'));
  lore.addEventListener('click', event => { if (event.target === lore) lore.classList.remove('open'); });

  window.addEventListener('error', event => {
    if (/three|module|shader|webgl/i.test(`${event.message || ''} ${event.filename || ''}`)) {
      showStatus('Редактор столкнулся с ошибкой графики. Обновите страницу — исходные параметры сохранены в файле.', true);
    }
  });
  window.addEventListener('unhandledrejection', () => showStatus('Не удалось загрузить один из модулей редактора. Повторите загрузку страницы.', true));
  setTimeout(() => {
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) showStatus('3D-сцена не запустилась. Проверьте соединение и обновите страницу.', true);
  }, 7000);

  window.__CREATURE_EDITOR_WORLD__ = {
    version: '1.0.0', source: 'editor3_rainbow_shader', categories: 13,
    features: ['procedural-generation','animation','shader-presets','skins','html-export','json-export','mobile-orbit']
  };
})();
