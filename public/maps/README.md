# URI Campus Map

The Realm uses the official University of Rhode Island Kingston campus map as the **primary map layer**.

- **File:** `uri-campus-map.png`
- **Source:** [URI Kingston Campus Map (PDF)](https://web.uri.edu/wp-content/uploads/sites/904/URI-KingstonCampusMap-Web-FINAL.pdf) — map current as of August 2025

## Render layers (bottom → top)

1. URI campus map (`RealmCampusMapLayer`)
2. Building footprints (`RealmFootprintsLayer`)
3. Paths / walkways (`RealmPathsLayer`)
4. Location pins (`RealmMap`)
5. Quest glow (on pins with active quests)
6. Bottom sheet (on tap)

## Admin calibration

Marker positions (`x`, `y` percentages), footprints, and paths live in:

- `lib/realm/locations.ts` — landmarks and markers
- `lib/realm/mapGeometry.ts` — building footprints and walkway traces

Open The Realm with `?realm_calibrate=1` to show the full-opacity reference map with a dashed outline.

Debug layer state with `?realm_debug=1` (also logs to the browser console in development).

Replace `uri-campus-map.png` when URI publishes an updated campus map, then re-verify marker positions.
