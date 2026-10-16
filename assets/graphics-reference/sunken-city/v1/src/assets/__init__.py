"""Asset registry: every model of the pack is a function decorated with @asset that builds and returns a
vox.Model (or a list of variants). Categories drive the catalogue and the folders of the pack."""
REG = {}
ORDER = []
CATS = {
    "creature": "Существа",
    "flora": "Водоросли, мох, кораллы",
    "city": "Готический город",
    "wreck": "Корабли и обломки",
    "vehicle": "Батискафы и транспорт",
    "weapon": "Подводное оружие",
    "pickup": "Находки",
}


def asset(fn):
    REG[fn.__name__] = fn
    ORDER.append(fn.__name__)
    return fn


def build_all(only=None):
    out = []
    for name in ORDER:
        if only and name not in only:
            continue
        res = REG[name]()
        out.extend(res if isinstance(res, list) else [res])
    return out
