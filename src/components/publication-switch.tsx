import styles from "./publication-switch.module.css";
import { PendingButtonLabel } from "./pending-button-label";

export function PublicationSwitch({
  label,
  checked,
  onChange,
  disabled = false,
  pending = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <label className={styles.publication}>
      <span>
        <PendingButtonLabel pending={pending}>{label}</PendingButtonLabel>
      </span>
      <span className={styles.switch}>
        <input
          className={styles.input}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-busy={pending}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.track} aria-hidden="true" />
      </span>
    </label>
  );
}
