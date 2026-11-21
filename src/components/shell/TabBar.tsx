"use client";
import { BookMarked, Compass, Map, TrainFront } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

// Four places. Scanning and Guess Boston are optional quests, reached from Discover.
const TABS = [
  { href: "/", label: "Map", Icon: Map, also: [] as string[] },
  { href: "/ride", label: "Ride", Icon: TrainFront, also: ["/journey"] },
  { href: "/discover", label: "Discover", Icon: Compass, also: ["/scan", "/play"] },
  { href: "/passport", label: "Passport", Icon: BookMarked, also: [] },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      data-tour="tabs"
      className="relative z-30 shrink-0 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur framed:pb-[18px]"
    >
      <ul className="flex h-[62px] items-stretch px-2">
        {TABS.map(({ href, label, Icon, also }) => {
          const active = href === "/" ? pathname === "/" : [href, ...also].some((p) => pathname.startsWith(p));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("flex h-full flex-col items-center justify-center gap-1 text-[11.5px] font-semibold", active ? "text-forest" : "text-ink-faint")}
              >
                <span className={cx("grid h-8 w-14 place-items-center rounded-full transition", active && "bg-moss")}>
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* iOS home indicator: decorative, desktop frame only */}
      <span aria-hidden className="absolute bottom-[7px] left-1/2 hidden h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink framed:block" />
    </nav>
  );
}
