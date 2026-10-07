'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRbxlx } = require('../lib/roblox-rbxlx-parser');
const { importRbxlx } = require('../lib/roblox-importer');

const fixture = `<?xml version="1.0" encoding="utf-8"?>
<roblox version="4">
  <Item class="Workspace" referent="RBX0"><Properties><string name="Name">Workspace</string></Properties>
    <Item class="Model" referent="RBX1"><Properties><string name="Name">GothicCity</string></Properties>
      <Item class="MeshPart" referent="RBX2"><Properties>
        <string name="Name">Tower</string><bool name="Anchored">true</bool>
        <Vector3 name="Size"><X>4</X><Y>12</Y><Z>4</Z></Vector3>
        <Content name="MeshId"><url>rbxassetid://123456</url></Content>
      </Properties></Item>
    </Item>
  </Item>
  <Item class="RemoteEvent" referent="RBX3"><Properties><string name="Name">ThrowRock</string></Properties></Item>
  <Item class="Script" referent="RBX4"><Properties>
    <string name="Name">MossRockServer</string>
    <ProtectedString name="Source"><![CDATA[
      local Workspace = game:GetService("Workspace")
      local ReplicatedStorage = game:GetService("ReplicatedStorage")
      local hit = Workspace:Raycast(origin, direction)
      rock:ApplyImpulse(direction * 50)
      remote.OnServerEvent:Connect(function(player) end)
    ]]></ProtectedString>
  </Properties></Item>
  <Item class="LocalScript" referent="RBX5"><Properties>
    <string name="Name">SurfaceClimber</string>
    <ProtectedString name="Source"><![CDATA[
      local UserInputService = game:GetService("UserInputService")
      local RunService = game:GetService("RunService")
      RunService.RenderStepped:Connect(function() end)
    ]]></ProtectedString>
  </Properties></Item>
</roblox>`;

test('RBXLX parser preserves hierarchy, typed values and embedded source without executing it', () => {
  globalThis.__robloxImportMustNotExecute = 0;
  const parsed = parseRbxlx(fixture);
  assert.equal(parsed.instanceCount, 6);
  assert.equal(parsed.classes.MeshPart, 1);
  assert.equal(parsed.scripts.length, 2);
  assert.equal(parsed.remotes[0].name, 'ThrowRock');
  const mesh = parsed.instances[0].children[0].children[0];
  assert.deepEqual(mesh.properties.Size, { X: 4, Y: 12, Z: 4 });
  assert.equal(mesh.properties.MeshId, 'rbxassetid://123456');
  assert.equal(globalThis.__robloxImportMustNotExecute, 0);
});

test('importer emits deterministic World Server IR and explicit unresolved assets', () => {
  const a = importRbxlx(fixture), b = importRbxlx(fixture);
  assert.deepEqual(a, b);
  assert.equal(a.schemaVersion, 'world-server.roblox-import.v1');
  assert.equal(a.summary.uniqueAssets, 1);
  assert.equal(a.assets[0].assetId, '123456');
  assert.equal(a.assets[0].status, 'unresolved-external');
  assert.ok(a.migration.blockers.includes('external-assets-unresolved'));
  assert.equal(a.migration.executable, false);
});

test('semantic translator maps physics, networking, controls and frame scheduling to World Server adapters', () => {
  const result = importRbxlx(fixture);
  const capabilities = result.behaviors.capabilities.map((item) => item.capability);
  assert.ok(capabilities.includes('physics.raycast'));
  assert.ok(capabilities.includes('physics.impulse'));
  assert.ok(capabilities.includes('network.events'));
  assert.ok(capabilities.includes('input.actions'));
  assert.ok(capabilities.includes('scheduler.frames'));
  assert.equal(result.adapters.controls.canonical, 'shared/ai3d-playable-runtime.js');
  assert.equal(result.adapters.physics.canonical, 'shared/golden-physics.js');
  assert.deepEqual(result.adapters.networking.remoteEvents, ['ThrowRock']);
});

test('provided assets resolve metadata only and do not weaken script safety policy', () => {
  const result = importRbxlx(fixture, { providedAssets: { 123456: 'assets/tower.glb' } });
  assert.equal(result.assets[0].status, 'provided');
  assert.equal(result.assets[0].resolvedTo, 'assets/tower.glb');
  assert.equal(result.migration.blockers.includes('external-assets-unresolved'), false);
  assert.equal(result.adapters.scriptExecution.importTime, false);
  assert.equal(result.adapters.scriptExecution.runtime, false);
});

test('terrain and Roblox UI are explicit migration lanes rather than silent approximations', () => {
  const extra = fixture.replace('</roblox>', '<Item class="TerrainRegion" referent="RBX6"><Properties><string name="Name">Region</string></Properties></Item><Item class="StarterGui" referent="RBX7"><Properties><string name="Name">StarterGui</string></Properties><Item class="ImageLabel" referent="RBX8"><Properties><string name="Name">AimHud</string></Properties></Item></Item></roblox>');
  const result = importRbxlx(extra, { providedAssets: { 123456: 'assets/tower.glb' } });
  assert.equal(result.adapters.terrain.mode, 'adapt-or-export');
  assert.equal(result.adapters.ui.mode, 'semantic-rebuild');
  assert.equal(result.adapters.ui.canonical, 'shared/golden-ui-shell.js');
  assert.ok(result.migration.blockers.includes('terrain-region-bytes-require-decoder-or-export'));
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('browser runtime adapter delegates to host physics/network and never creates a second authority', () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/roblox-runtime-adapter.js'), 'utf8');
  const calls = [];
  const listeners = new Map();
  const context = {
    window: {
      GameGoldenStandard: { input: () => ({ forward:true, back:false, left:false, right:false, run:false, jump:false }) },
      addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener() {}
    },
    performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console
  };
  vm.createContext(context); vm.runInContext(source, context);
  const bridge = context.window.WorldServerRobloxRuntime;
  const runtime = bridge.createRuntime({
    physics: { raycast:(...a)=>calls.push(['raycast',...a]), applyImpulse:(...a)=>calls.push(['impulse',...a]), setLinearVelocity(){}, onContact(){} },
    network: { fireServer:(...a)=>calls.push(['fireServer',...a]), fireClient(){}, fireAll(){}, onServer(){}, onClient(){} },
    scheduler: { onTick(){} }
  });
  runtime.physics.raycast({x:0},{x:1});
  runtime.network.remote('ThrowRock').fireServer({power:1});
  assert.equal(runtime.input.read().forward, true);
  assert.equal(runtime.policy.executeLuau, false);
  assert.equal(runtime.policy.authoritativeNetworking, true);
  assert.deepEqual(calls.map((x)=>x[0]), ['raycast','fireServer']);
});

test('CFrame adapter preserves Roblox position and rotation matrix explicitly', () => {
  const source = fs.readFileSync(path.join(__dirname, '../shared/roblox-runtime-adapter.js'), 'utf8');
  const context = { window:{ addEventListener(){}, removeEventListener(){} }, performance:{now:()=>0}, requestAnimationFrame:()=>1, cancelAnimationFrame(){} };
  vm.createContext(context); vm.runInContext(source, context);
  const transform = context.window.WorldServerRobloxRuntime.cframeToTransform({ X:1,Y:2,Z:3,R00:0,R01:0,R02:-1,R10:0,R11:1,R12:0,R20:1,R21:0,R22:0 });
  assert.deepEqual(JSON.parse(JSON.stringify(transform.position)), {x:1,y:2,z:3});
  assert.deepEqual(JSON.parse(JSON.stringify(transform.rotationMatrix)), [0,0,-1,0,1,0,1,0,0]);
});
