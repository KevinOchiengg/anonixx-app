import { Alert as NativeAlert } from 'react-native';

let show = null;

export function registerConfirmHost(handler) {
  show = handler;
  return () => { if (show === handler) show = null; };
}

const ICON_HINTS = [
  [/delete|remove|clear|erase/i, 'delete'],
  [/block/i, 'block'],
  [/report|fake/i, 'report'],
  [/boost|promote/i, 'boost'],
  [/coin|unlock|top up|refund|pay/i, 'coins'],
  [/live/i, 'live'],
  [/log ?out|sign out/i, 'logout'],
  [/mute/i, 'mute'],
  [/end |leave/i, 'leave'],
];

function iconFor(title, danger) {
  const hit = ICON_HINTS.find(([re]) => re.test(title || ''));
  return hit ? hit[1] : danger ? 'warning' : 'info';
}

/**
 * Shows the Anonixx alert and resolves true if the main action is chosen.
 * options: { title, message?, rows?: [{ label, value, highlight? }], confirmLabel?, cancelLabel?,
 *            tone?: 'danger', icon? }
 */
export function confirm(options) {
  if (!show) return Promise.resolve(false);
  const danger = options.tone === 'danger';
  return new Promise((resolve) => {
    show({
      title: options.title,
      message: options.message,
      rows: options.rows,
      icon: options.icon || iconFor(options.title, danger),
      tone: danger ? 'danger' : 'default',
      buttons: [
        { text: options.confirmLabel || 'Confirm', style: danger ? 'destructive' : 'default', onPress: () => resolve(true) },
        { text: options.cancelLabel || 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      ],
    });
  });
}

/** Drop-in for React Native's Alert, drawn as the Anonixx alert. */
export const Alert = {
  alert(title, message, buttons, opts) {
    const list = buttons?.length ? buttons : [{ text: 'OK' }];
    if (!show) {
      NativeAlert.alert(title, message, list, opts);
      return;
    }
    const danger = list.some((b) => b.style === 'destructive');
    show({
      title,
      message: message || undefined,
      icon: iconFor(title, danger),
      tone: danger ? 'danger' : 'default',
      buttons: list,
    });
  },
};
