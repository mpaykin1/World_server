# Krieger operator resolver

This tool bridges global native Krieger operator IDs to the file-local command indices required by the compact `.kx` document format.

It is derived from the pinned player parser in `KDoc::Init` and the real handler table in `player_kkrieger/kkrieger_oplist.cpp`.

It reads every upstream `.kx` donor in `data/`, measures `convention + packing` per real operator ID, then resolves each requested operator against a target document:

- `target-class`: operator already exists in the target class table, so its exact local command index is known.
- `class-extension`: operator is absent from the target but exactly one measured convention/packing variant exists in other pinned donor documents.
- missing/ambiguous: fail closed; do not serialize.

The resolver now also contains the first bounded native writer: it may append missing classes to the **end** of the compact `.kx` class table. Existing command indices therefore remain unchanged. The writer reparses its output and verifies that the binary tail after the class table is byte-identical.

It still does **not** insert new operator instances into the graph. The next serializer stage must encode op type/connection/link/parameter/animation sections and prove a real-document round-trip before arbitrary native game generation can be claimed.
