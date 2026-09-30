# Living Ink / ASQURA MVP success — 2026-09-30

## Result

The first public Living Ink / ASQURA MVP is working and externally reachable.

Public test URL:
https://mpaykin1.github.io/scratch-chain-reaction/living-ink-asqura/

Published scratch commit:
df9cae000f9f9ae8986661f3ed4b86a562baff89

World Server implementation branch:
ai/chatgpt/living-ink-asqura-vertical-slice

## What was proven

- one self-contained autonomous HTML
- no CDN, external JavaScript, external model, external texture, API or runtime dependency
- deterministic seeded Living Ink renderer
- cream paper background, blue-gray sketch lines, translucent watercolor-like fills, soft shadows and glass
- artistic distance LOD
- 10 procedurally differentiated office employees
- suit/shirt/tie/hair/accessory variation
- 13 reusable action labels including walk, sit, type, coffee, talk, meeting and printer
- 10 office prop/space classes including desks, computers, chairs, plants, coffee point, printer, lounge, meeting room, glass walls and pendant lights
- responsive portrait framing for phone screens
- drag-look and keyboard camera movement
- runtime remains alive after the browser is switched offline

## Public browser evidence

Desktop public load returned HTTP 200. Runtime exposed 10 employees, 10 prop classes and 13 actions. After network was disabled, the scene continued to animate.

Portrait browser test at 390x844 returned HTTP 200 and the same scene contract. The renderer remained alive offline.

The public artifact is a static GitHub Pages URL, not an expiring preview URL.

## Why this MVP succeeded

The previous slice was too sparse because the renderer existed but the scene did not contain enough visual information. The successful version kept the renderer but increased scene semantics rather than replacing the architecture: multiple glass office zones, workstation clusters, meeting area, lounge, coffee point, printer, plants, pendant lights and ten staff were all expressed through the same reusable Living Ink primitives.

The other important improvement was separating the visual target from photorealism. The renderer deliberately uses thin imperfect line passes, translucent low-saturation fills, paper texture, sparse distant detail and deterministic variation. This makes additional detail increase the architectural-sketch feeling instead of turning the result into a conventional 3D office.

Portrait framing was handled inside the renderer instead of by creating a second mobile scene. This preserved one artifact and one world recipe across desktop and phone.

The standalone compiler remains the source of truth. The published file is a compiled artifact, not a manually maintained second implementation.

## Known limitation

This is a graphics MVP, not a claim of 85% pixel-level identity to the supplied ASQURA reference. The main remaining quality gap is human anatomy/pose richness and the density of small office objects. The next visual step should improve those inside the existing renderer rather than start a new architecture.

## Rule for future chats

Do not replace this MVP with a new one-off canvas prototype. Reuse:
- shared/living-ink-core.js
- shared/living-ink-office.js
- lib/living-ink-compiler.js
- data/living-ink-office.recipe.json

Improve the same stack incrementally and keep the standalone/offline contract.
