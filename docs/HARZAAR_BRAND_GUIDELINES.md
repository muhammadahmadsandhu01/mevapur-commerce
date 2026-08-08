# HARZAAR Brand Guidelines

## Identity

- Name: **HARZAAR**
- Pronunciation: **Har-Zaar**
- Tagline: **CHOOSE BEYOND.**
- Positioning: **A modern, configurable, multi-category commerce platform.**

HARZAAR is the current demo marketplace identity. It must not be described globally as only a dry-fruit, grocery, food, Pakistan-only, single-currency, single-provider, or single-hosting product. The live catalogue, inventory, edition, and provider configuration determine what is actually available.

## Logo system

The primary symbol is a geometric uppercase H with forward-arrow negative space. A cart or shopping bag must not replace it as the primary symbol.

- Horizontal logo: use for headers, navigation, authentication, documentation, and wider placements.
- Symbol: use where horizontal space is constrained.
- Favicon: use the dedicated 32 × 32 asset; do not scale down the horizontal wordmark.
- Light logo: use on Midnight Navy or another sufficiently dark, uncluttered surface.
- Dark logo: use on Off-White, white, or another sufficiently light surface.

Keep clear space around the logo equal to at least one quarter of the H symbol height. Do not let text, controls, or container edges enter that area.

Recommended minimum digital sizes:

- horizontal logo: 120 CSS pixels wide;
- standalone symbol: 24 CSS pixels high;
- favicon: use the dedicated asset at 16, 24, or 32 CSS pixels as the browser permits.

## Approved colours

| Role | Name | Hex |
|---|---|---|
| Primary | Midnight Navy | `#0B132B` |
| Accent | Amber Orange | `#FF8A00` |
| Surface | Off-White | `#F7F7F5` |
| Muted text/support | Cool Gray | `#6B7280` |

Use Midnight Navy and Off-White for primary text/background contrast. Amber Orange is an accent for focus, calls to action, and highlights; do not rely on orange alone to communicate status, and do not use it as small body text on a light surface without verifying contrast. Cool Gray is for secondary copy and requires contrast verification at the rendered size.

## Typography

Use a modern geometric sans-serif direction through the existing system-font stack. No external font request, font package, or embedded third-party font is required. Maintain readable weights, line height, and fallback behaviour across platforms.

## Incorrect usage

Do not:

- stretch, skew, rotate, outline, or recolour the logo outside the approved palette;
- remove the arrow negative-space concept;
- place the dark logo on a dark surface or the light logo on a light surface;
- use the wordmark at favicon scale;
- add unapproved shadows, gradients, slogans, or a cart/bag to the primary symbol;
- repeat `CHOOSE BEYOND.` on every screen;
- imply that every product or provider is always available;
- claim trademark registration or domain ownership.

## Accessibility

- Preserve the SVG title and meaningful image alternative text.
- Do not encode meaning through colour alone.
- Keep keyboard focus visible and use accessible names for linked logos and assistant controls.
- Test logo contrast in both light and dark themes.
- Respect zoom and responsive layouts; the logo must remain recognizable without clipping.

## Customer rebranding

Public identity is centralized in the storefront and admin branding configuration. A sold-customer identity should replace the brand values and assets through that public configuration layer, not by renaming API routes, cookies, tokens, provider IDs, database identities, migrations, or compatibility storage keys. Customer-owned contact details and production origins belong in the documented public configuration/environment boundary.

HARZAAR is a demo/default identity, not a permanent identity forced on every sold deployment. Trademark clearance, business-name clearance, and domain clearance remain pending and must be completed by the owner before commercial launch. No trademark registration or domain ownership is claimed here.
