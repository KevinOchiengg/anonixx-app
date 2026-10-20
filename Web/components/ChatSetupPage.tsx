"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import AppShell from "./AppShell";

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
};

const SLOT_COST = 25;
const FREE_GUESTS = 4;
const MAX_GUESTS = 12;
const MAX_GALLERY = 3;

function Inner() {
  const router = useRouter();
  const { refresh } = useAuth();
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
  const picInput = useRef<HTMLInputElement>(null);
  const galInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Profile | null>("/chat-profile/me")
      .then((d) => {
        if (!d) return;
        setPattern(d.background_pattern || DEFAULT_PATTERN);
        setFont(d.font_style || DEFAULT_FONT);
        setPic(d.profile_picture_url || null);
        setName(d.anonymous_name || "");
        setGallery(d.gallery || []);
        setSound(d.welcome_sound || "soft-chime");
        setCallMode(d.call_mode || "solo");
        setMaxGuests(d.max_guests || 1);
        setSlots(d.purchased_slots || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    if (gallery.length >= MAX_GALLERY) { setError("Gallery is capped at 3 items — delete one first."); return; }
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
      setNote(`Room size is now ${d.max_guests} guests — ${d.coins_spent} coins spent.`);
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
    try {
      await api("/chat-profile/me", {
        method: "PUT",
        body: { background_pattern: pattern, font_style: font, profile_picture_url: pic, welcome_sound: sound, call_mode: callMode },
      });
      setNote("Your room, your rules. Saved.");
      window.setTimeout(() => router.push("/inbox"), 700);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted center">Loading…</p>;

  const roomLeft = MAX_GUESTS - maxGuests;
  return (
    <div className="u-setup">
      <link rel="stylesheet" href={FONTS_HREF} precedence="default" />
      <p className="u-sub">
        This is what people see once they unlock a chat with you — decorate it however fits your vibe.
      </p>
      {error ? <div className="err">{error}</div> : null}
      {note ? <div className="ok">{note}</div> : null}

      <input ref={picInput} type="file" accept="image/*" hidden onChange={pickPic} />
      <button type="button" className="u-pic" onClick={() => picInput.current?.click()} disabled={uploading} aria-label="Change profile picture">
        {pic ? <Image src={pic} alt="" width={84} height={84} /> : name[0]?.toUpperCase() || "A"}
      </button>
      <p className="u-sub" style={{ textAlign: "center" }}>{uploading ? "Uploading…" : name ? `${name} · tap to change picture` : "Tap to change picture"}</p>

      <h4>Background</h4>
      <div className="u-swatches">
        {PATTERNS.map((p) => (
          <button key={p.id} type="button" className={`u-swatch${pattern === p.id ? " on" : ""}`} onClick={() => setPattern(p.id)}>
            <span><ChatBackground id={p.id} className="u-bg" /></span>
            {p.label}
          </button>
        ))}
      </div>

      <h4>Font</h4>
      <div className="u-chips">
        {FONTS.map((f) => (
          <button key={f.id} type="button" className={`u-chip${font === f.id ? " on" : ""}`} onClick={() => setFont(f.id)}>
            <span className="aa" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style }}>Aa</span>
            {f.label}
          </button>
        ))}
      </div>

      <h4>Welcome sound</h4>
      <div className="u-chips">
        {SOUNDS.map((s) => (
          <button key={s.id} type="button" className={`u-chip${sound === s.id ? " on" : ""}`} onClick={() => setSound(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <h4>Video calls</h4>
      <div className="u-chips">
        {[["solo", "One-on-one"], ["multi", "Group room"]].map(([k, l]) => (
          <button key={k} type="button" className={`u-chip${callMode === k ? " on" : ""}`} onClick={() => setCallMode(k)}>{l}</button>
        ))}
      </div>
      {callMode === "multi" ? (
        <div className="u-cap">
          <span>
            Room fits <b>{maxGuests}</b> guests ({FREE_GUESTS} free{slots ? ` + ${slots} bought` : ""}). Extra slots are {SLOT_COST} coins each, up to {MAX_GUESTS}.
          </span>
          {roomLeft > 0 ? (
            <button type="button" disabled={buying} onClick={() => buySlots(1)}>
              {buying ? "Buying…" : `Add a slot · ${SLOT_COST} coins`}
            </button>
          ) : null}
        </div>
      ) : null}

      <h4>Media gallery</h4>
      <p className="u-sub">Up to {MAX_GALLERY} photos, GIFs or short videos — shown to people the first time they open your chat.</p>
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

      <button className="u-cta" onClick={save} disabled={saving || uploading} style={{ marginTop: 18 }}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export default function ChatSetupPage() {
  return (
    <AppShell title="Your Chat Interface" back="/inbox">
      <Inner />
    </AppShell>
  );
}
