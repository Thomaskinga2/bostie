"use client";
// One map component, two backends: Google Maps when a key is configured and working,
// otherwise the built-in schematic SVG map. Screens only ever import from this file.
import { useState } from "react";
import { LINES, lineOf, PATTERNS, STATION } from "@/lib/network";
import { GoogleMap, googleFailed } from "./GoogleMap";
import { SvgMap } from "./SvgMap";
import type { CityMapProps, MapLine } from "./shared";

export type { CityMapProps, MapLine, MapMarker } from "./shared";

/**
 * Every MBTA rapid-transit pattern as a polyline in its line colour.
 * ponytail: straight segments between stations, not track geometry. Swap in the
 * MBTA /shapes polylines if the lines need to follow the streets on Google tiles.
 */
export const TRANSIT_LINES: MapLine[] = PATTERNS.map((p, i) => ({
  id: `${p.route}-${i}`,
  color: LINES[lineOf(p.route)].color,
  path: p.stops.map((id) => ({ lat: STATION[id].lat, lng: STATION[id].lng })),
}));

export function CityMap(props: CityMapProps) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [failed, setFailed] = useState(googleFailed);
  return key && !failed ? <GoogleMap {...props} apiKey={key} onFail={() => setFailed(true)} /> : <SvgMap {...props} />;
}
