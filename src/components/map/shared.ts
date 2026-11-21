import type { LatLng } from "@/lib/geo";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: "station" | "landmark" | "saved" | "pin" | "answer" | "user";
  label: string;
  color?: string;
  done?: boolean;
};
export type MapLine = { id: string; color: string; path: LatLng[]; emphasis?: boolean; dashed?: boolean };

export type CityMapProps = {
  markers: MapMarker[];
  lines?: MapLine[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMapClick?: (p: LatLng) => void;
  center?: LatLng;
  /** Google-style zoom level (13 ≈ city, 15 ≈ neighbourhood). Both backends honour it. */
  zoom?: number;
  /** Frame these points instead of using center/zoom. */
  fit?: LatLng[];
  className?: string;
};

// Marker inks, shared by both backends so a place looks the same on either map.
export const INK = "#1d2320";
export const CARD = "#fffcf4";
export const FOREST = "#1f4b3a";
export const GOLD = "#b8862b";
export const GOLD_SOFT = "#f3e3b8";
export const USER_BLUE = "#2a6fdb";

/** Teardrop pin whose tip sits at the origin. */
export const PIN_PATH = "M0,0C-3,-9 -10,-13 -10,-21a10,10 0 1 1 20,0C10,-13 3,-9 0,0z";
export const BOOKMARK_PATH = "M-6,-8h12v16l-6,-4.5l-6,4.5z";
