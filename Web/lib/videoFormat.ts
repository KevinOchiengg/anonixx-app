// After a video fails to open, read its codec from the file header to explain why.

export type VideoCodec = "hevc" | "dolby" | "avc" | "av1" | "vp9" | "unknown";

const SCAN = 2 * 1024 * 1024;
const FOURCC: [string, VideoCodec][] = [
  ["dvh1", "dolby"], ["dvhe", "dolby"],
  ["hvc1", "hevc"], ["hev1", "hevc"],
  ["av01", "av1"], ["vp09", "vp9"], ["avc1", "avc"], ["avc3", "avc"],
];

export async function sniffVideo(file: Blob): Promise<{ codec: VideoCodec; hdr: boolean }> {
  const parts = [file.slice(0, SCAN)];
  if (file.size > SCAN) parts.push(file.slice(Math.max(SCAN, file.size - SCAN)));
  let text = "";
  for (const p of parts) {
    try {
      // latin1 keeps one character per byte, so four-letter codes can be found as text
      text += new TextDecoder("latin1").decode(await p.arrayBuffer());
    } catch { /* unreadable: leave it unknown */ }
  }
  const codec = FOURCC.find(([tag]) => text.includes(tag))?.[1] ?? "unknown";
  // mastering-display / content-light boxes and Dolby Vision config only appear in HDR video
  const hdr = codec === "dolby" || text.includes("mdcv") || text.includes("clli") || text.includes("dvcC") || text.includes("dvvC");
  return { codec, hdr };
}

export function formatProblem({ codec, hdr }: { codec: VideoCodec; hdr: boolean }): string {
  const fix = "To avoid this, record without it: on Android, open Camera settings → Video and turn off \"High efficiency video\" (and HDR); on iPhone, Settings → Camera → Formats → Most Compatible.";
  if (codec === "hevc" || codec === "dolby") {
    return `This video is HEVC (H.265)${hdr ? " with HDR" : ""}, which this browser can't play, so it can't be trimmed or captioned here. Posted as it is, many people's browsers won't play it either. ${fix}`;
  }
  if (hdr) {
    return `This is an HDR video, which this browser can't play, so it can't be trimmed or captioned here. Posted as it is, many people's browsers won't play it either. ${fix}`;
  }
  if (codec === "av1" || codec === "vp9") {
    return `This video uses ${codec === "av1" ? "AV1" : "VP9"}, which this browser can't play, so it can't be trimmed or captioned here. Convert it to an H.264 .mp4 to edit it.`;
  }
  return "This browser can't open this video, so it can't be trimmed or captioned here. It may be damaged or in an unusual format; an H.264 .mp4 is the safest choice.";
}
