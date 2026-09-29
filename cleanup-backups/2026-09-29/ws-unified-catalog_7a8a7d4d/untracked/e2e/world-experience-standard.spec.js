const {test,expect}=require('@playwright/test');

test('compact one-button world menu renders newspaper catalog with automatic lore',async({page})=>{
  await page.goto('/apps/catalog/');
  await expect(page.locator('#goldenWorldButton')).toHaveCount(1);
  await expect(page.locator('#goldenWorldButton')).toBeHidden();
  await expect(page.locator('#goldenToolbar')).toHaveCount(0);
  await expect(page.locator('#goldenDrawer')).toHaveClass(/open/);
  await expect(page.locator('.worldNewspaper')).toBeVisible();
  await expect(page.locator('.worldStoryCard')).toHaveCount(22);
  const first=page.locator('.worldStoryCard').first();
  await expect(first.locator('.worldHeadline')).not.toHaveText('');
  await expect(first.locator('.worldRole')).not.toHaveText('');
});

test('inventory automatically weaves every world into shared lore',async({request})=>{
  const r=await request.get('/api/apps?all=1');expect(r.ok()).toBeTruthy();
  const j=await r.json();expect(j.rootStory).toBe('Осколки Improve World');expect(j.inventory.length).toBeGreaterThanOrEqual(22);
  for(const w of j.inventory){expect(w.lore?.headline).toBeTruthy();expect(w.lore?.story).toBeTruthy();expect(w.lore?.connections?.length).toBeGreaterThanOrEqual(2);}
});

for(const id of ['voxel-world','ai3d-voxel-city']){
  test(`${id}: gameplay chrome stays compact and infinite-world contract is live`,async({page})=>{
    await page.goto(`/apps/${id}/`,{waitUntil:'commit'});
    await expect(page.locator('#goldenWorldButton')).toBeVisible({timeout:15000});
    await expect.poll(()=>page.evaluate(worldId=>window.InfiniteWorldStandard?.audit(worldId)?.ok===true,id),{timeout:15000}).toBe(true);
    const outside=page.locator('body > button:visible, body > header button:visible, main > button:visible');
    await expect(outside).toHaveCount(0);
  });
}
