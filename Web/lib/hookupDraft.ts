/** Live draft for the guided hookup form: turns the answers into a short first-person
 * confession as they're typed. Each sentence has a few wordings; `seed` picks among them,
 * so two people with similar answers don't read the same, and "new wording" reshuffles.
 * Same rules as the AI writer (Backend services/confession_writer.py): only what was said,
 * no money, no contact details. App twin: Frontend/src/utils/hookupDraft.js. */

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const end = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`);
const join = (list: string[]) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

// Ids match HOOKUP_VIBES / HOOKUP_MEET_WHEN in Backend/app/api/v1/drops.py.
export const WANTS: [string, string, string][] = [
  ['company', 'Company', 'good company'],
  ['romance', 'Romance', 'a little romance'],
  ['intimacy', 'Intimacy', 'real closeness'],
  ['casual', 'Something casual', 'something easy, no pressure'],
  ['on our terms', 'On our terms', 'something we agree on together'],
];
export const MEET_WHEN: [string, string][] = [
  ['asap', 'ASAP'], ['today', 'Today'], ['tonight', 'Tonight'], ['week', 'This week'], ['flexible', 'Flexible'],
];
// How long the post stays discoverable for each answer (Backend FRESH_WINDOWS).
export const FRESH_FOR_WHEN: Record<string, string> = { asap: 'tonight', today: 'tonight', tonight: 'tonight', week: 'week', flexible: 'flexible' };

const WHEN_LINES: Record<string, string[]> = {
  asap: ["Sooner is better. Honestly, now.", "I don't want to wait on this one.", "If you're free right now, even better."],
  today: ['Today, if you can.', "I'd like it to be today.", 'Today feels right.'],
  tonight: ['Tonight, ideally.', 'I keep thinking about tonight.', 'Tonight would be perfect.'],
  week: ['Sometime this week.', 'This week, whenever it suits us both.', 'Some evening this week.'],
  flexible: ["No rush. When it feels right.", "I'm not in a hurry. I'd rather it be right.", 'Whenever it feels right for both of us.'],
};
const CLOSERS = ["If that's you, knock.", 'Knock if you felt that.', 'You know what to do if this is you.', 'If you read this twice, knock.'];

export type DraftAnswers = {
  age: string; gender: string | null; area: string; appearance: string;
  lookingFor: string; ageMin: string; ageMax: string; wants: string[];
  when: string; hosting: string | null; publicFirst: boolean;
  note: string; want: string; dontWant: string;
};

export function hookupDraft(a: DraftAnswers, seed = 0): string {
  const pick = (list: string[], k: number) => list[(seed + k * 7) % list.length];
  const age = a.age && Number(a.age) >= 18 ? a.age : '';
  const area = (a.area || '').trim();
  const gword = a.gender === 'woman' ? 'woman' : a.gender === 'man' ? 'man' : '';
  const parts: string[] = [];

  if (age && area) {
    parts.push(pick([
      `${age}${gword ? `, ${gword}` : ''}, ${area}. Saying this here because I can't say it anywhere else.`,
      `I'm ${age} and somewhere in ${area} right now, thinking about things I don't usually admit.`,
      `${area}, ${age}${gword ? `, ${gword}` : ''}. Nobody here knows my name, and maybe that's why I'm being honest.`,
      `Here's the truth: I'm ${age}${gword ? `, a ${gword}` : ''} in ${area}, and I'm tired of pretending I don't want this.`,
    ], 0));
  } else {
    parts.push("Nobody here knows my name, so I'll just say it.");
  }

  const look = (a.appearance || '').trim().replace(/[.!?]+$/, '');
  if (look) parts.push(pick([`To picture me: ${look}.`, `You'd know me by this: ${look}.`, `${cap(look)}, if that helps you picture me.`], 1));

  const who = a.lookingFor === 'woman' ? 'a woman' : a.lookingFor === 'man' ? 'a man' : 'someone';
  const lo = a.ageMin ? Number(a.ageMin) : null;
  const hi = a.ageMax ? Number(a.ageMax) : null;
  const ages = lo && hi && lo !== hi ? ` between ${Math.min(lo, hi)} and ${Math.max(lo, hi)}` : lo || hi ? ` around ${lo || hi}` : '';
  const what = join(WANTS.filter(([id]) => (a.wants || []).includes(id)).map(([, , words]) => words));
  parts.push(what
    ? pick([
      `I want ${who}${ages} who's after ${what} too.`,
      `What I really want is ${what}, with ${who}${ages} who means it.`,
      `${cap(who)}${ages}. ${cap(what)}. That's all I'm asking for.`,
    ], 2)
    : `I want ${who}${ages} who feels the same pull I do.`);

  if (a.when && WHEN_LINES[a.when]) parts.push(pick(WHEN_LINES[a.when], 3));
  const place = a.hosting === 'can_host' ? 'I can host' : a.hosting === 'can_travel' ? "I'll come to you" : '';
  if (a.publicFirst) parts.push(place ? `Somewhere public first, then ${place[0].toLowerCase()}${place.slice(1)}.` : 'Somewhere public first.');
  else if (place) parts.push(`${place}.`);

  const note = (a.note || '').trim();
  if (note) parts.push(end(note));
  const want = (a.want || '').trim().replace(/[.!?]+$/, '');
  const dont = (a.dontWant || '').trim().replace(/[.!?]+$/, '');
  if (want) parts.push(pick([`What I want is ${want}.`, `Honestly? ${cap(want)}.`], 6));
  if (dont) parts.push(pick([`I don't want ${dont}.`, `Not ${dont}. Not this time.`], 4));

  parts.push(pick(CLOSERS, 5));
  return parts.join(' ').slice(0, 500);
}
