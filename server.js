
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const WORLD_FILE = path.join(DATA_DIR, 'survival_world.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const file of [USERS_FILE, SESSIONS_FILE]) if (!fs.existsSync(file)) fs.writeFileSync(file, '{}', 'utf8');
if (!fs.existsSync(WORLD_FILE)) fs.writeFileSync(WORLD_FILE, JSON.stringify({ buildings: [], depleted: {} }, null, 2), 'utf8');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
let users = readJson(USERS_FILE, {});
let sessions = readJson(SESSIONS_FILE, {});
let worldSave = readJson(WORLD_FILE, { buildings: [], depleted: {} });

function safeName(name) { return String(name || '').trim().replace(/[^a-zA-Z0-9_а-яА-ЯёЁ-]/g, '').slice(0, 20); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(':')[1];
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex')); } catch { return false; }
}
function userFromToken(token) {
  if (!token || !sessions[token]) return null;
  const username = sessions[token];
  const user = users[username];
  return user ? { id: user.id, username } : null;
}
function publicUser(user) { return user ? { id: user.id, username: user.username } : null; }
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function notFound(res) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.wasm':'application/wasm'
};
function sendFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
function safeJoin(base, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const full = path.normalize(path.join(base, clean));
  if (!full.startsWith(base)) return null;
  return full;
}

function titleFromIndex(appDir, fallback) {
  try {
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : fallback;
  } catch { return fallback; }
}
function prettyAppName(id) {
  return String(id || 'app')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/apps') {
    const appsDir = path.join(ROOT, 'apps');
    const items = fs.readdirSync(appsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => fs.existsSync(path.join(appsDir, d.name, 'index.html')))
      .map(d => {
        const dir = path.join(appsDir, d.name);
        const fallbackTitle = prettyAppName(d.name);
        const title = titleFromIndex(dir, fallbackTitle);
        const hasIcon = fs.existsSync(path.join(dir, 'ico.png'));
        const hasClient = fs.existsSync(path.join(dir, 'client.js'));
        return {
          id: d.name,
          title,
          description: hasClient ? 'Автоматически найдено в папке apps/' + d.name : 'HTML-приложение из папки apps/' + d.name,
          url: `/apps/${d.name}/`,
          icon: hasIcon ? `/apps/${d.name}/ico.png` : '',
          hasClient
        };
      })
      .sort((a, b) => (a.id === 'catalog' ? -1 : b.id === 'catalog' ? 1 : a.title.localeCompare(b.title, 'ru')));
    return json(res, 200, { apps: items });
  }
  if (req.method === 'POST' && url.pathname === '/api/register') {
    const body = await readBody(req).catch(() => ({}));
    const username = safeName(body.username); const password = String(body.password || '');
    if (username.length < 3) return json(res, 400, { error: 'Ник должен быть минимум 3 символа.' });
    if (password.length < 4) return json(res, 400, { error: 'Пароль должен быть минимум 4 символа.' });
    if (users[username]) return json(res, 409, { error: 'Такой аккаунт уже есть.' });
    users[username] = { id: crypto.randomUUID(), username, passwordHash: hashPassword(password), createdAt: Date.now() };
    writeJson(USERS_FILE, users);
    const token = makeToken(); sessions[token] = username; writeJson(SESSIONS_FILE, sessions);
    return json(res, 200, { token, user: publicUser(users[username]) });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readBody(req).catch(() => ({}));
    const username = safeName(body.username); const password = String(body.password || '');
    const user = users[username];
    if (!user || !verifyPassword(password, user.passwordHash)) return json(res, 401, { error: 'Неверный логин или пароль.' });
    const token = makeToken(); sessions[token] = username; writeJson(SESSIONS_FILE, sessions);
    return json(res, 200, { token, user: publicUser(user) });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
    return json(res, 200, { user: userFromToken(token) });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token && sessions[token]) { delete sessions[token]; writeJson(SESSIONS_FILE, sessions); }
    return json(res, 200, { ok: true });
  }
  return notFound(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/') { res.writeHead(302, { Location: '/apps/catalog/' }); return res.end(); }
    if (url.pathname.startsWith('/shared/')) {
      const file = safeJoin(ROOT, url.pathname);
      return file ? sendFile(res, file) : notFound(res);
    }
    if (url.pathname.startsWith('/apps/')) {
      let file = safeJoin(ROOT, url.pathname);
      if (!file) return notFound(res);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      return sendFile(res, file);
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    return notFound(res);
  } catch (e) {
    json(res, 500, { error: e.message || 'server error' });
  }
});

// ---------- sharabass room ----------
const sharabassPlayers = new Map();
const sharabassObjects = [];
const MAX_SHARABASS_OBJECTS = 50;
let sharabassWeather = { rain: 0, lightning: 0, clouds: 0.2, wind: 0.1, snow: 0, smoke: 0.4 };
let lastWeatherChange = 0;

// ---------- survival world ----------
const CHUNK_SIZE = 64;
const RESOURCE_HIT_DISTANCE = 9;
const BUILD_DISTANCE = 14;
const BUILD_GRID = 4;
const MAX_SPEED_PER_SEC = 18;
const survivalPlayers = new Map();
const generatedChunks = new Map();
const depleted = new Map(Object.entries(worldSave.depleted || {}));
let buildings = Array.isArray(worldSave.buildings) ? worldSave.buildings : [];
let lastWorldSave = 0;
const STACK_MAX = { wood: 999, stone: 999, metal_ore: 999, cloth: 999, food: 64, stone_hatchet: 1, pickaxe: 1, campfire: 16, storage_box: 16, door: 16 };
const RECIPES = { stone_hatchet: { wood: 10, stone: 5 }, pickaxe: { wood: 15, stone: 10 }, campfire: { wood: 20, stone: 5 }, storage_box: { wood: 40 }, door: { wood: 25 } };
const BUILD_COSTS = { foundation: { wood: 50 }, wall: { wood: 30 }, doorway: { wood: 35 }, door: { wood: 25 }, stairs: { wood: 45 }, campfire: { wood: 20, stone: 5 }, storage_box: { wood: 40 } };
function defaultInventory() { const inv = Array.from({ length: 36 }, () => null); inv[0] = { item: 'wood', count: 999 }; inv[1] = { item: 'stone', count: 500 }; inv[2] = { item: 'metal_ore', count: 120 }; inv[3] = { item: 'food', count: 16 }; inv[27] = { item: 'stone_hatchet', count: 1 }; inv[28] = { item: 'pickaxe', count: 1 }; inv[29] = { item: 'wood', count: 250 }; return inv; }
function invCount(inv, item) { return inv.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0); }
function hasItems(inv, cost) { return Object.entries(cost).every(([item, count]) => invCount(inv, item) >= count); }
function addItem(inv, item, count) { let left = count; const max = STACK_MAX[item] || 999; for (const slot of inv) { if (slot && slot.item === item && slot.count < max) { const add = Math.min(max - slot.count, left); slot.count += add; left -= add; if (left <= 0) return 0; } } for (let i = 0; i < inv.length; i++) { if (!inv[i]) { const add = Math.min(max, left); inv[i] = { item, count: add }; left -= add; if (left <= 0) return 0; } } return left; }
function removeItems(inv, cost) { if (!hasItems(inv, cost)) return false; for (const [item, need] of Object.entries(cost)) { let left = need; for (let i = 0; i < inv.length && left > 0; i++) { const slot = inv[i]; if (slot?.item === item) { const take = Math.min(slot.count, left); slot.count -= take; left -= take; if (slot.count <= 0) inv[i] = null; } } } return true; }
function seeded(seed) { let h = 2166136261 >>> 0; for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function chunkKey(cx, cz) { return `${cx},${cz}`; }
function genChunk(cx, cz) { const key = chunkKey(cx, cz); if (generatedChunks.has(key)) return generatedChunks.get(key); const rand = seeded(`survival:${cx}:${cz}`); const resources = []; const types = ['tree', 'stone', 'metal_ore', 'bush']; for (let i = 0; i < 13; i++) { const type = types[Math.floor(rand() * types.length)]; const x = cx * CHUNK_SIZE + rand() * CHUNK_SIZE - CHUNK_SIZE / 2; const z = cz * CHUNK_SIZE + rand() * CHUNK_SIZE - CHUNK_SIZE / 2; const id = `r:${cx}:${cz}:${i}`; const base = type === 'tree' ? 70 : type === 'metal_ore' ? 90 : type === 'stone' ? 80 : 40; const remaining = depleted.has(id) ? depleted.get(id) : base; resources.push({ id, type, position: { x, y: 0, z }, amount: base, remaining }); } const chunk = { cx, cz, resources }; generatedChunks.set(key, chunk); return chunk; }
function getResource(id) { const parts = id.split(':'); if (parts.length !== 4) return null; const cx = Number(parts[1]), cz = Number(parts[2]); const chunk = genChunk(cx, cz); return chunk.resources.find(r => r.id === id) || null; }
function dist2(a, b) { const dx = a.x - b.x; const dz = a.z - b.z; return dx * dx + dz * dz; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function snap(n, grid = BUILD_GRID) { return Math.round(n / grid) * grid; }
function sameSpot(a, b, eps = 0.12) { return Math.abs(a.position.x - b.x) < eps && Math.abs(a.position.z - b.z) < eps && Math.abs((a.rotationY || 0) - (b.rotY || 0)) < 0.02; }
function foundationEdges(f) {
  const x = f.position.x, z = f.position.z;
  return [
    { x, z: z - 2, y: 0, rotY: 0, supportId: f.id, slot: `edge:${f.id}:n` },
    { x, z: z + 2, y: 0, rotY: 0, supportId: f.id, slot: `edge:${f.id}:s` },
    { x: x - 2, z, y: 0, rotY: Math.PI / 2, supportId: f.id, slot: `edge:${f.id}:w` },
    { x: x + 2, z, y: 0, rotY: Math.PI / 2, supportId: f.id, slot: `edge:${f.id}:e` }
  ];
}
function nearestFoundationEdge(pos) {
  let best = null, bd = Infinity;
  for (const f of buildings) {
    if (f.piece !== 'foundation') continue;
    for (const e of foundationEdges(f)) {
      const d = (e.x - pos.x) * (e.x - pos.x) + (e.z - pos.z) * (e.z - pos.z);
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best && bd <= 3.2 * 3.2 ? best : null;
}
function nearestFoundationCenter(pos) {
  let best = null, bd = Infinity;
  for (const f of buildings) {
    if (f.piece !== 'foundation') continue;
    const d = (f.position.x - pos.x) * (f.position.x - pos.x) + (f.position.z - pos.z) * (f.position.z - pos.z);
    if (d < bd) { bd = d; best = f; }
  }
  return best && bd <= 3.2 * 3.2 ? best : null;
}
function nearestDoorway(pos) {
  let best = null, bd = Infinity;
  for (const b of buildings) {
    if (b.piece !== 'doorway') continue;
    const d = (b.position.x - pos.x) * (b.position.x - pos.x) + (b.position.z - pos.z) * (b.position.z - pos.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best && bd <= 1.6 * 1.6 ? best : null;
}
function snapBuilding(piece, pos, rotY = 0) {
  if (piece === 'foundation') return { x: snap(pos.x), y: 0, z: snap(pos.z), rotY: 0, slot: `foundation:${snap(pos.x)}:${snap(pos.z)}` };
  if (piece === 'wall' || piece === 'doorway') {
    const edge = nearestFoundationEdge(pos);
    if (edge) return { ...edge };
    const gx = Math.round(pos.x / BUILD_GRID) * BUILD_GRID;
    const gz = Math.round(pos.z / BUILD_GRID) * BUILD_GRID;
    const lx = pos.x - gx, lz = pos.z - gz;
    return Math.abs(lx) > Math.abs(lz) ? { x: gx + Math.sign(lx || 1) * 2, y: 0, z: gz, rotY: Math.PI / 2, slot: `freewall:${gx}:${gz}:x` } : { x: gx, y: 0, z: gz + Math.sign(lz || 1) * 2, rotY: 0, slot: `freewall:${gx}:${gz}:z` };
  }
  if (piece === 'door') {
    const d = nearestDoorway(pos);
    if (d) return { x: d.position.x, y: 0, z: d.position.z, rotY: d.rotationY || 0, supportId: d.id, slot: `door:${d.id}` };
    return { x: snap(pos.x), y: 0, z: snap(pos.z), rotY: Number(rotY) || 0, slot: `doorfree:${snap(pos.x)}:${snap(pos.z)}` };
  }
  if (piece === 'stairs') {
    const f = nearestFoundationCenter(pos);
    if (f) return { x: f.position.x, y: 0, z: f.position.z, rotY: Number(rotY) || 0, supportId: f.id, slot: `stairs:${f.id}` };
    return { x: snap(pos.x), y: 0, z: snap(pos.z), rotY: Number(rotY) || 0, slot: `stairsfree:${snap(pos.x)}:${snap(pos.z)}` };
  }
  return { x: snap(pos.x), y: 0, z: snap(pos.z), rotY: Number(rotY) || 0, slot: `${piece}:${snap(pos.x)}:${snap(pos.z)}` };
}
function buildingRadius(piece) { return piece === 'foundation' ? 2.05 : piece === 'campfire' ? 1.2 : piece === 'storage_box' ? 1.1 : 0.7; }
function canPlaceBuilding(piece, pos, player) {
  if (!BUILD_COSTS[piece]) return { ok: false, error: 'Нет такого строительного элемента.' };
  if (dist2(player.position, pos) > BUILD_DISTANCE * BUILD_DISTANCE) return { ok: false, error: 'Слишком далеко для строительства.' };
  if ((piece === 'wall' || piece === 'doorway') && !pos.supportId) return { ok: false, error: 'Сначала поставь фундамент, потом крепи стену к краю.' };
  if (piece === 'door' && !pos.supportId) return { ok: false, error: 'Дверь ставится в doorway-проём.' };
  if (piece === 'foundation') {
    for (const b of buildings) if (b.piece === 'foundation' && Math.hypot(b.position.x - pos.x, b.position.z - pos.z) < 0.5) return { ok: false, error: 'Фундамент уже стоит.' };
  }
  if (piece === 'wall' || piece === 'doorway') {
    for (const b of buildings) if ((b.piece === 'wall' || b.piece === 'doorway') && sameSpot(b, pos)) return { ok: false, error: 'На этом краю уже есть стена/проём.' };
  }
  if (piece === 'door') {
    for (const b of buildings) if (b.piece === 'door' && sameSpot(b, pos)) return { ok: false, error: 'Дверь уже стоит.' };
  }
  if (piece === 'campfire' || piece === 'storage_box') {
    const r = buildingRadius(piece);
    for (const b of buildings) {
      const min = r + buildingRadius(b.piece) - 0.2;
      if (Math.hypot(b.position.x - pos.x, b.position.z - pos.z) < min && (b.piece === 'campfire' || b.piece === 'storage_box')) return { ok: false, error: 'Место занято.' };
    }
  }
  return { ok: true };
}
function saveWorldSoon() { const now = Date.now(); if (now - lastWorldSave < 1500) return; lastWorldSave = now; writeJson(WORLD_FILE, { buildings, depleted: Object.fromEntries(depleted.entries()) }); }
function nearbyPlayersPayload() { return [...survivalPlayers.values()].map(p => ({ id: p.id, name: p.name, position: p.position, rotationY: p.rotationY, running: p.running, action: p.action, health: p.health, hunger: p.hunger, thirst: p.thirst })); }

// ---------- tiny websocket server, no npm packages ----------
const clients = new Map();
const chatHistory = [];
function wsSend(client, event, data) {
  if (!client || client.closed) return;
  const payload = Buffer.from(JSON.stringify({ event, data }), 'utf8');
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  try { client.socket.write(Buffer.concat([header, payload])); } catch { client.closed = true; }
}
function broadcast(event, data, filter = () => true) { for (const c of clients.values()) if (!c.closed && filter(c)) wsSend(c, event, data); }
function closeClient(client) {
  if (!client || client.closed) return;
  client.closed = true;
  clients.delete(client.id);
  survivalPlayers.delete(client.id);
  if (client.inSharabass) {
    sharabassPlayers.delete(client.id);
    const removed = [];
    for (let i = sharabassObjects.length - 1; i >= 0; i--) { if (sharabassObjects[i].owner === client.id) { removed.push(sharabassObjects[i].id); sharabassObjects.splice(i, 1); } }
    for (const id of removed) broadcast('sharabass:object:removed', { id }, c => c.inSharabass);
    broadcast('sharabass:players', [...sharabassPlayers.values()].map(p => ({ id: p.id, name: p.name, cameraPos: p.cameraPos, cameraTarget: p.cameraTarget })), c => c.inSharabass);
  }
  broadcast('survival:players:update', nearbyPlayersPayload(), c => c.inSurvival);
  try { client.socket.destroy(); } catch {}
}
function onEvent(client, event, data) {
  if (event === 'app:join') { client.app = safeName(data) || 'unknown'; return; }
  if (event === 'chat:send') {
    const text = String(data?.text || '').trim().slice(0, 220);
    if (!text) return;
    const msg = { id: crypto.randomUUID(), ts: Date.now(), app: safeName(data?.app || client.app || 'global'), name: client.name, account: Boolean(client.user), text };
    chatHistory.push(msg); while (chatHistory.length > 100) chatHistory.shift();
    broadcast('chat:message', msg);
    return;
  }
  if (event === 'sharabass:join') {
    const p = { id: client.id, name: client.user?.username || `Guest_${client.id.slice(0, 4)}`, cameraPos: { x: 0, y: 3, z: 8 }, cameraTarget: { x: 0, y: 0, z: 0 }, lastUpdate: Date.now() };
    sharabassPlayers.set(client.id, p);
    client.inSharabass = true;
    wsSend(client, 'sharabass:init', { selfId: client.id, objects: sharabassObjects, weather: sharabassWeather, players: [...sharabassPlayers.values()].map(p2 => ({ id: p2.id, name: p2.name, cameraPos: p2.cameraPos, cameraTarget: p2.cameraTarget })) });
    broadcast('sharabass:players', [...sharabassPlayers.values()].map(p2 => ({ id: p2.id, name: p2.name, cameraPos: p2.cameraPos, cameraTarget: p2.cameraTarget })), c => c.inSharabass);
    return;
  }
  if (event === 'sharabass:weather') {
    if (data && typeof data.rain === 'number') { sharabassWeather = data; lastWeatherChange = Date.now(); broadcast('sharabass:weather', sharabassWeather, c => c.inSharabass); }
    return;
  }
  if (event === 'sharabass:fly') {
    const p = sharabassPlayers.get(client.id); if (!p) return;
    const d = data || {};
    p.cameraPos = { x: Number(d.cameraPos?.x) || p.cameraPos.x || 0, y: Number(d.cameraPos?.y) || p.cameraPos.y || 0, z: Number(d.cameraPos?.z) || p.cameraPos.z || 0 };
    p.cameraTarget = { x: Number(d.cameraTarget?.x) || p.cameraTarget.x || 0, y: Number(d.cameraTarget?.y) || p.cameraTarget.y || 0, z: Number(d.cameraTarget?.z) || p.cameraTarget.z || 0 };
    p.lastUpdate = Date.now();
    return;
  }
  if (event === 'sharabass:place') {
    const p = sharabassPlayers.get(client.id); if (!p) return;
    if (sharabassObjects.length >= MAX_SHARABASS_OBJECTS) return wsSend(client, 'error:message', 'Мир переполнен объектами, удали что-нибудь.');
    const d = data || {};
    const obj = { id: crypto.randomUUID(), type: Number(d.type) || 0, position: { x: Number(d.position?.x) || 0, y: Number(d.position?.y) || 0, z: Number(d.position?.z) || 0 }, size: Math.max(0.2, Number(d.size) || 1), owner: client.id, ownerName: p.name };
    sharabassObjects.push(obj);
    broadcast('sharabass:object:placed', obj, c => c.inSharabass);
    return;
  }
  if (event === 'sharabass:remove') {
    const id = String(data?.id || '');
    const idx = sharabassObjects.findIndex(o => o.id === id && o.owner === client.id);
    if (idx === -1) return wsSend(client, 'error:message', 'Не найден объект для удаления.');
    sharabassObjects.splice(idx, 1);
    broadcast('sharabass:object:removed', { id }, c => c.inSharabass);
    return;
  }
  if (event === 'survival:join') {
    const player = { id: client.id, accountId: client.user?.id || null, name: client.user?.username || `Guest_${client.id.slice(0, 4)}`, position: { x: Math.random() * 12 - 6, y: 0, z: Math.random() * 12 - 6 }, rotationY: 0, running: false, action: 'idle', health: 100, hunger: 100, thirst: 100, inventory: defaultInventory(), selectedHotbarSlot: 0, lastInputTime: Date.now(), lastHit: 0, lastBuild: 0 };
    survivalPlayers.set(client.id, player);
    client.inSurvival = true;
    wsSend(client, 'survival:init', { selfId: client.id, player, buildings });
    wsSend(client, 'inventory:update', player.inventory);
    broadcast('survival:players:update', nearbyPlayersPayload(), c => c.inSurvival);
    return;
  }
  if (event === 'survival:state') {
    const p = survivalPlayers.get(client.id); if (!p) return;
    const now = Date.now(); const dt = clamp((now - p.lastInputTime) / 1000, 0.016, 0.35);
    const next = data?.position || p.position; const maxStep = MAX_SPEED_PER_SEC * dt;
    const dx = clamp(Number(next.x) - p.position.x, -maxStep, maxStep); const dz = clamp(Number(next.z) - p.position.z, -maxStep, maxStep);
    p.position.x += dx; p.position.z += dz; p.position.y = 0;
    p.rotationY = Number.isFinite(data?.rotationY) ? Number(data.rotationY) : p.rotationY;
    p.running = Boolean(data?.running); p.action = String(data?.action || 'idle').slice(0, 16); p.lastInputTime = now;
    return;
  }
  if (event === 'chunk:request') {
    const chunks = Array.isArray(data?.chunks) ? data.chunks.slice(0, 32) : [];
    wsSend(client, 'chunk:data', chunks.map(c => genChunk(Math.trunc(Number(c.x)), Math.trunc(Number(c.z)))));
    return;
  }
  if (event === 'resource:hit') {
    const p = survivalPlayers.get(client.id); if (!p) return;
    const now = Date.now(); if (now - p.lastHit < 550) return wsSend(client, 'error:message', 'Подожди cooldown добычи.');
    const r = getResource(String(data?.id || ''));
    if (!r || r.remaining <= 0) return wsSend(client, 'error:message', 'Ресурс уже добыт.');
    if (dist2(p.position, r.position) > RESOURCE_HIT_DISTANCE * RESOURCE_HIT_DISTANCE) return wsSend(client, 'error:message', 'Слишком далеко до ресурса.');
    p.lastHit = now;
    const damage = data?.tool === 'pickaxe' || data?.tool === 'stone_hatchet' ? 34 : 20;
    r.remaining = Math.max(0, r.remaining - damage); depleted.set(r.id, r.remaining);
    const item = r.type === 'tree' ? 'wood' : r.type === 'bush' ? (Math.random() > 0.5 ? 'cloth' : 'food') : r.type === 'metal_ore' ? 'metal_ore' : 'stone';
    const qty = r.type === 'tree' ? 25 : r.type === 'metal_ore' ? 18 : r.type === 'bush' ? 5 : 20;
    addItem(p.inventory, item, qty); wsSend(client, 'inventory:update', p.inventory); broadcast('resource:update', { id: r.id, remaining: r.remaining }, c => c.inSurvival); saveWorldSoon();
    return;
  }
  if (event === 'craft:item') {
    const p = survivalPlayers.get(client.id); if (!p) return;
    const item = String(data?.item || ''); const recipe = RECIPES[item];
    if (!recipe) return wsSend(client, 'error:message', 'Нет такого рецепта.');
    if (!removeItems(p.inventory, recipe)) return wsSend(client, 'error:message', 'Не хватает ресурсов.');
    addItem(p.inventory, item, 1); wsSend(client, 'inventory:update', p.inventory); return;
  }
  if (event === 'inventory:move') {
    const p = survivalPlayers.get(client.id); if (!p) return;
    const a = Math.trunc(Number(data?.from)); const b = Math.trunc(Number(data?.to));
    if (a < 0 || b < 0 || a >= p.inventory.length || b >= p.inventory.length) return;
    [p.inventory[a], p.inventory[b]] = [p.inventory[b], p.inventory[a]]; wsSend(client, 'inventory:update', p.inventory); return;
  }
  if (event === 'build:place') {
    const p = survivalPlayers.get(client.id); if (!p) return;
    const now = Date.now(); if (now - p.lastBuild < 350) return wsSend(client, 'error:message', 'Подожди cooldown строительства.');
    const piece = String(data?.piece || 'foundation'); const rawPos = { x: Number(data?.position?.x || 0), y: 0, z: Number(data?.position?.z || 0) };
    const snapped = snapBuilding(piece, rawPos, Number(data?.rotationY || 0)); const place = canPlaceBuilding(piece, snapped, p);
    if (!place.ok) return wsSend(client, 'error:message', place.error);
    const cost = BUILD_COSTS[piece]; if (!removeItems(p.inventory, cost)) return wsSend(client, 'error:message', 'Не хватает ресурсов для стройки.');
    const building = { id: crypto.randomUUID(), piece, owner: p.accountId || p.id, ownerName: p.name, position: { x: snapped.x, y: snapped.y, z: snapped.z }, rotationY: snapped.rotY, supportId: snapped.supportId || null, slot: snapped.slot || '', hp: 1000, createdAt: Date.now() };
    buildings.push(building); p.lastBuild = now; wsSend(client, 'inventory:update', p.inventory); broadcast('building:placed', building, c => c.inSurvival); saveWorldSoon();
  }
}
function parseFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const b0 = client.buffer[0], b1 = client.buffer[1];
    const opcode = b0 & 0x0f; const masked = Boolean(b1 & 0x80); let len = b1 & 0x7f; let off = 2;
    if (len === 126) { if (client.buffer.length < 4) return; len = client.buffer.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (client.buffer.length < 10) return; const big = client.buffer.readBigUInt64BE(2); if (big > BigInt(1024*1024)) return closeClient(client); len = Number(big); off = 10; }
    const maskLen = masked ? 4 : 0; if (client.buffer.length < off + maskLen + len) return;
    const mask = masked ? client.buffer.subarray(off, off + 4) : null; off += maskLen;
    let payload = client.buffer.subarray(off, off + len); client.buffer = client.buffer.subarray(off + len);
    if (opcode === 0x8) return closeClient(client);
    if (opcode === 0x9) continue; // ping ignored for MVP
    if (opcode !== 0x1) continue;
    if (masked) { const unmasked = Buffer.alloc(payload.length); for (let i = 0; i < payload.length; i++) unmasked[i] = payload[i] ^ mask[i % 4]; payload = unmasked; }
    try { const msg = JSON.parse(payload.toString('utf8')); if (msg && typeof msg.event === 'string') onEvent(client, msg.event, msg.data); } catch {}
  }
}
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const user = userFromToken(url.searchParams.get('token'));
  const id = crypto.randomBytes(8).toString('hex');
  const client = { id, socket, user, name: user?.username || `Guest_${id.slice(0, 4)}`, app: 'global', inSurvival: false, buffer: Buffer.alloc(0), closed: false };
  clients.set(id, client);
  socket.on('data', d => parseFrames(client, d));
  socket.on('error', () => closeClient(client));
  socket.on('close', () => closeClient(client));
  wsSend(client, 'auth:me', { user: client.user, name: client.name });
  wsSend(client, 'chat:history', chatHistory.slice(-60));
});
setInterval(() => broadcast('survival:players:update', nearbyPlayersPayload(), c => c.inSurvival), 100);
setInterval(() => broadcast('sharabass:players', [...sharabassPlayers.values()].map(p => ({ id: p.id, name: p.name, cameraPos: p.cameraPos, cameraTarget: p.cameraTarget })), c => c.inSharabass), 100);
// Weather auto-change for sharabass
setInterval(() => {
    const now = Date.now();
    if (now - lastWeatherChange > 8000) {
        lastWeatherChange = now;
        sharabassWeather = {
            rain: Math.random() * 0.6, lightning: 0, clouds: 0.1 + Math.random() * 0.7,
            wind: Math.random() * 0.6, snow: Math.random() < 0.2 ? Math.random() * 0.5 : 0,
            smoke: 0.3 + Math.random() * 0.5
        };
        if (sharabassWeather.rain > 0.3 && Math.random() < 0.4) sharabassWeather.lightning = 0.3 + Math.random() * 0.6;
        broadcast('sharabass:weather', sharabassWeather, c => c.inSharabass);
    }
}, 2000);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WebGL Survival Hub NO-NPM running: http://localhost:${PORT}`));
