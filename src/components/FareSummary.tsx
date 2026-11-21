"use client";
// What a journey costs and how to pay for it. Information only: nothing here sells a
// ticket or takes a payment. Every figure comes from data/fares.ts via lib/fares.ts.
import { Banknote, ChevronDown, CreditCard, ExternalLink, IdCard, Smartphone, Ticket, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  BUS_FARE, CR_ZONE_FARE, FARE_SOURCES, FARES_VERIFIED_ON, FERRY_FARE, HOW_TO_PAY, PASSES, PAYMENT, REDUCED_FARE_INFO,
  type FareCategory, type PaymentId,
} from "@/data/fares";
import { formatFare, journeyFare } from "@/lib/fares";
import { lineOf, type Plan } from "@/lib/network";
import { cx, LinePill } from "./ui";

const ICON: Record<PaymentId, LucideIcon> = {
  contactless: CreditCard, wallet: Smartphone, charliecard: IdCard, charlieticket: Ticket, cash: Banknote, mticket: Smartphone, paper_ticket: Ticket,
};
const verified = new Date(`${FARES_VERIFIED_ON}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
const external = "inline-flex items-center gap-1 font-semibold text-forest underline underline-offset-2";

export function FareSummary({ plan, className }: { plan: Plan; className?: string }) {
  const [category, setCategory] = useState<FareCategory>("adult");
  const [open, setOpen] = useState(false);
  const quote = journeyFare(plan, category);
  const routes = [...new Map(plan.legs.map((l) => [lineOf(l.route), l.route])).values()];

  return (
    <section data-tour="fare-summary" aria-label="Fare" className={cx("overflow-hidden rounded-3xl border border-line bg-card shadow-card", className)}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13.5px] font-semibold text-ink-soft">
              {quote.status === "exact" ? "Fare, one way" : quote.status === "estimate" ? "Estimated fare, one way" : "Fare"}
            </p>
            <p className="font-display text-[38px] font-bold leading-none text-forest" data-testid="fare-total">{formatFare(quote.totalCents)}</p>
          </div>
          <div role="radiogroup" aria-label="Fare type" className="flex rounded-full bg-sand p-1">
            {(["adult", "reduced"] as const).map((c) => (
              <button key={c} role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={cx("h-8 rounded-full px-3 text-[13px] font-semibold capitalize", category === c ? "bg-card text-ink shadow-card" : "text-ink-soft")}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13.5px] text-ink-soft">
          {routes.map((r) => <LinePill key={r} route={r} />)}
          <span>{plan.legs.length > 1 ? "One subway fare covers every change on this trip." : "Subway fare."}</span>
        </p>

        <ul aria-label="Ways to pay" className="mt-3 flex flex-wrap gap-1.5">
          {quote.accepted.map((id) => {
            const Icon = ICON[id];
            return (
              <li key={id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-paper px-2.5 text-[12.5px] font-semibold">
                <Icon size={15} aria-hidden /> {PAYMENT[id].short}
              </li>
            );
          })}
        </ul>
      </div>

      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-12 w-full items-center justify-between border-t border-line px-4 text-[14.5px] font-semibold text-forest">
        {open ? "Hide fare details" : "Fare breakdown and how to pay"}
        <ChevronDown size={18} aria-hidden className={cx("transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="space-y-5 border-t border-line px-4 pb-5 pt-4 text-[14.5px] leading-snug">
              <div>
                <h3 className="text-[17px] font-bold">Breakdown</h3>
                <ul className="mt-1.5 divide-y divide-line">
                  {quote.lines.map((l, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        {l.label}
                        {l.note && <span className="block text-[13px] text-ink-soft">{l.note}</span>}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">{l.chargedCents === 0 ? "Free transfer" : formatFare(l.chargedCents)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 py-2 font-bold">
                    <span>Total, {category} one way</span>
                    <span className="tabular-nums">{formatFare(quote.totalCents)}</span>
                  </li>
                </ul>
                {quote.notes.map((n) => <p key={n} className="mt-1.5 text-[13.5px] text-ink-soft">{n}</p>)}
              </div>

              <div>
                <h3 className="text-[17px] font-bold">How to pay</h3>
                <ol className="mt-1.5 space-y-1.5">
                  {HOW_TO_PAY.subway.map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-forest text-[11px] font-bold text-paper">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[13.5px] text-ink-soft">
                  Accepted here: {quote.accepted.map((id) => PAYMENT[id].label).join("; ")}. The mTicket app is for Commuter Rail and ferries, not the subway.
                </p>
              </div>

              <div>
                <h3 className="text-[17px] font-bold">Reduced and free fares</h3>
                <p className="mt-1.5">{REDUCED_FARE_INFO.eligible} {REDUCED_FARE_INFO.free}</p>
                <a href={FARE_SOURCES.reduced} target="_blank" rel="noreferrer" className={cx(external, "mt-1.5")}>
                  Reduced fares on mbta.com <ExternalLink size={13} aria-hidden />
                </a>
              </div>

              <div>
                <h3 className="text-[17px] font-bold">Riding more today?</h3>
                <p className="mt-1.5">
                  A {PASSES[0].label} is {formatFare(PASSES[0].cents)} and covers {PASSES[0].covers}. A {PASSES[1].label} is {formatFare(PASSES[1].cents)}.
                </p>
              </div>

              <div>
                <h3 className="text-[17px] font-bold">Connecting to another service</h3>
                <ul className="mt-1.5 space-y-1.5">
                  <li>
                    <strong>Bus</strong>, {formatFare(BUS_FARE[0])}: included in your subway fare within two hours, with the same card or device.{" "}
                    <a href={FARE_SOURCES.bus} target="_blank" rel="noreferrer" className={external}>Bus fares</a>
                  </li>
                  <li>
                    <strong>Commuter Rail</strong>, {formatFare(CR_ZONE_FARE["1A"][0])} to {formatFare(CR_ZONE_FARE["10"][0])} by zone: needs its own ticket, and contactless is not accepted.{" "}
                    <a href={FARE_SOURCES.commuter_rail} target="_blank" rel="noreferrer" className={external}>Tickets and mTicket</a>
                  </li>
                  <li>
                    <strong>Ferry</strong>, {formatFare(FERRY_FARE.inner_harbor.price[0])} to {formatFare(FERRY_FARE.hingham_hull.price[0])} by route: contactless, mTicket or a paper ticket.{" "}
                    <a href={FARE_SOURCES.ferry} target="_blank" rel="noreferrer" className={external}>Ferry fares</a>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl bg-paper px-3.5 py-3">
                <p className="text-[13px] text-ink-soft">
                  Prices and rules from mbta.com, checked on {verified}. Fares can change, and Bostie does not sell tickets or take payments.
                </p>
                <a href={FARE_SOURCES.overview} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-forest text-[14.5px] font-semibold text-paper">
                  Official MBTA fares <ExternalLink size={15} aria-hidden />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
