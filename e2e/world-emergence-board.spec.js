'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root,'shared/world-emergence-board.css'),'utf8');
const js = fs.readFileSync(path.join(root,'shared/world-emergence-board.js'),'utf8');

test.beforeEach(async ({page}) => {
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main>Voxel world</main></body></html>');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:js});
  await page.evaluate(() => {
    let state={schemaVersion:'1.0.0',revision:1,growthStage:0,maxGrowthStage:5,entities:[],relations:[],features:[]};
    window.__placements=[];
    window.__board = window.WorldEmergenceBoard.mount({
      getState:()=>state,
      getPlayer:()=>({x:0,z:0}),
      onPlace:async(kind,x,z,id)=>{
        window.__placements.push({kind,x,z,id});
        const nextId=id||'macro-'+kind+'-'+(state.revision+1);
        const entities=state.entities.filter(e=>e.id!==nextId).concat([{id:nextId,type:kind,label:kind,x,z}]);
        const adjacent=entities.length>1 && Math.hypot(entities[0].x-entities[1].x,entities[0].z-entities[1].z)<130;
        const relations=adjacent?[{a:entities[0].id,b:entities[1].id,summary:'Город и лес породили новую дорогу.'}]:[];
        state={...state,revision:state.revision+1,growthStage:1,entities,relations,
          features:adjacent?[{id:'road',kind:'road',label:'лесная дорога',x:(entities[0].x+entities[1].x)/2,z:(entities[0].z+entities[1].z)/2,stage:1}]:[]};
        window.__board.setState(state);
      },
      onGrow:async()=>{
        state={...state,revision:state.revision+1,growthStage:state.growthStage+1,
          features:[...state.features,{id:'detail-'+state.revision,kind:'park',label:'заповедник',x:10,z:10,stage:state.growthStage+1}]};
        window.__board.setState(state);
      }
    });
  });
});

test('child can place two macro entities by clicking a map and see a new relationship', async ({page}) => {
  await page.getByRole('button',{name:/Соедини две вещи/}).click();
  await page.locator('.we-palette-item[data-kind="city"]').click();
  const map=page.locator('.we-map');
  await map.click({position:{x:map?120:120,y:110}});
  await expect(page.locator('.we-entity')).toHaveCount(1);
  await page.locator('.we-palette-item[data-kind="forest"]').click();
  const bounds=await map.boundingBox();
  await map.click({position:{x:Math.min(bounds.width-15,190),y:110}});
  await expect(page.locator('.we-entity')).toHaveCount(2);
  await expect(page.locator('.we-story')).toContainText('дорогу');
  await expect(page.locator('.we-links line')).toHaveCount(1);
  await page.getByRole('button',{name:/Следующий этап/}).click();
  await expect(page.locator('.we-progress strong')).toHaveText('2/5');
  await expect(page.locator('.we-detail')).toHaveCount(2);
});

test('touch/desktop drag keeps the macro identity while moving it', async ({page}) => {
  await page.getByRole('button',{name:/Соедини две вещи/}).click();
  const palette=page.locator('.we-palette-item[data-kind="city"]');
  const map=page.locator('.we-map');
  const p=await palette.boundingBox(),m=await map.boundingBox();
  await page.mouse.move(p.x+p.width/2,p.y+p.height/2);
  await page.mouse.down();
  await page.mouse.move(m.x+m.width*.43,m.y+m.height*.5,{steps:7});
  await page.mouse.up();
  await expect(page.locator('.we-entity')).toHaveCount(1);
  const before=await page.evaluate(()=>window.__placements[0]);
  const existing=page.locator('.we-entity');
  const b=await existing.boundingBox();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
  await page.mouse.down();
  await page.mouse.move(m.x+m.width*.75,m.y+m.height*.6,{steps:7});
  await page.mouse.up();
  await expect(page.locator('.we-entity')).toHaveCount(1);
  const after=await page.evaluate(()=>window.__placements.at(-1));
  expect(after.id).toMatch(/^macro-city-/);
  expect(after.x).not.toBe(before.x);
});

test('keyboard-only placement and Escape close the world board', async ({page}) => {
  await page.getByRole('button',{name:/Соедини две вещи/}).click();
  await page.locator('.we-palette-item[data-kind="river"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.we-map').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.we-entity')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#vwWorldBoardBackdrop')).toBeHidden();
});
