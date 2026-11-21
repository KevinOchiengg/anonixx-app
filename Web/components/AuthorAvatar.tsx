import Image from "next/image";
import { Mars, NonBinary, Venus, type LucideIcon } from "lucide-react";

export type Gender = "male" | "female" | "nonbinary";

const GENDER_ICON: Record<Gender, { Icon: LucideIcon; color: string; label: string }> = {
  male: { Icon: Mars, color: "#6FB1FF", label: "Male" },
  female: { Icon: Venus, color: "#FF7AB8", label: "Female" },
  nonbinary: { Icon: NonBinary, color: "#B89CFF", label: "Non-binary" },
};

export function genderOf(value: string | null | undefined): Gender | null {
  return value && value in GENDER_ICON ? (value as Gender) : null;
}

type Props = {
  src?: string | null;
  name?: string | null;
  gender?: string | null;
  size: number;
};

export default function AuthorAvatar({ src, name, gender, size }: Props) {
  if (src) return <Image src={src} alt="" width={size} height={size} />;

  const g = genderOf(gender);
  if (!g) return <>{(name || "A").charAt(0).toUpperCase()}</>;

  const { Icon, color, label } = GENDER_ICON[g];
  return (
    <span
      className="gender-ava"
      style={{ "--g": color } as React.CSSProperties}
      role="img"
      aria-label={label}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
