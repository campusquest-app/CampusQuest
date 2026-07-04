"use client";

import { memo } from "react";
import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Cog,
  Crown,
  Dumbbell,
  Image,
  MapPin,
  Palette,
  QrCode,
  Scroll,
  Star,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { MarkerIconKind } from "@/lib/realm/realmMarkerVisuals";

const ICON_MAP: Record<MarkerIconKind, LucideIcon> = {
  book: BookOpen,
  building: Building2,
  briefcase: Briefcase,
  star: Star,
  utensils: Utensils,
  dumbbell: Dumbbell,
  cog: Cog,
  palette: Palette,
  "map-pin": MapPin,
  scroll: Scroll,
  crown: Crown,
  calendar: Calendar,
  image: Image,
  qr: QrCode,
  wrench: Wrench,
};

export const RealmMarkerIcon = memo(function RealmMarkerIcon({ kind }: { kind: MarkerIconKind }) {
  const Icon = ICON_MAP[kind];
  return <Icon className="cq-realm-marker-icon" strokeWidth={2.25} aria-hidden />;
});
