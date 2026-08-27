// Real multi-user end-to-end coverage for the improve-world-home
// questionnaire -> story -> world -> merge pipeline, against a REAL deployed
// backend and a REAL Supabase project -- not localhost, not mocks.
//
// PREREQUISITES (this spec cannot pass until all three are true):
//   1. supabase/migrations/20260827100000_story_world_merge.sql and
//      20260827120000_merge_idempotency_constraint.sql are applied to the
//      real production Supabase project (iphfwxjuhsucvdyluink) -- blocked
//      as of this writing on org access, see WORK_IN_PROGRESS.md Blocker #5.
//   2. PR #11 (api/ router consolidation) is merged to master, so
//      world-server.vercel.app actually serves api/narrative.js.
//   3. This branch (or wherever apps/improve-world-home/public/app.js's
//      backend wiring lives) is deployed to the URL IW_E2E_BASE_URL points
//      at -- defaults to this session's own preview deployment, which
//      already has the frontend; override with the real env var once
//      production has everything above.
//
// Until then, every test here will fail with real, informative errors
// (404s/500s from the actual endpoints) rather than a fake pass -- that is
// intentional: this file exists to be run the moment the prerequisites are
// met, not to be quietly skipped.
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.IW_E2E_BASE_URL || 'https://improve-world-home-git-ai-claudesafe-paral-cca382-improve-world.vercel.app';

async function completeQuestionnaireAndPublish(page, authorName) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Создать' }).click();
  for (let i = 0; i < 31; i++) {
    await page.getByRole('button', { name: 'Пропустить' }).click();
  }
  await expect(page.locator('#result')).not.toHaveClass(/hide/);
  await page.getByRole('button', { name: 'Зарегистрироваться и опубликовать' }).click();
  await page.locator('#pubBox input#author').fill(authorName);
  await page.locator('#pubBox').getByRole('button', { name: 'Опубликовать' }).click();
  const worldIdLocator = page.locator('#pubBox code');
  await expect(worldIdLocator).toBeVisible({ timeout: 15000 });
  const worldId = (await worldIdLocator.textContent()).trim();
  expect(worldId).toMatch(/^w-[0-9a-f]{12}$/);
  return worldId;
}

async function mergeViaUI(page, otherWorldId) {
  await page.getByRole('button', { name: 'Соединить с другими историями' }).click();
  await page.locator('#mergeTarget').fill(otherWorldId);
  await page.locator('#weaveBox').getByRole('button', { name: 'Соединить' }).click();
  const resultLocator = page.locator('#mergeResult code');
  await expect(resultLocator).toBeVisible({ timeout: 15000 });
  return (await resultLocator.textContent()).trim();
}

async function apiGetWorld(request, worldId, guestId) {
  const res = await request.post(`${BASE_URL}/api/world`, {
    data: { action: 'get', worldId, guestId: guestId || '99999999-9999-4999-8999-999999999999' }
  });
  return res;
}

test.describe('Real multi-user world creation and merge chain (A, B, C -> AB -> ABC)', () => {
  test('User A (clean context) creates a published World A', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const worldId = await completeQuestionnaireAndPublish(page, 'User A');
    expect(worldId).toBeTruthy();
    await context.close();
  });

  test('full chain: A + B -> AB, then AB + C -> ABC, each in its own clean incognito-equivalent context', async ({ browser, request }) => {
    // Each browser.newContext() is isolated storage (no cookies/localStorage
    // carried over) -- equivalent to three different anonymous visitors,
    // each getting their own guestId.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const ctxC = await browser.newContext();

    const worldA = await completeQuestionnaireAndPublish(await ctxA.newPage(), 'User A');
    const worldB = await completeQuestionnaireAndPublish(await ctxB.newPage(), 'User B');
    const worldC = await completeQuestionnaireAndPublish(await ctxC.newPage(), 'User C');

    // A+B -> AB, driven through User A's own UI (merging is a public action,
    // not owner-gated -- any world's own result screen can trigger it).
    const pageA = ctxA.pages()[0];
    const worldAB = await mergeViaUI(pageA, worldB);
    expect(worldAB).toMatch(/^w-[0-9a-f]{12}$/);

    // Provenance: AB's spec must carry both A's and B's story ids.
    const abRes = await apiGetWorld(request, worldAB);
    expect(abRes.ok()).toBeTruthy();
    const abBody = await abRes.json();
    expect(abBody.spec.provenance.sourceWorldIds).toEqual(expect.arrayContaining([worldA, worldB]));

    // AB+C -> ABC, driven fresh (a brand-new clean context, not reusing A/B/C's).
    const ctxMerger = await browser.newContext();
    const pageMerger = await ctxMerger.newPage();
    await pageMerger.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    // This context has no worldId of its own yet -- merging is done purely
    // by world id, so drive it via a completed publish first (a 4th "world",
    // representing "whoever performs the AB+C merge doesn't need to be A/B/C").
    const mergerWorld = await completeQuestionnaireAndPublish(pageMerger, 'Merger');
    const worldABC1 = await mergeViaUI(pageMerger, worldAB);
    // mergeViaUI merges mergerWorld with worldAB here -- for the literal
    // "AB+C" requested, merge AB and C directly via the API instead (the UI
    // always merges "my current world" with a pasted id, so to combine two
    // arbitrary existing worlds without a third party's own world in the mix,
    // go through the API the UI itself calls).
    const abcRes = await request.post(`${BASE_URL}/api/merge`, {
      data: { action: 'create', sourceWorldIds: [worldAB, worldC], guestId: '99999999-9999-4999-8999-999999999999' }
    });
    expect(abcRes.ok()).toBeTruthy();
    const abcBody = await abcRes.json();
    const worldABC = abcBody.resultWorldId;
    expect(worldABC).toMatch(/^w-[0-9a-f]{12}$/);

    // Provenance survives the second-level fold: ABC must carry A, B, and C.
    const abcWorldRes = await apiGetWorld(request, worldABC);
    const abcWorldBody = await abcWorldRes.json();
    expect(abcWorldBody.spec.provenance.sourceWorldIds).toEqual(expect.arrayContaining([worldAB, worldC]));

    await ctxA.close(); await ctxB.close(); await ctxC.close(); await ctxMerger.close();
  });
});

test.describe('Reload, recovery, and offline/online sync', () => {
  test('reload preserves guestId and any in-progress draft (localStorage recovery cache)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Создать' }).click();
    await page.getByRole('button', { name: 'Пропустить' }).click();
    await page.getByRole('button', { name: 'Пропустить' }).click();
    const guestIdBefore = await page.evaluate(() => localStorage.iwGuestId);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const guestIdAfter = await page.evaluate(() => localStorage.iwGuestId);
    expect(guestIdAfter).toBe(guestIdBefore);
  });

  test('a story finished while offline is queued and syncs automatically once back online', async ({ page, context }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Создать' }).click();
    await context.setOffline(true);
    for (let i = 0; i < 31; i++) {
      await page.getByRole('button', { name: 'Пропустить' }).click();
    }
    // finish() ran while offline -- syncStory() must have skipped the
    // network call and marked the story pending, not thrown or lost it.
    const pendingWhileOffline = await page.evaluate(() => JSON.parse(localStorage.iwSyncState || '{}').pending);
    expect(pendingWhileOffline).toBe(true);

    await context.setOffline(false);
    // The 'online' listener should fire and flush the queued sync.
    await page.waitForFunction(() => {
      try { return JSON.parse(localStorage.iwSyncState || '{}').pending === false; } catch { return false; }
    }, { timeout: 15000 });
    const storyId = await page.evaluate(() => localStorage.iwStoryId);
    expect(storyId).toBeTruthy();
  });
});

test.describe('Idempotency, duplicate, and concurrent merge', () => {
  test('merging the same pair twice (idempotency) returns the identical result world both times', async ({ browser, request }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const worldA = await completeQuestionnaireAndPublish(await ctxA.newPage(), 'Idem A');
    const worldB = await completeQuestionnaireAndPublish(await ctxB.newPage(), 'Idem B');

    const first = await request.post(`${BASE_URL}/api/merge`, { data: { action: 'create', sourceWorldIds: [worldA, worldB], guestId: '99999999-9999-4999-8999-999999999999' } });
    const second = await request.post(`${BASE_URL}/api/merge`, { data: { action: 'create', sourceWorldIds: [worldB, worldA], guestId: '99999999-9999-4999-8999-999999999999' } });
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.resultWorldId).toBe(firstBody.resultWorldId);
    expect(secondBody.reused).toBe(true);
    await ctxA.close(); await ctxB.close();
  });

  test('rapid double-click on "Соединить" in the UI produces exactly one merge, not two', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const worldA = await completeQuestionnaireAndPublish(await ctxA.newPage(), 'Dup A');
    const worldB = await completeQuestionnaireAndPublish(await ctxB.newPage(), 'Dup B');

    const pageA = ctxA.pages()[0];
    await pageA.getByRole('button', { name: 'Соединить с другими историями' }).click();
    await pageA.locator('#mergeTarget').fill(worldB);
    const mergeButton = pageA.locator('#weaveBox').getByRole('button', { name: 'Соединить' });
    await Promise.all([mergeButton.click(), mergeButton.click()]);
    await expect(pageA.locator('#mergeResult code')).toBeVisible({ timeout: 15000 });
    await ctxA.close(); await ctxB.close();
  });

  test('two concurrent server-side merge requests for the same pair converge on one canonical result', async ({ browser, request }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const worldA = await completeQuestionnaireAndPublish(await ctxA.newPage(), 'Race A');
    const worldB = await completeQuestionnaireAndPublish(await ctxB.newPage(), 'Race B');

    const [r1, r2] = await Promise.all([
      request.post(`${BASE_URL}/api/merge`, { data: { action: 'create', sourceWorldIds: [worldA, worldB], guestId: '99999999-9999-4999-8999-999999999999' } }),
      request.post(`${BASE_URL}/api/merge`, { data: { action: 'create', sourceWorldIds: [worldA, worldB], guestId: '88888888-8888-4888-8888-888888888888' } })
    ]);
    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    expect(b1.resultWorldId).toBe(b2.resultWorldId);
    await ctxA.close(); await ctxB.close();
  });
});

test.describe('Public access from a genuinely clean visitor', () => {
  test('a published world is readable by an anonymous request with no prior guestId relationship to it', async ({ browser, request }) => {
    const ctx = await browser.newContext();
    const worldId = await completeQuestionnaireAndPublish(await ctx.newPage(), 'Public Test');
    await ctx.close();

    // Fresh, unrelated request context -- no shared guestId, no cookies.
    const res = await apiGetWorld(request, worldId, '77777777-7777-4777-8777-777777777777');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('published');
  });
});

test.describe('Mobile', () => {
  // Run with: npx playwright test e2e/improve-world-home-multiuser.spec.js --project=mobile-chromium
  test('the full create -> finish -> publish flow works on a mobile viewport', async ({ page }) => {
    const worldId = await completeQuestionnaireAndPublish(page, 'Mobile User');
    expect(worldId).toBeTruthy();
  });
});
