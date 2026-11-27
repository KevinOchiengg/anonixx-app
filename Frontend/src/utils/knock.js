/** One tap Knock (web twin: Web/components/KnockPay.tsx). Pays the Link Up fee and opens the
 * chat; short on coins it sends them to Coins, which walks them in once the top-up lands.
 * Backend: POST /unlock-requests (refunds itself if the poster never replies in 7 days). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import store from '../store';
import { confirm } from './confirm';

export const LINKUP_COST = 6;

/** The open chat with this person, if you're already linked up (signed out: null). */
export async function linkedChat(userId) {
  if (!userId) return null;
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return null;
    const res = await fetch(`${API_BASE_URL}/api/v1/chat-profile/${userId}/knock-target`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? (await res.json()).connection_id || null : null;
  } catch {
    return null;
  }
}

/** Returns { connectionId } | { pending, already } | { short: true } | { ageGate: true } | { error }.
 * ask: the knock waits for their answer; coins leave only if they let you in. */
export async function payIn(postId, viaProfile = false, ask = false) {
  try {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/v1/unlock-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ target_type: 'drop', target_id: postId, payment_method: 'coins', ...(viaProfile ? { via_profile: true } : {}), ...(ask ? { ask: true } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.connection_id) return { connectionId: data.connection_id, fresh: !data.already_unlocked };
    if (res.ok && data.status === 'pending') return { pending: true, already: !!data.already };
    const code = data?.detail?.code;
    if (code === 'coins_short') return { short: true, cost: data.detail.cost };
    if (code === 'age_verification_required') return { ageGate: true };
    return { error: typeof data?.detail === 'string' ? data.detail : data?.detail?.message || 'Could not link up right now.' };
  } catch {
    return { error: "Can't reach Anonixx right now. Check your connection." };
  }
}

/** The Link Up coin details: one wording for every way in (card, avatar, comment). */
export function knockCopy(post) {
  const { auth, coins } = store.getState();
  const cost = auth.user?.is_premium ? 0 : LINKUP_COST;
  const name = post.anonymous_name || 'them';
  return {
    title: `Link up with ${name}?`,
    icon: 'coins',
    message: post.ask
      ? (cost ? `Your request goes to ${name}. The ${cost} coins leave only if they let you in.` : `Free for you. Your request goes to ${name}.`)
      : (cost ? "You go straight into the chat. If they don't reply within 7 days, your coins come back." : 'Free for you. You go straight into the chat.'),
    rows: cost
      ? [
        { label: 'Link Up', value: `${cost} coins`, highlight: true },
        { label: 'Your balance', value: `${coins.balance ?? 0} coins` },
      ]
      : [],
    confirmLabel: post.ask ? (cost ? `Send request · ${cost} coins` : 'Send request') : cost ? `Pay ${cost} coins` : 'Link Up',
  };
}

/** After payIn: into the chat, a sent notice, or Coins / the age check first. */
export function settleKnock(navigation, post, r, showToast) {
  const who = post.anonymous_name || 'They';
  if (r.connectionId) navigation.navigate('DropChat', { connectionId: r.connectionId, linkedUp: !!r.fresh });
  else if (r.pending) showToast?.({ type: 'success', message: r.already ? `Already sent. Waiting for ${who} to answer.` : `Request sent. ${who} decides. Coins leave only if they let you in.` });
  else if (r.short) navigation.navigate('Coins', { knockFor: { id: post.id, name: post.anonymous_name || null, cost: r.cost || LINKUP_COST, viaProfile: !!post.kind && post.kind !== 'hookup', ask: !!post.ask } });
  else if (r.ageGate) navigation.navigate('PostUnlock', { post });
  else showToast?.({ type: 'warning', message: r.error });
}

/** Tap Knock: confirm, then pay and settle. */
export async function knockIn(navigation, post, showToast) {
  if (!(await confirm(knockCopy(post)))) return;
  settleKnock(navigation, post, await payIn(post.id, !!post.kind && post.kind !== 'hookup', !!post.ask), showToast);
}
