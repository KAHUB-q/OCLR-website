"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { useAppTranslations } from "@/i18n/shared";
import type { WikiGalleryFigure } from "@/lib/wiki-articles";
import { WikiGalleryCard } from "./wiki-gallery-card";
import "./wiki-gallery-preview.css";

const WikiGalleryLightbox = dynamic(() => import("./wiki-gallery-lightbox"));

export function WikiGalleryPreview({
  figure,
  showHint = false,
  open,
  onOpenChange,
}: {
  figure: WikiGalleryFigure;
  showHint?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tr = useAppTranslations();
  const cardRef = useRef<SVGSVGElement>(null);
  const enlargeLabel = tr("Click to enlarge");

  return (
    <>
      <a
        className="wiki-gallery-preview"
        href={figure.src}
        target="_blank"
        rel="noreferrer"
        aria-haspopup="dialog"
        aria-label={`${enlargeLabel}: ${figure.caption} (${figure.rarity})`}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          onOpenChange(true);
        }}
      >
        <WikiGalleryCard figure={figure} cardRef={cardRef} />
        {showHint && (
          <span className="wiki-gallery-preview-hint" aria-hidden="true">
            {enlargeLabel}
          </span>
        )}
      </a>
      {open && (
        <WikiGalleryLightbox
          figure={figure}
          cardRef={cardRef}
          close={() => onOpenChange(false)}
        />
      )}
    </>
  );
}
