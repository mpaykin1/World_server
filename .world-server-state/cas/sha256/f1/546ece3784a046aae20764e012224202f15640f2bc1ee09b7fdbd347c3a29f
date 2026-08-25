from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v6 import aggregate_benchmark_results, build_benchmark_farm_plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', action='store_true')
    ap.add_argument('--results')
    ap.add_argument('--output', required=True)
    ap.add_argument('--repetitions', type=int, default=3)
    args = ap.parse_args()
    if args.results:
        data = json.loads(Path(args.results).read_text(encoding='utf-8'))
        rows = data if isinstance(data, list) else data.get('results', [])
        out = aggregate_benchmark_results(rows)
    else:
        out = build_benchmark_farm_plan(repetitions=args.repetitions)
    Path(args.output).write_text(json.dumps(out, indent=2), encoding='utf-8')
    print(json.dumps(out, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
