/**
 * loadingMessageEngine.js
 *
 * Centralized loading message engine for Anonixx.
 * Maps real socket events to message pools, injects soft signals,
 * handles user-state personalization, and surfaces rare moments.
 */

// ─── Message pools ────────────────────────────────────────────────────────────

const EVENT_MESSAGES = {
  profile_viewed: [
    "Someone just checked you",
    "You've been noticed",
    "Eyes are on you",
    "You caught someone's attention",
    "Someone lingered on your profile",
  ],
  user_typing: [
    "A message is forming…",
    "Someone has something to say",
    "Words are finding their way to you",
    "Something is being written right now",
    "A thought is turning into words",
  ],
  user_online: [
    "Someone just arrived",
    "The space is filling up",
    "You're not alone here",
    "Activity just picked up",
    "Someone stepped in",
  ],
  new_message: [
    "You have something waiting",
    "Something came in while you were away",
    "Someone reached out",
    "A message is waiting for you",
    "Your inbox isn't empty",
  ],
  high_activity_detected: [
    "Things are getting active",
    "Something's happening right now",
    "The space is alive tonight",
    "Energy is building",
    "Everyone's here",
  ],
  message_locked: [
    "Not everything is visible",
    "Some things stay hidden",
    "There's more beneath the surface",
    "Layers you haven't unlocked",
    "Not all truths are free",
  ],
  soft_signal: [
    "Someone is thinking about you",
    "You might get a message soon",
    "Something is shifting",
    "The air feels different tonight",
    "Something is about to happen",
    "You're being seen",
    "Connections forming in the dark",
    "Not everything is still",
  ],
};

const STATE_MESSAGES = {
  new: [
    "You're just getting started",
    "This space is waking up for you",
    "First steps into something real",
    "Something is beginning",
  ],
  active: [
    "You're going deeper",
    "The further in, the more real it gets",
    "You've been here before",
    "You know this space now",
  ],
  returning: [
    "Things changed while you were away",
    "Something moved while you were gone",
    "The space remembers you",
    "You came back",
    "It waited",
  ],
  ignored_chats: [
    "You left something unfinished",
    "Someone is still waiting",
    "A conversation that never ended",
    "There's a thread you dropped",
  ],
};

const RARE_MESSAGES = [
  "You weren't supposed to see this",
  "This one is different",
  "Someone is closer than you think",
  "Not everyone gets this far",
  "This moment won't repeat",
  "Pay attention to this one",
];

// ─── Rotation indices (per pool, never repeat consecutive) ───────────────────

const _indices = {};

function _nextFrom(pool, key) {
  if (_indices[key] === undefined) _indices[key] = 0;
  const msg = pool[_indices[key] % pool.length];
  _indices[key]++;
  return msg;
}

// ─── Probability gates ────────────────────────────────────────────────────────

function _shouldShowRare() {
  return Math.random() < 0.03; // 3 %
}

function _shouldInjectSoftSignal() {
  return Math.random() < 0.15; // 15 %
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the next loading message.
 *
 * Priority:
 *   1. Rare moment (3 %)
 *   2. Real event message (if eventType provided)
 *   3. Soft signal injection (15 % when no event)
 *   4. User-state message
 *   5. Default soft signal
 *
 * @param {string|null} eventType  — socket event type, e.g. 'profile_viewed'
 * @param {string|null} userState  — 'new' | 'active' | 'returning' | 'ignored_chats'
 */
export function getLoadingMessage(eventType = null, userState = null) {
  if (_shouldShowRare()) {
    return _nextFrom(RARE_MESSAGES, 'rare');
  }

  if (eventType && EVENT_MESSAGES[eventType]) {
    return _nextFrom(EVENT_MESSAGES[eventType], eventType);
  }

  if (!eventType && _shouldInjectSoftSignal()) {
    return _nextFrom(EVENT_MESSAGES.soft_signal, 'soft_signal');
  }

  if (userState && STATE_MESSAGES[userState]) {
    return _nextFrom(STATE_MESSAGES[userState], userState);
  }

  return _nextFrom(EVENT_MESSAGES.soft_signal, 'soft_signal');
}

/**
 * Derive user state from the user object.
 *
 * @param {object|null} user          — user object from AuthContext
 * @param {boolean}     hasUnread     — whether unread chats exist
 */
export function detectUserState(user, hasUnread = false) {
  if (!user) return 'new';
  if (hasUnread) return 'ignored_chats';

  const createdAt = user.created_at ? new Date(user.created_at) : null;
  if (createdAt) {
    const days = (Date.now() - createdAt.getTime()) / 86_400_000;
    if (days < 1) return 'new';
    if (days > 7) return 'returning';
  }

  return 'active';
}

/** All event names this engine understands. */
export const LOADING_EVENTS = [
  'user_online',
  'user_typing',
  'profile_viewed',
  'new_message',
  'high_activity_detected',
  'message_locked',
];
