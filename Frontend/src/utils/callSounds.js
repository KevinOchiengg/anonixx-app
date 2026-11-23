import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const SOURCES = {
  ringtone: require('../../assets/sounds/ringtone.wav'),
  ringback: require('../../assets/sounds/ringback.wav'),
  end: require('../../assets/sounds/callend.wav'),
};

let looping = null;

function release(player) {
  try {
    player.pause();
    player.remove();
  } catch { /* already released */ }
}

/** Loops the incoming ringtone or the outgoing "calling" tone until stopCallSound(). */
export function startCallSound(name) {
  stopCallSound();
  try {
    if (name === 'ringtone') setAudioModeAsync({ playsInSilentMode: false }).catch(() => {});
    const player = createAudioPlayer(SOURCES[name]);
    player.loop = true;
    player.play();
    looping = player;
  } catch { /* no audio: vibration and the screen still show the call */ }
}

export function stopCallSound() {
  if (!looping) return;
  release(looping);
  looping = null;
}

/** The short tone when a call ends. */
export function playEndTone() {
  try {
    const player = createAudioPlayer(SOURCES.end);
    player.play();
    setTimeout(() => release(player), 1500);
  } catch { /* silent */ }
}
