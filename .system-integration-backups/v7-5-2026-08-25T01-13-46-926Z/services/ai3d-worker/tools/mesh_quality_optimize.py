from pathlib import Path
from ai3d.plugins.mesh_quality_optimizer import MeshQualityOptimizer
import sys
if __name__=="__main__":
    src=Path(sys.argv[1]);job=Path(sys.argv[2]);job.mkdir(parents=True,exist_ok=True);r,l=MeshQualityOptimizer().prepare(src,job,{});print(r,*l)
