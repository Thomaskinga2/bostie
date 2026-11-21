"use client";
// Preview a share picture, then hand it to the phone's share sheet or save it.
import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { canShareFiles, saveImage, shareImage } from "@/lib/share";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

type Made = { blob: Blob; url: string } | "failed" | null;

export function ShareSheet({ open, onClose, title, make, caption, filename, warning }: {
  open: boolean; onClose: () => void; title: string; make: () => Promise<Blob>; caption: string; filename: string; warning?: string;
}) {
  const [made, setMade] = useState<Made>(null);
  const [note, setNote] = useState("");

  // Draw the picture each time the sheet opens, and free it when it closes.
  useEffect(() => {
    if (!open) return;
    let url = "";
    let alive = true;
    make()
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (alive) setMade({ blob, url });
      })
      .catch(() => alive && setMade("failed"));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setMade(null);
      setNote("");
    };
    // `make` is recreated by the caller on every render; opening is the only trigger we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ready = made && made !== "failed" ? made : null;
  const native = canShareFiles();

  const share = async () => {
    if (!ready) return;
    const result = await shareImage(ready.blob, caption, filename);
    if (result === "shared") setNote("Shared.");
    else if (result === "unsupported") {
      saveImage(ready.blob, filename);
      setNote("Saved the picture. Add it to your story or post from your photos.");
    }
  };
  const save = async () => {
    if (!ready) return;
    saveImage(ready.blob, filename);
    await navigator.clipboard?.writeText(caption).catch(() => {});
    setNote("Picture saved and caption copied.");
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      <div className="mx-auto w-[min(62%,250px)] overflow-hidden rounded-3xl bg-ink shadow-lift" style={{ aspectRatio: "9 / 16" }}>
        {ready ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated locally
          <img src={ready.url} alt="Preview of the picture you are about to share" className="size-full object-cover" />
        ) : made === "failed" ? (
          <p className="grid h-full place-items-center px-5 text-center text-[14px] text-paper/80">The picture could not be made. Please try again.</p>
        ) : (
          <div className="size-full animate-pulse bg-ink-soft/40" role="status" aria-label="Making your picture" />
        )}
      </div>

      {warning && <p className="mt-4 rounded-2xl bg-gold-soft px-4 py-3 text-[14px] leading-snug text-[#5b410b]">{warning}</p>}

      <div className="mt-4 flex flex-col gap-2.5">
        {native && (
          <Button onClick={share} disabled={!ready}>
            <Share2 size={18} aria-hidden /> Share
          </Button>
        )}
        <Button variant={native ? "secondary" : "primary"} onClick={save} disabled={!ready}>
          <Download size={18} aria-hidden /> Save image
        </Button>
      </div>
      <p role="status" className="mt-3 min-h-5 text-center text-[13.5px] font-semibold text-forest">{note}</p>
      <p className="mt-1 text-center text-[12.5px] leading-snug text-ink-faint">
        {native
          ? "Share opens your phone's share menu: pick Instagram, Facebook or any other app. Bostie cannot post for you."
          : "On this device, save the picture and add it to your story or post. Bostie cannot post for you."}
      </p>
    </Sheet>
  );
}
