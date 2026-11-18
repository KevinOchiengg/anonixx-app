/** Answer options for the guided hookup form (ids match HOOKUP_VIBES / HOOKUP_MEET_WHEN
 * in Backend/app/api/v1/drops.py). The poster writes the confession itself. Web twin: Web/lib/hookupDraft.ts. */


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
