"use client";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./ui";

const noop = () => () => {};

/** Renders into the phone screen's overlay layer, so dialogs never escape the device frame. */
export function Overlay({ children }: { children: ReactNode }) {
  const root = useSyncExternalStore(noop, () => document.getElementById("overlay-root"), () => null);
  return root ? createPortal(children, root) : null;
}

export function Sheet({
  open, onClose, title, children, tall, scrim = true,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean; scrim?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <Overlay>
      <AnimatePresence>
        {open && (
          <>
            {scrim && (
              <motion.div
                className="pointer-events-auto absolute inset-0 bg-ink/40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
              />
            )}
            <motion.div
              role="dialog"
              aria-modal={scrim}
              aria-label={title}
              className={cx(
                "pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-card shadow-[0_-12px_40px_-12px_rgb(29_35_32/0.35)]",
                tall ? "max-h-[92%] min-h-[60%]" : "max-h-[82%]",
              )}
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 340 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
            >
              <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-2.5">
                <span className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-line" />
                <h2 className="pt-3 text-[21px] font-bold">{title}</h2>
                <button onClick={onClose} aria-label="Close" className="mt-3 grid size-8 place-items-center rounded-full bg-sand text-ink-soft">
                  <X size={17} />
                </button>
              </div>
              <div className="scroll-area min-h-0 flex-1 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2" onPointerDownCapture={(e) => e.stopPropagation()}>
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Overlay>
  );
}
