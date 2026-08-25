#!/usr/bin/env python3
"""Deprecated compatibility entrypoint. Installs the current V8 core; never downgrades quality."""
from install_v7_patch import main
if __name__=='__main__': raise SystemExit(main())
