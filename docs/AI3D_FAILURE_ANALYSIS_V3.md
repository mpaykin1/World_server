# AI3D FAILURE ANALYSIS v3 — почему baseline был неприемлем

## Наблюдаемый провал
Референс — полноценный готический voxel-город: собор, башни, мосты, улицы, тёплый свет, плотная архитектура.
Прислано — маленький model viewer, серо-чёрная поверхность и relief/«гора», по которой нельзя ходить.

Это FAIL даже при технически валидном GLB.

## Причина 1 — неверный acceptance criterion
Pipeline оптимизировал GLB header, buffers, vertex/face count, zDepth, watertight и pipeline completion.
Пользовательский критерий был другим: узнаваемый, максимально похожий, playable/walkable мир.

## Причина 2 — heightfield не подходит для многослойной архитектуры
Одна высота на X/Z не умеет корректно хранить нависающие мосты, арки, помещения, улицу под мостом и перекрывающиеся фасады.
Нужен voxel occupancy / scene graph / multi-object reconstruction.

## Причина 3 — grayscale != depth
Яркость не равна расстоянию. Солнце и тёмный собор ломают такую модель глубины.
Grayscale допустим лишь как diagnostic fallback, не как финальная depth reconstruction.

## Причина 4 — city был классифицирован как single_object
Из-за этого не включились road/building decomposition и city-specific pipeline.

## Причина 5 — отсутствовал playable world stage
Не было обязательных стадий: collision, floor, player spawn, controls, pointer lock, walkable smoke test, public playable route.

## Причина 6 — diagnostic page была подана как final
Reference/model/render-back полезны разработчику, но основной URL должен открывать игру.

## Причина 7 — silhouette дал ложное чувство качества
Большая неправильная масса может иметь высокий silhouette. Поэтому silhouette нельзя принимать без SSIM, edges, color, multi-view и walkability.

## Причина 8 — tiny camera framing
Viewer показывал artifact слишком мелко. Это отдельный UI bug, но auto-fit не превращает неправильный relief в город.

## Причина 9 — не было machine-readable READY state
Теперь `ai3d-final-delivery.json` по умолчанию `NOT_READY_FOR_FINAL_DELIVERY`.
READY разрешён только после hard gate.

## Новый правильный pipeline
reference ingest → classify city → camera estimate → segmentation → honest depth prior → voxel/scene construction → buildings/roads/bridges → collision world → player spawn → keyboard + mouse-look → render-back → independent verifier → iterative correction → public deploy → public playable check → READY.

## Критерий успеха глазами пользователя
Открываю ссылку → узнаю город → иду стрелками/WASD → озираюсь мышью → могу пройти по улице и обойти основные здания.
Всё остальное — промежуточный artifact.
