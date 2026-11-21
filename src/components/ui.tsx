"use client";
import {
  Camera, Eye, Flame, Gamepad2, Landmark, MapPin, Medal, Route, Shuffle, Sun, TrainFront, Trophy, type LucideIcon,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LINES, lineOf, STATION, type LineId } from "@/lib/network";
import { photoOf } from "@/lib/places";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const ICONS: Record<string, LucideIcon> = {
  train: TrainFront, camera: Camera, route: Route, landmark: Landmark, trophy: Trophy, eye: Eye, sun: Sun,
  shuffle: Shuffle, medal: Medal, flame: Flame, "map-pin": MapPin, gamepad: Gamepad2,
};
export function NamedIcon({ name, ...rest }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  const Icon = ICONS[name] ?? Medal;
  return <Icon aria-hidden {...rest} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "gold"; size?: "md" | "lg" | "sm" };
export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-45 disabled:active:scale-100",
        size === "lg" ? "h-14 px-7 text-[17px]" : size === "sm" ? "h-9 px-4 text-[14px]" : "h-12 px-6 text-[16px]",
        variant === "primary" && "bg-forest text-paper shadow-lift",
        variant === "secondary" && "border border-line bg-card text-ink",
        variant === "quiet" && "text-forest",
        variant === "gold" && "bg-gold text-forest-deep",
        className,
      )}
    />
  );
}

/** Says where a number came from. Simulated data is never dressed up as live. */
export function SourceBadge({ kind, className }: { kind: "live" | "estimated" | "simulated" | "offline"; className?: string }) {
  const label = { live: "Live MBTA", estimated: "Estimated", simulated: "Demo data", offline: "Offline" }[kind];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none",
        kind === "live" ? "bg-moss text-forest-deep" : kind === "simulated" ? "bg-gold-soft text-[#6a4b0c]" : "bg-sand text-ink-soft",
        className,
      )}
    >
      {kind === "live" && <span className="size-1.5 animate-pulse-dot rounded-full bg-t-green" />}
      {label}
    </span>
  );
}

export const lineColor = (line: LineId) => LINES[line].color;

export function LinePill({ route, className }: { route: string; className?: string }) {
  const line = lineOf(route);
  const branch = route.startsWith("Green-") ? ` ${route.slice(6)}` : "";
  return (
    <span
      className={cx("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-bold leading-none text-white", className)}
      style={{ background: LINES[line].color }}
    >
      {line === "Mattapan" ? "Mattapan" : `${line}${branch}`}
    </span>
  );
}

export function LineDots({ lines, size = 10 }: { lines: LineId[]; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {lines.map((l) => (
        <span key={l} className="rounded-full" style={{ width: size, height: size, background: LINES[l].color }} />
      ))}
    </span>
  );
}

/** Styled after MBTA platform signage: a charcoal band under a stripe in the line colour. */
export function StationSign({ id, children, className }: { id: string; children?: ReactNode; className?: string }) {
  const s = STATION[id];
  return (
    <div className={cx("overflow-hidden rounded-2xl bg-ink text-white", className)}>
      <div className="flex h-2">
        {s.lines.map((l) => (
          <div key={l} className="flex-1" style={{ background: LINES[l].color }} />
        ))}
      </div>
      <div className="px-4 pb-3.5 pt-3">
        <div className="text-[22px] font-bold leading-tight tracking-tight">{s.name}</div>
        {children}
      </div>
    </div>
  );
}

export function Meter({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cx("h-2 overflow-hidden rounded-full bg-sand", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color ?? "var(--color-forest)" }} />
    </div>
  );
}

/** A licensed Wikimedia Commons photo with its attribution. */
export function Photo({ id, className, credit = true, alt = "" }: { id: string; className?: string; credit?: boolean; alt?: string }) {
  const p = photoOf(id);
  if (!p) return <div className={cx("bg-sand", className)} />;
  return (
    <div className={cx("relative overflow-hidden bg-sand", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- hot-linked Commons thumbnails, already sized */}
      <img src={p.src} alt={alt} loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
      {credit && (
        <a
          href={p.source}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-0 right-0 max-w-[85%] truncate rounded-tl-lg bg-ink/65 px-2 py-1 text-[10px] leading-none text-white/90"
        >
          {p.credit}, {p.license}
        </a>
      )}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <h1 className="text-[32px] font-bold leading-[1.05]">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-ink-soft">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-5 py-7 text-center">
      <p className="font-display text-[19px] font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-[26ch] text-[14px] text-ink-soft">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const clockTime = (iso: string | number) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const shortDate = (at: number) => new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
