"use client";
import { useState } from "react";
import Image from "next/image";
import { fillsFrame } from "@/lib/mediaFit";

/** A feed photo: fills the slide when it's phone-shaped, otherwise shown whole over its own blur. */
export default function FitImage({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  const [fill, setFill] = useState(false);
  return (
    <div className={`fit${fill ? " fill" : ""}`}>
      {fill ? null : <Image className="fit-blur" src={src} alt="" width={64} height={80} aria-hidden />}
      <Image
        src={src}
        alt={alt}
        width={1080}
        height={1350}
        sizes="100vw"
        priority={priority}
        onLoad={(e) => {
          const i = e.currentTarget;
          setFill(fillsFrame(i.naturalWidth, i.naturalHeight, i.parentElement));
        }}
      />
    </div>
  );
}
