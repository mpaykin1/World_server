#!/usr/bin/env python3
"""
Scaffold new content in the house style. Every template registers and builds as it is, with
placeholder art you then redraw — so the loop is always: new → build → check → shots → refine.

usage: python3 tools/new.py KIND ID [--pack PACK] [--name "Имя"] [--color "#hex"]

kinds and where they go (files are appended to, never overwritten):
  pack        packs/<ID>/pack.json
  melee       weapons.js  + art/weapons.py   (@weapon, 32×32, drawn at 45°: grip bottom-left, tip top-right)
  ranged      weapons.js  + art/weapons.py   (@weapon pointing right) + projectiles.js + art/projectiles.py
  enemy       enemies.js                     (base body 'serpent' + brain 'stalker'; recolour via look)
  body        bodies.js                      (how a foe moves and is drawn)
  brain       brains.js                      (how a foe thinks)
  biome       biomes.js                      (block roles, terrain, flora, palette, weather, foes)
  block       blocks.js   + art/tiles.py     (@tile, 16×16 seamless)
  flora       flora.js                       (a grower: trees, crystals, ruins …)
  character   heroes.js   + art/heroes.py    (@hero sheet from art.character.Spec)
  relic       relics.js   + art/icons.py     (@icon, 16×16)
  npc         npcs.js     + art/heroes.py
  event       events.js                      (palette / weather / ambience / spawn pressure + onTick)
  weather     weather.js                     (GPU precipitation kind)
  sound       sounds.js                      (synth recipe)
  anim | fire | projectile | ricochet        combat building blocks
--pack defaults to 'mods' (created with a pack.json when missing). --color tints placeholder art.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

JS = {
    "melee": ("weapons.js", """
/* {name}: TODO — what makes it different (anim, numbers, an effect). Fields: docs/CONTENT.md → Оружие. */
defineWeapon('{id}', {
  name: '{name}', kind: 'melee', rar: 'rare', anim: 'slash',
  dmg: 18, cd: 0.4, dur: 0.34, reach: 1.9, arc: 120, kb: 4, combo: 2, slow: 0.6,
  trail: '{color}', stat: 'Урон 18', desc: 'TODO: одна фраза о том, чем оно особенное.',
  held: 1.4, loot: {{ tier: 9 }},
});
"""),
    "ranged": ("weapons.js", """
/* {name}: TODO — fire mode, projectile, ricochet, magazine. Fields: docs/CONTENT.md → Оружие. */
defineWeapon('{id}', {
  name: '{name}', kind: 'ranged', rar: 'rare', fire: 'proj', proj: '{id}', ric: 'none',
  dmg: 12, cd: 0.3, speed: 30, life: 1.6, size: 0.5, r: 0.12, kb: 2, mag: 8, reload: 1.2,
  color: [1, 0.8, 0.5, 2.5], stat: 'Урон 12 · 8 выстрелов', desc: 'TODO: одна фраза о том, чем оно особенное.',
  held: 1.2, loot: {{ tier: 9 }},
  sfx: [['hiss', 0.12, 1800, 0.7, 0.1], ['tone', 260, 0.1, 'square', 0.05, 120]],
});
"""),
    "projectile": ("projectiles.js", """
/* {name}: how the shot looks (draw), trails (trail → seconds to the next puff) and bursts (impact). */
defineProjectile('{id}', {
  draw(p, li) {{ sprites.add(p.pos.x, p.pos.y, p.pos.z, 0.55, 0.55, p.age * 8, PUV['{id}'], 0, 0, 1, 1, li, li, li, 0.2); }},
  trail(p) {{ glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.25, 0.08, 0.02, toColor('{color}'), 0.8, 0, 0, 1); return 0.04; }},
  impact(p) {{ for (let k = 0; k < 5; k++) glow.emit(p.pos.x, p.pos.y, p.pos.z, rr(-2, 2), rr(0.5, 2.5), rr(-2, 2), rr(0.15, 0.3), 0.07, 0.02, C.spark, 1, 8, 1, 1); }},
}});
"""),
    "enemy": ("enemies.js", """
/* {name}: TODO — numbers, look and when it appears. Fields: docs/CONTENT.md → Враги. */
defineEnemy('{id}', {
  name: '{name}', body: 'serpent', brain: 'stalker',
  seg: 6, rad: 0.4, spacing: 0.3, hover: 1.0, hp: 40, dmg: 1, wander: 1.8, chase: 3.1, chaseR: 7,
  soul: 0.25, danger: 0.7, eye: 0.1, eyeGap: 0.12,
  look: {{ core: '#06030c', rim: '{color}', aura: '{color}', spikes: 0, auraGain: 1, style: 0 }},
  spawn: {{ from: 'sea', priority: 4, every: 5, dist: [12, 24], max: (c) => (c.collected < 4 ? 0 : 2) }},
});
"""),
    "body": ("bodies.js", """
/* {name}: init builds f.segs / f.rads; step executes the brain's intent (steerFoe is the engine's inertial
   steering); render draws segments with putSegment (+ drawEyes); drawFx may add ribbons each frame. */
defineBody('{id}', {{
  init(f, x, y, z) {{
    for (let k = 0; k < f.n; k++) {{ f.segs.push(new THREE.Vector3(x, y - k * 0.2, z)); f.rads.push(f.def.rad * (1 - 0.4 * k / Math.max(1, f.n - 1))); }}
  }},
  step(f, dt) {{
    steerFoe(f, dt);
    for (let k = 1; k < f.n; k++) {{                                  // each segment trails the one ahead
      const a = f.segs[k - 1], b = f.segs[k];
      b.lerp(a, damp(9 - k * 0.6, dt));
      b.y += Math.sin(f.t * 2.4 - k * 0.6 + f.seed) * 0.12 * dt;
    }}
  }},
  touch(f, px, py, pz) {{ const h = f.segs[0]; return Math.hypot(px - h.x, py - h.y, pz - h.z) < f.rads[0] + 0.3 ? 0 : -1; }},
  render(f) {{
    for (let k = 0; k < f.n; k++) {{ const s = f.segs[k]; putSegment(f, s.x, s.y, s.z, f.rads[k], Math.max(0, f.alpha), f.seed + k); }}
    drawEyes(f, f.segs[0], f.def.rad);
  }},
}});
"""),
    "brain": ("brains.js", """
/* {name}: think(f, dt, s) picks the state and writes the intent: f.target, f.speed, f.turn, f.ty, f.yk, f.arrive,
   f.harmful. s = {{ px, py, pz, dxp, dzp, dist, prog, canChase, chaseR }}. Optional: init, afterRise,
   onHurtHero, onDamaged, damageMul, drawFx. */
defineBrain('{id}', {{
  think(f, dt, s) {{
    const def = f.def, head = f.segs[0];
    if (f.state === 'wander') {{
      f.timer -= dt;
      if (f.timer <= 0) {{ const c = world.landCells[Math.floor(Math.random() * world.landCells.length)]; f.target.set(c[0] + 0.5, 0, c[1] + 0.5); f.timer = rr(3, 6); }}
      if (s.canChase && s.dist < s.chaseR) f.state = 'chase';
    }} else if (f.state === 'chase') {{
      f.target.set(s.px, 0, s.pz);
      if (!s.canChase || s.dist > s.chaseR + 5) {{ f.state = 'wander'; f.timer = 0; }}
    }}
    f.speed = f.state === 'chase' ? def.chase : def.wander;
    f.turn = 1.6;
    f.ty = Math.max(terrainTop(head.x, head.z), SEA) + def.hover + 0.25 * Math.sin(f.t * 1.5 + f.seed);
    f.yk = 2.4; f.arrive = 0.01; f.harmful = true;
  }},
  onHurtHero(f) {{ f.state = 'wander'; f.timer = 1.5; }},
}});
"""),
    "biome": ("biomes.js", """
/* {name}: block roles (any registered block), terrain, flora, palette per phase, weather, foes.
   Fields: docs/CONTENT.md → Биомы. */
defineBiome('{id}', {
  name: '{name}', short: 'TODO: три слова', desc: 'TODO: описание острова.',
  lede: 'TODO: строка под названием игры на титульном экране.',
  blocks: {{
    top: 'grass', soil: 'dirt', deep: 'stone', beach: 'sand', path: 'dirt', plaza: 'stone',
    wall: 'brick', pier: 'plank', post: 'bark', rock: 'stone', tower: 'brick', towerCap: 'brick', towerTop: 'stone', door: 'plank',
  }},
  terrain: {{ height: 8.4, base: 0.42, hills: 0.8 }},
  flora: [{{ type: 'round_tree', count: 20, spacing: 4.3, trunk: 'bark', crown: 'leaves' }}],
  rocks: 6, ruins: 2, piers: 2, shrines: 3,
  leafColors: ['#3a823d', '#5ea443', '#8fc64d'],
  palette: {{ dusk: {{ skyHor: '{color}' }}, twi: {{}}, night: {{}}, dawn: {{}} }},
  weather: null,
  ambience: {{ wind: 1, waves: 1 }},
});
"""),
    "block": ("blocks.js", """
/* {name}: tiles name @tile art (any pack); mm = minimap colour; step = footstep kind (sound 'step_<kind>'). */
defineBlock('{id}', {{ name: '{name}', tiles: '{id}', mm: '{color}', step: 'stone' }});
"""),
    "flora": ("flora.js", """
/* {name}: grow(ctx, x, z, h, opt) writes voxels with ctx.set (recorded, so felling removes exactly them)
   and returns {{ th, crownY }}. ctx.rand is the island's RNG. */
defineFlora('{id}', {{
  name: '{name}', footprint: 1, minHeight: 5, choppable: true,
  grow(ctx, x, z, h, opt) {{
    const trunk = ctx.block(opt.trunk || 'bark'), crown = ctx.block(opt.crown || 'leaves');
    const th = 3;
    for (let y = h; y < h + th; y++) ctx.set(x, y, z, trunk);
    ctx.soilUnder(x, z);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (ctx.get(x + a, h + th, z + b) === 0) ctx.set(x + a, h + th, z + b, crown);
    ctx.set(x, h + th + 1, z, crown);
    return {{ th, crownY: h + th }};
  }},
}});
"""),
    "character": ("heroes.js", """
/* {name}: stats are multipliers (hp in half-hearts); start = weapons in hand; lantern = a glowing pixel. */
defineCharacter('{id}', {
  name: '{name}', desc: 'TODO: кто это и чем играет иначе.', perk: 'TODO: две-три слова',
  art: '{id}', stats: {{ hp: 6, speed: 1 }}, start: ['fists'],
});
"""),
    "relic": ("relics.js", """
/* {name}: stats multiply (speed, jump, swim, melee, ranged, wisp, magnet) or add (maxHp, soul, regen = s per half-heart).
   Hooks: onPickup(), onTick(dt); a relic can also work through on('hit' | 'kill' | …) with heldRelics(). */
defineRelic('{id}', {{ name: '{name}', desc: 'TODO: что даёт.', icon: '{id}', rar: 'rare', stats: {{ speed: 1.1 }} }});
"""),
    "npc": ("npcs.js", """
/* {name}: art = an @hero sheet (frame 4 is shown); lines cycle while the hero is near; a line may be
   (ctx) => text | null. ctx: left, all, wardenDown, night, relics, shrines, event, weapons, kills, plural. */
defineNPC('{id}', {
  name: '{name}', art: '{id}', place: 'spawn', radius: 3.2,
  lines: [
    'TODO: первая реплика.',
    (c) => (c.left > 0 ? `Осталось ${{c.left}} ${{c.plural(c.left, 'монета', 'монеты', 'монет')}}.` : null),
  ],
});
"""),
    "event": ("events.js", """
/* {name}: palette targets (any palette lever), weather, ambience beds and spawn pressure are blended in by
   the eased intensity k; onTick(dt, k) for anything alive. Fields: docs/CONTENT.md → События. */
defineEvent('{id}', {{
  name: '{name}', toast: 'TODO: что видит игрок',
  chance: 0.25, duration: [30, 45], cooldown: 60,
  when: (c) => c.play > 30,
  weather: {{ kind: 'rain', density: 0.6, wind: [1, 0.4] }},
  palette: {{ fogD: 0.03, skyHor: '{color}' }},
  ambience: {{ rain: 0.6, wind: 1.3 }},
  onTick(dt, k) {{}},
}});
"""),
    "weather": ("weather.js", """
/* {name}: color · size · fall (negative rises) · sway · shape 0 flake / 1 streak / 2 ash · alpha · additive + glow · box */
defineWeather('{id}', {{ color: '{color}', size: 0.07, fall: 0.6, sway: 0.5, shape: 0, alpha: 0.85 }});
"""),
    "sound": ("sounds.js", """
/* {name}: ['tone', freq, dur, type, vol, slide, delay] · ['hiss', dur, freq, q, vol, type, delay] · ['sweep', dur, f0, f1, q, vol, type, delay] */
defineSound('{id}', [['tone', 660, 0.12, 'triangle', 0.04, 990], ['hiss', 0.08, 2400, 1.2, 0.03]]);
"""),
    "anim": ("anims.js", """
/* {name}: pose(w, t, step, fin) → {{ ang (deg vs. the aim), push (along the aim), active (hit window) }}. */
defineAnim('{id}', {{
  trail: 'arc', lunge: [2.2, 3.4], swing: 1,
  pose(w, t) {{
    const ang = t < 0.2 ? lerp(100, 120, easeOut(span(t, 0, 0.2))) : lerp(120, -70, easeOut(span(t, 0.2, 0.55)));
    return {{ ang, push: 0.2 * Math.sin(t * Math.PI), active: t > 0.22 && t < 0.55 }};
  }},
}});
"""),
    "fire": ("fires.js", """
/* {name}: trigger(w, origin, dir, charge) fires once; continuous + update(dt, w) for held beams. */
defineFire('{id}', {{
  trigger(w, o, dir, charge) {{ spawnShot(w, o, dir, charge); }},
}});
"""),
    "ricochet": ("ricochets.js", """
/* {name}: hit(p, comp, speed) → true = the projectile dies. comp: the blocked axis ('x' | 'y' | 'z'). */
defineRicochet('{id}', (p, comp) => {{
  if (p.bounce > 0) {{ p.vel[comp] *= -0.7; p.bounce--; ricochetFx(p, comp); return false; }}
  return impact(p);
}});
"""),
}

ART_HEAD = {
    "weapons.py": '"""Weapon art (32×32 cells). melee: 45°, grip bottom-left; ranged: points right (base 0)."""\n'
                  "from art.pixel import N, S, Y, H, new, m_diag, m_rect, paint, put, outline, make_ramp\n"
                  "from art.registry import weapon\n",
    "projectiles.py": '"""Projectile sprites (16×16)."""\n'
                      "from art.pixel import new, m_ellipse, paint_round, put, outline, make_ramp\n"
                      "from art.registry import projectile\n",
    "tiles.py": '"""Tiles (16×16, seamless, no outline)."""\n'
                "import numpy as np\n\n"
                "from art.pixel import T, lut, pnoise, jitter, make_ramp\n"
                "from art.pixel import wput as put\n"
                "from art.registry import tile\n",
    "icons.py": '"""Icons (16×16) for relics and items."""\n'
                "from art.pixel import new, m_ellipse, paint_round, put, outline, make_ramp\n"
                "from art.registry import icon\n",
    "heroes.py": '"""Character sheets (6 frames of 16×24: walk ×4, idle, jump) — see art/character.py."""\n'
                 "from art.character import Spec, sheet\n"
                 "from art.pixel import make_ramp\n"
                 "from art.registry import hero\n",
}

ART = {
    "melee": ("weapons.py", '''

@weapon("{id}")
def w_{id}():
    c = new()
    paint(c, m_diag(6, 26, 5, 2), [N[1], N[2], N[3], N[4]])                  # grip
    paint(c, m_diag(8, 21, 3, 4, dx=1, dy=1), [Y[1], Y[2], Y[3], Y[4]])       # guard
    blade = make_ramp("{color}")
    paint(c, m_diag(11, 21, 14, 3, taper=[2, 1]), [blade[1], blade[2], blade[4], blade[5]])
    return outline(c), dict(grip=(8, 24), tip=(25, 6), base=45)
'''),
    "ranged": ("weapons.py", '''

@weapon("{id}")
def w_{id}():
    c = new()
    body = make_ramp("{color}")
    paint(c, m_rect(8, 13, 24, 17), [body[1], body[2], body[3], body[4]])    # body
    paint(c, m_rect(24, 14, 28, 15), [S[2], S[3], S[4], S[5]])               # barrel
    paint(c, m_rect(9, 18, 12, 23), [N[1], N[2], N[3], N[4]])                # grip
    return outline(c), dict(grip=(10, 20), tip=(28, 15), muzzle=(29, 15), base=0)
'''),
    "projectile": ("projectiles.py", '''

@projectile("{id}")
def p_{id}():
    c = new(16)
    ramp = make_ramp("{color}")
    paint_round(c, m_ellipse(7.5, 7.5, 2.6, 2.6, 16), ramp, 7.5, 7.5, 2.6)
    return outline(c)
'''),
    "block": ("tiles.py", '''

@tile("{id}")
def tile_{id}(seed={seed}):
    ramp = make_ramp("{color}", 6)
    f = 0.7 * pnoise(4, seed) + 0.3 * pnoise(8, seed + 1)
    idx = np.full((T, T), 3)
    idx[f < np.quantile(f, 0.25)] = 2
    idx[f > np.quantile(f, 0.85)] = 4
    a = lut(ramp)[idx]
    rng = np.random.default_rng(seed + 2)
    for x, y in jitter(rng, 4, 4, m=0.1):          # lit top-left, shade bottom-right
        put(a, int(x), int(y), ramp[5]); put(a, int(x) + 1, int(y) + 1, ramp[1])
    return a
'''),
    "relic": ("icons.py", '''

@icon("{id}")
def i_{id}():
    c = new(16)
    ramp = make_ramp("{color}")
    paint_round(c, m_ellipse(8, 8, 5, 5, 16), ramp, 8, 8, 5)
    put(c, 6, 5, "#ffffff")
    return outline(c)
'''),
    "character": ("heroes.py", '''

@hero("{id}")
def h_{id}():
    tunic = make_ramp("{color}", 4)
    return sheet(Spec(colors=dict(tunic=[tunic[0], tunic[1], tunic[2]])))
'''),
    "npc": ("heroes.py", '''

@hero("{id}")
def h_{id}():
    coat = make_ramp("{color}", 4)
    return sheet(Spec(colors=dict(tunic=[coat[0], coat[1], coat[2]]), tails=None))
'''),
}


def fill(t, **kw):
    # templates double the braces that must survive; {id} / {name} / {color} / {seed} are placeholders
    out = t
    for k, v in kw.items():
        out = out.replace("{" + k + "}", str(v))
    return out.replace("{{", "{").replace("}}", "}")


def append(path, text, head=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    new_file = not os.path.isfile(path)
    with open(path, "a", encoding="utf-8") as fh:
        if new_file and head:
            fh.write(head)
        fh.write(text)
    print(("created " if new_file else "appended ") + os.path.relpath(path, ROOT))


def main():
    a = sys.argv[1:]
    if len(a) < 2 or a[0] in ("-h", "--help"):
        print(__doc__); sys.exit(1)
    kind, cid = a[0], a[1]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d   # noqa: E731
    pack, name, color = opt("--pack", "mods"), opt("--name", cid.replace("_", " ").capitalize()), opt("--color", "#7fb8ff")
    if not re.fullmatch(r"[a-z][a-z0-9_]*", cid):
        sys.exit("id must be lower_snake_case (a-z, 0-9, _)")
    pdir = os.path.join(ROOT, "packs", cid if kind == "pack" else pack)
    pj = os.path.join(pdir, "pack.json")
    if not os.path.isfile(pj):
        os.makedirs(pdir, exist_ok=True)
        orders = [json.load(open(os.path.join(ROOT, "packs", d, "pack.json"))).get("order", 50)
                  for d in os.listdir(os.path.join(ROOT, "packs")) if os.path.isfile(os.path.join(ROOT, "packs", d, "pack.json"))]
        meta = {"id": os.path.basename(pdir), "name": name if kind == "pack" else os.path.basename(pdir), "order": max(orders + [0]) + 10,
                "desc": "TODO: что добавляет этот пак."}
        json.dump(meta, open(pj, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("created", os.path.relpath(pj, ROOT))
    if kind == "pack":
        return
    if kind not in JS:
        sys.exit(f"unknown kind '{kind}' — see --help")
    kw = dict(id=cid, name=name, color=color, seed=abs(hash(cid)) % 997)
    fname, tpl = JS[kind]
    append(os.path.join(pdir, fname), fill(tpl, **kw))
    if kind == "ranged":                                     # a ranged weapon gets its own projectile kind + sprite
        append(os.path.join(pdir, JS["projectile"][0]), fill(JS["projectile"][1], **kw))
        append(os.path.join(pdir, "art", "projectiles.py"), fill(ART["projectile"][1], **kw), ART_HEAD["projectiles.py"])
    if kind in ART:
        afile, atpl = ART[kind]
        append(os.path.join(pdir, "art", afile), fill(atpl, **kw), ART_HEAD[afile])
    print("next: python3 tools/build.py && python3 tools/check.py --no-build   (then tools/shots.py for a look)")


if __name__ == "__main__":
    main()
