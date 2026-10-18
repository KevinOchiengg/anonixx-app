"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { uploadFile } from "@/lib/upload";
import VoiceRecorder, { type VoiceDraft } from "../compose/VoiceRecorder";
import LocationFields, { type LocationDraft } from "../compose/LocationFields";
import { MAX_VIDEO_SECONDS, videoLength } from "../compose/MediaPicker";
import "../../app/poststudio.css";

type Format = "text" | "photo" | "video" | "voice" | "poll";
const FORMATS: { id: Format; label: string; hint: string; icon: string }[] = [
  { id: "text", label: "Text", hint: "Words on a gradient", icon: "Aa" },
  { id: "photo", label: "Photos", hint: "1 to 10 images", icon: "◧" },
  { id: "video", label: "Video", hint: `Up to ${MAX_VIDEO_SECONDS}s`, icon: "▶" },
  { id: "voice", label: "Voice", hint: "Record a note", icon: "●" },
  { id: "poll", label: "Poll", hint: "2 to 4 options", icon: "▤" },
];

const LOOKS = {
  "meet-me": { label: "Meet Me", sub: "Looking for something real", mood: "longing", from: "#12070c", to: "#2a121b", accent: "#FF6B8A", text: "#FBE8ED" },
  "skeleton-in-the-closet": { label: "Skeleton In The Closet", sub: "Secrets don't stay buried", mood: "untold", from: "#14060a", to: "#2a0f18", accent: "#FF3B7A", text: "#F6E6EC" },
  "just-tonight": { label: "Just Tonight", sub: "No strings attached", mood: "horny", from: "#0a0000", to: "#2b0505", accent: "#FF1744", text: "#FFE4E4" },
} as const;
type LookId = keyof typeof LOOKS;

const MAX_TEXT = 500;
const MAX_IMG_MB = 5;
const MAX_VID_MB = 50;
const EMPTY_PLACE: LocationDraft = { country: "", county: "", subCounty: "", estate: "" };

type Pick = { file: File; url: string };

export default function PostStudio() {
  const [format, setFormat] = useState<Format>("text");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Pick[]>([]);
  const [video, setVideo] = useState<Pick | null>(null);
  const [voice, setVoice] = useState<VoiceDraft>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [look, setLook] = useState<LookId>("skeleton-in-the-closet");
  const [mature, setMature] = useState(false);
  const [share, setShare] = useState(true);
  const [place, setPlace] = useState<LocationDraft>(EMPTY_PLACE);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const theme = LOOKS[look];
  const opts = options.map((o) => o.trim()).filter(Boolean);
  const placed = Object.values(place).some((v) => v.trim());

  const missing =
    format === "text" ? (text.trim() ? "" : "Write something to post.")
    : format === "photo" ? (photos.length ? "" : "Add at least one photo.")
    : format === "video" ? (video ? "" : "Add a video.")
    : format === "voice" ? (voice ? "" : "Record a voice note.")
    : !question.trim() ? "Ask a question."
    : opts.length < 2 ? "Add at least two options." : "";

  function track(file: File): Pick {
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    return { file, url };
  }

  function chooseFormat(f: Format) {
    setFormat(f);
    setError("");
  }

  async function addFiles(list: FileList | File[] | null) {
    if (!list || !list.length) return;
    setError("");
    const files = Array.from(list);
    if (format === "video") {
      const f = files.find((x) => x.type.startsWith("video/"));
      if (!f) return setError("That isn't a video file.");
      if (f.size > MAX_VID_MB * 1024 * 1024) return setError(`That video is too big. Max ${MAX_VID_MB}MB.`);
      setBusy("Checking video…");
      const len = await videoLength(f);
      setBusy("");
      if (len > MAX_VIDEO_SECONDS) return setError(`Videos must be ${MAX_VIDEO_SECONDS}s or shorter. This one is ${Math.round(len)}s.`);
      setVideo(track(f));
      return;
    }
    const imgs = files.filter((x) => x.type.startsWith("image/"));
    if (!imgs.length) return setError("Only image files can go here.");
    const big = imgs.find((x) => x.size > MAX_IMG_MB * 1024 * 1024);
    if (big) return setError(`${big.name} is too big. Max ${MAX_IMG_MB}MB per photo.`);
    const room = 10 - photos.length;
    if (imgs.length > room) setError("Only 10 photos fit in one drop. Extras were skipped.");
    setPhotos((p) => [...p, ...imgs.slice(0, room).map(track)]);
  }

  function makeCover(i: number) {
    setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)]);
  }

  async function publish() {
    if (missing) return setError(missing);
    setError("");
    try {
      let media: Record<string, unknown> = {};
      if (format === "photo") {
        const out: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          setBusy(`Uploading photo ${i + 1} of ${photos.length}…`);
          out.push(await uploadFile(photos[i].file, "image"));
        }
        media = out.length > 1 ? { images: out } : { media_type: "image", media_url: out[0] };
      } else if (format === "video" && video) {
        setBusy("Uploading video…");
        media = { media_type: "video", media_url: await uploadFile(video.file, "video") };
      } else if (format === "voice" && voice) {
        setBusy("Uploading voice note…");
        media = {
          media_type: "voice",
          media_url: await uploadFile(voice.blob, "voice"),
          duration_seconds: voice.seconds,
          waveform_data: voice.waveform,
        };
      } else if (format === "poll") {
        media = { poll: { question: question.trim(), options: opts.slice(0, 4) } };
      }
      setBusy("Publishing…");
      await api("/drops", {
        body: {
          kind: "confession",
          // the API needs some text on every drop; a poll's question stands in for a caption
          confession: text.trim() || (format === "poll" ? question.trim() : undefined),
          intent: look,
          mood_tag: theme.mood,
          font_style: "bold-tease",
          sensitivity: mature ? "mature" : "general",
          publisher_opt_in: share,
          ...(place.country.trim() ? { location_country: place.country.trim() } : {}),
          ...(place.county.trim() ? { location_county: place.county.trim() } : {}),
          ...(place.subCounty.trim() ? { location_sub_county: place.subCounty.trim() } : {}),
          ...(place.estate.trim() ? { location_estate: place.estate.trim() } : {}),
          ...media,
        },
      });
      setPublished(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function reset() {
    setText(""); setPhotos([]); setVideo(null); setVoice(null);
    setQuestion(""); setOptions(["", ""]); setPlace(EMPTY_PLACE);
    setMature(false); setError(""); setPublished(false);
  }

  const cover = format === "photo" ? photos[0]?.url : undefined;
  const previewText = text.trim() || (format === "poll" ? "" : "");
  const bars = useMemo(() => Array.from({ length: 36 }, (_, i) => 18 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.4)) * 70)), []);
  const voiceBars = voice?.waveform?.length ? voice.waveform.map((v) => 12 + Math.round(v * 88)) : bars;

  if (published) {
    return (
      <div className="ps-done">
        <div className="ps-check" aria-hidden>✓</div>
        <h2>It&apos;s live.</h2>
        <p>Posted as Anonixx. It&apos;s in the feed now.</p>
        <div className="ps-done-row">
          <Link href="/" className="ps-btn primary">View the feed</Link>
          <button type="button" className="ps-btn" onClick={reset}>Post another</button>
        </div>
      </div>
    );
  }

  const drop = (
    <div
      className={`ps-drop${drag ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      onClick={() => fileRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
    >
      <b>{format === "video" ? "Drop a video here" : photos.length ? "Add more photos" : "Drop photos here"}</b>
      <span>or click to browse{format === "photo" ? ` · up to 10, ${MAX_IMG_MB}MB each` : ` · ${MAX_VIDEO_SECONDS}s, ${MAX_VID_MB}MB max`}</span>
    </div>
  );

  return (
    <div className="ps">
      <div className="ps-head">
        <div>
          <h2>Post a drop</h2>
          <p>Publishes to the feed as <b>Anonixx</b>. Free, no coins.</p>
        </div>
      </div>

      <div className="ps-grid">
        <div className="ps-col">
          <section className="ps-sec">
            <h3><i>1</i> Format</h3>
            <div className="ps-formats" role="tablist">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={format === f.id} className={format === f.id ? "on" : ""} onClick={() => chooseFormat(f.id)}>
                  <span className="ic">{f.icon}</span>
                  <b>{f.label}</b>
                  <small>{f.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="ps-sec">
            <h3><i>2</i> Content</h3>

            {format === "photo" || format === "video" ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple={format === "photo"}
                  accept={format === "video" ? "video/*" : "image/*"}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
                {format === "photo" ? (
                  <>
                    {photos.length ? (
                      <div className="ps-thumbs">
                        {photos.map((p, i) => (
                          <div key={p.url} className="ps-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={`Photo ${i + 1}`} />
                            {i === 0 ? <em>Cover</em> : <button type="button" className="mk" onClick={() => makeCover(i)}>Make cover</button>}
                            <button type="button" className="rm" aria-label="Remove photo" onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))}>×</button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {photos.length < 10 ? drop : null}
                  </>
                ) : video ? (
                  <div className="ps-video">
                    <video src={video.url} controls playsInline muted />
                    <button type="button" className="ps-btn" onClick={() => setVideo(null)}>Replace video</button>
                  </div>
                ) : drop}
              </>
            ) : null}

            {format === "voice" ? <VoiceRecorder value={voice} onChange={setVoice} onError={setError} /> : null}

            {format === "poll" ? (
              <div className="ps-poll">
                <label>
                  <span>Question</span>
                  <input type="text" maxLength={140} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to know?" />
                </label>
                {options.map((o, i) => (
                  <div className="ps-opt" key={i}>
                    <span>{String.fromCharCode(65 + i)}</span>
                    <input type="text" maxLength={60} value={o} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} />
                    {options.length > 2 ? <button type="button" aria-label="Remove option" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))}>×</button> : null}
                  </div>
                ))}
                {options.length < 4 ? <button type="button" className="ps-link" onClick={() => setOptions((l) => [...l, ""])}>+ Add option</button> : null}
              </div>
            ) : null}

            <label className="ps-text">
              <span>{format === "text" ? "Your text" : format === "poll" ? "Caption (optional, defaults to the question)" : "Caption (optional)"}</span>
              <textarea
                rows={format === "text" ? 6 : 3}
                maxLength={MAX_TEXT}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={format === "text" ? "Say what people can't say out loud…" : "Add a line under it…"}
              />
              <small className={MAX_TEXT - text.length <= 20 ? "warn" : ""}>{MAX_TEXT - text.length} left</small>
            </label>
          </section>

          <section className="ps-sec">
            <h3><i>3</i> Look</h3>
            <div className="ps-looks">
              {(Object.keys(LOOKS) as LookId[]).map((id) => (
                <button key={id} type="button" className={look === id ? "on" : ""} onClick={() => setLook(id)}
                  style={{ "--f": LOOKS[id].from, "--t": LOOKS[id].to, "--a": LOOKS[id].accent } as React.CSSProperties}>
                  <span className="sw" />
                  <b>{LOOKS[id].label}</b>
                  <small>{LOOKS[id].sub}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="ps-sec">
            <h3><i>4</i> Reach</h3>
            <label className="ps-switch">
              <span><b>Share to Anonixx socials</b><small>Eligible for our official accounts.</small></span>
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            </label>
            <label className="ps-switch">
              <span><b>Mature content</b><small>Blurred until the viewer taps to reveal.</small></span>
              <input type="checkbox" checked={mature} onChange={(e) => setMature(e.target.checked)} />
            </label>
            <details className="ps-place" open={placed}>
              <summary>Target a location {placed ? <em>set</em> : <small>optional</small>}</summary>
              <LocationFields value={place} onChange={setPlace} />
            </details>
          </section>
        </div>

        <aside className="ps-side">
          <div className="ps-phone" style={{ "--f": theme.from, "--t": theme.to, "--a": theme.accent, "--x": theme.text } as React.CSSProperties}>
            <div className="ps-screen">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ps-bg" src={cover} alt="" />
              ) : null}
              {format === "video" && video ? <video className="ps-bg" src={video.url} muted playsInline loop autoPlay /> : null}
              {format === "photo" && photos.length > 1 ? (
                <div className="ps-dots">{photos.map((p, i) => <i key={p.url} className={i === 0 ? "on" : ""} />)}</div>
              ) : null}
              <div className={`ps-copy${cover || (format === "video" && video) ? " over" : ""}`}>
                {format === "poll" ? (
                  <div className="ps-pv-poll">
                    <b>{question.trim() || "Your question"}</b>
                    {(opts.length ? options.filter((o) => o.trim()) : ["Option one", "Option two"]).map((o, i) => <span key={i}>{o}</span>)}
                  </div>
                ) : null}
                {format === "voice" ? (
                  <div className="ps-pv-wave">{voiceBars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
                ) : null}
                {text.trim() || format === "text" ? <p>{previewText || "Your words show up here."}</p> : null}
                <div className="ps-by">
                  <span className="av">A</span>
                  <div><b>Anonixx</b><small>just now · Official</small></div>
                </div>
              </div>
              {mature ? <div className="ps-mature">Mature · blurred</div> : null}
            </div>
          </div>
          <p className="ps-note">Live preview of the feed card.</p>
        </aside>
      </div>

      <div className="ps-bar">
        <div className="ps-bar-msg">
          {error ? <span className="bad">{error}</span> : busy ? <span>{busy}</span> : missing ? <span className="mute">{missing}</span> : <span className="ok">Ready to publish.</span>}
        </div>
        <button type="button" className="ps-btn primary big" disabled={Boolean(busy) || Boolean(missing)} onClick={publish}>
          {busy ? "Working…" : "Publish as Anonixx"}
        </button>
      </div>
    </div>
  );
}
