import type { ReactNode } from "react";
import { Spinner } from "./spinner";
import styles from "./pending-button-label.module.css";

/** Keep the action name readable while its request or refresh is pending. */
export function PendingButtonLabel({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return pending ? (
    <span className={styles.label}>
      <Spinner compact />
      {children}
    </span>
  ) : (
    children
  );
}
