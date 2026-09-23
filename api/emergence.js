'use strict';

// Vercel/local compatibility lane. Cloudflare routes /api/emergence directly
// to the dedicated Supabase Edge function, while other hosts reuse the
// already-hardened Voxel server actions.
module.exports = require('./voxel');
