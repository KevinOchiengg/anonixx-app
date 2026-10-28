// Crisis lines by the viewer's country; others get findahelpline.com. Keep in sync with the app.
export type Helpline = { name: string; label: string; href: string };

const BY_COUNTRY: Record<string, Helpline[]> = {
  KE: [
    { name: "Befrienders Kenya", label: "+254 722 178 177", href: "tel:+254722178177" },
    { name: "Kenya Red Cross", label: "1199, free", href: "tel:1199" },
  ],
  US: [{ name: "988 Suicide & Crisis Lifeline", label: "call or text 988", href: "tel:988" }],
  CA: [{ name: "9-8-8 Suicide Crisis Helpline", label: "call or text 988", href: "tel:988" }],
  GB: [{ name: "Samaritans", label: "116 123, free", href: "tel:116123" }],
  IE: [{ name: "Samaritans", label: "116 123, free", href: "tel:116123" }],
  AU: [{ name: "Lifeline", label: "13 11 14", href: "tel:131114" }],
  NZ: [{ name: "Need to talk?", label: "call or text 1737", href: "tel:1737" }],
  ZA: [{ name: "SADAG", label: "0800 567 567, free", href: "tel:0800567567" }],
  IN: [{ name: "Tele-MANAS", label: "14416, free", href: "tel:14416" }],
};

export const FIND_A_HELPLINE: Helpline = {
  name: "Find a free line near you", label: "findahelpline.com", href: "https://findahelpline.com",
};

export function helplinesFor(country: string | null): Helpline[] {
  return [...(country ? BY_COUNTRY[country] ?? [] : []), FIND_A_HELPLINE];
}
