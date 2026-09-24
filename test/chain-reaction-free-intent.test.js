'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/world-consequence-engine');
test('specific solar intent beats generic electricity in fifth free design',()=>{
 const w=E.createWorld('solar-natural-language');
 const solar=E.interpretIntent('Построим солнечную электростанцию поэтапно','workshop');
 const geothermal=E.interpretIntent('Построим геотермальную электростанцию','workshop');
 assert.equal(solar.goal,'solar');assert.equal(geothermal.goal,'geothermal');
 const plan=E.preview(w,solar);assert.equal(plan.buildTicks,3);assert.equal(plan.cost,52);
 assert.equal(plan.risk,0);assert.equal(plan.feasible,true);
});
