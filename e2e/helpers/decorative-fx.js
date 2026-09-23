// Runs inside the browser. This classifies known FX surfaces, not arbitrary HUD.
function decorativeFxIds() {
  return ['phaser4FxLayer', 'goldenCinematicPost'].filter(id => {
    const root = document.getElementById(id);
    if (!root || root.tagName !== 'DIV' || root.getAttribute('aria-hidden') !== 'true') return false;
    const nodes = [root, ...root.querySelectorAll('*')];
    if (root.textContent.trim() || nodes.some(el => getComputedStyle(el).pointerEvents !== 'none' ||
      el.matches('a,button,input,select,textarea,[tabindex],[contenteditable],[role="button"]'))) return false;
    const style = getComputedStyle(root);
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return false;
    if (id === 'goldenCinematicPost') return root.children.length === 0 && Number(style.opacity) <= .34;
    return style.backgroundImage === 'none' && [...root.children].every(el => el.tagName === 'CANVAS');
  });
}
module.exports = { decorativeFxIds };
