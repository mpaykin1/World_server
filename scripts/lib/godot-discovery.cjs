'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const home=os.homedir(),local=process.env.LOCALAPPDATA||path.join(home,'AppData','Local'),tplRoot=path.join(home,'AppData','Roaming','Godot','export_templates');
function which(name){const r=cp.spawnSync(process.platform==='win32'?'where':'which',[name],{encoding:'utf8',windowsHide:true});return r.status===0?String(r.stdout||'').trim().split(/\r?\n/)[0]:null;}
function packageCandidates(){const root=path.join(local,'Packages');if(!fs.existsSync(root))return[];const out=[];for(const n of fs.readdirSync(root)){const d=path.join(root,n,'LocalCache','Local','GodotEngine');if(!fs.existsSync(d))continue;for(const f of fs.readdirSync(d))if(/^Godot_v\d+\.\d+\.\d+-stable_win64_console\.exe$/i.test(f))out.push(path.join(d,f));}return out;}
function versionFromName(p){const m=String(p||'').match(/Godot_v(\d+)\.(\d+)\.(\d+)-stable/i);return m?m.slice(1).map(Number):null;}
function templateVersionFromName(p){const v=versionFromName(p);return v?`${v[0]}.${v[1]}.${v[2]}.stable`:null;}
function hasTemplates(p){const v=templateVersionFromName(p);return !!(v&&fs.existsSync(path.join(tplRoot,v,'windows_release_x86_64_console.exe')));}
function candidates(){const explicit=process.env.GODOT_BIN&&process.env.GODOT_BIN.trim();const fixed=[explicit,which('godot'),which('godot4'),path.join(local,'GameServerStudio','tools','Godot_v4.7.2-stable_win64_console.exe'),path.join(local,'GameServerStudio','tools','Godot_v4.7.1-stable_win64_console.exe'),path.join(local,'GodotEngine','Godot_v4.7.2-stable_win64_console.exe'),path.join(local,'GodotEngine','Godot_v4.7.1-stable_win64_console.exe'),...packageCandidates()].filter(p=>p&&fs.existsSync(p));return [...new Set(fixed)].sort((a,b)=>{const A=versionFromName(a)||[0,0,0],B=versionFromName(b)||[0,0,0];return B[0]-A[0]||B[1]-A[1]||B[2]-A[2]});}
function findGodot(opts={}){const all=candidates();return (opts.requireTemplates?all.find(hasTemplates):all[0])||null;}
function versionOf(bin=findGodot()){if(!bin)return null;const r=cp.spawnSync(bin,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000});return r.status===0?String(r.stdout||r.stderr||'').trim().split(/\s+/)[0]:null;}
function templateVersionOf(bin=findGodot()){return templateVersionFromName(bin);}
module.exports={findGodot,versionOf,templateVersionOf,hasTemplates,candidates,packageCandidates};
