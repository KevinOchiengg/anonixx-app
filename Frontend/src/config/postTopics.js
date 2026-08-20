/**
 * postTopics.js
 *
 * The topic taxonomy for main-feed Posts — shared between CreatePostScreen
 * (where a post actually gets tagged) and SearchScreen (where those tags
 * become filter chips). Single source of truth so the two can't drift out
 * of sync with each other again.
 *
 * Matches Anonixx's actual voice — anonymous confessions with a flirty
 * edge (see DROP_CATEGORIES in DropsComposeScreen.jsx, and this app's own
 * compose prompts: "the thing you've been carrying alone…", "what you
 * can't say out loud…") — not a clinical mental-health-app category list.
 * Ids are kept in sync with AVAILABLE_TOPICS / HEAVY_TOPICS / LIGHT_TOPICS
 * in Backend/app/api/v1/posts.py — the emotional-pacing safety mechanism
 * there (never more than 2 "heavy" posts back-to-back in the feed) reads
 * these same ids, so don't rename one side without the other.
 */
export const POST_TOPICS = [
  { id: 'desire',            label: 'Desire',              emoji: '🔥' },
  { id: 'heartbreak',        label: 'Heartbreak',          emoji: '💔' },
  { id: 'late_night',        label: 'Late Night Thoughts', emoji: '🌙' },
  { id: 'secrets',           label: 'Secrets',              emoji: '🤫' },
  { id: 'toxic_ties',        label: 'Toxic Ties',          emoji: '⛓️' },
  { id: 'family',            label: 'Family',               emoji: '🏠' },
  { id: 'money',             label: 'Money Stress',         emoji: '💸' },
  { id: 'identity',          label: 'Identity',             emoji: '🪞' },
  { id: 'queer',             label: 'Queer & Questioning',  emoji: '🏳️‍🌈' },
  { id: 'glow_up',           label: 'Glow Up',              emoji: '🌱' },
  { id: 'friendship',        label: 'Friendship',           emoji: '🤝' },
  { id: 'hustle',            label: 'Hustle & Grind',       emoji: '🎓' },
  { id: 'dark_nights',       label: 'Dark Nights',          emoji: '🌧️' },
  { id: 'spiraling',         label: 'Spiraling',            emoji: '😰' },
  { id: 'grief',             label: 'Grief',                emoji: '🕯️' },
  { id: 'carrying_it_alone', label: 'Carrying It Alone',    emoji: '🌑' },
  { id: 'cant_sleep',        label: "Can't Sleep",          emoji: '😴' },
];

export const MAX_POST_TOPICS = 3;
