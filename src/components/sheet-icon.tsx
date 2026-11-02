/** Small utility icons shared by the private practice and timetable controls. */
export function SheetIcon({
  kind,
}: {
  kind:
    | "reload"
    | "delete"
    | "undo"
    | "save"
    | "help"
    | "expand"
    | "check"
    | "copy";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "reload" ? (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
        </>
      ) : kind === "delete" ? (
        <>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5" />
        </>
      ) : kind === "undo" ? (
        <>
          <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6v3" />
        </>
      ) : kind === "save" ? (
        <>
          <path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8" />
        </>
      ) : kind === "help" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </>
      ) : kind === "check" ? (
        <path d="m5 12 4 4L19 6" />
      ) : kind === "copy" ? (
        <>
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </>
      ) : (
        <path d="m6 9 6 6 6-6" />
      )}
    </svg>
  );
}
