#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {ROOT,shaFile,shaBuffer,readJSON,writeJSON,gitBranch,gitCommit,nowIso}=require('./integration-utils.cjs');
const started=nowIso();
function descriptor(rel){const abs=path.join(ROOT,rel);if(!fs.existsSync(abs))return null;return {name:rel,digest:{sha256:shaFile(abs)}}}
const graph=readJSON(path.join(ROOT,'CAS_INDEX.json'),{}),dr=readJSON(path.join(ROOT,'DISASTER_RECOVERY_STATUS.json'),{}),cap=descriptor('data/system-capability-registry.json'),pol=descriptor('policy/opa-bundle/worldserver.rego'),lock=descriptor('package-lock.json');
const buildSubject={schemaVersion:'2.0.0',commit:gitCommit(),branch:gitBranch(),merkleRoot:graph.root||null,latestSnapshot:dr.latestSnapshot||null,capabilityRegistry:cap?.digest?.sha256||null,policy:pol?.digest?.sha256||null};
writeJSON(path.join(ROOT,'INTEGRATION_BUILD_SUBJECT.json'),buildSubject);
const subject=[descriptor('INTEGRATION_BUILD_SUBJECT.json')].filter(Boolean);
const deps=[lock,cap,pol].filter(Boolean);if(gitCommit())deps.unshift({name:'git-commit',uri:`git+https://github.com/mpaykin1/World_server@${gitCommit()}`,digest:{sha1:gitCommit()}});if(graph.root)deps.push({name:'project-merkle-root',digest:{sha256:graph.root}});
const byproducts=['SYSTEM_INTEGRATION_REPORT.json','POLICY_DECISION_REPORT.json','DISASTER_RECOVERY_VERIFY_REPORT.json','TECHNOLOGY_CONSENSUS_REPORT.json','DURABLE_QUEUE_STATUS.json','INTEGRATION_TELEMETRY_STATUS.json'].map(descriptor).filter(Boolean);
const statement={_type:'https://in-toto.io/Statement/v1',subject,predicateType:'https://slsa.dev/provenance/v1',predicate:{buildDefinition:{buildType:'https://github.com/mpaykin1/World_server/blob/master/docs/buildtypes/system-integration-v2.md',externalParameters:{branch:gitBranch(),cpuFirst:true,gpuRequired:false,integrationLayer:'2.0.0'},internalParameters:{node:process.version,platform:process.platform,arch:process.arch},resolvedDependencies:deps},runDetails:{builder:{id:'https://github.com/mpaykin1/World_server/.github/workflows/system-integration-v2.yml@master',version:{integrationLayer:'2.0.0'}},metadata:{invocationId:process.env.GITHUB_RUN_ID?`${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT||'1'}`:`local-${Date.now()}-${process.pid}`,startedOn:started,finishedOn:nowIso()},byproducts}}};
writeJSON(path.join(ROOT,'SLSA_PROVENANCE.intoto.json'),statement);
const valid=statement._type==='https://in-toto.io/Statement/v1'&&statement.predicateType==='https://slsa.dev/provenance/v1'&&subject.length>0&&Boolean(statement.predicate.buildDefinition.buildType)&&Boolean(statement.predicate.runDetails.builder.id);
writeJSON(path.join(ROOT,'PROVENANCE_STATUS.json'),{schemaVersion:'2.0.0',generatedAt:nowIso(),pass:valid,statement:'SLSA_PROVENANCE.intoto.json',statementSha256:shaFile(path.join(ROOT,'SLSA_PROVENANCE.intoto.json')),signed:false,signatureNote:'Local provenance is generated and hash-bound. Add Sigstore/cosign signing only when a trusted key/OIDC identity is configured; unsigned provenance is never presented as signed.'});
console.log(`[PROVENANCE] ${valid?'PASS':'FAIL'} subjects=${subject.length} dependencies=${deps.length}`);if(!valid)process.exitCode=2;
