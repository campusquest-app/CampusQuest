/**
 * CampusQuest Google Maps style (MapOptions.styles).
 *
 * Goal: Pokémon GO / Find My feel — rich campus structure (building outlines,
 * pedestrian paths, roads, parks, water) with zero Google clutter. Only POI
 * labels/icons and transit are hidden; structural geometry stays visible so
 * buildings like the Library, Memorial Union, Engineering, and the Ryan
 * Center read clearly. CampusQuest markers are the only interactive layer
 * (`clickableIcons: false` on the map).
 *
 * Note: this array only applies when the Map has no `mapId` (Google ignores
 * inline styles on Cloud-styled maps). This project intentionally uses the
 * in-code array so the style ships with the repo.
 */
export const CAMPUS_QUEST_MAP_BACKGROUND = "#0d1420";

export const CAMPUS_QUEST_MAP_STYLES: google.maps.MapTypeStyle[] = [
  // Base ground — dark navy, slightly lighter than the app background for depth.
  { elementType: "geometry", stylers: [{ color: "#131d2b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#93a5ba" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1420" }, { weight: 2 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },

  // ——— POIs: hide the clutter, keep the structure ———
  // No POI labels or icons anywhere (restaurants, cafes, shops, parking, attractions).
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  // Hide the tinted "business area" polygons that make the map feel commercial.
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", elementType: "geometry", stylers: [{ visibility: "off" }] },
  // Keep campus + athletics grounds visible for orientation.
  { featureType: "poi.school", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#1a2637" }] },
  { featureType: "poi.sports_complex", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#1c2b3d" }] },
  // Parks and greens — clearly readable grass.
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#15301f" }] },

  // No transit icons, stations, or lines.
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  // ——— Buildings ———
  // Building footprints noticeably lighter than the ground, with crisp outlines.
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#243349" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#4a5f7d" }, { weight: 1 }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#121b28" }] },

  // ——— Roads & pedestrian paths ———
  // Hierarchy: highways brightest, locals/footpaths still clearly visible.
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#aab9cd" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#42526e" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#556a8c" }, { weight: 0.8 }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#34425a" }] },
  // Local streets + campus walking paths/sidewalks render under road.local —
  // kept bright enough to trace the path network across campus.
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#2c3a50" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#8ba0b8" }] },

  // ——— Water ———
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f2942" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#54718f" }] },

  // ——— Administrative ———
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#7d8fa6" }] },
];
