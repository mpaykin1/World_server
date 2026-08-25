'use strict';
// Cross-platform helper to start World_server on port 3100 without shell quotes.
// LHCI's startServerCommand often uses shell forms like "PORT=3100 node server.js"
// which break on Windows and require shell quoting. This file is the canonical
// cross-platform entry: `node scripts/lhci-start-server.cjs` — no env prefix, no quotes.
// It sets PORT in-process and then loads the existing server.js which reads process.env.PORT.
process.env.PORT = '3100';
require('../server.js');
