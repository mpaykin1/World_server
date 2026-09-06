# AI3D FAILURE ANALYSIS v2 — почему baseline был неприемлем

## Наблюдаемый результат

На присланном пользователем экране:
- слева референс: полноценный готический voxel-город, улицы, башни, мосты, центральный собор, тёплый закат;
- по центру: маленький серо-чёрный объект в model viewer;
- справа: серый рельеф/«гора»;
- вместо игры — диагностическая comparison page.

Это не является ошибкой только UI. Это **ошибка постановки цели pipeline**.

## Главная системная ошибка

Pipeline оптимизировал:
- валидный GLB;
- ненулевую глубину;
- watertight;
- число вершин/треугольников;
- завершение стадий.

Но пользовательская задача была другой:

> построить максимально похожий на референс **3D-мир, по которому можно ходить**.

То есть технические метрики были surrogate metrics и не соответствовали пользовательскому acceptance criterion.

## Ошибки по уровням

### A. Product contract
Не было жёсткого запрета выдавать debug viewer как финальный deliverable.

Исправление:
`AI3D_FINAL_DELIVERY_CONTRACT.md` + server policy + CI gate.

### B. Representation
Город представлен как heightfield/relief.

Почему это неверно:
- heightfield хранит одну высоту на X/Z;
- не умеет естественно представлять нависающие мосты, внутренние улицы, арки, отдельные башни, фасады за фасадами;
- фронтальная картинка города содержит перекрывающиеся архитектурные массы.

Исправление:
voxel occupancy / scene graph / отдельные объекты и комнаты.

### C. Depth
Grayscale использовался как fallback глубины.

Почему это неверно:
яркость ≠ расстояние.
Солнце/небо становятся «высокими», тёмный собор — «низким».

Исправление:
Depth Anything или другой настоящий depth prior; при недоступности — depth остаётся HEURISTIC/UNTESTED, а не grayscale-depth.

### D. Classification
Город попал в `single_object`.

Следствие:
не сработал city-specific pipeline.

Исправление:
городская классификация должна учитывать много архитектурных компонентов и допускать override `sceneType=city`.

### E. Scene construction
Не было:
- улиц;
- floor navigation graph;
- player spawn;
- collision world;
- отдельного собора;
- мостов;
- домов как самостоятельных масс.

Следствие:
даже идеальный GLB viewer не превращался бы в игру.

### F. Delivery UI
`apps/ai3d-reference-test` был показан как будто это результат.

Эта страница должна существовать только для:
- debug;
- verifier;
- before/after;
- render-back.

Она не имеет права быть основной ссылкой пользователю.

### G. Camera / scale
Центральная модель была показана очень маленькой.
Даже диагностически это снижало читаемость и создавало ложное впечатление «результат есть».

Исправление:
авто-fit camera для debug viewer. Но это вторично: увеличение плохого heightfield не делает его городом.

### H. Texture/materials
Clay render удалил критически важную часть референса — цвет/свет/материалы.
Textured pass не восстанавливал реальную структуру.

Исправление:
сначала correct geometry/massing, затем projection/material reconstruction.

### I. Verification mismatch
Высокий silhouette IoU был фактически ложноположительным для задачи:
большая общая масса может совпасть, оставаясь абсолютно не похожей архитектурно.

Исправление:
silhouette никогда не использовать отдельно.
Обязательны SSIM + edges + color + multi-view + walkability.

## Новый запрет на выдачу

Если выполняется хотя бы одно:
- `RELIEF_DOMINANT`
- `HEIGHTFIELD_DOMINANT`
- `BILLBOARD_LIKE`
- `walkable=false`
- `mouseLook=false`
- `collisions=false`
- нет public playable scene URL

то результат **не может называться финальным**.

## Новый порядок работы

1. reference ingest
2. scene classification
3. camera estimate
4. segmentation
5. real/heuristic depth with honest label
6. voxel/scene construction
7. buildings/roads/bridges
8. collision + player spawn
9. walkable browser runtime
10. render-back
11. independent metrics
12. iterative correction
13. public playable scene
14. только после этого — финальная ссылка пользователю

## Acceptance definition

Успех — когда пользователь может:
1. открыть ссылку;
2. сразу увидеть мир, похожий на референс;
3. двигаться стрелками/WASD;
4. смотреть мышью;
5. идти по улицам;
6. обходить основные здания;
7. визуально узнать ключевые объекты референса.

Валидный GLB сам по себе больше не является acceptance criterion.
