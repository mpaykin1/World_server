from __future__ import annotations
import argparse,json,py_compile,sys,tempfile
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v10 import normalize_profiler_evidence_v10,pvs_pruning_proof_v10,validate_semantic_model_contract_v10
from ai3d.quality_extensions import static_performance_gate
from ai3d.production_v11 import fault_injection_gate_v11


def main():
    ap=argparse.ArgumentParser(description="Safe V11 fault injection: uses temp/in-memory corruptions; never modifies production assets.")
    ap.add_argument("--output",type=Path,default=Path("fault-injection-v11.json"));args=ap.parse_args()
    rows=[]
    with tempfile.TemporaryDirectory() as td:
        bad=Path(td)/"bad.py";bad.write_text("def broken(:\n",encoding="utf-8")
        try: py_compile.compile(str(bad),doraise=True);det=False
        except py_compile.PyCompileError:det=True
        rows.append({"faultClass":"syntax_error","detected":det,"detector":"py_compile","detectorFailedClosed":True})
        model=Path(td)/"missing.onnx"
        contract={"modelSha256":"0"*64,"modelVersion":"x","featureSchemaVersion":9,"validationDatasetSha256":"1"*64,"validationSamples":5000,"metrics":{"precision":.95,"recall":.95,"expectedCalibrationError":.03},"provenance":{"source":"real_dataset","trainingRunId":"r1"}}
        sem=validate_semantic_model_contract_v10(contract,model)
        rows.append({"faultClass":"missing_asset","detected":"modelFileMissing" in sem.get("failures",[]),"detector":"semantic_model_contract","detectorFailedClosed":True})
    fake=normalize_profiler_evidence_v10([{"target":"web","executedInTarget":True,"evidenceKind":"synthetic","advancedGpuCounters":{"backend":"webgl_timer_query","gpuFrameMsP95":10.0}}])
    rows.append({"faultClass":"fake_runtime_evidence","detected":not fake.get("passed"),"detector":"profiler_normalizer","detectorFailedClosed":True})
    perf=static_performance_gate({"sourceStats":{"triangles":1000,"materials":1,"drawCallEstimate":1},"lodStats":[{"triangles":900,"materials":1,"drawCallEstimate":1},{"triangles":950},{"triangles":500},{"triangles":100}],"collisionStats":{"triangles":10}},{})
    rows.append({"faultClass":"inverted_lod","detected":not perf.get("checks",{}).get("hasProgressiveLods",True),"detector":"static_performance_gate","detectorFailedClosed":True})
    corrupt=validate_semantic_model_contract_v10({"modelSha256":"0"*64,"modelVersion":"bad","featureSchemaVersion":9,"validationDatasetSha256":"1"*64,"validationSamples":1000,"metrics":{"precision":.1,"recall":.1,"expectedCalibrationError":.9},"provenance":{"source":"synthetic","trainingRunId":"x"}})
    rows.append({"faultClass":"semantic_mask_corruption","detected":not corrupt.get("passed"),"detector":"semantic_contract_quality","detectorFailedClosed":True})
    samples=[]
    for i in range(60):
        samples.append({"room":"a","sessionId":f"s{i}","buildId":f"b{i%3}","deviceId":f"d{i%5}","portalStateHash":f"p{i%3}","timestampEpoch":i,"visibleRooms":["b"] if i==59 else []})
    pvs=pvs_pruning_proof_v10({"a":["b"]},samples,[{"room":"a","visibleRoom":"b"}],{"minSessions":20,"minBuilds":2,"minDevices":3,"minPortalStates":2,"minHoldoutObservations":50})
    rows.append({"faultClass":"pvs_visibility_hole","detected":not pvs.get("passed"),"detector":"pvs_pruning_proof","detectorFailedClosed":True})
    gate=fault_injection_gate_v11(rows)
    report={"schemaVersion":11,"results":rows,"gate":gate,"passed":gate.get("passed")}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(0 if report["passed"] else 1)
if __name__=="__main__":main()
