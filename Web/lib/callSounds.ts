type Name = "ringtone" | "ringback";

let looping: HTMLAudioElement | null = null;

/** Loops the incoming ringtone or the outgoing "calling" tone until stopCallSound(). */
export function startCallSound(name: Name) {
  stopCallSound();
  try {
    const a = new Audio(`/sounds/${name}.wav`);
    a.loop = true;
    a.volume = name === "ringback" ? 0.6 : 0.9;
    void a.play().catch(() => {});
    looping = a;
  } catch { /* no audio support */ }
}

export function stopCallSound() {
  if (!looping) return;
  try { looping.pause(); looping.src = ""; } catch { /* already stopped */ }
  looping = null;
}

/** The short tone when a call ends. */
export function playEndTone() {
  try {
    const a = new Audio("/sounds/callend.wav");
    a.volume = 0.7;
    void a.play().catch(() => {});
  } catch { /* no audio support */ }
}
