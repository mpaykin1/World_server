(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WorldServerFixedViewport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STYLE_ID = "world-server-fixed-game-viewport";

  const CSS_TEXT = [
    "html,body{position:fixed!important;inset:0!important;margin:0!important;padding:0!important;",
    "width:100%!important;height:var(--ws-game-h,100dvh)!important;min-width:100%!important;",
    "min-height:0!important;overflow:hidden!important;overscroll-behavior:none!important;",
    "touch-action:none!important;-webkit-overflow-scrolling:auto!important;",
    "-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}",
    "[data-world-game-root]{position:fixed!important;left:0!important;top:0!important;width:100%!important;",
    "height:var(--ws-game-h,100dvh)!important;overflow:hidden!important;overscroll-behavior:none!important;",
    "touch-action:none!important;}",
    "[data-world-game-canvas]{position:absolute!important;left:0!important;top:0!important;width:100%!important;",
    "height:var(--ws-game-h,100dvh)!important;max-width:none!important;max-height:none!important;",
    "touch-action:none!important;overscroll-behavior:none!important;}"
  ].join("");

  function viewportHeight(win, doc) {
    return Math.max(1, Math.round(
      (win.visualViewport && win.visualViewport.height) ||
      win.innerHeight ||
      doc.documentElement.clientHeight ||
      1
    ));
  }

  function install(options = {}) {
    const win = options.window || (typeof window !== "undefined" ? window : null);
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    if (!win || !doc || !doc.documentElement || !doc.body) {
      throw new Error("FixedGameViewport requires window and document");
    }

    let style = doc.getElementById ? doc.getElementById(STYLE_ID) : null;
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS_TEXT;
      (doc.head || doc.documentElement).appendChild(style);
    }

    let last = null;
    let guarding = false;

    function sync() {
      const h = viewportHeight(win, doc);
      doc.documentElement.style.setProperty("--ws-game-h", h + "px");
      doc.documentElement.scrollTop = 0;
      doc.body.scrollTop = 0;
      if (!guarding && (win.scrollX || win.scrollY)) {
        guarding = true;
        try { win.scrollTo(0, 0); } finally { guarding = false; }
      }
      last = {
        height: h,
        scrollX: Number(win.scrollX || 0),
        scrollY: Number(win.scrollY || 0),
        rootScrollHeight: Number(doc.documentElement.scrollHeight || 0),
        bodyScrollHeight: Number(doc.body.scrollHeight || 0)
      };
      return last;
    }

    const prevent = event => {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
    };
    const onScroll = () => {
      if (!guarding && (win.scrollX || win.scrollY)) sync();
    };

    doc.addEventListener("touchmove", prevent, { passive: false, capture: true });
    ["gesturestart", "gesturechange", "gestureend"].forEach(type =>
      doc.addEventListener(type, prevent, { passive: false, capture: true })
    );
    win.addEventListener("scroll", onScroll, { passive: true });
    win.addEventListener("resize", sync, { passive: true });
    if (win.visualViewport) {
      // Browser chrome movement may emit visualViewport scroll while layout
      // is settling. Writing height/scroll state from that event can create
      // a feedback loop on iOS. Resize is the authoritative height signal;
      // document scroll is guarded independently below.
      win.visualViewport.addEventListener("resize", sync, { passive: true });
    }

    sync();

    return {
      sync,
      snapshot: () => last && { ...last },
      destroy() {
        doc.removeEventListener("touchmove", prevent, true);
        ["gesturestart", "gesturechange", "gestureend"].forEach(type =>
          doc.removeEventListener(type, prevent, true)
        );
        win.removeEventListener("scroll", onScroll);
        win.removeEventListener("resize", sync);
        if (win.visualViewport) {
          win.visualViewport.removeEventListener("resize", sync);
        }
      }
    };
  }

  return { STYLE_ID, CSS_TEXT, install, viewportHeight };
});
