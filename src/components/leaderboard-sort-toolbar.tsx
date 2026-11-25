import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fitSortRows } from "@/lib/leaderboard-sort";
import styles from "./player-leaderboard-cards.module.css";

export function LeaderboardSortToolbar<
  T extends { key: string; label: string; trophy?: string },
>({
  columns,
  label,
  children,
}: {
  columns: T[];
  label: string;
  children: (column: T) => ReactNode;
}) {
  const labelKey = JSON.stringify(
    columns.map(({ key, label, trophy }) => [key, label, trophy]),
  );
  const sortBarRef = useRef<HTMLDivElement>(null);
  const [sortRowSizes, setSortRowSizes] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    const bar = sortBarRef.current;
    if (!bar) return;
    let widths: number[] | undefined;
    let frame = 0;
    let cancelled = false;

    const update = () => {
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
      const gap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
      const next = fitSortRows(widths, gap, bar.getBoundingClientRect().width);
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

  const rowStarts = new Set<number>();
  let offset = 0;
  for (const size of sortRowSizes ?? []) {
    offset += size;
    rowStarts.add(offset);
  }
  return (
    <div
      ref={sortBarRef}
      className={styles.sortBar}
      role="toolbar"
      aria-label={label}
      data-measuring={sortRowSizes ? undefined : true}
    >
      {columns.map((column, index) => (
        <Fragment key={column.key}>
          {rowStarts.has(index) && (
            <span className={styles.sortBreak} aria-hidden="true" />
          )}
          {children(column)}
        </Fragment>
      ))}
    </div>
  );
}
