#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const LEDGER_PATH = "data/krieger-total-control-evidence-ledger.json";
export const SUMMARY_PATH = "docs/krieger-total-control/EVIDENCE_SUMMARY.md";
export const STATUS = new Set(["UNKNOWN","PARTIAL","TESTED","CONTROL_PROVEN","REGRESSED","BLOCKED"]);
export const METRIC_V2 = "krieger-total-control/v2-three-chain-100";
export const POLICY_V2 = "krieger-control-proof/v2-owner-verdict-separated";
const REQUIRED_CHAINS=["graphics","gameplay","nativeAuthoring"];

function statusOf(node,scope){
  return node?.[scope+"Status"] ?? node?.status;
}

function chainScore(nodes,scope,weight){
  if(!nodes.length)return 0;
  return nodes.filter(n=>statusOf(n,scope)==="CONTROL_PROVEN").length/nodes.length*weight;
}

export function computeLedger(ledger){
  const errors=[];
  const ids=new Set();
  const chains=ledger?.chains||{};
  const chainWeights=ledger?.scoring?.chainWeights||{};
  const metricVersion=ledger?.metricVersion||ledger?.scoring?.metricVersion||"legacy";
  const v2=metricVersion===METRIC_V2;
  const chainNames=v2?REQUIRED_CHAINS:Object.keys(chains);
  const nodes=[];

  for(const chain of chainNames){
    const list=chains[chain]||[];
    if(v2&&!Array.isArray(chains[chain]))errors.push(`missing required chain: ${chain}`);
    for(const node of list){
      if(!node?.id||ids.has(node.id))errors.push(`bad/duplicate node id: ${node?.id}`);
      ids.add(node.id);
      for(const scope of v2?["master","candidate"]:["candidate"]){
        const st=statusOf(node,scope);
        if(!STATUS.has(st))errors.push(`bad ${scope} status for ${node?.id}: ${st}`);
      }
      nodes.push({...node,chain});
    }
  }

  if(v2){
    const totalWeight=REQUIRED_CHAINS.reduce((sum,c)=>sum+Number(chainWeights[c]||0),0);
    if(Math.abs(totalWeight-100)>1e-9)errors.push(`chain weights must sum to 100, got ${totalWeight}`);
    if(nodes.length!==40)errors.push(`expected 40 v2 control nodes, got ${nodes.length}`);
    if(ledger?.policyVersion!==POLICY_V2)errors.push(`expected policyVersion ${POLICY_V2}`);
  } else if(nodes.length!==23) errors.push(`expected 23 legacy requested control nodes, got ${nodes.length}`);

  const score=(scope)=>v2
    ? REQUIRED_CHAINS.reduce((sum,c)=>sum+chainScore(chains[c]||[],scope,Number(chainWeights[c]||0)),0)
    : (nodes.length?nodes.filter(n=>statusOf(n,scope)==="CONTROL_PROVEN").length/nodes.length*100:0);

  const masterProven=nodes.filter(n=>statusOf(n,"master")==="CONTROL_PROVEN");
  const candidateProven=nodes.filter(n=>statusOf(n,"candidate")==="CONTROL_PROVEN");
  return{
    errors,nodes,masterProven,candidateProven,
    masterWeight:Number(score("master").toFixed(6)),
    candidateWeight:Number(score("candidate").toFixed(6)),
  };
}

export function renderSummary(ledger){
  const c=computeLedger(ledger);
  if(c.errors.length)throw new Error(c.errors.join("; "));
  const row=(node)=>`| ${node.label} | ${statusOf(node,"master")} | ${statusOf(node,"candidate")} | ${String(node.note||"").replace(/\|/g,"\\|")} |`;
  const candidate=ledger.currentCandidate||{};
  const scoring=ledger.scoring||{};
  const lines=[
    "# KRIEGER Total Control — Evidence Summary","",
    "Canonical source: `data/krieger-total-control-evidence-ledger.json`.","",
    `METRIC — **${ledger.metricVersion||"legacy"}**`,
    `POLICY — **${ledger.policyVersion||"legacy"}**`,
    `KRIEGER MASTER — **${c.masterWeight.toFixed(2)}%**`,
    `KRIEGER CANDIDATE — **${c.candidateWeight.toFixed(2)}%**`,"",
    "Only objective CONTROL_PROVEN weight contributes to K. Owner SUCCESS/FAILURE is a separate owner-only product verdict and never gates technical CONTROL_PROVEN.","",
    `Weights: render ${scoring.chainWeights?.graphics??"legacy"}, gameplay ${scoring.chainWeights?.gameplay??"legacy"}, native authoring ${scoring.chainWeights?.nativeAuthoring??"legacy"}; normalized total 100.`,"",
    `Master baseline: \`${ledger.git.masterBaseline}\``,
    `Evidence branch base: \`${ledger.git.evidenceBase}\``,
    `Pinned upstream: \`${ledger.git.pinnedUpstream}\``,
    `PR: #${ledger.git.pr??"PENDING"}`,"",
    "## Current candidate","",
    `- Branch: \`${candidate.branch||"UNKNOWN"}\``,
    `- Owner verdict: **${candidate.ownerVerdict||"UNSET"}**`,
    `- State: **${candidate.state||"UNKNOWN"}**`,
    `- Exact-head browser proof: **${candidate.browserProof||"PENDING"}**`,
    `- Exact-head process-tree proof: **${candidate.processTreeProof||"PENDING"}**`,"",
  ];
  const headings={graphics:"Render chain",gameplay:"Gameplay chain",nativeAuthoring:"Native Authoring chain"};
  for(const chain of REQUIRED_CHAINS){
    lines.push(`## ${headings[chain]}`,"","| Node | MASTER | CANDIDATE | Evidence summary |","| --- | --- | --- | --- |",...(ledger.chains[chain]||[]).map(row),"");
  }
  lines.push(
    "## Proven weight","",
    `MASTER CONTROL_PROVEN: ${c.masterProven.map(n=>n.label).join(", ")||"none"}.`,"",
    `CANDIDATE CONTROL_PROVEN: ${c.candidateProven.map(n=>n.label).join(", ")||"none"}.`,"",
    `MASTER proven weight: **${c.masterWeight.toFixed(2)}/100**.`,
    `CANDIDATE proven weight: **${c.candidateWeight.toFixed(2)}/100**.`,"",
    "Metric/policy migrations are score-neutral for session delta: baseline and current must be recomputed with the same metric version.",""
  );
  return lines.join("\n");
}

function runCli(){
  const ledger=JSON.parse(fs.readFileSync(LEDGER_PATH,"utf8"));
  const computed=computeLedger(ledger);
  if(computed.errors.length)throw new Error(computed.errors.join("; "));
  if(
    Math.abs(Number(ledger.computed?.masterWeight)-computed.masterWeight)>1e-6||
    Math.abs(Number(ledger.computed?.candidateWeight)-computed.candidateWeight)>1e-6||
    ledger.computed?.totalNodes!==computed.nodes.length
  )throw new Error("ledger computed totals are stale");

  const expected=renderSummary(ledger).trimEnd();
  if(process.argv.includes("--write"))fs.writeFileSync(SUMMARY_PATH,expected+"\n");
  else if(process.argv.includes("--check")){
    const actual=fs.readFileSync(SUMMARY_PATH,"utf8").trimEnd();
    if(actual!==expected)throw new Error("EVIDENCE_SUMMARY.md does not match canonical ledger");
    console.log(JSON.stringify({
      pass:true,metricVersion:ledger.metricVersion,policyVersion:ledger.policyVersion,
      totalNodes:computed.nodes.length,masterWeight:computed.masterWeight,candidateWeight:computed.candidateWeight,
      ownerVerdict:ledger.currentCandidate?.ownerVerdict||"UNSET"
    }));
  }else console.log(expected);
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(invoked)runCli();
