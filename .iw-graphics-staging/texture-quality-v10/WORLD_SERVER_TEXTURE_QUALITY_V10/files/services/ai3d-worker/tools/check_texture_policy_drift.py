from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v6 import detect_policy_drift


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('baseline')
    ap.add_argument('current')
    ap.add_argument('--output', required=True)
    args = ap.parse_args()
    baseline = json.loads(Path(args.baseline).read_text(encoding='utf-8'))
    current = json.loads(Path(args.current).read_text(encoding='utf-8'))
    report = detect_policy_drift(baseline, current)
    Path(args.output).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    return 2 if report['driftDetected'] else 0

if __name__ == '__main__':
    raise SystemExit(main())
