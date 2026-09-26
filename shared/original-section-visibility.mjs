export function originalFaceVisible(block, neighbor, full = value => value !== 0) { return block !== 0 && !full(neighbor); }
