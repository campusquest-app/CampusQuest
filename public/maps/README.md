# URI Campus Map

The Realm displays a **fantasy parchment skin** traced from the official University of Rhode Island Kingston campus map.

- **Display file:** `uri-campus-map-fantasy.jpg` — RPG-style rendition, same layout/aspect as the reference
- **Reference file:** `uri-campus-map.png` — used in calibration mode and as a runtime fallback
- **Source:** [URI Kingston Campus Map (PDF)](https://web.uri.edu/wp-content/uploads/sites/904/URI-KingstonCampusMap-Web-FINAL.pdf) — map current as of August 2025

Both images share the `100 × 77.25` coordinate space, so marker percentages calibrate against either.

## Render layers (bottom → top)

1. Campus map — fantasy skin, reference fallback (`RealmCampusMapLayer`)
2. Building footprints (`RealmFootprintsLayer`)
3. Paths / walkways (`RealmPathsLayer`)
4. Fantasy decorations — non-interactive (`RealmDecorLayer`)
5. Location pins (`RealmMap`)
6. Quest glow (on pins with active quests)
7. Bottom sheet (on tap)

## Admin calibration

Marker positions (`x`, `y` percentages), footprints, and paths live in:

- `lib/realm/locations.ts` — landmarks and markers
- `lib/realm/mapGeometry.ts` — building footprints and walkway traces

Open The Realm with `?realm_calibrate=1` to show the full-opacity reference map with a dashed outline.

Debug layer state with `?realm_debug=1` (admin accounts only; also auto-enables in development for admins).

Replace `uri-campus-map.png` when URI publishes an updated campus map, then re-verify marker positions.
