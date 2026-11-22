"use client";
// Tap a picture to see it full screen, then close it. Used for the large photos only:
// small thumbnails inside lists and cards stay plain, so their rows keep one tap target.
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { photoOf } from "@/lib/places";
import { Overlay } from "./Sheet";
import { cx, ExpandButton, Photo } from "./ui";

export function Lightbox({ src, alt, onClose }: { src: string | null; alt: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    // Capture phase, so Escape closes the picture and not the sheet underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [src, onClose]);

  return (
    <Overlay>
      <AnimatePresence>
        {src && (
          <motion.div
            role="dialog" aria-modal aria-label="Photo" data-testid="lightbox"
            className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-ink/95 p-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            onClick={onClose} // tapping anywhere closes it too
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the same picture the page already loaded */}
            <img src={src} alt={alt} draggable={false} className="max-h-full max-w-full rounded-xl object-contain" />
            <button aria-label="Close photo" className="absolute right-3 top-[calc(env(safe-area-inset-top)+12px)] grid size-11 place-items-center rounded-full bg-paper text-ink shadow-lift framed:top-[58px]">
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Overlay>
  );
}

/** A catalogue photo that opens full screen when tapped. */
export function ZoomPhoto(props: { id: string; className?: string; credit?: boolean; alt?: string }) {
  const [open, setOpen] = useState(false);
  const p = photoOf(props.id);
  return (
    <>
      <Photo {...props} onExpand={p ? () => setOpen(true) : undefined} />
      <Lightbox src={open && p ? p.src : null} alt={props.alt ?? ""} onClose={() => setOpen(false)} />
    </>
  );
}

/** Any other picture (the rider's own photo or drawing, the share picture) that opens full screen when tapped. */
export function ZoomImage({ src, alt, className, small }: { src: string; alt: string; className?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={cx("relative overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local or generated picture */}
        <img src={src} alt={alt} draggable={false} className="size-full object-cover" />
        <ExpandButton onClick={() => setOpen(true)} small={small} />
      </div>
      <Lightbox src={open ? src : null} alt={alt} onClose={() => setOpen(false)} />
    </>
  );
}
