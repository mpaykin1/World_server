'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {findGodot,versionOf,templateVersionOf}=require('../scripts/lib/godot-discovery.cjs');
test('Godot discovery finds installed runtime without pinning one patch version',()=>{const bin=findGodot();assert.ok(bin);assert.ok(fs.existsSync(bin));assert.match(versionOf(bin)||'',/^4\./);assert.match(templateVersionOf(bin)||'',/^4\.\d+\.\d+\.stable$/)});
test('worldgen/native build reuse central Godot discovery',()=>{for(const rel of ['scripts/compare-worldgen.js','scripts/godot-native-build.js']){const s=fs.readFileSync(path.join(__dirname,'..',rel),'utf8');assert.match(s,/godot-discovery\.cjs/);assert.doesNotMatch(s,/AppData\/Local\/GodotEngine\/Godot_v4\.7\.2-stable_win64_console\.exe/)}});
