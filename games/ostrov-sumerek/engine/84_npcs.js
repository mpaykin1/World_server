/* =============================================================================
   84 · NPCs: island inhabitants with lines of dialogue.
        defineNPC(id, { name, art (an @hero sheet), ghost?, place, lines, radius, biomes?, onMeet? })
        place: 'tower' | 'spawn' | 'ruin' | (world) => { x, z }
        lines: strings or (ctx) => string | null (null = skip) — they cycle while the hero is near.
============================================================================= */
const NPC_VERT = /* glsl */`
uniform vec4 uFrame;
varying vec2 vUv; varying float vY;
#include <fog_pars_vertex>
void main() {
  vUv = vec2(uFrame.x + uv.x * uFrame.z, uv.y);
  vY = uv.y;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const NPC_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uTint; uniform float uGhost, uTime, uLight;
varying vec2 vUv; varying float vY;
#include <fog_pars_fragment>
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb * uLight;
  if (uGhost > 0.5) {
    // a ghost: cold, see-through, dissolving into wisps at the feet
    float l = dot(t.rgb, vec3(0.3, 0.55, 0.15));
    col = mix(uTint * (0.16 + pow(l, 0.85) * 1.55), vec3(1.0), l * l * 0.35) * (0.88 + 0.12 * sin(uTime * 7.0 + vY * 20.0));
    float fade = smoothstep(0.0, 0.32, vY + 0.04 * sin(uTime * 3.0 + gl_FragCoord.x * 0.2));
    if (bayer2(gl_FragCoord.xy) > fade * 0.95) discard;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;
let npcs = [];
const npcBubble = $('npcSay');
function finalizeNPCs() {
  for (const d of REG.npcs.values()) if (!HERO_TEX[d.art]) regError(`npc '${d.id}': no sprite sheet '${d.art}' (draw it with @hero)`);
}
finalizeNPCs();
function npcPlace(d) {
  const w = world, p = d.place || 'tower';
  if (typeof p === 'function') return p(w);
  if (p === 'spawn') return { x: w.spawn.x + 1.6, z: w.spawn.z + 0.4 };
  if (p === 'ruin' && w.ruins.length) return { x: w.ruins[0].x + 0.5, z: w.ruins[0].z + 0.5 };
  const b = w.beacon, r = w.ring;
  return { x: r.x + (r.x - b.x) * 0.55 + (r.z - b.z) * 0.6, z: r.z + (r.z - b.z) * 0.55 - (r.x - b.x) * 0.6 };
}
function buildNPCs() {
  for (const n of npcs) { scene.remove(n.mesh); n.mesh.material.dispose(); }
  npcs = [];
  for (const d of REG.npcs.values()) {
    if (!HERO_TEX[d.art] || (d.biomes && !d.biomes.includes(world.biome))) continue;
    const p = npcPlace(d);
    if (!p) continue;
    // stand on the walkable surface of that column (not on a tree crown above it)
    const ix = Math.floor(p.x), iz = Math.floor(p.z), st = ix >= 0 && iz >= 0 && ix < W && iz < D ? world.stand[ix + iz * W] : BLOCKED;
    const gy = st !== BLOCKED && st < H - 2 ? st : groundBelow(p.x, H - 1, p.z);
    const u = { uMap: { value: HERO_TEX[d.art] }, uFrame: { value: new THREE.Vector4(4 / 6, 0, 1 / 6, 0) }, uTint: { value: new THREE.Color(d.tint || '#7fe6ff') },
      uGhost: { value: d.ghost ? 1 : 0 }, uTime: U.time, uLight: { value: 1 } };
    const mesh = new THREE.Mesh(heroGeo, fogShader({ uniforms: u, vertexShader: NPC_VERT, fragmentShader: NPC_FRAG, transparent: !!d.ghost }));
    mesh.renderOrder = 2;
    mesh.rotation.order = 'YXZ';                 // like the hero: yaw to the camera, then lean back
    scene.add(mesh);
    npcs.push({ def: d, x: p.x, z: p.z, y: gy, mesh, u, line: -1, lineT: 0, met: false, near: false, phase: Math.random() * TAU, face: -1 });
  }
}
function npcLines(n) {
  const ctx = { G, world, player, left: G.total - G.collected, all: G.all, wardenDown: G.wardenDown, hero: HERO && HERO.id,
    night: G.tod > 0.6, relics: relicsHeld.length, shrines: relicSpots.filter((r) => r.alive).length, event: EVT.cur && EVT.cur.id,
    weapons: combat.arsenal.length - 1, kills: G.kills, biome: G.biome, plural: ruPlural };
  return n.def.lines.map((l) => (typeof l === 'function' ? l(ctx) : l)).filter(Boolean);
}
let bubbleNpc = null, bubbleText = '', bubbleShown = 0;
function updateNPCs(dt) {
  let speaker = null;
  for (const n of npcs) {
    const d = n.def;
    const dist = Math.hypot(player.pos.x - n.x, player.pos.z - n.z);
    const near = G.state === 'play' && dist < (d.radius ?? 3.2);
    if (near && !n.met) { n.met = true; if (d.onMeet) d.onMeet(n); }
    if (near && !n.near) { n.line = -1; n.lineT = 0; }
    n.near = near;
    if (near) {
      n.lineT -= dt;
      if (n.lineT <= 0) {
        const lines = npcLines(n);
        if (lines.length) { n.line = (n.line + 1) % lines.length; n.text = lines[n.line]; n.lineT = 1.2 + n.text.length * 0.055; if (d.voice) playSound(d.voice); }
      }
      speaker = n;
      // face the hero on screen: which side of the NPC the hero is, along the camera's right vector
      const sx = (player.pos.x - n.x) * U.right.value.x + (player.pos.z - n.z) * U.right.value.z;
      if (Math.abs(sx) > 0.15) n.face = sx > 0 ? 1 : -1;
    }
    // idle life: a slow bob (ghosts float), facing the hero when talking
    const bob = d.ghost ? 0.35 + Math.sin(G.time * 1.6 + n.phase) * 0.12 : 0;
    n.mesh.position.set(n.x, n.y + bob, n.z);
    n.mesh.rotation.y = Math.atan2(camera.position.x - n.x, camera.position.z - n.z);
    n.mesh.rotation.x = -rig.pitchEff * 0.45;
    const breathe = Math.sin(G.time * 2 + n.phase) * 0.02;
    n.mesh.scale.set(n.face, 1 + breathe, 1);
    n.u.uLight.value = lightTint() * 1.05;
    if (d.ghost && Math.random() < dt * 6) glow.emit(n.x + rr(-0.3, 0.3), n.y + bob + rr(0.1, 0.6), n.z + rr(-0.3, 0.3), 0, rr(0.3, 0.8), 0, rr(0.6, 1.2), 0.08, 0.02, toColor(d.tint, C.zapCore), 0.5, -0.2, 1, 0);
  }
  bubbleNpc = speaker;
}
// the speech bubble is HTML over the canvas: typed out, follows the NPC's head
function updateNpcHud(dt) {
  if (!npcBubble) return;
  const n = bubbleNpc;
  if (!n || !n.text) { if (!npcBubble.hidden) npcBubble.hidden = true; bubbleText = ''; return; }
  if (n.text !== bubbleText) { bubbleText = n.text; bubbleShown = 0; npcBubble.querySelector('b').textContent = n.def.name; }
  bubbleShown = Math.min(bubbleText.length, bubbleShown + dt * 42);
  npcBubble.querySelector('span').textContent = bubbleText.slice(0, Math.ceil(bubbleShown));
  const s = project(tmpA.set(n.x, n.mesh.position.y + 1.85, n.z));
  if (!s) { npcBubble.hidden = true; return; }
  npcBubble.hidden = false;
  npcBubble.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -100%)`;
}
