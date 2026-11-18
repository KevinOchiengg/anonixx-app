/** Answer options for the guided hookup form (ids match HOOKUP_VIBES / HOOKUP_MEET_WHEN
 * in Backend/app/api/v1/drops.py). The poster writes the confession itself. App twin: Frontend/src/utils/hookupDraft.js. */


export const WANTS: [string, string, string][] = [
  ['company', 'Company and conversation', 'company and good conversation'],
  ['romance', 'Romance and affection', 'romance and affection'],
  ['intimacy', 'Intimacy and company', 'intimacy and closeness'],
  ['casual', 'Casual, no-strings connection', 'a no strings attached relationship'],
  ['spontaneous', 'Something spontaneous', 'something spontaneous'],
  // older drafts only; the form no longer offers it
  ['on our terms', 'On our terms', 'something on our own terms'],
];
export const MEET_WHEN: [string, string][] = [
  ['asap', 'As soon as possible'], ['today', 'Before the end of today'], ['tonight', 'Tonight'],
  ['week', 'This week'], ['flexible', 'Whenever the right person comes along'],
];
// How long the post stays discoverable for each answer (Backend FRESH_WINDOWS).
export const FRESH_FOR_WHEN: Record<string, string> = { asap: 'tonight', today: 'tonight', tonight: 'tonight', week: 'week', flexible: 'flexible' };

export type DraftAnswers = {
  age: string; gender: string | null; area: string; appearance?: string;
  lookingFor: string; ageMin: string; ageMax: string; wants: string[];
  when: string; hosting: string | null; publicFirst: boolean;
  note: string; want: string; dontWant: string;
};
