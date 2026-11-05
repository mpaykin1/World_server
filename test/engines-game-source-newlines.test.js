'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createGameArtifact}=require('../lib/engines/game-builder.cjs');
const f=require('./fixtures/meta-game-vault.json');
test('same exact source commit produces identical package for LF and CRLF checkout source',()=>{
 const original=fs.readFileSync;
 const input={...f,sourceCommit:'a'.repeat(40)};
 try{
  fs.readFileSync=function(file,...args){const r=original.call(this,file,...args);return typeof r==='string'&&/[\\/]lib[\\/]engines[\\/]/.test(String(file))?r.replace(/\r\n/g,'\n'):r;};
  const lf=createGameArtifact(input);
  fs.readFileSync=function(file,...args){const r=original.call(this,file,...args);return typeof r==='string'&&/[\\/]lib[\\/]engines[\\/]/.test(String(file))?r.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'):r;};
  const crlf=createGameArtifact(input);
  assert.equal(crlf.manifest_sha256,lf.manifest_sha256);
  assert.deepEqual(crlf.files,lf.files);
 }finally{fs.readFileSync=original;}
});
