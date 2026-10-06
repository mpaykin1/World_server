import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runner=fs.readFileSync("tools/krieger-total-control/run-browser-damage-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-damage-browser-proof.py","utf8");

test("damage proof crosses browser input into native player life with negative control and restoration",()=>{
  assert.match(runner,/case 'k':[\s\S]*case 'K'/);
  assert.match(runner,/Player\.Hit\(10\)/);
  assert.match(runner,/open\(sys\.argv\[1\],"rb"\)\.read\(\)/);
  assert.match(runner,/b"void KKriegerPlayer::Hit[\s\S]*Sound\(10\)/);
  assert.doesNotMatch(runner,/open\(sys\.argv\[1\],encoding="utf-8"\)/);
  assert.match(runner,/steps="\$steps,focus,\$action,wait:2"/);
  assert.match(runner,/run_phase irrelevant-key "key:j"/);
  assert.match(runner,/run_phase damaged "key:k"/);
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
    Buffer.from("Life -= (hits-Armor)+(Armor/4);\nLife -= hits/4;\nvoid KKriegerPlayer::Hit(sInt hits)\n{\n  if(hits>Armor)\n    Life -= (hits-Armor)+(Armor/4);\n  else\n    Life -= hits/4;\n  if(Life<0)\n    Life = 0;\n  if(hits>4)\n    Sound(10);\n}\ncase 'k':\n  case 'K':\n    Player.Hit(10);\n    break;\n","ascii"),
    Buffer.from([0xdf]),
  ]);
  const anchors=[
    Buffer.from("void KKriegerPlayer::Hit(sInt hits)\n{\n  if(hits>Armor)\n    Life -= (hits-Armor)+(Armor/4);\n  else\n    Life -= hits/4;\n  if(Life<0)\n    Life = 0;\n  if(hits>4)\n    Sound(10);\n}"),
    Buffer.from("case 'k':\n  case 'K':\n    Player.Hit(10);\n    break;"),
  ];
  for(const anchor of anchors){
    assert.notEqual(fixture.indexOf(anchor),-1);
    assert.equal(fixture.indexOf(anchor),fixture.lastIndexOf(anchor));
  }
  assert.throws(()=>new TextDecoder("utf-8",{fatal:true}).decode(fixture));
});
