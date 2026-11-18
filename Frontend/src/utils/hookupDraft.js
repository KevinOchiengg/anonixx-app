/** Live draft for the guided hookup form: turns the answers into a short first-person
 * confession as they're typed. Each sentence has a few wordings; `seed` picks among them,
 * so two people with similar answers don't read the same, and "new wording" reshuffles.
 * Same rules as the AI writer (Backend services/confession_writer.py): only what was said,
 * no money, no contact details. Web twin: Web/lib/hookupDraft.ts. */

const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const end = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);
const join = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')}${list.some((x) => x.includes(' and ')) ? ', plus' : ' and'} ${list[list.length - 1]}`);

// Ids match HOOKUP_VIBES / HOOKUP_MEET_WHEN in Backend/app/api/v1/drops.py.
export const WANTS = [
  ['company', 'Company and conversation', 'company and good conversation'],
  ['romance', 'Romance and affection', 'romance and affection'],
  ['intimacy', 'Intimacy and company', 'intimacy and closeness'],
  ['casual', 'Casual, no-strings connection', 'a no strings attached relationship'],
  ['spontaneous', 'Something spontaneous', 'something spontaneous'],
  // older drafts only; the form no longer offers it
  ['on our terms', 'On our terms', 'something on our own terms'],
];
export const MEET_WHEN = [
  ['asap', 'As soon as possible'], ['today', 'Before the end of today'], ['tonight', 'Tonight'],
  ['week', 'This week'], ['flexible', 'Whenever the right person comes along'],
];
// How long the post stays discoverable for each answer (Backend FRESH_WINDOWS).
export const FRESH_FOR_WHEN = { asap: 'tonight', today: 'tonight', tonight: 'tonight', week: 'week', flexible: 'flexible' };

const WHEN_LINES = {
  asap: ['Ready as soon as possible.', 'Available right now.', 'The sooner the better.'],
  today: ['Free today.', 'Today if possible.', "I'd like it to be today."],
  tonight: ['Free tonight.', 'Tonight would be perfect.', 'Tonight, ideally.'],
  week: ['Sometime this week.', 'Free this week.', 'Any evening this week.'],
  flexible: ['No rush, whenever it feels right.', 'No hurry. The right person is worth the wait.', 'Whenever the right person comes along.'],
};
const CLOSERS = ["Knock if that's you.", "If that's you, knock.", "Knock and let's talk.", "Knock if you're interested."];

export function hookupDraft(a, seed = 0) {
  const pick = (list, k) => list[(seed + k * 7) % list.length];
  const age = a.age && Number(a.age) >= 18 ? a.age : '';
  const area = (a.area || '').trim();
  const gword = a.gender === 'woman' ? 'woman' : a.gender === 'man' ? 'man' : a.gender === 'other' ? 'person' : '';
  const parts = [];

  // Hello, who I am and where: "Hello, I'm 31, living in Kikuyu."
  if (age && area) {
    parts.push(pick([
      `Hello, I'm ${gword ? `a ${age} year old ${gword}` : age}, living in ${area}.`,
      `Hi, I'm ${age} from ${area}.`,
      `Hey there, ${age} here, from ${area}.`,
      `Good evening, I'm ${age}, based in ${area}.`,
    ], 0));
  } else if (age) parts.push(`Hello, I'm ${age}.`);
  else if (area) parts.push(`Hello, I'm from ${area}.`);
  else parts.push('Hello there.');

  // A line about themselves, in their words.
  const note = (a.note || '').trim();
  if (note) parts.push(end(cap(note)));

  // Who and what for: "Looking for a gentleman for a mature friendship."
  const who = a.lookingFor === 'woman' ? pick(['a lady', 'a decent woman', 'a woman'], 1)
    : a.lookingFor === 'man' ? pick(['a gentleman', 'a decent man', 'a man'], 1) : 'someone';
  const lo = a.ageMin ? Number(a.ageMin) : null;
  const hi = a.ageMax ? Number(a.ageMax) : null;
  const ages = lo && hi && lo !== hi ? ` between ${Math.min(lo, hi)} and ${Math.max(lo, hi)}` : lo || hi ? ` around ${lo || hi}` : '';
  const what = join(WANTS.filter(([id]) => (a.wants || []).includes(id)).map(([, , words]) => words));
  parts.push(what
    ? pick([`Looking for ${who}${ages} for ${what}.`, `I'd like to meet ${who}${ages} for ${what}.`, `I want ${who}${ages} for ${what}.`], 2)
    : pick([`Looking for ${who}${ages} who feels the same.`, `I'd like to meet ${who}${ages}.`], 2));

  if (a.when && WHEN_LINES[a.when]) parts.push(pick(WHEN_LINES[a.when], 3));
  const place = a.hosting === 'can_host' ? 'I can host' : a.hosting === 'can_travel' ? 'I can come to you' : '';
  if (a.publicFirst) parts.push(place ? `We meet somewhere public first, then ${place[0].toLowerCase()}${place.slice(1)}.` : 'We meet somewhere public first.');
  else if (place) parts.push(`${place}.`);

  const want = (a.want || '').trim().replace(/[.!?]+$/, '');
  const dont = (a.dontWant || '').trim().replace(/[.!?]+$/, '');
  if (want) parts.push(pick([`One thing I ask: ${want}.`, `Just so you know: ${want}.`], 6));
  if (dont) parts.push(pick([`No ${dont}, please.`, `I don't want ${dont}.`], 4));

  parts.push(pick(CLOSERS, 5));
  return parts.join(' ').slice(0, 500);
}
