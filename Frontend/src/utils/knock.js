/** One tap Knock (web twin: Web/components/KnockPay.tsx). Pays the Link Up fee and opens the
 * chat; short on coins it sends them to Coins, which walks them in once the top-up lands.
 * Backend: POST /unlock-requests (refunds itself if the poster never replies in 7 days). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import store from '../store';
import { confirm } from './confirm';

export const LINKUP_COST = 6;

/** Returns { connectionId } | { short: true } | { ageGate: true } | { error } */
export async function payIn(postId, viaProfile = false) {
  try {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ target_type: 'drop', target_id: postId, payment_method: 'coins', ...(viaProfile ? { via_profile: true } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.connection_id) return { connectionId: data.connection_id };
    const code = data?.detail?.code;
    if (code === 'coins_short') return { short: true, cost: data.detail.cost };
    if (code === 'age_verification_required') return { ageGate: true };
    return { error: typeof data?.detail === 'string' ? data.detail : data?.detail?.message || 'Could not link up right now.' };
  } catch {
    return { error: "Can't reach Anonixx right now. Check your connection." };
  }
}

function confirmKnock(post) {
  const { auth, coins } = store.getState();
  const cost = auth.user?.is_premium ? 0 : LINKUP_COST;
  const name = post.anonymous_name || 'them';
  return confirm({
    title: `Link up with ${name}?`,
    icon: 'coins',
    message: cost
      ? "You go straight into the chat. If they don't reply within 7 days, your coins come back."
      : 'Free for you. You go straight into the chat.',
    rows: cost
      ? [
        { label: 'Link Up', value: `${cost} coins`, highlight: true },
        { label: 'Your balance', value: `${coins.balance ?? 0} coins` },
      ]
      : [],
    confirmLabel: cost ? `Pay ${cost} coins` : 'Link Up',
  });
}

/** Tap Knock: confirm, then straight into the chat, or to Coins / the age check first. */
export async function knockIn(navigation, post, showToast) {
  if (!(await confirmKnock(post))) return;
  const r = await payIn(post.id, !!post.kind && post.kind !== 'hookup');
  if (r.connectionId) navigation.navigate('DropChat', { connectionId: r.connectionId });
  else if (r.short) navigation.navigate('Coins', { knockFor: { id: post.id, name: post.anonymous_name || null, cost: r.cost || LINKUP_COST } });
  else if (r.ageGate) navigation.navigate('PostUnlock', { post });
  else showToast?.({ type: 'warning', message: r.error });
}
