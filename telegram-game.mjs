// Telegram transport for the existing deterministic World Consequence Engine.
// No paid language-model or image-generation calls are made at runtime.
import './supabase/functions/_shared/world-consequence-engine.js';

const engine = globalThis.WorldConsequenceEngine;
const WEBHOOK_URL = 'https://world-server.mmmpaykin.workers.dev/api/telegram/webhook';
const INTRO_IMAGE = 'https://world-server.mmmpaykin.workers.dev/apps/ai3d-reference-test/assets/renders/front_textured.png';
const MAX_TURNS = 8;
const NAMES = {
  geothermal: 'Геотермальная станция', tourism: 'Туристический комплекс',
  volcanic_farm: 'Вулканические фермы', solar: 'Солнечная станция',
  temple: 'Культурный центр', workshop: 'Мастерские',
  desalination: 'Опреснение', coal: 'Угольная станция',
  festival: 'Городской фестиваль', water_recycling: 'Очистка воды',
  deep_wells: 'Глубокие скважины', greenhouse: 'Теплицы',
  intensive_farm: 'Интенсивные фермы', export_market: 'Экспортный рынок',
  luxury_arcology: 'Новый жилой район', automated_mine: 'Автоматическая шахта',
  water_park: 'Аквапарк', bottling_plant: 'Завод воды',
  biofuel_refinery: 'Биотопливный завод', livestock_export: 'Животноводство'
};
const FALLBACK = Object.keys(engine.PROJECTS);

export async function webhookSecret(token) {
  const digest = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('world-server-telegram-webhook-v1:' + token));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function telegram(token, method, payload, fetcher = fetch) {
  const response = await fetcher('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error('Telegram ' + method + ' failed');
  return result.result;
}

// Pick four affordable alternatives using canonical simulator previews.
// The full Genie category validator runs in the main game; it is deliberately
// not replayed on every Telegram callback (Workers free-tier CPU budget).
export function choices(world) {
  const r = world.resources;
  const target = ['power', 'water', 'food'].sort((a, b) => r[a] - r[b])[0];
  const targeted = {
    power: ['coal', 'solar', 'geothermal', 'workshop'],
    water: ['deep_wells', 'desalination', 'water_recycling', 'workshop'],
    food: ['intensive_farm', 'greenhouse', 'volcanic_farm', 'export_market']
  }[target];
  const proposals = [...new Set([...targeted, ...FALLBACK])];
  const offered = [];
  for (const type of proposals) {
    const plan = engine.preview(world, engine.interpretIntent('', type));
    if (plan.feasible) offered.push({ type, label: NAMES[type] || type, plan });
    if (offered.length === 4) break;
  }
  return offered;
}

export function replay(chatId, path = '') {
  if (!/^[0-3]{0,8}$/.test(path)) throw new Error('Invalid game path');
  let world = engine.createWorld('telegram:' + String(chatId));
  let latest = null;
  for (const step of path) {
    const selected = choices(world)[Number(step)];
    if (!selected) throw new Error('Unavailable project');
    const before = world.resources;
    const intent = engine.interpretIntent('', selected.type);
    world = engine.commit(world, intent, world.revision);
    world = engine.simulateTicks(world, Math.min(selected.plan.buildTicks + 1, 8));
    latest = { label: selected.label, before };
  }
  return { world, latest };
}

function resourceSummary(world) {
  const r = world.resources;
  return '⚡ ' + r.power + '   💧 ' + r.water + '   🌾 ' + r.food
    + '\n💰 ' + r.budget + '   🌳 ' + r.ecology + '   ❤️ ' + r.health;
}

function gameView(chatId, path) {
  const { world, latest } = replay(chatId, path);
  const next = path.length < MAX_TURNS ? choices(world) : [];
  const intro = latest
    ? '✅ ' + latest.label + '. Прошло несколько игровых дней.\n'
    : '🌍 ЦЕПНАЯ РЕАКЦИЯ · ЗЛОЙ ДЖИНН\nГород зависит от твоих решений.\n';
  const text = intro + '\nДень ' + world.tick + ' · Жителей: ' + world.population
    + '\n' + resourceSummary(world)
    + (world.crisis ? '\n🚨 Кризис: город продолжает бороться.' : '')
    + (next.length ? '\n\nВыбери следующий проект:' : '\n\nРаунд завершён. Начни заново.');
  const buttons = next.map((choice, index) => [{
    text: choice.label + ' · 💰' + choice.plan.cost + ' · ⏳' + choice.plan.buildTicks,
    callback_data: 'tg1:' + path + String(index)
  }]);
  buttons.push([{ text: '🔄 Начать заново', callback_data: 'tg1:reset' }]);
  return { text, reply_markup: { inline_keyboard: buttons } };
}

async function respondMessage(chat, token, fetcher) {
  if (chat.type !== 'private') return;
  const view = gameView(chat.id, '');
  try {
    await telegram(token, 'sendPhoto', {
      chat_id: chat.id, photo: INTRO_IMAGE, caption: view.text,
      reply_markup: view.reply_markup
    }, fetcher);
  } catch {
    // The existing static image may be temporarily unavailable after deployment.
    await telegram(token, 'sendMessage', { chat_id: chat.id, ...view }, fetcher);
  }
}

async function respondCallback(callback, token, fetcher) {
  const chat = callback.message?.chat;
  const data = callback.data || '';
  if (!chat || chat.type !== 'private') {
    await telegram(token, 'answerCallbackQuery', {
      callback_query_id: callback.id, text: 'Открой бота в личных сообщениях.'
    }, fetcher);
    return;
  }
  const path = data === 'tg1:reset' ? '' : data.startsWith('tg1:') ? data.slice(4) : null;
  if (path === null || !/^[0-3]{0,8}$/.test(path)) {
    await telegram(token, 'answerCallbackQuery', {
      callback_query_id: callback.id, text: 'Эта кнопка устарела. Отправь /start.'
    }, fetcher);
    return;
  }
  let view;
  try { view = gameView(chat.id, path); }
  catch {
    await telegram(token, 'answerCallbackQuery', {
      callback_query_id: callback.id, text: 'Мир изменился. Отправь /start.'
    }, fetcher);
    return;
  }
  await telegram(token, 'answerCallbackQuery', { callback_query_id: callback.id }, fetcher);
  await telegram(token, 'sendMessage', { chat_id: chat.id, ...view }, fetcher);
}

export async function handleTelegramWebhook(request, env, fetcher = fetch) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return new Response('Not configured', { status: 503 });
  const expected = await webhookSecret(token);
  if (request.headers.get('x-telegram-bot-api-secret-token') !== expected) {
    return new Response('Forbidden', { status: 403 });
  }
  if (Number(request.headers.get('content-length') || 0) > 16384) {
    return new Response('Too large', { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > 16384) return new Response('Too large', { status: 413 });
  let update;
  try { update = JSON.parse(raw); }
  catch { return new Response('Invalid JSON', { status: 400 }); }
  if (update.message?.text && /^\/(start|help)(?:@\w+)?(?:\s|$)/i.test(update.message.text)) {
    await respondMessage(update.message.chat, token, fetcher);
  } else if (update.callback_query) {
    await respondCallback(update.callback_query, token, fetcher);
  } else if (update.message?.chat?.type === 'private') {
    await telegram(token, 'sendMessage', {
      chat_id: update.message.chat.id, text: 'Начни игру командой /start.'
    }, fetcher);
  }
  return new Response('OK', { status: 200, headers: { 'cache-control': 'no-store' } });
}

export async function registerTelegramWebhook(env, fetcher = fetch) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return false;
  await telegram(token, 'setWebhook', {
    url: WEBHOOK_URL, secret_token: await webhookSecret(token),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false
  }, fetcher);
  return true;
}
