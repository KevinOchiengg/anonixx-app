"use client";
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
import RoomThemePicker, { RoomMini } from "./RoomThemePicker";

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
};

type Knock = {
  id: string; requester_id: string; requester_anonymous_name: string; requester_avatar_url: string | null;
  pitch: string | null; intents: string[]; confession_snippet: string; created_at: string;
};
type Conn = {
  id: string; other_user_id: string; other_anonymous_name: string; other_avatar_url: string | null;
  is_sender: boolean; last_message: string | null; last_message_at: string;
};

type Tab = "room" | "knocks" | "inside" | "appearance" | "privacy";
const TABS: [Tab, string][] = [
  ["room", "My Room"], ["knocks", "Knocks"], ["inside", "Inside"], ["appearance", "Appearance"], ["privacy", "Privacy"],
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
  const [knocks, setKnocks] = useState<Knock[] | null>(null);
  const [inside, setInside] = useState<Conn[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Conn | null>(null);
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
  };

  useEffect(() => {
    api<Profile | null>("/chat-profile/me")
      .then((d) => { if (d) apply(d); })
      .catch(() => setError("Could not load your Room. Pull to refresh or try again."))
      .finally(() => setLoading(false));
  }, []);

  const loadPeople = useCallback(async () => {
    try {
      const [k, c] = await Promise.all([
        api<{ requests: Knock[] }>("/unlock-requests/incoming"),
        api<{ connections: Conn[] }>("/drops/connections"),
      ]);
      setKnocks(k.requests);
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
    if (gallery.length >= MAX_GALLERY) { setError("Gallery is capped at 3 items. Delete one first."); return; }
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("image/")) { setError("Pick a photo, GIF or video."); return; }
    setUploading(true);
    setError("");
    try {
      const url = await uploadFile(file, isVideo ? "video" : "image");
      const p = await api<Profile>("/chat-profile/media", {
        body: { media_url: url, media_type: isVideo ? "video" : file.type === "image/gif" ? "gif" : "image" },
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
          intro, welcome_message: welcome, room_status: status, gallery_visibility: visibility, knocks_open: knocksOpen,
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
    if (!window.confirm(`Remove ${c.other_anonymous_name} from your Room?\n\nThe conversation closes for both of you. They'd have to knock again to come back.`)) return;
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
      await api(`/users/${c.other_user_id}/block`, { method: "POST" });
      await api(`/drops/connections/${c.id}/remove`, { method: "POST" }).catch(() => {});
      setNote("Blocked.");
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
                <span>Your private space. Visitors peek through the window, knock, and you decide who comes in.</span>
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

            <div className="rs-field">
              <label htmlFor="rs-welcome">Welcome message</label>
              <textarea id="rs-welcome" rows={3} value={welcome} maxLength={MAX_WELCOME} onChange={(e) => setWelcome(e.target.value)} placeholder="What they read the moment you let them in…" />
              <small>{welcome.length}/{MAX_WELCOME} · only people you let in see this.</small>
            </div>

            <p className="rs-h">On the walls</p>
            <p className="u-sub" style={{ margin: 0 }}>
              Up to {MAX_GALLERY} photos, GIFs or short videos. Who sees them is set in <button type="button" className="u-link-btn" style={{ padding: 0 }} onClick={() => go("privacy")}>Privacy</button>.
            </p>
            <input ref={galInput} type="file" accept="image/*,video/*" hidden onChange={addMedia} />
            <div className="u-gallery">
              {gallery.map((m, i) => (
                <div className="u-gal" key={i}>
                  {m.media_type === "video" ? <video src={m.media_url} muted playsInline preload="metadata" /> : <Image src={m.media_url} alt="" width={92} height={92} />}
                  {m.media_type !== "image" ? <b>{m.media_type.toUpperCase()}</b> : null}
                  <button type="button" onClick={() => removeMedia(i)} aria-label="Remove">×</button>
                </div>
              ))}
              {gallery.length < MAX_GALLERY ? (
                <button type="button" className="u-gal-add" onClick={() => galInput.current?.click()} disabled={uploading} aria-label="Add media">+</button>
              ) : null}
            </div>

            <p className="rs-h">Welcome sound</p>
            <div className="u-chips">
              {SOUNDS.map((s) => (
                <button key={s.id} type="button" className={`u-chip${sound === s.id ? " on" : ""}`} onClick={() => setSound(s.id)}>{s.label}</button>
              ))}
            </div>

            <p className="rs-h">Video calls</p>
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
                  <button type="button" disabled={buying} onClick={() => buySlots(1)}>
                    {buying ? "Buying…" : `Add a slot · ${SLOT_COST} coins`}
                  </button>
                ) : null}
              </div>
            ) : null}
            {saveBar}
          </>
        ) : null}

        {tab === "knocks" ? (
          knocks === null ? <p className="muted center">Loading…</p> : knocks.length === 0 ? (
            <div className="u-empty">No one&apos;s at the door. Post something and watch the knocks come in.</div>
          ) : (
            <div>
              <p className="rs-info">Knocking is free for them. Let someone in and their coins move automatically. Decline and nothing happens.</p>
              {knocks.map((k) => (
                <div className="rs-person" key={k.id}>
                  <Ava src={k.requester_avatar_url} name={k.requester_anonymous_name || "A"} />
                  <div className="rs-person-t">
                    <b>{k.requester_anonymous_name || "Anonymous"}</b>
                    <small>{k.pitch ? `“${k.pitch}”` : "Just knocked"}{k.intents?.length ? ` · ${k.intents.map(intentLabel).join(", ")}` : ""}</small>
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
            <div className="u-empty">Nobody&apos;s inside yet. When you let someone in, they show up here.</div>
          ) : (
            <div>
              <p className="rs-info">People you&apos;ve let in. Remove closes the conversation; they&apos;d have to knock again. Block also stops them knocking.</p>
              {inside.map((c) => (
                <div className="rs-person" key={c.id}>
                  <Ava src={c.other_avatar_url} name={c.other_anonymous_name || "A"} />
                  <div className="rs-person-t">
                    <b>{c.other_anonymous_name || "Anonymous"}</b>
                    <small>{c.last_message || "No messages yet"}</small>
                  </div>
                  <div className="rs-person-acts">
                    <Link href={`/chat/${c.id}`}>Chat</Link>
                    <button disabled={busy === c.id} onClick={() => remove(c)}>Remove</button>
                    <button disabled={busy === c.id} onClick={() => setReporting(c)}>Report</button>
                    <button className="danger" disabled={busy === c.id} onClick={() => block(c)}>Block</button>
                  </div>
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

            <p className="rs-h">Your door</p>
            <div className="rs-toggle">
              <span>
                <b>Taking knocks</b>
                <small>{knocksOpen ? "Anyone 18+ who finds your post can knock." : "Nobody can knock. People already inside stay inside."}</small>
              </span>
              <button type="button" role="switch" aria-checked={knocksOpen} aria-label="Taking knocks" className={`rs-switch${knocksOpen ? " on" : ""}`} onClick={() => setKnocksOpen(!knocksOpen)} />
            </div>

            <p className="rs-info">
              Your Room is only reachable from your posts. It doesn&apos;t show up in search. People you block can&apos;t see your Room or knock on it.
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
