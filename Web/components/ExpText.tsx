"use client";
import { useExperiment } from "@/lib/experiments";

/** Text that an A/B test on /admin/growth can swap (key), else the fallback. */
export default function ExpText({ k, fallback }: { k: string; fallback: string }) {
  return <>{useExperiment(k, fallback)}</>;
}
