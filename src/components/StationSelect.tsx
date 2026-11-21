"use client";
import { LINES, MAIN_LINES, STATION, stationsOnLine } from "@/lib/network";
import { LineDots } from "./ui";

const GROUPS = [...MAIN_LINES, "Mattapan" as const].map((line) => ({
  line,
  stations: stationsOnLine(line).sort((a, b) => a.name.localeCompare(b.name)),
}));

/** Native picker (wheel on iOS, list on Android), grouped by line. */
export function StationSelect({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  return (
    <label className="relative flex h-14 items-center gap-3 px-4">
      <span className="w-10 shrink-0 text-[13px] font-semibold text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{STATION[value]?.name ?? "Choose a station"}</span>
      {STATION[value] && <LineDots lines={STATION[value].lines} />}
      <select
        aria-label={`${label} station`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {GROUPS.map((g) => (
          <optgroup key={g.line} label={LINES[g.line].name}>
            {g.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
