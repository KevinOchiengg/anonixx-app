import Image from "next/image";
import { PORTRAIT_VIEWBOX, portraitFor } from "@/lib/portrait";

type Props = {
  src?: string | null;
  seed?: string | null;
  name?: string | null;
  gender?: string | null;
  size: number;
};

export default function AuthorAvatar({ src, seed, name, gender, size }: Props) {
  if (src) return <Image src={src} alt="" width={size} height={size} />;

  const p = portraitFor(seed || name || "", gender);
  return (
    <svg className="portrait" viewBox={PORTRAIT_VIEWBOX} width={size} height={size} role="img" aria-label={p.label}>
      {p.shapes.map((s, i) =>
        s.t === "path" ? <path key={i} d={s.d} fill={s.fill} />
          : s.t === "circle" ? <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />
            : <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} />,
      )}
    </svg>
  );
}
