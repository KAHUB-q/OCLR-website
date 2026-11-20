export function openReplayListChannel(listUrl: string) {
  try {
    return new BroadcastChannel(`oclr:replay-list:${listUrl}`);
  } catch {
    return null;
  }
}

export function notifyReplayListChanged(listUrl: string) {
  const channel = openReplayListChannel(listUrl);
  try {
    channel?.postMessage(null);
  } catch {
    // A viewer also reloads when its tab becomes visible.
  } finally {
    channel?.close();
  }
}
