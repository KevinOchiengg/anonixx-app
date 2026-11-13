"use client";
/** "Your Room", and where every Room setting lives (the Rooms ⋮ menu opens it on a tab):
 * My Room, Welcome, Knocks, Inside, Calls, Appearance, Privacy, Notifications. ?tab= picks one. */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadFile } from "@/lib/upload";
import {
  ChatBackground,
  DEFAULT_FONT,
  DEFAULT_PATTERN,
  FONTS,
  FONTS_HREF,
  PATTERNS,
  SOUNDS,
  type GalleryItem,
} from "@/lib/chatTheme";
import { intentLabel } from "@/lib/linkup";
import {
  DEFAULT_ROOM_THEME, GALLERY_VISIBILITY, MAX_INTRO, MAX_WELCOME, ROOM_STATUSES, roomThemeById,
} from "@/lib/roomThemes";
import AppShell from "./AppShell";
import KnockClues, { type KnockClue } from "./KnockClues";
import RoomThemePicker, { RoomMini } from "./RoomThemePicker";
import WelcomeAudio from "./rooms/WelcomeAudio";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Profile = {
  background_pattern?: string;
  font_style?: string;
  profile_picture_url?: string | null;
  anonymous_name?: string;
  gallery?: GalleryItem[];
  welcome_sound?: string;
  call_mode?: string;
  max_guests?: number;
  purchased_slots?: number;
  room_theme?: string;
  intro?: string | null;
  welcome_message?: string | null;
  room_status?: string | null;
  gallery_visibility?: string;
  knocks_open?: boolean;
  break_until?: string | null;
  door_rule?: string;
  listing?: string;
  welcome_audio_url?: string | null;
  welcome_audio_seconds?: number | null;
  welcome_autoplay?: boolean;
  welcome_visibility?: string;
  allow_audio_calls?: boolean;
  allow_video_calls?: boolean;
  notify?: Notify;
};
type Notify = {
  knocks: boolean; messages: boolean; calls: boolean; sessions: boolean; previews: boolean;
  quiet_start: number | null; quiet_end: number | null;
};
const NOTIFY_DEFAULTS: Notify = { knocks: true, messages: true, calls: true, sessions: true, previews: true, quiet_start: null, quiet_end: null };
const NOTIFY_ROWS: [keyof Notify, string, string][] = [
  ["knocks", "New knocks", "Someone knocks on your Room"],
  ["messages", "Messages", "New messages in your conversations"],
  ["calls", "Calls", "Incoming and missed calls"],
  ["sessions", "Group sessions", "Someone you are inside with opens a session"],
  ["previews", "Show message text", "Off: notifications say \"New message\" without the words"],
];
const WELCOME_VISIBILITY = [
  { id: "inside", label: "Only people I let in", hint: "Your note and audio wait behind the door. The default." },
  { id: "window", label: "Everyone peeking", hint: "Visitors hear and read this before they knock." },
];
type Visitor = { user_id: string; anonymous_name: string; avatar_url: string | null; status: string; let_in_at: string };
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

type Knock = KnockClue & {
  id: string; requester_id: string; requester_anonymous_name: string; requester_avatar_url: string | null;
  pitch: string | null; intents: string[]; confession_snippet: string; created_at: string;
};

// What a Knock on this Room must carry (Backend chat_profile.py DOOR_RULES).
const DOOR_RULES: { id: string; label: string; hint: string }[] = [
  { id: "line_peek", label: "A line + a peek", hint: "A line plus a photo, video or voice note." },
  { id: "line", label: "A line is enough", hint: "Just a line about themselves. Fewer clues, more knocks." },
  { id: "voice", label: "A voice note", hint: "5 to 15 seconds of their voice. A strong clue without a face." },
];
// Where the Room shows in Discover (Backend chat_profile.py LISTINGS). Default "limited".
const LISTINGS: { id: string; label: string; hint: string }[] = [
  { id: "discoverable", label: "Show my Room in Near", hint: "People nearby can find your Room, even with no post up." },
  { id: "limited", label: "Only through my posts", hint: "Only reachable from your posts." },
  { id: "private", label: "Keep me out of Near", hint: "Your posts still show in the feed, but you won't appear in Near." },
];
type Conn = {
  id: string; other_user_id: string; other_anonymous_name: string; other_avatar_url: string | null;
  is_sender: boolean; last_message: string | null; last_message_at: string; removable_at?: string | null;
};

type Tab = "room" | "welcome" | "knocks" | "inside" | "calls" | "appearance" | "privacy" | "notifications";
const TABS: [Tab, string][] = [
  ["room", "My Room"], ["welcome", "Welcome"], ["knocks", "Knocks"], ["inside", "Inside"], ["calls", "Calls"],
  ["appearance", "Appearance"], ["privacy", "Privacy"], ["notifications", "Notifications"],
];

const SLOT_COST = 25;
const FREE_GUESTS = 4;
const MAX_GUESTS = 12;
const MAX_GALLERY = 3;

const REPORT_REASONS: [string, string][] = [
  ["abuse", "Harassment or abuse"], ["explicit", "Sexually explicit or unwanted"], ["doxxing", "Shares private info"],
  ["spam", "Spam or scam"], ["other", "Something else"],
];

function Ava({ src, name }: { src: string | null; name: string }) {
  return (
    <span className="lr-ava"><span>{src ? <Image src={src} alt="" width={42} height={42} /> : name[0]?.toUpperCase() || "A"}</span></span>
  );
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, refresh } = useAuth();
  const initialTab = (params.get("tab") as Tab) || "room";
  const [tab, setTab] = useState<Tab>(TABS.some(([k]) => k === initialTab) ? initialTab : "room");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [font, setFont] = useState(DEFAULT_FONT);
  const [pic, setPic] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [sound, setSound] = useState("soft-chime");
  const [callMode, setCallMode] = useState("solo");
  const [maxGuests, setMaxGuests] = useState(1);
  const [slots, setSlots] = useState(0);
  const [buying, setBuying] = useState(false);
  const [theme, setTheme] = useState(DEFAULT_ROOM_THEME);
  const [intro, setIntro] = useState("");
  const [welcome, setWelcome] = useState("");
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("window");
  const [knocksOpen, setKnocksOpen] = useState(true);
  // A break's length, picked when knocks go off this visit (null = keep what the server has).
  const [breakHours, setBreakHours] = useState<number | null>(null);
  const [breakUntil, setBreakUntil] = useState<string | null>(null);
  const [doorRule, setDoorRule] = useState("line_peek");
  const [listing, setListing] = useState("limited");
  const [knocks, setKnocks] = useState<Knock[] | null>(null);
  const [inside, setInside] = useState<Conn[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Conn | null>(null);
  const [welcomeAudio, setWelcomeAudio] = useState<{ url: string; seconds?: number | null } | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [welcomeVis, setWelcomeVis] = useState("inside");
  const [allowAudio, setAllowAudio] = useState(true);
  const [allowVideo, setAllowVideo] = useState(true);
  const [notify, setNotify] = useState<Notify>(NOTIFY_DEFAULTS);
  const [history, setHistory] = useState<Visitor[]>([]);
  const replaceAt = useRef<number | null>(null);
  const picInput = useRef<HTMLInputElement>(null);
  const galInput = useRef<HTMLInputElement>(null);

  const apply = (d: Profile) => {
    setPattern(d.background_pattern || DEFAULT_PATTERN);
    setFont(d.font_style || DEFAULT_FONT);
    setPic(d.profile_picture_url || null);
    setName(d.anonymous_name || "");
    setGallery(d.gallery || []);
    setSound(d.welcome_sound || "soft-chime");
    setCallMode(d.call_mode || "solo");
    setMaxGuests(d.max_guests || 1);
    setSlots(d.purchased_slots || 0);
    setTheme(d.room_theme || DEFAULT_ROOM_THEME);
    setIntro(d.intro || "");
    setWelcome(d.welcome_message || "");
    setStatus(d.room_status || "");
    setVisibility(d.gallery_visibility || "window");
    setKnocksOpen(d.knocks_open !== false);
    setBreakUntil(d.break_until || null);
    setBreakHours(null);
    setDoorRule(d.door_rule || "line_peek");
    setListing(d.listing || "limited");
    setWelcomeAudio(d.welcome_audio_url ? { url: d.welcome_audio_url, seconds: d.welcome_audio_seconds } : null);
    setAutoplay(!!d.welcome_autoplay);
    setWelcomeVis(d.welcome_visibility || "inside");
    setAllowAudio(d.allow_audio_calls !== false);
    setAllowVideo(d.allow_video_calls !== false);
    setNotify({ ...NOTIFY_DEFAULTS, ...(d.notify || {}) });
  };

  useEffect(() => {
    api<Profile | null>("/chat-profile/me")
      .then((d) => { if (d) apply(d); })
      .catch(() => setError("Couldn’t load your Room. Try again."))
      .finally(() => setLoading(false));
  }, []);

  const loadPeople = useCallback(async () => {
    try {
      const [k, c, v] = await Promise.all([
        api<{ requests: Knock[] }>("/unlock-requests/incoming"),
        api<{ connections: Conn[] }>("/drops/connections"),
        api<{ visitors: Visitor[] }>("/drops/room/visitors").catch(() => ({ visitors: [] as Visitor[] })),
      ]);
      setKnocks(k.requests);
      setHistory(v.visitors.filter((x) => x.status !== "inside"));
      // One row per person inside, their latest thread first.
      const seen = new Set<string>();
      setInside(c.connections.filter((x) => x.is_sender && !seen.has(x.other_user_id) && seen.add(x.other_user_id)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  function go(t: Tab) {
    setTab(t);
    setNote("");
    setError("");
    router.replace(`/chat-setup?tab=${t}`, { scroll: false });
  }

  async function pickPic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Pick an image."); return; }
    setUploading(true);
    setError("");
    try {
      setPic(await uploadFile(file, "image"));
    } catch (err) {
      setError((err as Error).message || "Could not upload picture. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  async function addMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const replaceIndex = replaceAt.current;
    replaceAt.current = null;
    if (replaceIndex === null && gallery.length >= MAX_GALLERY) { setError("Gallery is capped at 3 items. Delete one first."); return; }
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("image/")) { setError("Pick a photo, GIF or video."); return; }
    setUploading(true);
    setError("");
    try {
      const url = await uploadFile(file, isVideo ? "video" : "image");
      const p = await api<Profile>("/chat-profile/media", {
        body: {
          media_url: url, media_type: isVideo ? "video" : file.type === "image/gif" ? "gif" : "image",
          ...(replaceIndex !== null ? { replace_index: replaceIndex } : {}),
        },
      });
      setGallery(p.gallery || []);
    } catch (err) {
      setError((err as Error).message || "Could not add media. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  async function removeMedia(i: number) {
    try {
      const p = await api<Profile>(`/chat-profile/media/${i}`, { method: "DELETE" });
      setGallery(p.gallery || []);
    } catch {
      setError("Could not remove media.");
    }
  }

  async function moveMedia(from: number, to: number) {
    if (to < 0 || to >= gallery.length) return;
    const order = gallery.map((_, i) => i);
    [order[from], order[to]] = [order[to], order[from]];
    setGallery(order.map((i) => gallery[i]));
    try {
      const p = await api<Profile>("/chat-profile/media/order", { method: "PUT", body: { order } });
      setGallery(p.gallery || []);
    } catch {
      setError("Could not reorder. Try again.");
    }
  }

  // Saved straight away (outside Save): the welcome audio and its removal.
  async function saveAudio(url: string, seconds: number | null) {
    const d = await api<Profile>("/chat-profile/me", { method: "PUT", body: { welcome_audio_url: url, ...(seconds ? { welcome_audio_seconds: seconds } : {}) } });
    setWelcomeAudio(d.welcome_audio_url ? { url: d.welcome_audio_url, seconds: d.welcome_audio_seconds } : null);
    setNote("Welcome audio saved.");
  }
  async function removeAudio() {
    await api<Profile>("/chat-profile/me", { method: "PUT", body: { welcome_audio_url: "" } });
    setWelcomeAudio(null);
    setNote("Welcome audio removed.");
  }

  async function buySlots(n: number) {
    setBuying(true);
    setError("");
    setNote("");
    try {
      const d = await api<{ max_guests: number; purchased_slots: number; coins_spent: number }>("/chat-profile/call-capacity", {
        body: { add_slots: n },
      });
      setMaxGuests(d.max_guests);
      setSlots(d.purchased_slots);
      setNote(`Call room now fits ${d.max_guests} guests. ${d.coins_spent} coins spent.`);
      refresh();
    } catch (err) {
      setError((err as Error).message || "Could not buy slots. Try again.");
    } finally {
      setBuying(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setNote("");
    try {
      const d = await api<Profile>("/chat-profile/me", {
        method: "PUT",
        body: {
          background_pattern: pattern, font_style: font, profile_picture_url: pic, welcome_sound: sound, call_mode: callMode,
          intro, welcome_message: welcome, room_status: status, gallery_visibility: visibility, knocks_open: knocksOpen, ...(!knocksOpen && breakHours !== null ? { break_hours: breakHours } : {}), door_rule: doorRule, listing,
          welcome_autoplay: autoplay, welcome_visibility: welcomeVis, allow_audio_calls: allowAudio, allow_video_calls: allowVideo,
          notify: {
            knocks: notify.knocks, messages: notify.messages, calls: notify.calls, sessions: notify.sessions, previews: notify.previews,
            ...(notify.quiet_start !== null && notify.quiet_end !== null ? { quiet_start: notify.quiet_start, quiet_end: notify.quiet_end } : { quiet_start: -1, quiet_end: -1 }),
            tz_offset_min: -new Date().getTimezoneOffset(),
          },
        },
      });
      apply(d);
      setNote("Saved. Your Room is ready for visitors.");
    } catch (err) {
      setError((err as Error).message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function applyTheme(id: string) {
    const d = await api<Profile>("/chat-profile/me", { method: "PUT", body: { room_theme: id } });
    setTheme(d.room_theme || id);
    setNote(`${roomThemeById(id).name} applied. Visitors see it now.`);
  }

  async function knock(k: Knock, letIn: boolean) {
    setBusy(k.id);
    setError("");
    try {
      if (letIn) {
        const d = await api<{ connection_id?: string }>(`/unlock-requests/${k.id}/accept`, { method: "POST" });
        setNote(`${k.requester_anonymous_name || "They"} are inside now.`);
        if (d.connection_id) router.push(`/chat/${d.connection_id}`);
      } else {
        await api(`/unlock-requests/${k.id}/decline`, { method: "POST" });
        setNote("Declined. They weren't charged.");
      }
      await loadPeople();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: Conn) {
    if (c.removable_at && new Date(c.removable_at) > new Date()) {
      setError(`You can remove ${c.other_anonymous_name} from ${new Date(c.removable_at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Something wrong? Block them now.`);
      return;
    }
    if (!window.confirm(`Remove ${c.other_anonymous_name} from your Room?\n\nThe chat closes. They're outside again.`)) return;
    setBusy(c.id);
    try {
      await api(`/drops/connections/${c.id}/remove`, { method: "POST" });
      setNote(`${c.other_anonymous_name} is out of your Room.`);
      await loadPeople();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function block(c: Conn) {
    if (!window.confirm(`Block ${c.other_anonymous_name}?\n\nThey're removed from your Room and can't knock again.`)) return;
    setBusy(c.id);
    try {
      // Blocking closes the conversation and any call straight away, server side.
      await api(`/users/${c.other_user_id}/block`, { method: "POST" });
      setNote("Blocked. They can't see your Room or knock again.");
      await loadPeople();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function report(c: Conn, reason: string) {
    setBusy(c.id);
    try {
      await api(`/users/${c.other_user_id}/report`, { body: { reason } });
      setReporting(null);
      setNote("Report received. Thank you.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="muted center">Opening your Room…</p>;

  const roomLeft = MAX_GUESTS - maxGuests;
  const t = roomThemeById(theme);
  const saveBar = (
    <div className="rs-save">
      <button className="u-cta" onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save changes"}</button>
    </div>
  );

  return (
    <div>
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <nav className="rs-tabs" aria-label="Room sections">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>
            {label}
            {k === "knocks" && knocks?.length ? <b>{knocks.length}</b> : null}
          </button>
        ))}
      </nav>

      <div className="rs-body">
        {error ? <div className="err">{error}</div> : null}
        {note ? <div className="ok">{note}</div> : null}

        {tab === "room" ? (
          <>
            <div className="rs-hero">
              <RoomMini theme={theme} name={name} big />
              <div className="rs-hero-t">
                <b>{t.room}</b>
                <span>Your private space. They peek, they knock, you decide.</span>
                {user?.id ? <Link href={`/room/${user.id}`} className="pill ghost">See it as a visitor</Link> : null}
              </div>
            </div>

            <input ref={picInput} type="file" accept="image/*" hidden onChange={pickPic} />
            <button type="button" className="u-pic" onClick={() => picInput.current?.click()} disabled={uploading} aria-label="Change Room picture">
              {pic ? <Image src={pic} alt="" width={84} height={84} /> : name[0]?.toUpperCase() || "A"}
            </button>
            <p className="u-sub" style={{ textAlign: "center", margin: "-8px 0 0" }}>{uploading ? "Uploading…" : name ? `${name} · tap to change picture` : "Tap to change picture"}</p>

            <div className="rs-field">
              <label htmlFor="rs-intro">About you</label>
              <textarea id="rs-intro" rows={2} value={intro} maxLength={MAX_INTRO} onChange={(e) => setIntro(e.target.value)} placeholder="A line that makes them curious…" />
              <small>{intro.length}/{MAX_INTRO} · everyone peeking sees this. No numbers or handles.</small>
            </div>

            <div className="rs-field">
              <label>Status</label>
              <div className="u-chips">
                <button type="button" className={`u-chip${!status ? " on" : ""}`} onClick={() => setStatus("")}>None</button>
                {ROOM_STATUSES.map((s) => (
                  <button key={s.id} type="button" className={`u-chip${status === s.id ? " on" : ""}`} onClick={() => setStatus(s.id)}>{s.label}</button>
                ))}
              </div>
            </div>

            <button type="button" className="rs-next" onClick={() => go("welcome")}>
              <b>Your welcome</b>
              <small>What people get once you let them in.</small>
            </button>
            {saveBar}
          </>
        ) : null}

        {tab === "welcome" ? (
          <>
            <div className="rs-field">
              <label htmlFor="rs-welcome">Welcome note</label>
              <textarea id="rs-welcome" rows={3} value={welcome} maxLength={MAX_WELCOME} onChange={(e) => setWelcome(e.target.value)} placeholder="What they read the moment you let them in…" />
              <small>{welcome.length}/{MAX_WELCOME} · {welcomeVis === "window" ? "everyone peeking sees this." : "only people you let in see this."}</small>
            </div>

            <p className="rs-h">Welcome audio</p>
            <WelcomeAudio saved={welcomeAudio} onSave={saveAudio} onRemove={removeAudio} />
            <div className="rs-toggle">
              <span><b>Play it when they walk in</b><small>Plays once on their first visit, if their browser allows sound. Off: they press play.</small></span>
              <button type="button" role="switch" aria-checked={autoplay} aria-label="Play welcome audio on entry" className={`rs-switch${autoplay ? " on" : ""}`} onClick={() => setAutoplay(!autoplay)} />
            </div>

            <p className="rs-h">Who gets your welcome</p>
            <div className="rs-opts" role="radiogroup" aria-label="Who gets your welcome">
              {WELCOME_VISIBILITY.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={welcomeVis === v.id} className={`rs-opt${welcomeVis === v.id ? " on" : ""}`} onClick={() => setWelcomeVis(v.id)}>
                  <i />
                  <span><b>{v.label}</b><small>{v.hint}</small></span>
                </button>
              ))}
            </div>

            <p className="rs-h">Welcome media ({gallery.length}/{MAX_GALLERY})</p>
            <p className="u-sub" style={{ margin: 0 }}>
              Photos, GIFs or short videos on your walls, in this order. Who sees them is set in <button type="button" className="u-link-btn" style={{ padding: 0 }} onClick={() => go("privacy")}>Privacy</button>.
            </p>
            <input ref={galInput} type="file" accept="image/*,video/*" hidden onChange={addMedia} />
            <div className="u-gallery">
              {gallery.map((m, i) => (
                <div className="u-gal" key={`${m.media_url}-${i}`}>
                  {m.media_type === "video" ? <video src={m.media_url} muted playsInline preload="metadata" /> : <Image src={m.media_url} alt="" width={92} height={92} />}
                  {m.media_type !== "image" ? <b>{m.media_type.toUpperCase()}</b> : null}
                  <button type="button" onClick={() => removeMedia(i)} aria-label={`Remove welcome media ${i + 1}`}><X size={20} strokeWidth={2} aria-hidden /></button>
                  <span className="u-gal-tools">
                    <button type="button" disabled={i === 0} onClick={() => moveMedia(i, i - 1)} aria-label="Move earlier"><ChevronLeft size={18} strokeWidth={2} aria-hidden /></button>
                    <button type="button" disabled={uploading} onClick={() => { replaceAt.current = i; galInput.current?.click(); }} aria-label={`Replace welcome media ${i + 1}`}>↻</button>
                    <button type="button" disabled={i === gallery.length - 1} onClick={() => moveMedia(i, i + 1)} aria-label="Move later"><ChevronRight size={18} strokeWidth={2} aria-hidden /></button>
                  </span>
                </div>
              ))}
              {gallery.length < MAX_GALLERY ? (
                <button type="button" className="u-gal-add" onClick={() => { replaceAt.current = null; galInput.current?.click(); }} disabled={uploading} aria-label="Add welcome media">+</button>
              ) : null}
            </div>

            <p className="rs-h">Entrance chime</p>
            <p className="u-sub" style={{ margin: 0 }}>A chime when someone you let in walks in for the first time.</p>
            <div className="u-chips">
              {SOUNDS.map((s) => (
                <button key={s.id} type="button" className={`u-chip${sound === s.id ? " on" : ""}`} onClick={() => setSound(s.id)}>{s.label}</button>
              ))}
            </div>
            {saveBar}
          </>
        ) : null}

        {tab === "calls" ? (
          <>
            <p className="rs-h">Who can call you</p>
            <div className="rs-toggle">
              <span><b>Voice calls</b><small>People inside can ring you from the chat.</small></span>
              <button type="button" role="switch" aria-checked={allowAudio} aria-label="Allow voice calls" className={`rs-switch${allowAudio ? " on" : ""}`} onClick={() => setAllowAudio(!allowAudio)} />
            </div>
            <div className="rs-toggle">
              <span><b>Video calls</b><small>Off: they&apos;ll message instead.</small></span>
              <button type="button" role="switch" aria-checked={allowVideo} aria-label="Allow video calls" className={`rs-switch${allowVideo ? " on" : ""}`} onClick={() => setAllowVideo(!allowVideo)} />
            </div>

            <p className="rs-h">Group sessions</p>
            <p className="u-sub" style={{ margin: 0 }}>Go live from Rooms → Live.</p>
            <div className="u-chips">
              {[["solo", "One-on-one"], ["multi", "Group room"]].map(([k, l]) => (
                <button key={k} type="button" className={`u-chip${callMode === k ? " on" : ""}`} onClick={() => setCallMode(k)}>{l}</button>
              ))}
            </div>
            {callMode === "multi" ? (
              <div className="u-cap">
                <span>
                  Fits <b>{maxGuests}</b> guests ({FREE_GUESTS} free{slots ? ` + ${slots} bought` : ""}). Extra slots are {SLOT_COST} coins each, up to {MAX_GUESTS}.
                </span>
                {roomLeft > 0 ? (
                  <button type="button" disabled={buying} onClick={() => { if (window.confirm(`Add one guest seat for ${SLOT_COST} coins?\n\nCharged once, now. Your Room will fit ${maxGuests + 1} guests.`)) buySlots(1); }}>
                    {buying ? "Buying…" : `Add a seat · ${SLOT_COST} coins`}
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="rs-info">4 seats free. Going live is free.</p>
            {saveBar}
          </>
        ) : null}

        {tab === "notifications" ? (
          <>
            <p className="rs-h">Room notifications</p>
            {NOTIFY_ROWS.map(([k, title, hint]) => (
              <div className="rs-toggle" key={k}>
                <span><b>{title}</b><small>{hint}</small></span>
                <button type="button" role="switch" aria-checked={!!notify[k]} aria-label={title} className={`rs-switch${notify[k] ? " on" : ""}`} onClick={() => setNotify((n) => ({ ...n, [k]: !n[k] }))} />
              </div>
            ))}
            <p className="rs-h">Quiet hours</p>
            <div className="rs-toggle">
              <span>
                <b>Hold notifications overnight</b>
                <small>{notify.quiet_start !== null && notify.quiet_end !== null ? `Nothing buzzes from ${hourLabel(notify.quiet_start)} to ${hourLabel(notify.quiet_end)}.` : "Knocks, messages and calls still arrive, just silently."}</small>
              </span>
              <button type="button" role="switch" aria-checked={notify.quiet_start !== null} aria-label="Quiet hours" className={`rs-switch${notify.quiet_start !== null ? " on" : ""}`}
                onClick={() => setNotify((n) => (n.quiet_start !== null ? { ...n, quiet_start: null, quiet_end: null } : { ...n, quiet_start: 23, quiet_end: 7 }))} />
            </div>
            {notify.quiet_start !== null && notify.quiet_end !== null ? (
              <div className="rs-hours">
                {([["quiet_start", "From"], ["quiet_end", "Until"]] as const).map(([k, label]) => (
                  <label key={k}>
                    {label}
                    <select value={notify[k] ?? 0} onChange={(e) => setNotify((n) => ({ ...n, [k]: Number(e.target.value) }))}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
            <p className="rs-info">Turn off &ldquo;Show message text&rdquo; to keep words off your lock screen.</p>
            {saveBar}
          </>
        ) : null}

        {tab === "knocks" ? (
          knocks === null ? <p className="muted center">Loading…</p> : knocks.length === 0 ? (
            <div className="u-empty">No one&apos;s at the door. Post something and watch the knocks come in.</div>
          ) : (
            <div>
              <p className="rs-info">Knocking is free. Let them in and the fee leaves their wallet, once. Decline and nothing moves. You never pay to let someone in. <Link href="/coins">Your wallet and coin history</Link>.</p>
              {knocks.map((k) => (
                <div className="rs-person" key={k.id}>
                  <Ava src={k.requester_avatar_url} name={k.requester_anonymous_name || "A"} />
                  <div className="rs-person-t">
                    <b>{k.requester_anonymous_name || "Anonymous"}</b>
                    <small>{k.pitch ? `“${k.pitch}”` : "Just knocked"}{k.intents?.length ? ` · ${k.intents.map(intentLabel).join(", ")}` : ""}</small>
                    <KnockClues k={k} compact />
                  </div>
                  <div className="rs-person-acts">
                    <Link href={`/room/${k.requester_id}`}>Peek</Link>
                    <button disabled={busy === k.id} onClick={() => knock(k, false)}>Decline</button>
                    <button className="a" disabled={busy === k.id} onClick={() => knock(k, true)}>{busy === k.id ? "…" : "Let In"}</button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "inside" ? (
          inside === null ? <p className="muted center">Loading…</p> : inside.length === 0 ? (
            <div className="u-empty">Nobody&apos;s inside yet.</div>
          ) : (
            <div>
              <p className="rs-info">People you&apos;ve let in. Remove after 3 days, block any time.</p>
              {inside.map((c) => (
                <div className="rs-person" key={c.id}>
                  <Ava src={c.other_avatar_url} name={c.other_anonymous_name || "A"} />
                  <div className="rs-person-t">
                    <b>{c.other_anonymous_name || "Anonymous"}</b>
                    <small>{c.last_message || "No messages yet"}</small>
                  </div>
                  <div className="rs-person-acts">
                    <Link href={`/chat/${c.id}`}>Chat</Link>
                    <button disabled={busy === c.id} onClick={() => remove(c)} className={c.removable_at && new Date(c.removable_at) > new Date() ? "later" : ""}>
                      {c.removable_at && new Date(c.removable_at) > new Date() ? `Remove from ${new Date(c.removable_at).toLocaleDateString([], { weekday: "short" })}` : "Remove"}
                    </button>
                    <button disabled={busy === c.id} onClick={() => setReporting(c)}>Report</button>
                    <button className="danger" disabled={busy === c.id} onClick={() => block(c)}>Block</button>
                  </div>
                </div>
              ))}
              {history.length ? <p className="rs-h">History</p> : null}
              {history.map((h) => (
                <div className="rs-person past" key={h.user_id}>
                  <Ava src={h.avatar_url} name={h.anonymous_name || "A"} />
                  <div className="rs-person-t">
                    <b>{h.anonymous_name}</b>
                    <small>{h.status === "blocked" ? "Blocked" : "Removed"} · let in {new Date(h.let_in_at).toLocaleDateString([], { day: "numeric", month: "short" })}</small>
                  </div>
                  {h.status === "blocked" ? <div className="rs-person-acts"><Link href="/blocked">Manage</Link></div> : null}
                </div>
              ))}
              {reporting ? (
                <div className="rs-info">
                  <b>Report {reporting.other_anonymous_name}</b>
                  <div className="list" style={{ marginTop: 8 }}>
                    {REPORT_REASONS.map(([k, label]) => (
                      <button key={k} className="opt-row" disabled={busy === reporting.id} onClick={() => report(reporting, k)}>{label}</button>
                    ))}
                    <button className="opt-row" onClick={() => setReporting(null)}>Cancel</button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {tab === "appearance" ? (
          <>
            <p className="rs-h">Room theme</p>
            <RoomThemePicker saved={theme} name={name} onApply={applyTheme} />
            <p className="rs-h">Name and intro font</p>
            <div className="u-chips">
              {FONTS.map((f) => (
                <button key={f.id} type="button" className={`u-chip${font === f.id ? " on" : ""}`} onClick={() => setFont(f.id)}>
                  <span className="aa" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style }}>Aa</span>
                  {f.label}
                </button>
              ))}
            </div>
            <p className="rs-h">Chat background</p>
            <p className="u-sub" style={{ margin: 0 }}>Behind your conversations once someone is inside.</p>
            <div className="u-swatches">
              {PATTERNS.map((p) => (
                <button key={p.id} type="button" className={`u-swatch${pattern === p.id ? " on" : ""}`} onClick={() => setPattern(p.id)}>
                  <span><ChatBackground id={p.id} className="u-bg" /></span>
                  {p.label}
                </button>
              ))}
            </div>
            {saveBar}
          </>
        ) : null}

        {tab === "privacy" ? (
          <>
            <p className="rs-h">Who sees your photos</p>
            <div className="rs-opts" role="radiogroup">
              {GALLERY_VISIBILITY.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={visibility === v.id} className={`rs-opt${visibility === v.id ? " on" : ""}`} onClick={() => setVisibility(v.id)}>
                  <i />
                  <span><b>{v.label}</b><small>{v.hint}</small></span>
                </button>
              ))}
            </div>

            <p className="rs-h">Who gets your welcome</p>
            <div className="rs-opts" role="radiogroup" aria-label="Who gets your welcome">
              {WELCOME_VISIBILITY.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={welcomeVis === v.id} className={`rs-opt${welcomeVis === v.id ? " on" : ""}`} onClick={() => setWelcomeVis(v.id)}>
                  <i />
                  <span><b>{v.label}</b><small>{v.hint}</small></span>
                </button>
              ))}
            </div>

            <p className="rs-h">Your door</p>
            <div className="rs-toggle">
              <span>
                <b>Taking knocks</b>
                <small>
                  {knocksOpen
                    ? "Anyone 18+ who finds your post can knock."
                    : breakUntil && breakHours === null
                      ? `On a break until ${new Date(breakUntil).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. Nobody new can knock.`
                      : "On a break. Nobody new can knock."}
                </small>
              </span>
              <button type="button" role="switch" aria-checked={knocksOpen} aria-label="Taking knocks" className={`rs-switch${knocksOpen ? " on" : ""}`} onClick={() => { setKnocksOpen(!knocksOpen); setBreakHours(knocksOpen ? 12 : null); }} />
            </div>
            {!knocksOpen && breakHours !== null ? (
              <div className="rs-opts" role="radiogroup" aria-label="Break length">
                {([[12, "For tonight", "Back on in 12 hours"], [72, "For 3 days", "Back on by itself"], [168, "For a week", "Back on by itself"], [0, "Until I switch it back", "Stays off"]] as const).map(([h, label, hint]) => (
                  <button key={h} type="button" role="radio" aria-checked={breakHours === h} className={`rs-opt${breakHours === h ? " on" : ""}`} onClick={() => setBreakHours(h)}>
                    <i />
                    <span><b>{label}</b><small>{hint}</small></span>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="rs-info">Only affects knocks. Nobody sees when you&apos;re online.</p>

            <p className="rs-h">What a knock must include</p>
            <div className="rs-opts" role="radiogroup" aria-label="Door rule">
              {DOOR_RULES.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={doorRule === r.id} className={`rs-opt${doorRule === r.id ? " on" : ""}`} onClick={() => setDoorRule(r.id)}>
                  <i />
                  <span><b>{r.label}</b><small>{r.hint}</small></span>
                </button>
              ))}
            </div>
            <p className="rs-info">Knock photos and videos stay blurred until you tap.</p>

            <p className="rs-h">Where people find your Room</p>
            <div className="rs-opts" role="radiogroup" aria-label="Room listing">
              {LISTINGS.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={listing === r.id} className={`rs-opt${listing === r.id ? " on" : ""}`} onClick={() => setListing(r.id)}>
                  <i />
                  <span><b>{r.label}</b><small>{r.hint}</small></span>
                </button>
              ))}
            </div>
            <p className="rs-info">
              Near shows your area (county and country), never your exact spot. Open or taking a break is about knocks, not whether you&apos;re online. People you block can&apos;t see your Room or knock on it.
              Manage blocked people in <Link href="/blocked">Blocked</Link>.
            </p>
            {saveBar}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ChatSetupPage() {
  return (
    <AppShell title="Your Room" back="/inbox">
      <Suspense fallback={<p className="muted center">Opening your Room…</p>}>
        <Inner />
      </Suspense>
    </AppShell>
  );
}
