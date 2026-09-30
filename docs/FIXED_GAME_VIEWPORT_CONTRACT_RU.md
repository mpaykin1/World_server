# Fixed Game Viewport Contract — обязательный стандарт World Server

**Дата:** 2026-09-30  
**Статус:** REQUIRED FOR ALL RELEASED GAMES  
**Причина:** physical-iPhone regression в Krieger Surgery Lab: игровая страница могла тянуться вверх/вниз, из-за чего жест управления камерой конфликтовал с браузерным scroll/rubber-band.

## Правило

Любая игра World Server, публикуемая как playable web game, должна вести себя как фиксированная игровая поверхность:

- страница **никогда не скроллится** по X/Y;
- drag/touch перемещает только игровой мир/камеру или соответствующий контрол;
- браузерный overscroll/rubber-band не должен сдвигать game surface;
- canvas/game root занимает видимую область браузера;
- изменение высоты visual viewport из-за browser chrome не создаёт scrollable body;
- HUD остаётся screen-space overlay, но тоже не создаёт page scroll.

UX-референсы пользователя:

- https://openttdonline.com/play/
- https://micropolisweb.com/

В Micropolis drag используется для pan мира, wheel — для zoom. Это именно тот принцип: gesture принадлежит игре, а не HTML-документу.

## Почему прежний подход оказался недостаточным

В Krieger portrait shell было:

```css
body { overscroll-behavior:none; }
#wrap { position:fixed; inset:0; width:100dvw; height:100dvh; }
canvas { touch-action:none; }
```

Это защищало canvas, но не гарантировало, что сам document/body никогда не станет scrollable в iOS/Telegram/Safari visual viewport.

Physical iPhone показал regression: весь экран можно было тянуть вверх/вниз.

### Вывод

`position:fixed` только на игровом wrapper недостаточен.  
`overscroll-behavior:none` только на body недостаточен.

Нужно блокировать **document-level scrolling** и синхронизировать game surface с актуальной visual viewport height.

## Каноническая реализация

Использовать:

```
shared/fixed-game-viewport.js
```

и помечать поверхности:

```html
<div data-world-game-root>
  <canvas data-world-game-canvas></canvas>
</div>
```

Минимальный вызов:

```html
<script src="/shared/fixed-game-viewport.js"></script>
<script>
  WorldServerFixedViewport.install();
</script>
```

Runtime делает:

1. `html, body { position:fixed; inset:0; overflow:hidden; }`
2. `overscroll-behavior:none`;
3. `touch-action:none`;
4. фиксирует game root/canvas;
5. использует `visualViewport.height` / `innerHeight`;
6. предотвращает `touchmove` browser scrolling;
7. предотвращает Safari gesture scrolling/zoom;
8. при любом browser scroll возвращает `scrollTo(0,0)`;
9. синхронизируется на visual viewport resize/scroll.

## Acceptance gate

Game release не проходит mobile acceptance, если не доказано:

```
window.scrollX === 0
window.scrollY === 0

computedStyle(html).position === "fixed"
computedStyle(body).position === "fixed"

computedStyle(html).overflow === "hidden"
computedStyle(body).overflow === "hidden"

touch-action === none
overscroll-behavior === none

document scrollHeight <= visible viewport height + tolerance
```

Тест обязан попытаться:

```js
window.scrollTo(0, 500)
```

и убедиться, что page scroll остаётся `0`.

Для physical iPhone остаётся финальная проверка: drag по игровому экрану не должен визуально сдвигать страницу даже на несколько пикселей.

## Важное различие

**Game camera movement** — разрешено и необходимо.  
**HTML page movement** — regression.

Не нужно отключать pointermove/touch logic игры. Document-level lock должен предотвращать только native browser pan/rubber-band.

## Regression rule

Начиная с 2026-09-30, если playable game можно потянуть вверх/вниз как веб-страницу, она не считается готовой к выпуску независимо от качества графики и остальных тестов.
