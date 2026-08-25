from __future__ import annotations
import argparse,json
from ai3d.texture_runtime_v10 import MaterialProvenanceGraph
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('--lineage',required=True); a=p.parse_args(); print(json.dumps(MaterialProvenanceGraph(a.db).lineage(a.lineage),indent=2))
