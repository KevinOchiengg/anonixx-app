/** On phones a call takes the whole screen, browser bars included, like a native call. */
export function enterCallFullscreen() {
  if (typeof document === "undefined" || document.fullscreenElement) return;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
}

export function exitCallFullscreen() {
  if (typeof document === "undefined" || !document.fullscreenElement) return;
  document.exitFullscreen?.().catch(() => {});
}
