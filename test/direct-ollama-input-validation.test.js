'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {runAgenticTurn}=require('../lib/direct-ollama-mcp-transport');
test('unsupported capabilities and missing model fail before spawning an MCP process',async t=>{
 t.mock.method(cp,'spawn',()=>{throw Error('must not spawn');});
 await assert.rejects(runAgenticTurn('git status',{model:null,allowedTools:[]}),/unsupported_capability/);
 await assert.rejects(runAgenticTurn('read package.json',{model:null,allowedTools:['read_text_file']}),/model_not_selected/);
});
