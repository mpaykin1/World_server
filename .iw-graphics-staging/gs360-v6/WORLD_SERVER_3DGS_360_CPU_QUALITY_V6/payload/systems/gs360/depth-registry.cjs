#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const here=__dirname;const root=path.resolve(process.argv[2]||process.cwd());
function findPython(){const opts=process.platform==='win32'?[[path.join(here,'.venv','Scripts','python.exe'),[]],['python',[]],['py',['-3']]]:[[path.join(here,'.venv','bin','python'),[]],['python3',[]],['python',[]]];for(const [c,p] of opts){if((c.includes('/')||c.includes('\\'))&&!fs.existsSync(c))continue;const r=spawnSync(c,[...p,'-c','import sys'],{stdio:'ignore'});if(r.status===0)return{cmd:c,prefix:p};}return null;}
function imp(py,m){if(!py)return false;return spawnSync(py.cmd,[...py.prefix,'-c',`import ${m}`],{stdio:'ignore'}).status===0;}
const py=findPython();const ov=imp(py,'openvino'),ort=imp(py,'onnxruntime');
const ovPath=process.env.GS360_DEPTH_OPENVINO?path.resolve(process.env.GS360_DEPTH_OPENVINO):null;
const onnxPath=process.env.GS360_DEPTH_ONNX?path.resolve(process.env.GS360_DEPTH_ONNX):null;
const daRoot=process.env.GS360_DEPTH_ANYTHING_ROOT?path.resolve(process.env.GS360_DEPTH_ANYTHING_ROOT):null;
const daCkpt=process.env.GS360_DEPTH_ANYTHING_CHECKPOINT?path.resolve(process.env.GS360_DEPTH_ANYTHING_CHECKPOINT):null;
const daCode=!!(daRoot&&fs.existsSync(path.join(daRoot,'depth_anything_v2','dpt.py')));const daModel=!!(daCkpt&&fs.existsSync(daCkpt));const torch=!!(daCode&&daModel&&imp(py,'torch'));
const candidates=[
 {id:'openvino',available:!!(ov&&ovPath&&fs.existsSync(ovPath)),runtime:ov,model:ovPath,priority:100,cpu:true,reason:ov?(ovPath&&fs.existsSync(ovPath)?'OpenVINO runtime + model detected':'OpenVINO runtime detected; set GS360_DEPTH_OPENVINO to a compatible model'):'OpenVINO runtime not installed'},
 {id:'depth_anything_v2_small_cpu',available:!!(torch&&daCode&&daModel),runtime:torch,model:daCkpt,repo:daRoot,priority:95,cpu:true,license:'Apache-2.0 model',reason:torch?(daCode&&daModel?'Official Depth Anything V2 Small repo + checkpoint detected':'Torch detected; set GS360_DEPTH_ANYTHING_ROOT and GS360_DEPTH_ANYTHING_CHECKPOINT'):'PyTorch not installed'},
 {id:'onnxruntime',available:!!(ort&&onnxPath&&fs.existsSync(onnxPath)),runtime:ort,model:onnxPath,priority:90,cpu:true,reason:ort?(onnxPath&&fs.existsSync(onnxPath)?'ONNX Runtime + model detected':'ONNX Runtime detected; set GS360_DEPTH_ONNX'):'ONNX Runtime not installed'},
 {id:'proxy',available:true,runtime:true,model:null,priority:1,cpu:true,reason:'Built-in non-metric style-first fallback'}
];
const selected=candidates.filter(x=>x.available).sort((a,b)=>b.priority-a.priority)[0];
const rep={schema:'world-server.gs360-depth-registry/v2',generatedAt:new Date().toISOString(),python:py,selected:selected.id,candidates,truth:{metricDepthClaimed:false,proxyIsFallback:selected.id==='proxy'}};
fs.writeFileSync(path.join(root,'GS360_DEPTH_REGISTRY.json'),JSON.stringify(rep,null,2)+'\n');console.log(JSON.stringify(rep,null,2));
