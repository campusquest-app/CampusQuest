/** Arcane scanner glyph paths (24×24 viewBox, stroke-based hieroglyphics). */
export type RuneGlyphDef = {
  id: string;
  paths: string[];
  viewBox?: string;
};

export const RUNE_HIEROGLYPHS: RuneGlyphDef[] = [
  {
    id: "ring-break",
    paths: [
      "M12 4a8 8 0 0 1 8 8",
      "M12 20a8 8 0 0 0-6-2.2",
      "M12 12v4",
      "M8 10h2M14 14h2",
    ],
  },
  {
    id: "triad",
    paths: ["M12 4L20 18H4L12 4Z", "M12 11v3", "M10 15h4"],
  },
  {
    id: "crescent-staff",
    paths: ["M8 6c4-4 10-1 10 6s-6 10-10 6", "M12 4v16", "M6 12h2M16 12h2"],
  },
  {
    id: "angular-gate",
    paths: ["M5 8h14v8H5z", "M5 8l7 6 7-6", "M9 12h6"],
  },
  {
    id: "dot-constellation",
    paths: [
      "M6 6h.01M18 6h.01M6 18h.01M18 18h.01M12 12h.01",
      "M6 6l6 6M12 12l6 6M18 6L6 18",
    ],
  },
  {
    id: "broken-circle",
    paths: ["M12 5a7 7 0 0 1 7 7", "M12 19a7 7 0 0 0-5-3", "M7 12H5", "M17 12h2"],
  },
  {
    id: "vertical-runes",
    paths: ["M12 3v18", "M8 7v2M16 7v2", "M8 15v2M16 15v2", "M9 11h6"],
  },
  {
    id: "diamond-eye",
    paths: ["M12 5l6 7-6 7-6-7 6-7z", "M12 9a3 3 0 0 1 0 6", "M9 12h6"],
  },
  {
    id: "arc-ticks",
    paths: [
      "M6 14a8 8 0 0 1 12 0",
      "M8 10v2M12 8v2M16 10v2",
      "M12 16h.01",
    ],
  },
  {
    id: "sigil-cross",
    paths: ["M12 4v16", "M6 12h12", "M8 8l8 8", "M16 8L8 16"],
  },
  {
    id: "open-triangle",
    paths: ["M5 18L12 6l7 12", "M8 15h8", "M12 10v2"],
  },
  {
    id: "orbital",
    paths: ["M12 8a4 4 0 1 1 0 8", "M12 4h.01M12 20h.01", "M4 12h.01M20 12h.01"],
  },
  {
    id: "mark-chevron",
    paths: ["M7 8l5 4-5 4", "M14 8l5 4-5 4", "M12 5v2", "M12 17v2"],
  },
  {
    id: "shard",
    paths: ["M12 3l4 7-4 4-4-4 4-7z", "M10 14h4", "M11 17h2"],
  },
  {
    id: "lens-glyph",
    paths: [
      "M8 8a4 4 0 1 1 8 0 4 4 0 0 1-8 0",
      "M14 14l5 5",
      "M12 10h.01",
    ],
  },
];
