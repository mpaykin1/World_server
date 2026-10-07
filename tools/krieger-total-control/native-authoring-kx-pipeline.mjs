#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {compileKriegerNativeAuthoring,validateNativeAuthoringPlan} from "./native-authoring-compiler.mjs";
import {
  parseKkriegerOplist,parseWerkClassRegistry,buildConventionCatalog,
  resolveOperatorIds,extendTargetWithResolvedClasses,parseKxClassTable,
} from "./operator-resolver.mjs";

export function operatorIdsForPlan(plan){
  const verdict=validateNativeAuthoringPlan(plan);
  if(!verdict.pass)throw new Error(verdict.errors.join("; "));
  return [...new Set(plan.nodes
    .filter(n=>Number.isInteger(n.operatorId))
    .map(n=>n.operatorId))]
    .sort((a,b)=>a-b);
}

export function prepareKxAuthoringTarget({plan,targetBytes,oplist,catalog,sourceCatalog}){
  const operatorIds=operatorIdsForPlan(plan);
  const first=resolveOperatorIds({target:targetBytes,oplist,catalog,sourceCatalog,operatorIds});
  if(!first.pass){
    const reasons=[
      ...first.missing.map(x=>`missing 0x${x.id.toString(16)}:${x.reason}`),
      ...first.ambiguous.map(x=>`ambiguous 0x${x.id.toString(16)}`),
    ];
    throw new Error("Krieger operator resolution failed: "+reasons.join(", "));
  }

  const extended=extendTargetWithResolvedClasses(targetBytes,first);
  const finalResolution=resolveOperatorIds({
    target:extended.bytes,oplist,catalog,sourceCatalog,operatorIds,
  });
  if(!finalResolution.pass)throw new Error("extended KX did not resolve all authoring operators");

  const resolvedById=new Map(finalResolution.resolved.map(x=>[x.id,x]));
  const nodes=plan.nodes.map(node=>{
    if(!Number.isInteger(node.operatorId))return{...node,kxBinding:"runtime-only"};
    const resolved=resolvedById.get(node.operatorId);
    if(!resolved||!Number.isInteger(resolved.commandIndex))
      throw new Error(`operator 0x${node.operatorId.toString(16)} has no file-local command index`);
    return{
      ...node,
      kxBinding:"document-operator",
      kxCommandIndex:resolved.commandIndex,
      kxConvention:resolved.convention,
      kxPacking:resolved.packing,
      kxResolutionMode:resolved.mode,
    };
  });

  const preparedPlan={
    ...plan,
    nodes,
    boundary:{
      ...plan.boundary,
      targetClassTablePrepared:true,
      emitsClassTableExtendedKx:true,
      emitsNewOperatorInstances:false,
      emitsNativeKxBinary:false,
    },
    targetKx:{
      oldLayout:extended.parsed.oldLayout,
      originalClassCount:first.parsed.classes.length,
      finalClassCount:extended.parsed.classes.length,
      addedClasses:extended.added.map(x=>({
        operatorId:x.realId,commandIndex:x.commandIndex,
        convention:x.convention,packing:x.packing,
      })),
      allNativeNodesResolved:true,
      binaryTailPreserved:true,
    },
  };
  const verdict=validateNativeAuthoringPlan(preparedPlan);
  if(!verdict.pass)throw new Error(verdict.errors.join("; "));
  return{
    plan:preparedPlan,
    bytes:extended.bytes,
    resolution:finalResolution,
    parsedTarget:parseKxClassTable(extended.bytes),
  };
}

export function loadPinnedResolverEvidence(upstreamRoot){
  const root=path.resolve(upstreamRoot);
  const oplist=parseKkriegerOplist(
    fs.readFileSync(path.join(root,"player_kkrieger","kkrieger_oplist.cpp"),"utf8")
  );
  const sourceCatalog=parseWerkClassRegistry(
    fs.readFileSync(path.join(root,"werkops.cpp"),"utf8")
  );
  const dataDir=path.join(root,"data");
  const documents=fs.readdirSync(dataDir)
    .filter(name=>name.endsWith(".kx"))
    .sort()
    .map(name=>({name,bytes:fs.readFileSync(path.join(dataDir,name))}));
  return{oplist,sourceCatalog,catalog:buildConventionCatalog(documents),documents:documents.map(x=>x.name)};
}

export function prepareRecipeForTarget({recipe,targetBytes,oplist,catalog,sourceCatalog}){
  return prepareKxAuthoringTarget({
    plan:compileKriegerNativeAuthoring(recipe),
    targetBytes,oplist,catalog,sourceCatalog,
  });
}

function usage(){
  console.error("usage: node native-authoring-kx-pipeline.mjs <recipe.json> <werkkzeug3_kkrieger-root> <target.kx> <out.kx> <out-plan.json>");
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const [recipePath,upstreamRoot,targetPath,outKx,outPlan]=process.argv.slice(2);
  if(!outPlan){usage();process.exit(2);}
  const recipe=JSON.parse(fs.readFileSync(recipePath,"utf8"));
  const evidence=loadPinnedResolverEvidence(upstreamRoot);
  const result=prepareRecipeForTarget({
    recipe,targetBytes:fs.readFileSync(targetPath),
    oplist:evidence.oplist,catalog:evidence.catalog,sourceCatalog:evidence.sourceCatalog,
  });
  fs.writeFileSync(outKx,result.bytes);
  fs.writeFileSync(outPlan,JSON.stringify(result.plan,null,2)+"\n");
  console.log(JSON.stringify({
    pass:true,
    donorDocuments:evidence.documents,
    nativeOperatorIds:operatorIdsForPlan(result.plan).map(x=>"0x"+x.toString(16)),
    targetKx:result.plan.targetKx,
    boundary:result.plan.boundary,
  },null,2));
}
