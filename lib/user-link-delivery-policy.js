const policy=require('../data/user-link-delivery-policy.json');
function errorsForEvidence(e,now=Date.now()){
  const r=policy.rules,errors=[];
  if(!e||typeof e!=='object')return ['missing verification evidence'];
  const ts=Date.parse(e.verifiedAt||'');
  if(!Number.isFinite(ts)||now-ts>r.maxEvidenceAgeSeconds*1000||ts-now>5000)errors.push('verification evidence is stale or invalid');
  if(r.requireHttp2xx&&!(Number(e.httpStatus)>=200&&Number(e.httpStatus)<300))errors.push('URL is not HTTP 2xx');
  const body=String(e.bodySample||'');
  for(const marker of r.forbiddenHostPageMarkers)if(body.toLowerCase().includes(String(marker).toLowerCase()))errors.push(`host error marker: ${marker}`);
  if(r.requireApplicationReadyPredicate&&e.appReady!==true)errors.push('application ready predicate not proven');
  if(r.requireBrowserVerificationForPlayableWorld&&e.playableWorld===true&&e.browserVerified!==true)errors.push('playable world browser verification missing');
  if(r.ephemeralPreviewMayBeFinal===false&&e.deliveryRole==='final'&&e.ephemeralPreview===true)errors.push('ephemeral preview cannot be final user link');
  return [...new Set(errors)];
}
function assertUserFacingLinkVerified(e,now=Date.now()){
  const errors=errorsForEvidence(e,now);if(errors.length){const err=new Error(errors.join('; '));err.code='UNVERIFIED_LINK_HARD_BLOCK';throw err;}return true;
}
module.exports={policy,errorsForEvidence,assertUserFacingLinkVerified};
