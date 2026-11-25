import styles from "./liru-chat.module.css";

/** Liru by JerrYamada, CC BY 4.0. Monochrome portrait adapted for chat. */
export function LiruChatIcon({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={styles.icon}
      style={{ inlineSize: size, blockSize: size }}
    />
  );
}
