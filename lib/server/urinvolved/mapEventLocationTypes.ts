import type { RealmLocationId } from "@/lib/realm/locations";

export type CatalogLocationLike = {
  slug: string;
  name: string;
};

export type UriAliasTarget = {
  name: string;
  latitude?: number;
  longitude?: number;
};

export const URI_LOCATION_ALIASES: Record<string, UriAliasTarget> = {
  "weldin hall": { name: "Weldin Hall", latitude: 41.4908, longitude: -71.5294 },
  "weldin hall first floor lounge": { name: "Weldin Hall", latitude: 41.4908, longitude: -71.5294 },
  "weldin hall lounge": { name: "Weldin Hall", latitude: 41.4908, longitude: -71.5294 },
  "weldin lounge": { name: "Weldin Hall", latitude: 41.4908, longitude: -71.5294 },
  "weldin": { name: "Weldin Hall", latitude: 41.4908, longitude: -71.5294 },
  "swan hall": { name: "Swan Hall", latitude: 41.48725, longitude: -71.5317 },
  "swan auditorium": { name: "Swan Hall", latitude: 41.48725, longitude: -71.5317 },
  "edwards hall": { name: "Edwards Hall", latitude: 41.4887, longitude: -71.53065 },
  "edwards auditorium": { name: "Edwards Hall", latitude: 41.4887, longitude: -71.53065 },
  "chafee hall": { name: "Chafee Hall", latitude: 41.488, longitude: -71.5292 },
  "chafee social science center": { name: "Chafee Hall", latitude: 41.488, longitude: -71.5292 },
  "white hall": { name: "White Hall", latitude: 41.4895, longitude: -71.5285 },
  "green hall": { name: "Green Hall", latitude: 41.4869, longitude: -71.5323 },
  "roosevelt hall": { name: "Roosevelt Hall", latitude: 41.4876, longitude: -71.5309 },
  "washburn hall": { name: "Washburn Hall", latitude: 41.4873, longitude: -71.5304 },
  "lippitt hall": { name: "Lippitt Hall", latitude: 41.4869, longitude: -71.53 },
  "ranger hall": { name: "Ranger Hall", latitude: 41.4863, longitude: -71.5312 },
  "ranger": { name: "Ranger Hall", latitude: 41.4863, longitude: -71.5312 },
  "bliss hall": { name: "Bliss Hall", latitude: 41.4872, longitude: -71.5283 },
  "kelley hall": { name: "Kelley Hall", latitude: 41.487, longitude: -71.5288 },
  "pastore hall": { name: "Pastore Hall", latitude: 41.4866, longitude: -71.5294 },
  "beaupre center": { name: "Beaupre Center", latitude: 41.4853, longitude: -71.5301 },
  "beaupre": { name: "Beaupre Center", latitude: 41.4853, longitude: -71.5301 },
  "avedisian hall": { name: "Avedisian Hall", latitude: 41.4848, longitude: -71.5309 },
  "quinn hall": { name: "Quinn Hall", latitude: 41.4881, longitude: -71.5301 },
  "hope commons": { name: "Hope Commons", latitude: 41.4891, longitude: -71.5295 },
  "mainfare": { name: "Hope Commons", latitude: 41.4891, longitude: -71.5295 },
  "butterfield hall": { name: "Butterfield Hall", latitude: 41.4862, longitude: -71.5284 },
  "butterfield": { name: "Butterfield Hall", latitude: 41.4862, longitude: -71.5284 },
  "browning hall": { name: "Browning Hall", latitude: 41.4906, longitude: -71.5288 },
  "hillside hall": { name: "Hillside Hall", latitude: 41.4917, longitude: -71.5276 },
  "hillside": { name: "Hillside Hall", latitude: 41.4917, longitude: -71.5276 },
  "brookside hall": { name: "Brookside Hall", latitude: 41.492, longitude: -71.527 },
  "keaney gymnasium": { name: "Keaney Gym", latitude: 41.4853, longitude: -71.5319 },
  "keaney gym": { name: "Keaney Gym", latitude: 41.4853, longitude: -71.5319 },
  "keaney": { name: "Keaney Gym", latitude: 41.4853, longitude: -71.5319 },
  "meade stadium": { name: "Meade Stadium", latitude: 41.4844, longitude: -71.5328 },
  "boss arena": { name: "Boss Ice Arena", latitude: 41.4838, longitude: -71.5309 },
  "boss ice arena": { name: "Boss Ice Arena", latitude: 41.4838, longitude: -71.5309 },
  "higgins welcome center": { name: "Higgins Welcome Center", latitude: 41.4842, longitude: -71.5264 },
  "ryan center": { name: "Ryan Center", latitude: 41.4865, longitude: -71.5298 },
  "mackal": { name: "Rec Center" },
  "mackal field house": { name: "Rec Center" },
  "memorial union": { name: "Memorial Union" },
  "mu": { name: "Memorial Union" },
  "carothers library": { name: "Library" },
  "robert l carothers library": { name: "Library" },
  "uri library": { name: "Library" },
  "library": { name: "Library" },
  "the quad": { name: "The Quad" },
  "quad": { name: "The Quad" },
  "quadrangle": { name: "The Quad" },
  "rec center": { name: "Rec Center" },
  "recreation center": { name: "Rec Center" },
  "fascitelli fitness": { name: "Rec Center" },
  "engineering hall": { name: "Engineering Hall" },
  "fascitelli center for advanced engineering": { name: "Engineering Hall" },
  "ballentine hall": { name: "Business Building" },
  "ballentine": { name: "Business Building" },
  "college of business": { name: "Business Building" },
  "rams den": { name: "Rams Den" },
  "ram s den": { name: "Rams Den" },
};

export type EventLocationMatch =
  | {
      kind: "realm";
      realmLocationId: RealmLocationId | string;
      locationName: string;
      matchedText: string;
    }
  | {
      kind: "coords";
      locationName: string;
      latitude: number;
      longitude: number;
      matchedText: string;
    };
