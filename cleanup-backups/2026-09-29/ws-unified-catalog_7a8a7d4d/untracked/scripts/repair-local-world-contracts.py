from pathlib import Path
root=Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    text=path.read_text(encoding='utf-8-sig')
    if new in text:
        print(f'[skip] {path.name}: already migrated')
        return
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:80]!r}')
    path.write_text(text.replace(old,new,1),encoding='utf-8')
    print(f'[ok] {path}')

survival=root/'apps'/'survival'/'client.js'
replace_once(survival,
"const chunks = new Map(); const resources = new Map(); const resourceMeshes = new Map(); const buildings = new Map(); const remotePlayers = new Map();",
"const chunks = new Map(); const resources = new Map(); const resourceMeshes = new Map(); const buildings = new Map(); const remotePlayers = new Map();\nwindow.GamePlayableRuntime={stats:()=>({player:{x:self.position.x,y:self.position.y,z:self.position.z,yaw,pitch}})};")
replace_once(survival,
"if(keys.has('KeyW')) move.add(forward); if(keys.has('KeyS')) move.sub(forward); if(keys.has('KeyA')) move.add(right); if(keys.has('KeyD')) move.sub(right);",
"if(keys.has('KeyW')||keys.has('ArrowUp')) move.add(forward); if(keys.has('KeyS')||keys.has('ArrowDown')) move.sub(forward); if(keys.has('KeyA')||keys.has('ArrowLeft')) move.add(right); if(keys.has('KeyD')||keys.has('ArrowRight')) move.sub(right);")
sharabass=root/'apps'/'world-sharabass'/'index.html'
replace_once(sharabass,
'<script src="/shared/common.js"></script>\n<script type="module">',
'<script src="/shared/common.js"></script>\n<script src="/shared/ai3d-playable-runtime.js"></script>\n<script type="module">')
replace_once(sharabass,
"let charPos = { x: 0, y: 0, z: 0 };\nlet charYaw = 0;",
"let charPos = { x: 0, y: 0, z: 0 };\nlet charYaw = 0;\nwindow.GamePlayableRuntime={stats:()=>({player:{x:charPos.x,y:charPos.y,z:charPos.z,yaw:charYaw,pitch:0}})};\naddEventListener('goldenlook',e=>{const d=e.detail||{};charYaw+=(Number(d.dx)||0)*.01;});")
print('local world contract migration complete')
audit=root/'scripts'/'world-fleet-audit.js'
replace_once(audit,
"const worlds=[...localWorlds,...externalWorlds];",
"const requestedIds=new Set(String(process.env.WORLD_IDS||'').split(',').map(s=>s.trim()).filter(Boolean));\nconst worlds=[...localWorlds,...externalWorlds].filter(w=>!requestedIds.size||requestedIds.has(w.id));")
common=root/'shared'/'common.js'
replace_once(common,
"  class MiniSocket {",
"  class OfflineSocket {\n    constructor() { this.handlers={}; this.pending={}; this.connected=true; this.id=guestId(); this.name=`Guest_${this.id.replaceAll('-', '').slice(0,4)}`; queueMicrotask(()=>this._trigger('connect')); }\n    on(event,fn){ (this.handlers[event]||(this.handlers[event]=[])).push(fn); for(const data of this.pending[event]||[]) queueMicrotask(()=>fn(data)); delete this.pending[event]; return this; }\n    _trigger(event,data){ const list=this.handlers[event]||[]; if(!list.length){ (this.pending[event]||(this.pending[event]=[])).push(data); return; } for(const fn of list) try{fn(data)}catch(error){console.error(error)} }\n    emit(event,data){\n      if(event==='sharabass:join') this._trigger('sharabass:init',{selfId:this.id,objects:[],players:[],weather:{rain:0,lightning:0,clouds:.2,wind:.1,snow:0,smoke:0}});\n      else if(event==='survival:join') this._trigger('survival:init',{selfId:this.id,player:{name:this.name,inventory:Array(36).fill(null),health:100,hunger:100,thirst:100,position:{x:0,y:0,z:0}},buildings:[]});\n      else if(event==='chunk:request') this._trigger('chunk:data',[]);\n    }\n    disconnect(){this.connected=false;this._trigger('disconnect')}\n  }\n\n  class MiniSocket {")
replace_once(common,
"    async init(appId) {\n      state.appId = appId || 'global';\n      state.supabase = await createSupabase();\n      await loadMe(); buildAuth(); buildChat(); connectSocket(); state.ready = true; return state;\n    },",
"    async init(appId) {\n      state.appId = appId || 'global';\n      try { state.supabase = await createSupabase(); }\n      catch (error) { console.warn('[AppCore] realtime backend unavailable; using local offline runtime:', error?.message || error); state.supabase = null; }\n      await loadMe(); buildAuth(); buildChat();\n      if (state.supabase) connectSocket();\n      else { state.socket=new OfflineSocket(); state.socket.on('connect',()=>state.socket.emit('app:join',state.appId)); window.dispatchEvent(new CustomEvent('appcore:socket',{detail:state.socket})); }\n      state.ready = true; return state;\n    },")
replace_once(survival,
"const keys = new Set(); let yaw=0, pitch=.34;",
"const keys = new Set(); const inputDown=code=>keys.has(code)||window.GameGoldenStandard?.has(code); let yaw=0, pitch=.34;")
replace_once(survival,
"if(keys.has('KeyW')||keys.has('ArrowUp')) move.add(forward); if(keys.has('KeyS')||keys.has('ArrowDown')) move.sub(forward); if(keys.has('KeyA')||keys.has('ArrowLeft')) move.add(right); if(keys.has('KeyD')||keys.has('ArrowRight')) move.sub(right);",
"if(inputDown('KeyW')||inputDown('ArrowUp')) move.add(forward); if(inputDown('KeyS')||inputDown('ArrowDown')) move.sub(forward); if(inputDown('KeyA')||inputDown('ArrowLeft')) move.add(right); if(inputDown('KeyD')||inputDown('ArrowRight')) move.sub(right);")
replace_once(audit,
"const reportPath=path.join(root,'WORLD_FLEET_AUDIT.json');",
"const reportPath=path.join(root,process.env.WORLD_IDS?'WORLD_FLEET_AUDIT.targeted.json':'WORLD_FLEET_AUDIT.json');")
voxel_index=root/'apps'/'voxel-world'/'index.html'
voxel_client=root/'apps'/'voxel-world'/'client.js'
replace_once(voxel_index,
'<script src="/shared/common.js"></script>\n<script type="module" src="./client.js"></script>',
'<script src="/shared/common.js"></script>\n<script src="/shared/ai3d-playable-runtime.js"></script>\n<script type="module" src="./client.js"></script>')
replace_once(voxel_client,
"const keys=new Set(); let mobileMove={x:0,y:0}; let channel=null; let lastSave=0,lastNet=0; let started=false;",
"const keys=new Set(); const inputDown=code=>keys.has(code)||window.GameGoldenStandard?.has(code); let mobileMove={x:0,y:0}; let channel=null; let lastSave=0,lastNet=0; let started=false;")
replace_once(voxel_client,
"  const isF = (keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0;\n  const isB = (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0;\n  const isR = (keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0;\n  const isL = (keys.has('KeyA') || keys.has('ArrowLeft')) ? 1 : 0;",
"  const isF = (inputDown('KeyW') || inputDown('ArrowUp')) ? 1 : 0;\n  const isB = (inputDown('KeyS') || inputDown('ArrowDown')) ? 1 : 0;\n  const isR = (inputDown('KeyD') || inputDown('ArrowRight')) ? 1 : 0;\n  const isL = (inputDown('KeyA') || inputDown('ArrowLeft')) ? 1 : 0;")
