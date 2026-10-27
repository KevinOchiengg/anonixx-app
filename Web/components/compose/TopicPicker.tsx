"use client";
// Moods and topics an author can put on a confession (Backend utils/search_lexicon
// MOODS + STORY_TOPICS, max MAX_TOPICS). Optional; they help people find it in Stories.
export const STORY_MOODS: [string, string][] = [
  ["heartbreak", "Heartbreak"], ["love", "Love"], ["secrets", "Secrets"], ["regret", "Regret"], ["betrayal", "Betrayal"],
  ["happiness", "Happiness"], ["anger", "Anger"], ["relief", "Relief"], ["confusion", "Confusion"], ["funny", "Funny"],
  ["growth", "Personal growth"],
];
export const STORY_TOPICS: [string, string][] = [
  ["relationships", "Relationships"], ["friendship", "Friendship"], ["family", "Family"], ["work", "Work"],
  ["money", "Money"], ["school", "School"], ["desire", "Desire"],
];
export const MAX_TOPICS = 3;
const LABEL = Object.fromEntries([...STORY_MOODS, ...STORY_TOPICS]);
export const topicLabel = (id: string) => LABEL[id] || id;

export default function TopicPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : value.length >= MAX_TOPICS ? value : [...value, id]);
  const group = (title: string, items: [string, string][]) => (
    <div className="tp-group">
      <span className="tp-title">{title}</span>
      <div className="tp-chips" role="group" aria-label={title}>
        {items.map(([id, label]) => {
          const on = value.includes(id);
          return (
            <button key={id} type="button" aria-pressed={on} className={on ? "on" : ""} disabled={!on && value.length >= MAX_TOPICS} onClick={() => toggle(id)}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="tp">
      {group("How it feels", STORY_MOODS)}
      {group("What it's about", STORY_TOPICS)}
      <p className="tp-hint">{value.length}/{MAX_TOPICS} picked. Optional. It helps the right people find it in Stories.</p>
    </div>
  );
}
