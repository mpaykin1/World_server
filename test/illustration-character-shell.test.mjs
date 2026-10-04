import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_WORKER_VISUAL_PROFILE,
  createSketchProportionController
} from '../shared/graphics/illustration-character-shell.js';
import {
  inspectIllustrationCharacter,
  scoreIllustrationCharacter
} from '../shared/graphics/illustration-character-reference-gate.js';

const rootDir=path.resolve(import.meta.dirname,'..');

function mockRoot(){
  const nodes=[
    {isMesh:true,name:'worker-jacket-mass',userData:{illustrationCharacterShell:true,watercolorOutline:false,paintLayer:'mass'}},
    {isMesh:true,name:'worker-shirt-wash',userData:{illustrationCharacterShell:true,watercolorOutline:false,paintLayer:'detail'}},
    {isMesh:true,name:'worker-black-tie',userData:{illustrationCharacterShell:true,watercolorOutline:false,paintLayer:'ink'}},
    {isMesh:true,name:'worker-briefcase',userData:{illustrationCharacterShell:true,watercolorOutline:false,paintLayer:'mass'}},
    {isMesh:false,name:'worker-single-outer-contour',userData:{outlineRole:'outer',paintLayer:'ink'}}
  ];
  return {
    userData:{
      characterIllustrationShell:true,
      propGripConstraint:true,
      poseAwareSilhouette:true
    },
    traverse(fn){for(const n of nodes)fn(n);}
  };
}

test('sketch proportion controller decouples visible proportions from motion rig',()=>{
  const base=createSketchProportionController();
  const changed=base.merge({headScale:1.6,armThickness:.5});
  assert.equal(base.get('headScale'),DEFAULT_WORKER_VISUAL_PROFILE.headScale);
  assert.equal(changed.get('headScale'),1.6);
  assert.equal(changed.scaled(2,'armThickness'),1);
});

test('character reference gate rewards shell + one contour + semantic layers',()=>{
  const root=mockRoot();
  const metrics=inspectIllustrationCharacter(root);
  assert.equal(metrics.outerContours,1);
  assert.equal(metrics.directOutlinedMeshes,0);
  assert.equal(metrics.hasJacket,true);
  assert.equal(metrics.hasTie,true);
  assert.equal(metrics.hasBriefcase,true);
  const gate=scoreIllustrationCharacter(root);
  assert.equal(gate.pass,true);
  assert.ok(gate.score>=85);
});

test('character shell source implements all required systems',()=>{
  const source=fs.readFileSync(path.join(rootDir,'shared','graphics','illustration-character-shell.js'),'utf8');
  for(const token of [
    'createSketchProportionController',
    'createCharacterIllustrationShell',
    'createPropGripConstraint',
    'createDynamicContour',
    'addGarmentGrammar',
    'segmentEnvelope',
    'paintLayerOrder',
    'singleOuterContour',
    'poseAwareSilhouette',
    'visualEnvelopeMapper'
  ]) assert.match(source,new RegExp(token));
});

test('KayKit worker uses the illustration shell instead of per-part visual ownership',()=>{
  const source=fs.readFileSync(path.join(rootDir,'shared','graphics','illustration-character-kaykit.js'),'utf8');
  assert.match(source,/createCharacterIllustrationShell/);
  assert.match(source,/illustrationShell\.update\(\)/);
  assert.match(source,/characterReferenceGate/);
  assert.match(source,/illustrationShell,/);
});