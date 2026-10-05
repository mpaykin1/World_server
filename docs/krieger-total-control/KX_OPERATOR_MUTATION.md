# KX Operator Mutation v1

World Server can now append real native KOp instances to a current-format compact `.kx` document.

The mutation layer:

- requires the operator class to exist in the target class table;
- validates packed parameter bytes against the exact target convention/packing;
- enforces compact-KX backward-only input references;
- writes link indices, animation bytecode and blob payloads;
- updates the encoded operator count and optional root slots;
- reparses the mutated document;
- runs the byte-identical codec against the result.

The first real gate appends a native `Mesh_SingleVert (0xb3)` operator to a prepared `kkrieger3383.kx` without changing any root. That proves actual operator-instance serialization while keeping runtime behavior intentionally unchanged.

The next layer will map semantic authoring node parameters to packed operator payloads and emit connected multi-operator graphs.
