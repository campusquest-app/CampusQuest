# DiceBear avatar licenses (CampusQuest)

CampusQuest generates profile avatars with **[DiceBear](https://www.dicebear.com/)** using the npm packages `@dicebear/core` and `@dicebear/collection`. Runtime code is **MIT-licensed** (see each package’s `LICENSE` in `node_modules`).

The *art* for each avatar **style** has its own license. CampusQuest only ships styles available through `@dicebear/collection@9.x`; below are the styles exposed in the creator UI and a short license summary. For authoritative terms, follow the **License** links (and retain attribution where **CC BY 4.0** applies).

## Packages (code)

| Package | License |
|---------|---------|
| `@dicebear/core` | MIT |
| `@dicebear/collection` | MIT (metapackage; re-exports style packages, each MIT) |

## Avatar styles used in-app

| Style ID | Design license (summary) | Notes |
|----------|---------------------------|-------|
| `lorelei` | **CC0 1.0** (public domain dedication) | Very permissive. |
| `loreleiNeutral` | **CC0 1.0** | Very permissive. |
| `pixelArt` | **CC0 1.0** | Very permissive. |
| `pixelArtNeutral` | **CC0 1.0** | Very permissive. |
| `openPeeps` | **CC0 1.0** | Very permissive. |
| `adventurer` | **CC BY 4.0** | Commercial use allowed; **attribution required** (credit designer / license). |
| `adventurerNeutral` | **CC BY 4.0** | Same as above. |
| `micah` | **CC BY 4.0** | Same as above. |

License lines above are summarized from the DiceBear style headers in `node_modules/@dicebear/<style>/lib/index.d.ts` (generated metadata).

## Practical guidance for product/commercial use

- **CC0** styles can be used with minimal obligation; still good practice to credit DiceBear/docs if you publish marketing about the feature.
- **CC BY 4.0** styles require **attribution** in your app or materials (e.g. credits section, marketing page, or in-app “Avatar art” link). Include the designer credit and CC BY 4.0 as DiceBear’s style metadata indicates.

This document is **not legal advice**. When in doubt, confirm with your counsel or use **CC0-only** styles in the picker if you want the simplest compliance story.
