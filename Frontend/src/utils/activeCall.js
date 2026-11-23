/** The call in progress, so a bar can bring you back to it from anywhere in the app. */
let current = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(current));

export const activeCall = {
  get: () => current,
  set(info) {
    current = info;
    emit();
  },
  clear(callId) {
    if (!current || (callId && current.callId !== callId)) return;
    current = null;
    emit();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
