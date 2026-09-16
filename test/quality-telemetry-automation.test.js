'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('browser automation does not pollute production quality evidence',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','quality-telemetry.js'),'utf8');
  assert.match(src,/navigator\.webdriver===true/);
  assert.ok(src.indexOf('navigator.webdriver===true')<src.indexOf("const endpoint='/api/quality-telemetry'"));
});
