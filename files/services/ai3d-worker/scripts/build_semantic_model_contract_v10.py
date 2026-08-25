from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path


def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()


def main():
    ap=argparse.ArgumentParser(description="Build an evidence contract for a real V10 3D semantic ONNX model. Metrics are required and are never invented.")
    ap.add_argument("--model",type=Path,required=True)
    ap.add_argument("--model-version",required=True)
    ap.add_argument("--validation-dataset-sha256",required=True)
    ap.add_argument("--validation-samples",type=int,required=True)
    ap.add_argument("--precision",type=float,required=True)
    ap.add_argument("--recall",type=float,required=True)
    ap.add_argument("--ece",type=float,required=True)
    ap.add_argument("--training-run-id",required=True)
    ap.add_argument("--source",default="real_training_pipeline")
    ap.add_argument("--output",type=Path,default=Path("semantic-model-contract-v10.json"))
    a=ap.parse_args()
    if not a.model.is_file():raise SystemExit("Model file does not exist")
    if len(a.validation_dataset_sha256)!=64:raise SystemExit("Validation dataset SHA-256 must be a 64-char hash")
    data={"modelSha256":sha256(a.model),"modelVersion":a.model_version,"featureSchemaVersion":9,"validationDatasetSha256":a.validation_dataset_sha256.lower(),"validationSamples":a.validation_samples,"metrics":{"precision":a.precision,"recall":a.recall,"expectedCalibrationError":a.ece},"provenance":{"source":a.source,"trainingRunId":a.training_run_id}}
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(data,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
