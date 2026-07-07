# The Realm map — manual QA checklist

Use this after changes to the Realm map, markers, directions, or location sheet.

## Map load & navigation

- [ ] Open The Realm tab — map loads with 3D campus view (or flat fallback if unsupported)
- [ ] Leave The Realm and return — map is visible (no permanent loading overlay)
- [ ] Switch tabs quickly — no duplicate map instances or console errors

## Markers & editor

- [ ] CQ custom markers render with pulse/glow (quest, event, hot locations)
- [ ] Admin creates a marker — appears on map after save
- [ ] Admin drags marker — position persists after reload
- [ ] Quest linked to location appears on map
- [ ] No duplicate markers for the same building

## Location sheet

- [ ] Tap marker — bottom sheet opens with name, type badge, stats
- [ ] Swipe down on sheet — panel follows finger; releases past threshold closes smoothly
- [ ] While swiping sheet, map does not pan behind it
- [ ] Walk here / View memories / Start quest / View events buttons work

## Directions

- [ ] Tap Walk here — route draws; walking time and distance shown
- [ ] More options → driving mode works for long routes
- [ ] Open in Google Maps link works
- [ ] Deny location permission — Quad/campus center fallback still routes

## Camera (Safari/iOS)

- [ ] Tilt toggle (flat ↔ cinematic) does not crash Safari
- [ ] Rotate left/right and reset camera work
- [ ] Selected marker fly-to centers map smoothly

## Mobile Safari / PWA

- [ ] Marker animations run (no frozen pins)
- [ ] `prefers-reduced-motion` disables heavy marker motion
- [ ] Safe area respected on notched iPhones

## Data linking

- [ ] Memory at location appears in sheet and archive
- [ ] Event at location shows in sheet events section
- [ ] Location appears in memory creation dropdown and quest dropdowns
