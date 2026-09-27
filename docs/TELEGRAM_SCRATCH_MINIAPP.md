# Telegram Scratch Mini App — explicit beta release

This is the **approved Scratch art and Scratch game**, running inside Telegram Web Apps. It is not a new game simulator and is **not** Golden-certified. The existing text bot and graphic Scratch game intentionally have separate saved worlds until authenticated state synchronization is built.

## The two distinct URLs are intentional

- **Telegram Web App shell:** `https://world-server.mmmpaykin.workers.dev/apps/telegram-miniapp/` — Cloudflare Worker. It calls Telegram's WebApp `ready()`, `expand()`, and supported fullscreen APIs, and offers a fallback and a return-to-bot action. `MINIAPP_URL` always points to this shell.
- **Actual Scratch runtime:** `https://mpaykin1.github.io/scratch-chain-reaction/player/` — the same owner's Scratch source repository, published through GitHub Pages, embedded in the shell. It uses a locally bundled MPL-2.0 TurboWarp Scaffolding runtime plus the approved Scratch assets, with native responsive portrait and widescreen stages. There is no runtime request to turbowarp.org and no paid AI token usage.
- **Fallback compiled Scratch:** `https://mpaykin1.github.io/scratch-chain-reaction/miniapp/game.html`; SHA-256 `b9eb8fb77202c3a93228ea0c03dfd73ef7aa1f0aa5b37e9aca7a6974c03a8e01`, generated from approved Scratch source SHA-256 `8fe1553124471d126e1ff61928bfb4e9693c5c5a3473c88140eb82f8ff5e715e`, pinned @turbowarp/packager 3.13.0. This is deliberately outside the World Server pull request: its 4.86 MB generated HTML caused `git diff` to fail with `ENOBUFS` in the independent review gate. **The source changes remain fully independently reviewed.** Reproduce the offline build with `tools/build-telegram-scratch.cjs`.

The GitHub Pages runtime is a separately maintained, owner-controlled external dependency. Availability and exact asset SHA must be checked at release; this is not represented as an in-worker asset. If that origin fails, users can choose the fallback compiled game through the shell. The beta does not claim offline support.

## Controlled opt-in

The app is deliberately `visible: false`, `status: beta` in `data/app-release-registry.json` and must not appear in the general Golden-certified catalog. This does **not** imply the private Telegram `/game` command should be impossible: that command is an intentional **opt-in**, additionally gated with `TELEGRAM_MINIAPP_BETA_ENABLED='true'` in the production Worker environment. It defaults to **off**. Ordinary bot responses hide the Mini App button while off. Telegram groups never receive the opt-in.

Enable only after exact SHA Cloudflare production identity, 200 status at both URLs, native viewport coverage **over 85%** on desktop, mobile portrait and landscape, five visible choices, an actual player click affecting a Scratch variable, and successful signed Telegram webhook /game proof. Do not set app-registry `visible: true` without its separate Golden release process.

## Regression proof

`node --test test/telegram-game.test.mjs` checks hidden-beta rejection and enabled private /game action with the native `web_app.url` button. `test/telegram-miniapp.e2e.cjs` opens the wrapper in desktop Chrome and iPhone emulation, waits for the actual `window.__ownTurboWarp` runtime inside the cross-origin frame, measures the **Scratch canvas**, checks 85% minimum, all five visible choices and no JavaScript errors. The owner's Scratch repository also runs `test_selfhost_player.mjs` for iPhone portrait, iPhone landscape and desktop, with a real City selection (turn/population change). Always repeat browser tests against the deployed preview and production URL before sharing a playtest link.
