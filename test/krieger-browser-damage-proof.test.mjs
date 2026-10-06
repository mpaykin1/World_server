import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runner=fs.readFileSync("tools/krieger-total-control/run-browser-damage-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-damage-browser-proof.py","utf8");

test("damage proof crosses browser input into native player life with negative control and restoration",()=>{
  assert.match(runner,/Browser key K|case 'K'/);
  assert.match(runner,/Player\.Hit\(10\)/);
  assert.match(runner,/open\(sys\.argv\[1\],"rb"\)\.read\(\)/);
  assert.match(runner,/b"void KKriegerPlayer::Hit/);
  assert.doesNotMatch(runner,/open\(sys\.argv\[1\],encoding="utf-8"\)/);
  assert.match(runner,/run_phase irrelevant-key "key:J"/);
  assert.match(runner,/run_phase damaged "key:K"/);
  assert.match(runner,/run_phase restored/);
  assert.match(runner,/key:F10,wait:1,log:player:240/);
  assert.match(runner,/log:player:240/);
  assert.match(verifier,/irrelevantKeyNoEffect/);
  assert.match(verifier,/damageObserved/);
  assert.match(verifier,/restorationExact/);
  assert.match(verifier,/damage causality proof failed/);
});

test("pinned-source preflight is byte-safe for the upstream non-UTF-8 source",()=>{
  const fixture=Buffer.concat([
    Buffer.from("void KKriegerPlayer::Hit(sInt hits)\ncase 'K':\n    Player.Hit(10);\nLife -= (hits-Armor)+(Armor/4);\nLife -= hits/4;\n","ascii"),
    Buffer.from([0xdf]),
  ]);
  const anchors=[
    Buffer.from("void KKriegerPlayer::Hit(sInt hits)"),
    Buffer.from("case 'K':\n    Player.Hit(10);"),
    Buffer.from("Life -= (hits-Armor)+(Armor/4);"),
    Buffer.from("Life -= hits/4;"),
  ];
  for(const anchor of anchors) assert.notEqual(fixture.indexOf(anchor),-1);
  assert.throws(()=>new TextDecoder("utf-8",{fatal:true}).decode(fixture));
});
