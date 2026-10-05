# KX Graph Codec — byte-identical round trip

Before World Server writes new Krieger operator instances, it must prove that it can parse every compact document section and serialize it without drift.

The codec follows pinned `KDoc::Init` order:

`header/class table -> operator types+connections -> links -> class-sorted packed params -> animation bytecode -> events -> splines -> blobs`.

It parses graph connectivity and keeps exact raw payloads for lossless reconstruction. Its acceptance gate is strict: all pinned real donor `.kx` files must serialize **byte-for-byte identical** to their source.

This deliberately precedes mutation. New operator insertion remains disabled until this round-trip gate stays green.
