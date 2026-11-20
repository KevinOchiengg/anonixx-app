"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type Sound } from "@/lib/api";
import { captureCover } from "@/lib/coverFrame";
import { queueStreamDrop, waitForStreamDrop } from "@/lib/streamVideo";
import { BgUpload, useBgUpload, type BgResult } from "@/lib/bgUpload";
import UploadCard from "../compose/UploadCard";
import "../../app/uploadcard.css";
import ScheduledDrops, { toLocalInput } from "./ScheduledDrops";
import { uploadFile } from "@/lib/upload";
import { keepReadable, clearLocalCopies } from "@/lib/localCopy";
import { sniffVideo, formatProblem } from "@/lib/videoFormat";
import VoiceRecorder, { type VoiceDraft } from "../compose/VoiceRecorder";
import LocationFields, { type LocationDraft } from "../compose/LocationFields";
import { videoLength } from "../compose/MediaPicker";
import VideoEditor from "../compose/VideoEditor";
import VideoPlayer from "../VideoPlayer";
import { defaultEdit, isMeaningful, type VideoEdit } from "@/lib/videoEdit";
import { IconText, IconImages, IconVideo, IconMic, IconPoll } from "../compose/toolicons";
import "../../app/poststudio.css";
import { Upload, X } from "lucide-react";

type Format = "text" | "photo" | "video" | "voice" | "poll";
const FORMATS: { id: Format; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "text", label: "Text", hint: "Words on a gradient", icon: <IconText /> },
  { id: "photo", label: "Photos", hint: "1 to 9 images", icon: <IconImages /> },
  { id: "video", label: "Video", hint: "Up to 3 min, trim + text", icon: <IconVideo /> },
  { id: "voice", label: "Voice", hint: "Record a note", icon: <IconMic /> },
  { id: "poll", label: "Poll", hint: "2 to 4 options", icon: <IconPoll /> },
];

const THEME = { from: "#14060a", to: "#2a0f18", accent: "#FF3B7A", text: "#F6E6EC" };

const MAX_TEXT = 500;
const MAX_IMG_MB = 5;
// The original goes up untouched (trim is applied at playback), so this has to leave
// room for a long phone video that gets cut down to three minutes.
const MAX_VID_MB = 500;
const EMPTY_PLACE: LocationDraft = { country: "", county: "", subCounty: "", estate: "" };

type Pick = { file: File; url: string };
type Done = { id?: string; scheduledFor?: string; finishing?: boolean; count?: number };
// Extra videos picked together: each one posts as its own drop (own id), sharing the settings.
type Extra = { key: string; pick: Pick; up: BgUpload; len: number; caption: string };
const MAX_BATCH = 10;

const PROMO_HOURS: [number, string][] = [[6, "6 hours"], [24, "1 day"], [72, "3 days"], [168, "7 days"]];

export default function PostStudio() {
  const [format, setFormat] = useState<Format>("text");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Pick[]>([]);
  const [video, setVideo] = useState<Pick | null>(null);
  const [vlen, setVlen] = useState(0);
  const [vedit, setVedit] = useState<VideoEdit | null>(null);
  const [voice, setVoice] = useState<VoiceDraft>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [mature, setMature] = useState(false);
  const [share, setShare] = useState(true);
  const [place, setPlace] = useState<LocationDraft>(EMPTY_PLACE);
  const [busy, setBusy] = useState("");
  const [noPreview, setNoPreview] = useState(false);
  const [formatNote, setFormatNote] = useState("");
  // The video starts uploading the moment it's picked (lib/bgUpload.ts).
  const [bg, setBg] = useState<BgUpload | null>(null);
  const bgRef = useRef<BgUpload | null>(null);
  bgRef.current = bg;
  useEffect(() => () => bgRef.current?.cancel(), []);
  const [extras, setExtras] = useState<Extra[]>([]);
  const extrasRef = useRef<Extra[]>([]);
  extrasRef.current = extras;
  useEffect(() => () => extrasRef.current.forEach((x) => x.up.cancel()), []);
  const replacing = useRef(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState<Done | null>(null);
  const [drag, setDrag] = useState(false);
  // Spotlight: cover frame, a track over the post, pin/boost, publish later
  const [coverAt, setCoverAt] = useState<number | null>(null);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [soundId, setSoundId] = useState("");
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [promo, setPromo] = useState<"" | "pin" | "boost">("");
  const [promoHours, setPromoHours] = useState(24);
  const [later, setLater] = useState(false);
  const [laterAt, setLaterAt] = useState("");
  const [schedRefresh, setSchedRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    // "Draft" on a search nobody found an answer for (Visitors page) brings its words here.
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic) {
      const t = topic.trim().toLowerCase().slice(0, 30);
      if (t) setTopicNote(t);
    }
  }, []);
  const [topicNote, setTopicNote] = useState("");
  const [bestTimes, setBestTimes] = useState<{ weekday: number; hour: number; at_utc: string }[]>([]);
  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    api<{ suggestions: { weekday: number; hour: number; at_utc: string }[]; enough_data: boolean }>(`/admin/insights/best-times?days=28&tz=${tz}`)
      .then((r) => setBestTimes(r.enough_data ? r.suggestions.slice(0, 3) : []))
      .catch(() => {});
  }, []);
  const poster = "Anonixx";
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    api<{ sounds?: Sound[] }>("/sounds").then((r) => setSounds(r.sounds || [])).catch(() => {});
    return () => audio.current?.pause();
  }, []);
  const sound = sounds.find((s) => s.id === soundId) || null;

  function hear() {
    if (!sound) return;
    if (hearing) { audio.current?.pause(); setHearing(false); return; }
    audio.current?.pause();
    const a = new Audio(sound.url);
    a.onended = () => setHearing(false);
    a.play().then(() => setHearing(true)).catch(() => setError("Couldn't play that sound."));
    audio.current = a;
  }

  const theme = THEME;
  const opts = options.map((o) => o.trim()).filter(Boolean);
  const placed = Object.values(place).some((v) => v.trim());

  const missing =
    format === "text" ? (text.trim() ? "" : "Write something to post.")
    : format === "photo" ? (photos.length ? "" : "Add at least one photo.")
    : format === "video" ? (video ? "" : "Add a video.")
    : format === "voice" ? (voice ? "" : "Record a voice note.")
    : !question.trim() ? "Ask a question."
    : opts.length < 2 ? "Add at least two options."
    : "";
  const laterMissing = later && (!laterAt || new Date(laterAt).getTime() < Date.now() + 60000) ? "Pick a time at least a minute from now." : "";
  const bgState = useBgUpload(format === "video" ? bg : null);
  const [, bump] = useState(0);
  useEffect(() => {
    const subs = extras.map((x) => x.up.subscribe(() => bump((n) => n + 1)));
    return () => subs.forEach((u) => u());
  }, [extras]);
  const extraFailed = format === "video" && extras.some((x) => x.up.state.status === "error");
  const uploadFailed = bgState?.status === "error" || extraFailed ? "A video didn't upload. Tap Retry on it." : "";
  const blocker = missing || laterMissing || uploadFailed;

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
      const vids = files.filter((x) => x.type.startsWith("video/"));
      if (!vids.length) return setError("That isn't a video file.");
      const big = vids.find((x) => x.size > MAX_VID_MB * 1024 * 1024);
      if (big) return setError(`${big.name} is too big. Max ${MAX_VID_MB}MB per video.`);
      // The first fills the main slot (trim, text, cover); the rest each become their own drop.
      const main = !video || replacing.current;
      replacing.current = false;
      const picked = main ? vids[0] : null;
      const rest = main ? vids.slice(1) : vids;
      if (rest.length) await addExtras(rest);
      if (!picked) return;
      // Copy it now, while Android still lets the page read it (see lib/localCopy.ts).
      setBusy("Preparing video…");
      if (!extrasRef.current.length && !rest.length) await clearLocalCopies();
      let f: File;
      try { f = await keepReadable(picked); } catch (e) { setBusy(""); return setError((e as Error).message); }
      setBusy("Checking video…");
      const len = await videoLength(f);
      // The browser couldn't open it: find out why from the file itself.
      setFormatNote(len ? "" : formatProblem(await sniffVideo(f)));
      setBusy("");
      // Over three minutes isn't refused: the editor opens on its first 3:00 instead.
      setNoPreview(!len);
      setVlen(len);
      setVedit(len ? defaultEdit(len) : null);
      setCoverAt(null);
      setVideo(track(f));
      bgRef.current?.cancel();
      setBg(new BgUpload(f));
      return;
    }
    const imgs = files.filter((x) => x.type.startsWith("image/"));
    if (!imgs.length) return setError("Only image files can go here.");
    const big = imgs.find((x) => x.size > MAX_IMG_MB * 1024 * 1024);
    if (big) return setError(`${big.name} is too big. Max ${MAX_IMG_MB}MB per photo.`);
    const room = 9 - photos.length;
    if (imgs.length > room) setError("Only 9 photos fit in one drop. Extras were skipped.");
    let kept: File[];
    try { kept = await Promise.all(imgs.slice(0, room).map(keepReadable)); } catch (e) { return setError((e as Error).message); }
    setPhotos((p) => [...p, ...kept.map(track)]);
  }

  async function addExtras(list: File[]) {
    const room = MAX_BATCH - 1 - extrasRef.current.length;
    if (room <= 0) return setError(`Up to ${MAX_BATCH} videos at a time.`);
    if (list.length > room) setError(`Up to ${MAX_BATCH} videos at a time. Extras were skipped.`);
    setBusy("Preparing videos…");
    const out: Extra[] = [];
    for (const raw of list.slice(0, room)) {
      try {
        const f = await keepReadable(raw);
        out.push({ key: `${Date.now()}-${Math.random()}`, pick: track(f), up: new BgUpload(f), len: await videoLength(f), caption: "" });
      } catch (e) { setError((e as Error).message); }
    }
    setBusy("");
    setExtras((l) => [...l, ...out]);
  }

  function removeExtra(key: string) {
    extrasRef.current.find((x) => x.key === key)?.up.cancel();
    setExtras((l) => l.filter((x) => x.key !== key));
  }

  function retryExtra(key: string) {
    setExtras((l) => l.map((x) => (x.key === key ? { ...x, up: new BgUpload(x.pick.file) } : x)));
  }

  function removeVideo() {
    bgRef.current?.cancel();
    setBg(null);
    setVideo(null); setVlen(0); setVedit(null); setCoverAt(null); setFormatNote(""); setNoPreview(false);
  }

  // Waits for the background upload, showing its progress if Publish was pressed early.
  async function uploadedVideo(): Promise<BgResult> {
    const up = bgRef.current;
    if (!up) throw new Error("Add the video again.");
    let unsub: (() => void) | undefined;
    if (up.state.status === "uploading") {
      setBusy(`Finishing upload… ${up.state.pct}%`);
      unsub = up.subscribe((st) => setBusy(`Finishing upload… ${st.pct}%`));
    }
    try { return await up.wait(); } finally { unsub?.(); }
  }

  function makeCover(i: number) {
    setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)]);
  }

  async function publish() {
    if (blocker) return setError(blocker);
    setError("");
    audio.current?.pause();
    setHearing(false);
    try {
      let media: Record<string, unknown> = {};
      let streamUid = "";
      let streamEdit: VideoEdit | null = null;
      if (format === "photo") {
        const out: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          setBusy(`Uploading photo ${i + 1} of ${photos.length}…`);
          out.push(await uploadFile(photos[i].file, "image"));
        }
        media = out.length > 1 ? { images: out } : { media_type: "image", media_url: out[0] };
      } else if (format === "video" && video) {
        // Cover first (it's quick): the chosen frame, or the clip's first frame, with its text.
        let cover_url: string | undefined;
        if (vedit && !noPreview) {
          setBusy("Making the cover…");
          try {
            const shot = await captureCover(video.url, coverAt ?? vedit.start, vedit.overlays);
            cover_url = await uploadFile(shot, "image");
          } catch { /* no cover: the feed falls back to the video itself */ }
        }
        const edit = vedit ? { ...vedit, overlays: vedit.overlays.filter((o) => o.text.trim()) } : null;
        const uploaded = await uploadedVideo();
        if ("streamUid" in uploaded) {
          // Stream: the backend cuts edit's window out of the original and watermarks it.
          streamUid = uploaded.streamUid;
          streamEdit = edit;
          media = {
            media_type: "video",
            ...(edit?.overlays.length ? { video_edit: edit } : {}),
            ...(cover_url ? { cover_url } : {}),
          };
        } else {
          media = {
            media_type: "video",
            media_url: uploaded.url,
            ...(isMeaningful(edit, vlen) ? { video_edit: edit } : {}),
            ...(cover_url ? { cover_url } : {}),
          };
        }
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
      setBusy(later ? "Scheduling…" : "Publishing…");
      const build = (caption: string, m: Record<string, unknown>) => ({
          kind: "confession",
          // the API needs some text on every drop; a poll's question stands in for a caption
          confession: caption || (format === "poll" ? question.trim() : undefined),
          font_style: "classic",
          ...(topicNote ? { tags: [topicNote] } : {}),
          sensitivity: mature ? "mature" : "general",
          publisher_opt_in: share,
          ...(place.country.trim() ? { location_country: place.country.trim() } : {}),
          ...(place.county.trim() ? { location_county: place.county.trim() } : {}),
          ...(place.subCounty.trim() ? { location_sub_county: place.subCounty.trim() } : {}),
          ...(place.estate.trim() ? { location_estate: place.estate.trim() } : {}),
          ...(sound && format !== "voice" ? { sound_id: sound.id, sound_mute_original: format === "video" && muteOriginal } : {}),
          ...(promo ? { promo_kind: promo, promo_hours: promoHours } : {}),
          ...m,
      });
      const body = build(text.trim(), media);
      const batch = format === "video" ? extras : [];
      const at = later ? new Date(laterAt).toISOString() : null;
      if (batch.length) {
        // Several videos: each becomes its own drop. Stream ones finish in the background.
        const all = [{ body, uid: streamUid, edit: streamEdit }];
        for (let i = 0; i < batch.length; i++) {
          const x = batch[i];
          const n = `${i + 2} of ${batch.length + 1}`;
          setBusy(`Preparing video ${n}…`);
          const edit = x.len ? defaultEdit(x.len) : null;
          let cover_url: string | undefined;
          if (x.len) { try { cover_url = await uploadFile(await captureCover(x.pick.url, 0, []), "image"); } catch { /* feed falls back to the video */ } }
          const unsub = x.up.subscribe((st) => setBusy(`Uploading video ${n}… ${st.pct}%`));
          let up: BgResult;
          try { up = await x.up.wait(); } finally { unsub(); }
          const cap = x.caption.trim() || text.trim();
          const cov = cover_url ? { cover_url } : {};
          if ("streamUid" in up) all.push({ body: build(cap, { media_type: "video", ...cov }), uid: up.streamUid, edit });
          else all.push({ body: build(cap, { media_type: "video", media_url: up.url, ...(isMeaningful(edit, x.len) ? { video_edit: edit } : {}), ...cov }), uid: "", edit: null });
        }
        let first = "";
        let queued = false;
        for (let i = 0; i < all.length; i++) {
          const d = all[i];
          setBusy(`${at ? "Scheduling" : "Publishing"} ${i + 1} of ${all.length}…`);
          if (d.uid) { await queueStreamDrop(d.body, d.uid, d.edit, at); queued = true; }
          else if (at) await api("/admin/scheduled", { body: { publish_at: at, drop: d.body } });
          else { const r = await api<{ id?: string }>("/drops", { body: d.body }); first ||= r.id || ""; }
        }
        setSchedRefresh((k) => k + 1);
        setPublished(at ? { scheduledFor: at, count: all.length } : { id: first || undefined, finishing: queued && !first, count: all.length });
        return;
      }
      if (streamUid) {
        const job = await queueStreamDrop(body, streamUid, streamEdit, at);
        setSchedRefresh((n) => n + 1);
        if (at) {
          setPublished({ scheduledFor: at });
        } else {
          setBusy("Cutting and watermarking your video… this takes a minute or two.");
          const done = await waitForStreamDrop(job.id);
          setSchedRefresh((n) => n + 1);
          if (done.status === "failed") throw new Error(done.error || "Stream couldn't process this video.");
          setPublished(done.drop_id ? { id: done.drop_id } : { finishing: true });
        }
      } else if (at) {
        await api("/admin/scheduled", { body: { publish_at: at, drop: body } });
        setSchedRefresh((n) => n + 1);
        setPublished({ scheduledFor: at });
      } else {
        const r = await api<{ id?: string }>("/drops", { body });
        setPublished({ id: r.id });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function reset() {
    bgRef.current?.cancel(); setBg(null);
    extrasRef.current.forEach((x) => x.up.cancel()); setExtras([]);
    setText(""); setPhotos([]); setVideo(null); setVlen(0); setVedit(null); setVoice(null);
    setQuestion(""); setOptions(["", ""]); setPlace(EMPTY_PLACE);
    setTopicNote(""); setMature(false); setError(""); setPublished(null);
    setCoverAt(null); setSoundId(""); setMuteOriginal(false); setPromo(""); setLater(false); setLaterAt(""); setCopied(false);
  }

  const link = published?.id && typeof window !== "undefined" ? `${window.location.origin}/drop/${published.id}` : "";
  const shareText = text.trim().slice(0, 100) || "someone said this on anonixx…";
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError("Couldn't copy. Long-press the link instead."); }
  }

  const cover = format === "photo" ? photos[0]?.url : undefined;
  const previewText = text.trim() || (format === "poll" ? "" : "");
  const bars = useMemo(() => Array.from({ length: 36 }, (_, i) => 18 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.4)) * 70)), []);
  const voiceBars = voice?.waveform?.length ? voice.waveform.map((v) => 12 + Math.round(v * 88)) : bars;

  if (published) {
    return (
      <div className="ps-done">
        <div className="ps-check" aria-hidden>✓</div>
        {published.finishing ? (
          <>
            <h2>Almost there.</h2>
            <p>Stream is still finishing {published.count ? `the ${published.count} videos. Each posts as its own drop` : "the video. It posts"} itself as {poster} the moment it&apos;s ready, so you can leave this page. Track it under Coming up.</p>
          </>
        ) : published.scheduledFor ? (
          <>
            <h2>{published.count ? `${published.count} drops queued.` : <>It&apos;s queued.</>}</h2>
            <p>{published.count ? "Each one goes" : "Goes"} live as {poster} on {new Date(published.scheduledFor).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Find it under Coming up.</p>
          </>
        ) : (
          <>
            <h2>{published.count ? `${published.count} drops posted.` : <>It&apos;s live.</>}</h2>
            {published.count ? <p className="ps-help">Each video is its own drop. Any still processing on Stream show under Coming up until they go live.</p> : null}
            <p>Posted as {poster}{promo ? `, ${promo === "pin" ? "pinned to the top" : "boosted"} for ${PROMO_HOURS.find(([h]) => h === promoHours)?.[1]}` : ""}. Now send it somewhere it can spread.</p>
            {link ? (
              <div className="ps-share">
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Post link" />
                <div className="ps-done-row">
                  <button type="button" className="ps-btn" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
                  <a className="ps-btn" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${link}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                  <a className="ps-btn" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer">X</a>
                  <a className="ps-btn" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">Telegram</a>
                </div>
                <small className="ps-help">The link preview shows the cover{share ? " (blurred into a teaser once it goes out to our socials)" : ""}.</small>
              </div>
            ) : null}
          </>
        )}
        <div className="ps-done-row">
          {published.id ? <Link href={`/drop/${published.id}`} className="ps-btn primary">See it</Link> : <Link href="/" className="ps-btn primary">View the feed</Link>}
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
      <span className="ps-drop-ic" aria-hidden>
        <Upload strokeWidth={2} aria-hidden />
      </span>
      <b>{format === "video" ? "Select videos to upload" : photos.length ? "Add more photos" : "Select photos to upload"}</b>
      <span>or drag and drop {format === "video" ? `up to ${MAX_BATCH}` : "them"} here · {format === "video" ? "each video posts as its own drop" : "it starts uploading straight away"}</span>
      <span className="up-specs">
        {format === "video" ? (
          <><span>MP4 (H.264)</span><span>Up to 3 min</span><span>{MAX_VID_MB}MB max</span><span>Camera: Most compatible</span></>
        ) : (
          <><span>JPG or PNG</span><span>Up to 9</span><span>{MAX_IMG_MB}MB each</span></>
        )}
      </span>
    </div>
  );

  return (
    <div className="ps">
      <div className="ps-head">
        <div>
          <h2>Post a drop</h2>
          <p>Free, no coins. Shows in the feed as Anonixx.</p>
        </div>
      </div>

      <ScheduledDrops refresh={schedRefresh} />

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
            {topicNote ? <p className="ps-help">People searched “{topicNote}” and found nothing. Write the drop they were looking for; it&apos;ll come up for that search.</p> : null}

            {format === "photo" || format === "video" ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple
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
                            <button type="button" className="rm" aria-label="Remove photo" onClick={() => setPhotos((l) => l.filter((_, j) => j !== i))}><X size={20} strokeWidth={2} aria-hidden /></button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {photos.length < 9 ? drop : null}
                  </>
                ) : video ? (
                  <div className="ps-video">
                    {bg ? (
                      <UploadCard
                        up={bg}
                        onReplace={() => { replacing.current = true; fileRef.current?.click(); }}
                        onCancel={removeVideo}
                        onRetry={() => setBg(new BgUpload(video.file))}
                      />
                    ) : null}
                    {vedit && !noPreview ? (
                      <VideoEditor
                        src={video.url} duration={vlen} value={vedit} onChange={setVedit} onNoPreview={() => { setNoPreview(true); sniffVideo(video.file).then((r) => setFormatNote(formatProblem(r))).catch(() => {}); }}
                        cover={coverAt ?? vedit.start} onCover={setCoverAt}
                      />
                    ) : (
                      <p className="ps-note">{formatNote || "This browser can't play this video, so it can't be trimmed or captioned here. An H.264 .mp4 is the safest choice."}</p>
                    )}
                    {extras.length ? (
                      <div className="ps-batch">
                        <b>{extras.length + 1} videos · each posts as its own drop</b>
                        <small className="ps-help">These use their first 3 minutes and first frame as cover. Reach and Spotlight apply to all.</small>
                        {extras.map((x, i) => (
                          <div key={x.key} className="ps-batch-item">
                            <video src={x.pick.url} muted playsInline preload="metadata" />
                            <div>
                              <UploadCard up={x.up} onReplace={() => removeExtra(x.key)} onCancel={() => removeExtra(x.key)} onRetry={() => retryExtra(x.key)} />
                              <input type="text" maxLength={MAX_TEXT} value={x.caption} placeholder="Caption (blank uses the main one)" aria-label={`Caption for video ${i + 2}`}
                                onChange={(e) => setExtras((l) => l.map((y) => (y.key === x.key ? { ...y, caption: e.target.value } : y)))} />
                            </div>
                            <button type="button" className="rm" aria-label="Remove video" onClick={() => removeExtra(x.key)}><X size={16} strokeWidth={2} aria-hidden /></button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {extras.length < MAX_BATCH - 1 ? <button type="button" className="ps-link" onClick={() => fileRef.current?.click()}>+ Add more videos</button> : null}
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
                    {options.length > 2 ? <button type="button" aria-label="Remove option" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))}><X size={20} strokeWidth={2} aria-hidden /></button> : null}
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
            <h3><i>3</i> Reach</h3>
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

          <section className="ps-sec ps-spot">
            <h3><i>4</i> Spotlight <em className="ps-pro">admin</em></h3>
            <p className="ps-help">Extras that make a drop stop the scroll and travel further.</p>

            {format === "video" ? (
              <div className="ps-spot-row">
                <b>Cover</b>
                <span>{!video ? "Add a video first." : noPreview || !vedit ? "This format can't be framed here, so no cover." : `Frame at ${Math.floor((coverAt ?? vedit.start) / 60)}:${String(Math.round((coverAt ?? vedit.start) % 60)).padStart(2, "0")}${coverAt == null ? " (clip start)" : ""} with your text on it. Pick another with “Use this frame as cover” above. It's the poster and the link preview.`}</span>
              </div>
            ) : null}

            {format !== "voice" ? (
              <div className="ps-spot-row">
                <b>Sound</b>
                {sounds.length ? (
                  <div className="ps-spot-ctl">
                    <select value={soundId} onChange={(e) => { audio.current?.pause(); setHearing(false); setSoundId(e.target.value); }} aria-label="Sound">
                      <option value="">{format === "text" ? "Auto (by mood)" : "No sound"}</option>
                      {sounds.map((s) => <option key={s.id} value={s.id}>{s.title}{s.mood !== "any" ? ` · ${s.mood}` : ""}</option>)}
                    </select>
                    {sound ? <button type="button" className="ps-btn" onClick={hear}>{hearing ? "Stop" : "Listen"}</button> : null}
                    {sound && format === "video" ? (
                      <label className="ps-check-inline"><input type="checkbox" checked={muteOriginal} onChange={(e) => setMuteOriginal(e.target.checked)} /> Replace the video&apos;s own audio</label>
                    ) : null}
                  </div>
                ) : <span>No sounds yet. Add some on the <Link href="/admin/sounds">Sounds</Link> page.</span>}
              </div>
            ) : null}

            <div className="ps-spot-row">
              <b>Pin or boost</b>
              <div className="ps-spot-ctl">
                <div className="ps-seg" role="group" aria-label="Promote">
                  {([["", "Off"], ["pin", "Pin to top"], ["boost", "Boost"]] as const).map(([k, l]) => (
                    <button key={k} type="button" className={promo === k ? "on" : ""} onClick={() => setPromo(k)}>{l}</button>
                  ))}
                </div>
                {promo ? (
                  <select value={promoHours} onChange={(e) => setPromoHours(Number(e.target.value))} aria-label="For how long">
                    {PROMO_HOURS.map(([h, l]) => <option key={h} value={h}>for {l}</option>)}
                  </select>
                ) : null}
              </div>
              <span>{promo === "pin" ? "First thing everyone sees when they open the feed." : promo === "boost" ? "Shown near the top of everyone's feed." : "Shows in the feed like any new drop."}</span>
            </div>

            <div className="ps-spot-row">
              <b>When</b>
              <div className="ps-spot-ctl">
                <div className="ps-seg" role="group" aria-label="When">
                  <button type="button" className={!later ? "on" : ""} onClick={() => setLater(false)}>Now</button>
                  <button type="button" className={later ? "on" : ""} onClick={() => { setLater(true); if (!laterAt) setLaterAt(toLocalInput(new Date(Date.now() + 3600000))); }}>Later</button>
                </div>
                {later ? (
                  <input type="datetime-local" value={laterAt} min={toLocalInput(new Date(Date.now() + 120000))} onChange={(e) => setLaterAt(e.target.value)} aria-label="Publish at" />
                ) : null}
              </div>
              {later && bestTimes.length ? (
                <div className="ps-seg" role="group" aria-label="Suggested times">
                  {bestTimes.map((b) => {
                    const at = new Date(b.at_utc);
                    return (
                      <button key={b.at_utc} type="button" onClick={() => setLaterAt(toLocalInput(at))} title="One of the busiest hours on the site">
                        {at.toLocaleDateString(undefined, { weekday: "short" })} {at.toLocaleTimeString(undefined, { hour: "numeric" })}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {later ? <span>{bestTimes.length ? "Those are the busiest hours on the site lately." : "Evenings (8pm to midnight) are when the feed is busiest."}{promo ? " The pin/boost clock starts when it goes live." : ""}</span> : null}
            </div>
          </section>
        </div>

        <aside className="ps-side">
          <div className="ps-phone" style={{ "--f": theme.from, "--t": theme.to, "--a": theme.accent, "--x": theme.text } as React.CSSProperties}>
            <div className="ps-screen">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ps-bg" src={cover} alt="" />
              ) : null}
              {format === "video" && video ? (
                <div className="ps-bg"><VideoPlayer src={video.url} active near muted edit={vedit} /></div>
              ) : null}
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
              </div>
              {mature ? <div className="ps-mature">Mature · blurred</div> : null}
              {promo === "pin" || sound ? (
                <div className="ps-chips">
                  {promo === "pin" ? <span className="pin-tag">pinned</span> : null}
                  {sound ? <span className="ps-sound">♪ {sound.title}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          <p className="ps-note">Live preview of the feed card.</p>
        </aside>
      </div>

      <div className="ps-bar">
        <div className="ps-bar-msg">
          {error ? <span className="bad">{error}</span> : busy ? <span>{busy}</span> : blocker ? <span className="mute">{blocker}</span> : <span className="ok">{bgState?.status === "uploading" ? `Video uploading ${bgState.pct}%. You can ${later ? "schedule" : "publish"} now; it goes once the upload finishes.` : later ? "Ready to schedule." : "Ready to publish."}</span>}
        </div>
        <button type="button" className="ps-btn primary big" disabled={Boolean(busy) || Boolean(blocker)} onClick={publish}>
          {busy ? "Working…" : later ? "Schedule it" : `Publish as ${poster}`}
        </button>
      </div>
    </div>
  );
}
