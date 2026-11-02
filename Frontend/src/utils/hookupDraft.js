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
  ['company', 'Company and conversation', 'good company and real conversation'],
  ['romance', 'Romance and affection', 'romance and a little affection'],
  ['intimacy', 'Intimacy and company', 'closeness, the kind that stays a while'],
  ['casual', 'Casual, no-strings connection', 'something casual, no strings'],
  ['spontaneous', 'Something spontaneous', 'something spontaneous'],
  // older drafts only; the form no longer offers it
  ['on our terms', 'On our terms', 'something we agree on together'],
];
export const MEET_WHEN = [
  ['asap', 'As soon as possible'], ['today', 'Before the end of today'], ['tonight', 'Tonight'],
  ['week', 'This week'], ['flexible', 'Whenever the right person comes along'],
];
// How long the post stays discoverable for each answer (Backend FRESH_WINDOWS).
export const FRESH_FOR_WHEN = { asap: 'tonight', today: 'tonight', tonight: 'tonight', week: 'week', flexible: 'flexible' };

const WHEN_LINES = {
  asap: ["Sooner is better. Honestly, now.", "I don't want to wait on this one.", "If you're free right now, even better."],
  today: ['Today, if you can.', "I'd like it to be today.", 'Today feels right.'],
  tonight: ['Tonight, ideally.', 'I keep thinking about tonight.', 'Tonight would be perfect.'],
  week: ['Sometime this week.', 'This week, whenever it suits us both.', 'Some evening this week.'],
  flexible: ['Whenever the right person comes along.', "I'm not in a hurry. I'd rather it be right.", 'No rush. When it feels right for both of us.'],
};
const CLOSERS = ["If that's you, knock.", 'Knock if you felt that.', 'You know what to do if this is you.', 'If you read this twice, knock.'];

export function hookupDraft(a, seed = 0) {
  const pick = (list, k) => list[(seed + k * 7) % list.length];
  const age = a.age && Number(a.age) >= 18 ? a.age : '';
  const area = (a.area || '').trim();
  const gword = a.gender === 'woman' ? 'woman' : a.gender === 'man' ? 'man' : a.gender === 'other' ? 'person' : '';
  const parts = [];

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
  // "Expectations" in the form.
  if (want) parts.push(pick([`What I'd expect: ${want}.`, `One thing I'd ask: ${want}.`, `Just so you know: ${want}.`], 6));
  if (dont) parts.push(pick([`I don't want ${dont}.`, `Not ${dont}. Not this time.`], 4));

  parts.push(pick(CLOSERS, 5));
  return parts.join(' ').slice(0, 500);
}
