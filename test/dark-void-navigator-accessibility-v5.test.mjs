import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../shared/navigator-dialog.mjs',import.meta.url),'utf8');

test('Dark Void Navigator keeps English accessible public controls',()=>{
 for(const text of ['Dark Void Navigator','Talk to the Navigator','Send to Navigator','Read aloud'])assert.ok(src.includes(text),text);
 assert.match(src,/aria-live="polite"/);assert.match(src,/aria-atomic="true"/);assert.match(src,/aria-busy/);
 assert.doesNotMatch(src,/\bH4\b/i);
});

test('Navigator respects OS motion and contrast preferences without visual simplification',()=>{
 assert.match(src,/prefers-reduced-motion:reduce/);
 assert.match(src,/prefers-contrast:more/);
 assert.match(src,/forced-colors:active/);
 assert.doesNotMatch(src,/display:\s*none.*prefers-reduced-motion/s);
});

test('read aloud uses browser speech only and cancels on hide',()=>{
 assert.match(src,/globalThis\.speechSynthesis/);assert.match(src,/SpeechSynthesisUtterance/);
 assert.match(src,/utterance\.lang='en-US'/);assert.match(src,/speechSynthesis\?\.cancel/);
 assert.doesNotMatch(src,/posthog\.init|Sentry\.init|new AudioContext/);
});
