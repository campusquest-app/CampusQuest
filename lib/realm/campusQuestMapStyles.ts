/**
 * Dark navy / glowing CQ blue theme for The Realm Google Map layer.
 * Hides default POI icons only — keeps street, building, and campus text labels.
 */
export const CQ_REALM_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#071A33" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#D8ECFF" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#03101F" }, { weight: 3 }] },

  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", elementType: "labels.icon", stylers: [{ visibility: "off" }] },

  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0B284A" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#064E5A" }] },

  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1B5D9E" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#4BAEFF" }, { weight: 0.8 }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#D9F0FF" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#041629" }] },

  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#071E3A" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#12365D" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#5DBBFF" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#092C43" }] },

  { featureType: "water", elementType: "geometry", stylers: [{ color: "#03284C" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

/** @deprecated Use CQ_REALM_MAP_STYLE */
export const CAMPUS_QUEST_MAP_STYLES = CQ_REALM_MAP_STYLE;

/** Map canvas color while tiles load — matches base geometry. */
export const CQ_REALM_MAP_BACKGROUND = "#071A33";
