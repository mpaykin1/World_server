import assert from 'node:assert/strict';
import test from 'node:test';
import {
  choices, replay, webhookSecret, handleTelegramWebhook, registerTelegramWebhook
} from '../telegram-game.mjs';

const TOKEN = '12345:ABCdef_12345678901234567890123';
function mockTelegram() {
  const calls = [];
  return {
    calls,
    fetcher: async (url, options) => {
      calls.push({ method: url.split('/').at(-1), payload: JSON.parse(options.body) });
      return new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
  };
}
async function update(body, secret, fetcher) {
  return handleTelegramWebhook(new Request('https://world-server.mmmpaykin.workers.dev/api/telegram/webhook', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(body)
  }), { TELEGRAM_BOT_TOKEN: TOKEN }, fetcher);
}

test('same player and choices deterministically reproduce the same canonical world', () => {
  const a = replay(42), b = replay(42);
  assert.deepEqual(a, b);
  assert.equal(choices(a.world).length, 4);
  const advanced = replay(42, '0');
  assert(advanced.world.tick > 0);
  assert.deepEqual(advanced, replay(42, '0'));
});

test('secret prevents unauthorized Telegram webhook calls', async () => {
  const mock = mockTelegram();
  const unauthorized = await update({ message: { chat: { id: 42, type: 'private' }, text: '/start' } },
    'incorrect', mock.fetcher);
  assert.equal(unauthorized.status, 403);
  assert.equal(mock.calls.length, 0);
});

test('/start sends an image and buttons without any AI API calls', async () => {
  const mock = mockTelegram();
  const response = await update({
    update_id: 10, message: { chat: { id: 42, type: 'private' }, text: '/start' }
  }, await webhookSecret(TOKEN), mock.fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(mock.calls.map(call => call.method), ['sendPhoto']);
  assert.equal(mock.calls[0].payload.reply_markup.inline_keyboard.length, 5);
});

test('clicking a deterministic Genie option advances the game', async () => {
  const mock = mockTelegram();
  const response = await update({
    callback_query: { id: 'test-1', data: 'tg1:0', message: { chat: { id: 42, type: 'private' } } }
  }, await webhookSecret(TOKEN), mock.fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(mock.calls.map(call => call.method), ['answerCallbackQuery', 'sendMessage']);
  assert.match(mock.calls[1].payload.text, /День [1-9]/);
});

test('image error falls back to text with buttons', async () => {
  const mock = mockTelegram();
  const fetcher = async (url, options) => {
    if (url.endsWith('sendPhoto')) {
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }
    return mock.fetcher(url, options);
  };
  const response = await update({
    message: { chat: { id: 42, type: 'private' }, text: '/start' }
  }, await webhookSecret(TOKEN), fetcher);
  assert.equal(response.status, 200);
  assert.equal(mock.calls[0].method, 'sendMessage');
});

test('cron registers webhook using the stored production secret', async () => {
  const mock = mockTelegram();
  assert.equal(await registerTelegramWebhook({ TELEGRAM_BOT_TOKEN: TOKEN }, mock.fetcher), true);
  assert.equal(mock.calls[0].method, 'setWebhook');
  assert.equal(mock.calls[0].payload.secret_token, await webhookSecret(TOKEN));
  assert(!JSON.stringify(mock.calls).includes(TOKEN));
});
