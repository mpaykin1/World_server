'use strict';
const marker='quality-autopilot-contract-v10';
function contractScript(){return `<script data-${marker}>\n(()=>{if(window.__QUALITY_AUTOPILOT_CONTRACT__)return;const s=window.GameGoldenStandard?.state||window.__AI3D_PLAYABLE_SCENE__?.state||null;if(!s)return;window.__QUALITY_AUTOPILOT_CONTRACT__={version:10,state:s,source:window.GameGoldenStandard?.state?'GameGoldenStandard':'AI3D_PLAYABLE_SCENE'};})();\n</script>`;}
function instrumentHtml(html){const src=String(html);if(src.includes(`data-${marker}`)||src.includes('__QUALITY_AUTOPILOT_CONTRACT__'))return {changed:false,html:src,reason:'already-instrumented'};if(!/<\/body>/i.test(src))return {changed:false,html:src,reason:'body-end-missing'};return {changed:true,html:src.replace(/<\/body>/i,contractScript()+'\n</body>'),reason:'instrumented'};}
module.exports={instrumentHtml,contractScript,marker};
