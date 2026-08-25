from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import RoutePredictorV2,build_route_prefetch_v2
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('route_json'); p.add_argument('--current',required=True); p.add_argument('--previous'); p.add_argument('--bandwidth',type=float,default=20); a=p.parse_args(); routes=json.load(open(a.route_json,encoding='utf-8')); m=RoutePredictorV2(a.db)
for r in routes: m.observe(r)
print(json.dumps(build_route_prefetch_v2(a.previous,a.current,m,{'bandwidthMbps':a.bandwidth},{'action':'KEEP'},{'pressure':0.3}),indent=2))
