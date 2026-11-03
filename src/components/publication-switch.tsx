import styles from "./publication-switch.module.css";

export function PublicationSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={styles.publication}>
      <span>{label}</span>
      <span className={styles.switch}>
        <input
          className={styles.input}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={styles.track} aria-hidden="true" />
      </span>
    </label>
  );
}
