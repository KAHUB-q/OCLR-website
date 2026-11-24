import { useLayoutEffect, useRef, useState } from "react";
import { fitSortRows } from "@/lib/leaderboard-sort";

export function useLeaderboardSortLayout(labelKey: string) {
  const sortBarRef = useRef<HTMLDivElement>(null);
  const [sortRowSizes, setSortRowSizes] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    const bar = sortBarRef.current;
    if (!bar) return;
    let widths: number[] | undefined;
    let frame = 0;
    let cancelled = false;

    const update = () => {
      const row = bar.firstElementChild;
      if (!(row instanceof HTMLElement)) return;
      const buttons = [...bar.querySelectorAll("button")];
      if (!widths || widths.length !== buttons.length) {
        // Settled rows stretch each button. Measure its natural width instead.
        for (const button of buttons) button.style.flex = "0 0 auto";
        try {
          widths = buttons.map(
            (button) => button.getBoundingClientRect().width,
          );
        } finally {
          for (const button of buttons) button.style.removeProperty("flex");
        }
        if (!widths.length || widths.some((width) => width <= 0)) {
          widths = undefined;
          return;
        }
      }
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const next = fitSortRows(widths, gap, bar.clientWidth);
      setSortRowSizes((current) =>
        current?.length === next.length &&
        current.every((size, index) => size === next[index])
          ? current
          : next,
      );
    };
    function schedule() {
      if (cancelled) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }
    function remeasure() {
      widths = undefined;
      schedule();
    }

    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    // Viewport changes can alter button padding even if the bar stays the same width.
    window.addEventListener("resize", remeasure);
    void document.fonts.ready.then(remeasure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [labelKey]);

  return { sortBarRef, sortRowSizes };
}
