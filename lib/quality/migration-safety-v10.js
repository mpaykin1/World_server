'use strict';
function analyzeMigration(sql,{allowDestructive=false}={}){
  const src=String(sql||''); const findings=[];
  const rules=[
    ['drop-table',/\bdrop\s+table\b/i,'blocker'],['truncate',/\btruncate\b/i,'blocker'],['drop-column',/\bdrop\s+column\b/i,'major'],
    ['alter-type',/\balter\s+column\b[\s\S]{0,100}\btype\b/i,'major'],['disable-rls',/\bdisable\s+row\s+level\s+security\b/i,'blocker'],
    ['grant-public',/\bgrant\s+(?:all|execute|select|insert|update|delete)[\s\S]{0,100}\bto\s+public\b/i,'blocker']
  ];
  for(const [id,re,severity] of rules)if(re.test(src))findings.push({id,severity});
  const definer=/security\s+definer/i.test(src);const revokes=/revoke\s+execute[\s\S]{0,160}\bfrom\s+(?:public|anon|authenticated)/i.test(src);
  if(definer&&!revokes)findings.push({id:'security-definer-execute-not-revoked',severity:'blocker'});
  const destructive=findings.some(x=>['drop-table','truncate','drop-column','alter-type'].includes(x.id));
  const blockers=findings.filter(x=>x.severity==='blocker');
  const ok=blockers.length===0&&(!destructive||allowDestructive);
  return {ok,status:ok?'PASS':'HOLD',findings,requiresBackup:destructive,requiresExplicitApproval:destructive};
}
module.exports={analyzeMigration};
