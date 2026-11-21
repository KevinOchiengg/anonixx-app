/** One tap Knock (web twin: Web/components/KnockPay.tsx). Pays the Link Up fee and opens the
 * chat; short on coins it sends them to Coins, which walks them in once the top-up lands.
 * Backend: POST /unlock-requests (refunds itself if the poster never replies in 24 hours). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

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

/** Tap Knock: straight into the chat, or to Coins / the age check first. */
export async function knockIn(navigation, post, showToast) {
  const r = await payIn(post.id, !!post.kind && post.kind !== 'hookup');
  if (r.connectionId) navigation.navigate('DropChat', { connectionId: r.connectionId });
  else if (r.short) navigation.navigate('Coins', { knockFor: { id: post.id, name: post.anonymous_name || null, cost: r.cost || LINKUP_COST } });
  else if (r.ageGate) navigation.navigate('PostUnlock', { post });
  else showToast?.({ type: 'warning', message: r.error });
}
