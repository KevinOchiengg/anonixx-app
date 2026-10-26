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
import { TAG_GROUPS, TOP_TAGS } from "@/lib/adminTags";
import "../../app/poststudio.css";

type Format = "text" | "photo" | "video" | "voice" | "poll";
const FORMATS: { id: Format; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "text", label: "Text", hint: "Words on a gradient", icon: <IconText /> },
  { id: "photo", label: "Photos", hint: "1 to 9 images", icon: <IconImages /> },
  { id: "video", label: "Video", hint: "Up to 3 min, trim + text", icon: <IconVideo /> },
  { id: "voice", label: "Voice", hint: "Record a note", icon: <IconMic /> },
  { id: "poll", label: "Poll", hint: "2 to 4 options", icon: <IconPoll /> },
];

const THEME = { from: "#14060a", to: "#2a0f18", accent: "#FF3B7A", text: "#F6E6EC" };
const MAX_TAGS = 10;

const MAX_TEXT = 500;
const MAX_IMG_MB = 5;
// The original goes up untouched (trim is applied at playback), so this has to leave
// room for a long phone video that gets cut down to three minutes.
const MAX_VID_MB = 500;
const EMPTY_PLACE: LocationDraft = { country: "", county: "", subCounty: "", estate: "" };

type Pick = { file: File; url: string };
type Done = { id?: string; scheduledFor?: string; finishing?: boolean };

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
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [tagGroup, setTagGroup] = useState<string | null>(null); // open picker section, null = collapsed
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
    try { setName(localStorage.getItem("anonixx_post_as") || ""); } catch {}
    // "Draft" on a search nobody found an answer for (Visitors page) brings its words here.
    const topic = new URLSearchParams(window.location.search).get("topic");
    if (topic) {
      const t = topic.trim().toLowerCase().slice(0, 30);
      if (t) setTags((l) => (l.includes(t) ? l : [...l, t]));
      setText((cur) => cur || "");
      setTopicNote(t);
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
  useEffect(() => {
    try { localStorage.setItem("anonixx_post_as", name); } catch {}
  }, [name]);
  const poster = name.trim() || "Anonixx";
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
  const uploadFailed = bgState?.status === "error" ? "The video didn't upload. Tap Retry on it." : "";
  const blocker = missing || laterMissing || uploadFailed;

  function track(file: File): Pick {
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    return { file, url };
  }

  function addTag(raw: string) {
    const parts = raw.split(",").map((t) => t.trim().replace(/^#/, "").split(" ").filter(Boolean).join(" ").toLowerCase().slice(0, 30)).filter(Boolean);
    if (!parts.length) return;
    setTags((l) => {
      const next = [...l];
      for (const t of parts) if (!next.includes(t) && next.length < MAX_TAGS) next.push(t);
      return next;
    });
    setTagDraft("");
  }

  // Picker chips toggle: tap to add, tap again to remove.
  function toggleTag(t: string) {
    if (tags.includes(t)) setTags((l) => l.filter((x) => x !== t));
    else addTag(t);
  }

  function pickChip(t: string) {
    const on = tags.includes(t);
    return (
      <button key={t} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => toggleTag(t)} disabled={!on && tags.length >= MAX_TAGS}>
        {on ? "✓" : "+"} {t}
      </button>
    );
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
      const picked = files.find((x) => x.type.startsWith("video/"));
      if (!picked) return setError("That isn't a video file.");
      if (picked.size > MAX_VID_MB * 1024 * 1024) return setError(`That video is too big. Max ${MAX_VID_MB}MB.`);
      // Copy it now, while Android still lets the page read it (see lib/localCopy.ts).
      setBusy("Preparing video…");
      await clearLocalCopies();
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
      const body = {
          kind: "confession",
          ...(name.trim() ? { display_name: name.trim() } : {}),
          // the API needs some text on every drop; a poll's question stands in for a caption
          confession: text.trim() || (format === "poll" ? question.trim() : undefined),
          font_style: "bold-tease",
          ...(tags.length ? { tags } : {}),
          sensitivity: mature ? "mature" : "general",
          publisher_opt_in: share,
          ...(place.country.trim() ? { location_country: place.country.trim() } : {}),
          ...(place.county.trim() ? { location_county: place.county.trim() } : {}),
          ...(place.subCounty.trim() ? { location_sub_county: place.subCounty.trim() } : {}),
          ...(place.estate.trim() ? { location_estate: place.estate.trim() } : {}),
          ...(sound && format !== "voice" ? { sound_id: sound.id, sound_mute_original: format === "video" && muteOriginal } : {}),
          ...(promo ? { promo_kind: promo, promo_hours: promoHours } : {}),
          ...media,
      };
      if (streamUid) {
        const at = later ? new Date(laterAt).toISOString() : null;
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
      } else if (later) {
        const at = new Date(laterAt).toISOString();
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
    setText(""); setPhotos([]); setVideo(null); setVlen(0); setVedit(null); setVoice(null);
    setQuestion(""); setOptions(["", ""]); setPlace(EMPTY_PLACE);
    setTags([]); setTagDraft(""); setTagGroup(null); setMature(false); setError(""); setPublished(null);
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
            <p>Stream is still finishing the video. It posts itself as {poster} the moment it&apos;s ready, so you can leave this page. Track it under Coming up.</p>
          </>
        ) : published.scheduledFor ? (
          <>
            <h2>It&apos;s queued.</h2>
            <p>Goes live as {poster} on {new Date(published.scheduledFor).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Find it under Coming up.</p>
          </>
        ) : (
          <>
            <h2>It&apos;s live.</h2>
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" /></svg>
      </span>
      <b>{format === "video" ? "Select video to upload" : photos.length ? "Add more photos" : "Select photos to upload"}</b>
      <span>or drag and drop {format === "video" ? "a file" : "them"} here · it starts uploading straight away</span>
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
          <p>Free, no coins. Shows in the feed under the name below.</p>
        </div>
      </div>

      <section className="ps-sec ps-as">
        <label className="ps-text">
          <span>Post as</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Anonixx" />
        </label>
        <p className="ps-help">Give the page a personality, like SweetSpot or Midnight Confessions. Leave it empty to post as Anonixx.</p>
      </section>

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
                    {photos.length < 9 ? drop : null}
                  </>
                ) : video ? (
                  <div className="ps-video">
                    {bg ? (
                      <UploadCard
                        up={bg}
                        onReplace={() => fileRef.current?.click()}
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
            <h3><i>3</i> Search keywords</h3>
            {topicNote ? <p className="ps-help">People searched “{topicNote}” and found nothing. Write the drop they were looking for; the keyword is added.</p> : null}
            <p className="ps-help">When someone searches Anonixx, these words (and your caption) are what find this drop. Add what people would type.</p>
            <div className="ps-tags">
              {tags.map((t) => (
                <span key={t} className="ps-tag">#{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => setTags((l) => l.filter((x) => x !== t))}>×</button></span>
              ))}
              {tags.length < MAX_TAGS ? (
                <input
                  type="text"
                  value={tagDraft}
                  maxLength={30}
                  placeholder={tags.length ? "Add another…" : "Type a keyword, press Enter"}
                  onChange={(e) => { if (e.target.value.includes(",")) addTag(e.target.value); else setTagDraft(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); }
                    else if (e.key === "Backspace" && !tagDraft && tags.length) setTags((l) => l.slice(0, -1));
                  }}
                  onBlur={() => addTag(tagDraft)}
                />
              ) : null}
            </div>
            <div className="ps-pick">
              <b>Quick picks</b>
              <div className="ps-suggest">{TOP_TAGS.map(pickChip)}</div>
              <div className="ps-pick-tabs" role="tablist">
                {TAG_GROUPS.map((g) => {
                  const n = g.tags.filter((t) => tags.includes(t)).length;
                  const open = tagGroup === g.name;
                  return (
                    <button key={g.name} type="button" role="tab" aria-selected={open} className={open ? "on" : ""} onClick={() => setTagGroup(open ? null : g.name)}>
                      {g.name}{n ? <em>{n}</em> : null}
                    </button>
                  );
                })}
              </div>
              {tagGroup ? (
                <div className="ps-suggest">{(TAG_GROUPS.find((g) => g.name === tagGroup)?.tags || []).map(pickChip)}</div>
              ) : null}
            </div>
            <small className="ps-help">{tags.length}/{MAX_TAGS} keywords{!tags.length && !text.trim() && format !== "poll" ? " · with no caption or keywords, this drop can't be found by search." : ""}</small>
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

          <section className="ps-sec ps-spot">
            <h3><i>5</i> Spotlight <em className="ps-pro">admin</em></h3>
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
