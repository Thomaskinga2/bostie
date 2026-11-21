"use client";
import { BookMarked, Compass, Gamepad2, House, ScanLine } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

const TABS = [
  { href: "/", label: "Home", Icon: House },
  { href: "/explore", label: "Explore", Icon: Compass },
  { href: "/scan", label: "Scan", Icon: ScanLine },
  { href: "/play", label: "Play", Icon: Gamepad2 },
  { href: "/passport", label: "Passport", Icon: BookMarked },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="relative z-30 shrink-0 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur framed:pb-[18px]"
    >
      <ul className="flex h-[66px] items-stretch px-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" || pathname === "/journey" : pathname.startsWith(href);
          const scan = href === "/scan";
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("flex h-full flex-col items-center justify-end gap-[3px] pb-2 text-[11px] font-semibold", active ? "text-forest" : "text-ink-faint")}
              >
                {scan ? (
                  <span className={cx("grid size-[42px] place-items-center rounded-full text-paper shadow-lift transition", active ? "bg-forest-deep" : "bg-forest")}>
                    <Icon size={22} strokeWidth={2.3} aria-hidden />
                  </span>
                ) : (
                  <Icon size={23} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                )}
                <span>{label}</span>
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
