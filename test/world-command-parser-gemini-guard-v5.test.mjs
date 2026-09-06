import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSuggestedWorldCommand} from '../shared/world-command-parser.mjs';

test('structured AI suggestion is validated then routed through existing parser',()=>{
 const r=parseSuggestedWorldCommand({command:'build a large blue tower',confidence:.8});
 assert.equal(r.intent.action,'create'); assert.equal(r.intent.type,'tower'); assert.equal(r.intent.color,'blue'); assert.equal(r.intent.size,'large'); assert.equal(r.confidence,.8);
});

test('AI suggestion schema is fail-closed',()=>{
 assert.throws(()=>parseSuggestedWorldCommand({command:'build a tower',html:'<script>'}),/schema/);
 assert.throws(()=>parseSuggestedWorldCommand({command:42}),/text/);
 assert.throws(()=>parseSuggestedWorldCommand({command:'   '}),/empty/);
 assert.throws(()=>parseSuggestedWorldCommand({command:'build a tower',confidence:2}),/0\.\.1/);
});

test('control chars are sanitized before parser execution',()=>{
 const r=parseSuggestedWorldCommand({command:'build\u0000 a tower'});
 assert.equal(r.command,'build a tower'); assert.equal(r.intent.type,'tower');
});
