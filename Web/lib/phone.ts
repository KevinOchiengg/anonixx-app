export function normalizeKePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = "254" + d.slice(1);
  else if (d.startsWith("7") || d.startsWith("1")) d = "254" + d;
  return d;
}
