// App-wide icons (feed rail, bottom nav). One icon family across Anonixx: Lucide, the same set
// the app uses, at stroke 2. `filled`: solid for liked / saved, a soft fill for the current tab.
import {
  Bell, Bookmark as LBookmark, DoorOpen, Ellipsis as LMore, Flame as LFlame, Heart as LHeart, House, Inbox as LInbox,
  MessageSquareMore, Plus as LPlus, Share2 as LShare, User as LUser,
} from "lucide-react";

const S = 2;
const fillProps = (filled?: boolean) => (filled ? { fill: "currentColor" } : {});
// Current tab: a soft coral fill behind the outline, so inner details (the door, the face) stay visible.
const softFill = (on?: boolean) => (on ? { fill: "currentColor", fillOpacity: 0.18 } : {});

export const Heart = ({ filled = false }: { filled?: boolean }) => <LHeart strokeWidth={S} {...fillProps(filled)} />;
export const Comment = () => <MessageSquareMore strokeWidth={S} />;
export const Share = () => <LShare strokeWidth={S} />;
export const Bookmark = ({ filled = false }: { filled?: boolean }) => <LBookmark strokeWidth={S} {...fillProps(filled)} />;
export const More = () => <LMore strokeWidth={S} />;
export const Home = ({ filled = false }: { filled?: boolean }) => <House strokeWidth={S} {...softFill(filled)} />;
export const Plus = () => <LPlus strokeWidth={S} />;
export const Inbox = () => <LInbox strokeWidth={S} />;
export const User = () => <LUser strokeWidth={S} />;
export const Flame = ({ filled = false }: { filled?: boolean }) => <LFlame strokeWidth={S} {...softFill(filled)} />;
export const Door = ({ filled = false }: { filled?: boolean }) => <DoorOpen strokeWidth={S} {...softFill(filled)} />;
export const Requests = ({ filled = false }: { filled?: boolean }) => <Bell strokeWidth={S} {...softFill(filled)} />;
export const Person = ({ filled = false }: { filled?: boolean }) => <LUser strokeWidth={S} {...softFill(filled)} />;
