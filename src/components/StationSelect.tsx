"use client";
// Station field: type a few letters and pick from the suggestions.
// The list opens in the page flow, directly under the field, so it always stays
// inside the phone (a native <select> menu escapes the device frame on desktop).
import { useId, useState } from "react";
import { STATION, STATIONS, type Station } from "@/lib/network";
import { cx, LineDots } from "./ui";

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const INDEX = STATIONS.map((s) => ({ s, name: clean(s.name), words: clean(`${s.name} ${s.municipality} ${s.lines.join(" ")}`) }));
/** Shown before anything is typed: the busiest interchanges and terminals people start from. */
const STARTERS = ["place-pktrm", "place-dwnxg", "place-sstat", "place-north", "place-harsq", "place-kencl"];
const MAX = 6;

/** Best matches first: name starts with the text, then any word starts with it, then it appears anywhere. */
export function suggestStations(text: string): Station[] {
  const q = clean(text);
  if (!q) return STARTERS.map((id) => STATION[id]);
  const rank = (e: (typeof INDEX)[number]) =>
    e.name.startsWith(q) ? 0 : e.name.split(" ").some((w) => w.startsWith(q)) ? 1 : e.name.includes(q) ? 2 : e.words.includes(q) ? 3 : -1;
  return INDEX.map((e) => ({ e, r: rank(e) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.e.s.name.localeCompare(b.e.s.name))
    .slice(0, MAX)
    .map((x) => x.e.s);
}

export function StationSelect({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const id = useId();
  /** null = not editing: the field shows the chosen station. */
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const open = text !== null;
  const options = open ? suggestStations(text) : [];
  const current = STATION[value];

  const choose = (station: Station) => {
    onChange(station.id);
    setText(null);
  };

  return (
    <div className={cx("transition-colors", open && "bg-moss/40")}>
      <label className="flex h-14 items-center gap-3 px-4">
        <span className="w-10 shrink-0 text-[13px] font-semibold text-ink-faint">{label}</span>
        <input
          role="combobox"
          aria-label={`${label} station`}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-${options[active].id}` : undefined}
          value={open ? text : (current?.name ?? "")}
          placeholder={open ? `Type a station${current ? `, e.g. ${current.name}` : ""}` : "Type a station"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          onFocus={() => (setText(""), setActive(0))}
          onChange={(e) => (setText(e.target.value), setActive(0))}
          onBlur={() => setText(null)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && options[active]) {
              e.preventDefault();
              choose(options[active]);
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.currentTarget.blur();
            }
          }}
          // The row is highlighted while editing, so the default outline box is dropped here.
          style={{ outline: "none" }}
          className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold placeholder:font-normal placeholder:text-ink-faint"
        />
        {!open && current && <LineDots lines={current.lines} />}
      </label>

      {open && (
        <ul id={`${id}-list`} role="listbox" aria-label={`${label} station suggestions`} className="border-t border-line bg-card">
          {!clean(text) && <li role="presentation" className="px-4 pb-1 pt-2.5 text-[12.5px] font-semibold text-ink-faint">Popular stations</li>}
          {options.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-${s.id}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: it fires before the field loses focus and closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
                (document.activeElement as HTMLElement | null)?.blur();
              }}
              onMouseEnter={() => setActive(i)}
              className={cx("flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2", i === active && "bg-moss")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{s.name}</span>
                <span className="block truncate text-[12.5px] text-ink-soft">{s.municipality}</span>
              </span>
              <LineDots lines={s.lines} />
            </li>
          ))}
          {!options.length && <li role="presentation" className="px-4 py-3.5 text-[14.5px] text-ink-soft">No station matches “{text.trim()}”. Try the first few letters.</li>}
        </ul>
      )}
    </div>
  );
}
