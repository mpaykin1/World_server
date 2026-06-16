# Функции миршарабас1.html

## JS функции (клиент)

| Функция | Строки | Что делает |
|---------|--------|------------|
| `resize()` | 56-67 | Адаптирует canvas под размер окна с учётом DPI |
| `handleTouchStart(e)` | 83-100 | Обрабатывает касание: 1 палец → мелодия/аккорд, 2 пальца → зум/поворот |
| `handleTouchMove(e)` | 102-119 | Движение пальца: обновление touchX/Y, пинч-зум и поворот |
| `handleTouchEnd(e)` | 121-130 | Отпускание: сброс состояний |
| `createReverb()` | 171-183 | Создаёт реверберацию (импульс 2.5с) |
| `initAudio()` | 186-241 | Инициализирует AudioContext: мастер-канал, аккорды (4 осциллятора), бас, реверб, lightningGain |
| `setChord(idx)` | 244-256 | Переключает аккорд (12 типов: Cmaj → Dmin7) |
| `triggerMelodySequencer(x, y)` | 259-279 | Запускает мелодию: темп от скорости тапа, аккорд от X |
| `scheduleGroove(chordIdx, y)` | 282-338 | Один шаг секвенсора: бас (корень/квинта) + случайная мелодия, рекурсивный setTimeout |
| `triggerLightningSound(i, t)` | 341-368 | Звук молнии: шум с фильтром, два типа (cloud/branching) |
| `updateWeather(touchY)` | 377-405 | Погода от Y касания: облака, дождь, молнии, снег, дым |
| `createShader(type, source)` | 676-684 | Компилирует GLSL шейдер |
| `setupCamera(time)` | 720-740 | Орбитальная камера вокруг центра |
| `render()` | 744-783 | Главный цикл: обновление uniform'ов, отрисовка кадра |

## GLSL функции (шейдер)

| Функция | Строки | Что делает |
|---------|--------|------------|
| `hash(p)` | 441-445 | 1D хеш для случайности |
| `noise(p)` | 447-452 | 3D value noise |
| `fbm(p)` | 455-458 | Fractal Brownian Motion (4 октавы) |
| `smin(a, b, k)` | 461-464 | Smooth min для плавного слияния объектов |
| `sdSphere(p, r)` | 466 | SDF сферы |
| `sdBox(p, b)` | 467 | SDF куба |
| `sdTorus(p, t)` | 468 | SDF тора |
| `deform(p, t, intensity)` | 470-478 | Деформация сцены: скрутка + волны + пульсация от времени и касания |
| `map(p)` | 481-512 | SDF сцены: blob, pillar, orb, groundOrb, torus, ground + smooth merge |
| `getNormal(p)` | 514-517 | Нормаль через центральные разности |
| `smokeDensity(p)` | 519-525 | Плотность дыма с высотным затуханием |
| `getSmokeColor(p)` | 528-534 | Цвет дыма: белый/чёрный/цветной |
| `calcLighting(p, n, rd, matId, dist)` | 537-574 | Освещение: ambient + diffuse + specular + fresnel + glow + молнии + тепло/холод |
| `renderSky(rd)` | 577-623 | Небо: градиент + облака + молнии + дождь + снег |
| `render(uv)` | 626-668 | Основной рендер: ray marching + hit + smoke + tone mapping |
| `main()` | 670-672 | Точка входа: uv → render → fragColor |

## Uniform'ы шейдера

| Uniform | Тип | Назначение |
|---------|-----|------------|
| uTime | float | Время для анимации |
| uResolution | vec2 | Размер canvas |
| uCamPos | vec3 | Позиция камеры |
| uCamDir | vec3 | Направление камеры |
| uCamRight | vec3 | Право камеры |
| uCamUp | vec3 | Верх камеры |
| uTouch | vec2 | Позиция касания (X=аккорд/тепло, Y=погода/свет) |
| uTouchIntensity | float | Сила касания |
| uLightLevel | float | Уровень света (0.3–1.5) |
| uWarmth | float | Тепло/холод (0–1) |
| uRain / uLightning / uClouds / uWind / uSnow / uSmoke | float | Погода |
| uLightningFlash | float | Вспышка молнии (0–1) |
| uLightningType | float | Тип молнии (0–3) |

## Особенности

- Вся графика — SDF raymarching в WebGL2 (fullscreen quad)
- Музыка — Web Audio API (осцилляторы + реверберация)
- 12 аккордов, автогармонизация
- Погода управляется касанием по Y
- Деформация сцены от касания (интенсивность + позиция)
- Дым, молнии, дождь, снег
- Адаптивное разрешение (макс 1080px)
