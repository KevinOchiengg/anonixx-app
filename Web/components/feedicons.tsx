// Feed, comments and sheet icons. Lucide at stroke 2, the same family as the app; sized by CSS.
import {
  ChevronDown as LChevronDown, ChevronRight as LChevronRight, Clock as LClock, Ellipsis, ExternalLink as LExternalLink,
  Eye as LEye, Flag as LFlag, Image as LImage, Link2 as LLink2, Lock as LLock, MapPin as LMapPin, Megaphone as LMegaphone,
  Menu, Mic as LMic, Pin as LPin, Reply as LReply, Search, Send as LSend, ShieldCheck, Smile as LSmile, Sticker,
  UserX as LUserX, VolumeX, X,
} from "lucide-react";

const S = 2;

export const SearchIcon = () => <Search strokeWidth={S} />;
export const MenuIcon = () => <Menu strokeWidth={S} />;
export const MapPin = () => <LMapPin strokeWidth={S} />;
export const Eye = () => <LEye strokeWidth={S} />;
export const Link2 = () => <LLink2 strokeWidth={S} />;
export const ExternalLink = () => <LExternalLink strokeWidth={S} />;
export const Megaphone = () => <LMegaphone strokeWidth={S} />;
export const Flag = () => <LFlag strokeWidth={S} />;
export const UserX = () => <LUserX strokeWidth={S} />;
export const ChevronDown = () => <LChevronDown strokeWidth={S} />;
export const ChevronRight = () => <LChevronRight strokeWidth={S} />;
export const Reply = () => <LReply strokeWidth={S} />;
export const Lock = () => <LLock strokeWidth={S} />;
export const Clock = () => <LClock strokeWidth={S} />;
export const Close = () => <X strokeWidth={S} />;
export const Smile = () => <LSmile strokeWidth={S} />;
export const Pin = () => <LPin strokeWidth={S} />;
export const ImageIcon = () => <LImage strokeWidth={S} />;
export const Mic = () => <LMic strokeWidth={S} />;
export const Gif = () => <Sticker strokeWidth={S} />;
export const Send = () => <LSend strokeWidth={S} />;
export const More = () => <Ellipsis strokeWidth={S} />;
export const SoundOff = () => <VolumeX strokeWidth={S} />;
export const ShieldIcon = () => <ShieldCheck strokeWidth={S} aria-hidden />;
