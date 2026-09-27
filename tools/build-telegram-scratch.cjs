// Pinned offline packaging of the user's approved Scratch game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const packRoot=process.env.TURBOWARP_PACKAGER_DIR;
 const scratch=process.env.SCRATCH_GAME_SB3;
 if(!packRoot||!scratch)throw Error('TURBOWARP_PACKAGER_DIR and SCRATCH_GAME_SB3 required');
 const Packager=require(packRoot),src=fs.readFileSync(scratch);
 const hash=crypto.createHash('sha256').update(src).digest('hex');
 const expectedSource='8fe1553124471d126e1ff61928bfb4e9693c5c5a3473c88140eb82f8ff5e715e';
 if(hash!==expectedSource)throw Error('Scratch input differs from user-approved project');
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
 const compiledSha256=crypto.createHash('sha256').update(result.data).digest('hex');
 const expectedCompiled='b9eb8fb77202c3a93228ea0c03dfd73ef7aa1f0aa5b37e9aca7a6974c03a8e01';
 if(compiledSha256!==expectedCompiled)throw Error('Compiled fallback differs from approved owner-hosted graphics');
 const out=path.resolve(__dirname,'../apps/telegram-miniapp/game.html');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,result.data);
 const bytes=fs.statSync(out).size;
 if(bytes<100000||bytes>24000000)throw Error('Size blocked: '+bytes);
 fs.writeFileSync(path.join(path.dirname(out),'build.json'),
   JSON.stringify({scratchSha256:hash,packager:'@turbowarp/packager@3.13.0',
    bytes,generatedAt:new Date().toISOString().slice(0,10),compiledSha256,
    hostedUrl:'https://mpaykin1.github.io/scratch-chain-reaction/player/',
    sourceRepoCommit:'29707f9512c48e91b9cd3a1a7f761ede21ed9858',
    fallbackUrl:'https://mpaykin1.github.io/scratch-chain-reaction/miniapp/game.html',
    runtime:'owner-hosted TurboWarp Scaffolding MPL-2.0 with true portrait and wide stage',
    playerSourceSha:'934b80c330eb509150fcfd186b1830cd2458b3a5'},null,2));
 console.log('PACKAGED_OK',bytes,'SOURCE_SHA256',hash);
})().catch(e=>{console.error(e);process.exitCode=1});
