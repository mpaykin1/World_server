# Krieger operator resolver

This tool bridges global native Krieger operator IDs to the file-local command indices required by the compact `.kx` document format.

It is derived from the pinned player parser in `KDoc::Init` and the real handler table in `player_kkrieger/kkrieger_oplist.cpp`.

It reads every upstream `.kx` donor in `data/`, measures `convention + packing` per real operator ID, then resolves each requested operator against a target document:

- `target-class`: operator already exists in the target class table, so its exact local command index is known.
- `class-extension`: operator is absent from the target but exactly one measured convention/packing variant exists in other pinned donor documents.
- missing/ambiguous: fail closed; do not serialize.

The resolver does **not** yet write modified `.kx` bytes. It provides the exact metadata that the serializer needs and prevents guessed conventions.
