let show = null;

export function registerConfirmHost(handler) {
  show = handler;
  return () => { if (show === handler) show = null; };
}

/**
 * Shows the confirmation dialog and resolves true if the user confirms.
 * options: { title, message?, rows?: [{ label, value, highlight? }], confirmLabel?, cancelLabel?, tone?: 'danger' }
 */
export function confirm(options) {
  return show ? show(options) : Promise.resolve(false);
}
