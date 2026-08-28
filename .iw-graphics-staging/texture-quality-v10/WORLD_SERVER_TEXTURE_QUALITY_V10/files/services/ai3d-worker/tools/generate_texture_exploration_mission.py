from __future__ import annotations
import argparse, json
from pathlib import Path
from ai3d.texture_runtime_v6 import build_exploration_mission


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--positions')
    ap.add_argument('--bounds')
    ap.add_argument('--max-waypoints', type=int, default=24)
    ap.add_argument('--output', required=True)
    args = ap.parse_args()
    positions = json.loads(Path(args.positions).read_text(encoding='utf-8')) if args.positions else {}
    bounds = json.loads(Path(args.bounds).read_text(encoding='utf-8')) if args.bounds else None
    plan = build_exploration_mission(positions, bounds, args.max_waypoints)
    Path(args.output).write_text(json.dumps(plan, indent=2), encoding='utf-8')
    print(json.dumps(plan, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
