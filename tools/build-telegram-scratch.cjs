// Pinned offline packaging of the user's approved Scratch game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const packRoot=process.env.TURBOWARP_PACKAGER_DIR;
 const scratch=process.env.SCRATCH_GAME_SB3;
 if(!packRoot||!scratch)throw Error('TURBOWARP_PACKAGER_DIR and SCRATCH_GAME_SB3 required');
 const Packager=require(packRoot),src=fs.readFileSync(scratch);
 const hash=crypto.createHash('sha256').update(src).digest('hex');
 const loaded=await Packager.loadProject(src,()=>{});
 const maker=new Packager.Packager();maker.project=loaded;
 maker.options.turbo=true;maker.options.autoplay=true;
 maker.options.compiler.enabled=true;maker.options.target='html';
 maker.options.appearance.background='#091928';
 maker.options.loadingScreen.text='Цепная реакция — загружаем живой мир…';
 maker.options.controls.fullscreen.enabled=true;
 maker.options.custom.css=
   "html,body{margin:0;background:#091928 url('./backdrop.webp') center/cover fixed!important;overflow:hidden}";
 const result=await maker.package();
 if(result.type!=='text/html')throw Error('Bad output: '+result.type);
 const out=path.resolve(__dirname,'../apps/telegram-miniapp/game.html');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,result.data);
 const bytes=fs.statSync(out).size;
 if(bytes<100000||bytes>24000000)throw Error('Size blocked: '+bytes);
 fs.writeFileSync(path.join(path.dirname(out),'build.json'),
   JSON.stringify({scratchSha256:hash,packager:'@turbowarp/packager@3.13.0',
    bytes,generatedAt:'2026-09-27'},null,2));
 console.log('PACKAGED_OK',bytes,'SOURCE_SHA256',hash);
})().catch(e=>{console.error(e);process.exitCode=1});
