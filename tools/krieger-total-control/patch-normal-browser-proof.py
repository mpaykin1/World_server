#!/usr/bin/env python3
"""Fail-closed proof-only patch for the pinned EngMesh normal upload path."""

import sys


DECLARATION = "  sInt vco = mesh->VertMap(sGMI_COLOR0);"
INSTRUMENTED_DECLARATION = """  sInt vco = mesh->VertMap(sGMI_COLOR0);
#if defined(__EMSCRIPTEN__)
  const sInt kkNormalProofMode = 0;
  sU32 kkNormalHash = 2166136261u;
#endif"""
ASSIGNMENT = """    outVert->sz = srcVert[vtn].z;
    outVert->c = PackColor (srcVert + vco);"""
INSTRUMENTED_ASSIGNMENT = """    outVert->sz = srcVert[vtn].z;
#if defined(__EMSCRIPTEN__)
    if(kkNormalProofMode)
    {
      outVert->nx = -outVert->nx;
      outVert->ny = -outVert->ny;
      outVert->nz = -outVert->nz;
    }
    sVector kkNormal;
    kkNormal.Init(outVert->nx,outVert->ny,outVert->nz,0);
    kkNormalHash = (kkNormalHash ^ PackVector(&kkNormal)) * 16777619u;
#endif
    outVert->c = PackColor (srcVert + vco);"""
COMPLETION = """    srcVert += mesh->VertSize();
    outVert++;
  }
}"""
INSTRUMENTED_COMPLETION = """    srcVert += mesh->VertSize();
    outVert++;
  }
#if defined(__EMSCRIPTEN__)
  fprintf(stderr,"[kk-normal] mode=%d vertices=%d hash=%u\\n",kkNormalProofMode,VertCount,kkNormalHash);
#endif
}"""

FUNCTION_START = "void EngMesh::FillVertexBuffer(GenMesh *mesh)\n{"
FUNCTION_END = "\n// Compute bounding boxes for all parts in the mesh"


def replace_once(source, old, new, error):
    if source.count(old) != 1:
        raise SystemExit(error)
    return source.replace(old, new)


def fill_vertex_buffer_section(source):
    if source.count(FUNCTION_START) != 1:
        raise SystemExit("pinned EngMesh::FillVertexBuffer function anchor drift")
    start = source.index(FUNCTION_START)
    end = source.find(FUNCTION_END, start)
    if end < 0:
        raise SystemExit("pinned EngMesh::FillVertexBuffer end anchor drift")
    section = source[start:end]
    if "sInt vnr = mesh->VertMap(sGMI_NORMAL);" not in section:
        raise SystemExit("pinned EngMesh::FillVertexBuffer normal map drift")
    return start, end, section


def main(argv):
    if len(argv) != 3 or argv[1] not in {"instrument", "invert", "restore"}:
        raise SystemExit("usage: patch-normal-browser-proof.py instrument|invert|restore engine.cpp")
    path = argv[2]
    source = open(path, encoding="utf-8").read()
    start, end, section = fill_vertex_buffer_section(source)
    if argv[1] == "instrument":
        section = replace_once(section, DECLARATION, INSTRUMENTED_DECLARATION, "pinned EngMesh::FillVertexBuffer normal anchor drift")
        section = replace_once(section, ASSIGNMENT, INSTRUMENTED_ASSIGNMENT, "pinned EngMesh::FillVertexBuffer normal assignment drift")
        section = replace_once(section, COMPLETION, INSTRUMENTED_COMPLETION, "pinned EngMesh::FillVertexBuffer normal completion drift")
    else:
        old, new = ((" = 0;", " = 1;") if argv[1] == "invert" else (" = 1;", " = 0;"))
        section = replace_once(section, "const sInt kkNormalProofMode" + old, "const sInt kkNormalProofMode" + new, "normal proof mode anchor drift")
    source = source[:start] + section + source[end:]
    open(path, "w", encoding="utf-8").write(source)


if __name__ == "__main__":
    main(sys.argv)
