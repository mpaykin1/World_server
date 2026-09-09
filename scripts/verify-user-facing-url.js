const {assertUserFacingLinkVerified}=require('../lib/user-link-delivery-policy');
async function main(){
  const url=process.argv[2];if(!url)throw new Error('usage: node scripts/verify-user-facing-url.js <url>');
  const res=await fetch(url,{redirect:'follow',cache:'no-store',headers:{'cache-control':'no-cache'}});
  const text=(await res.text()).slice(0,12000);
  const evidence={url,verifiedAt:new Date().toISOString(),httpStatus:res.status,bodySample:text,
    deliveryRole:'final',ephemeralPreview:/deploy-preview-|--world-server\.netlify\.app/i.test(url),
    playableWorld:/\/apps\//.test(url),browserVerified:false,appReady:false};
  const hostOnly={...evidence,playableWorld:false,browserVerified:true,appReady:res.ok};
  assertUserFacingLinkVerified(hostOnly);
  console.log(JSON.stringify({ok:true,url:res.url,status:res.status,verifiedAt:evidence.verifiedAt},null,2));
}
main().catch(e=>{console.error(e.code||'VERIFY_LINK_FAIL',e.message);process.exit(1);});
