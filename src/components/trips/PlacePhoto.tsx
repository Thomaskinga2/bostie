"use client";
// A picture for a place: Google's photo when there is one, Bostie's own catalogue photo
// when the place is one it knows, otherwise a quiet tile with an icon. Never a stock image.
import { Coffee, Landmark, MapPin, ShoppingBag, Trees, Utensils, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ZoomImage, ZoomPhoto } from "@/components/Lightbox";
import { cx, Photo } from "@/components/ui";
import type { TripPlace } from "@/lib/contracts";
import { cataloguePhoto } from "@/lib/trips";

const ICONS: [RegExp, LucideIcon, string][] = [
  [/cafe|coffee|bakery|tea/i, Coffee, "#7c4a2d"],
  [/restaurant|food|pizza|bar|pub|diner|kitchen|grill/i, Utensils, "#b4532a"],
  [/park|garden|trail|beach|outdoor/i, Trees, "#2f7d4f"],
  [/shop|store|market|mall|book/i, ShoppingBag, "#7b5ea7"],
  [/museum|landmark|historic|church|monument|library|hall/i, Landmark, "#1f4b3a"],
];

/** `zoom` lets the rider tap the picture to see it full screen (for the large one on a stop's details). */
export function PlacePhoto({ place, className, zoom }: { place: Pick<TripPlace, "id" | "name" | "lat" | "lng" | "photo" | "category" | "provider">; className?: string; zoom?: boolean }) {
  const [failed, setFailed] = useState(false);
  const known = cataloguePhoto(place);
  // Bostie's own licensed photo first; then Google's, by reference or looked up from the place id.
  const src = place.photo ? `/api/trips/photo?ref=${encodeURIComponent(place.photo)}` : place.provider === "google" ? `/api/trips/photo?id=${encodeURIComponent(place.id)}` : null;
  if (!known && src && !failed && zoom) return <ZoomImage src={src} alt={place.name} className={cx("bg-sand", className)} />;
  if (!known && src && !failed) {
    return (
      <div className={cx("overflow-hidden bg-sand", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied Google place photo, already sized */}
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="size-full object-cover" />
      </div>
    );
  }
  if (known) return zoom ? <ZoomPhoto id={known} credit={false} className={className} alt={place.name} /> : <Photo id={known} credit={false} className={className} />;
  const [, Icon, color] = ICONS.find(([re]) => re.test(`${place.category ?? ""} ${place.name}`)) ?? [null, MapPin, "#4d564f"];
  return (
    <div className={cx("grid place-items-center", className)} style={{ background: `${color}22` }} aria-hidden>
      <Icon size={26} style={{ color }} />
    </div>
  );
}

export const priceText = (p: Pick<TripPlace, "priceLevel" | "priceRange">) =>
  p.priceRange ? `$${p.priceRange.low} to $${p.priceRange.high}` : p.priceLevel === 0 ? "Free" : p.priceLevel ? "$".repeat(p.priceLevel) : null;
