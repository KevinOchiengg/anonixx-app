// Composer tool icons. Lucide at stroke 2, the same family as the app.
import {
  ChartBarBig, Images, MapPin, Mic, Music, Share2, Shuffle, Sparkles, TriangleAlert, Type, UserPlus, Video, X,
} from "lucide-react";

const P = { size: 18, strokeWidth: 2, "aria-hidden": true } as const;

export const IconImages = () => <Images {...P} />;
export const IconSparkles = () => <Sparkles {...P} />;
export const IconUserPlus = () => <UserPlus {...P} />;
export const IconPin = () => <MapPin {...P} />;
export const IconMic = () => <Mic {...P} />;
export const IconPoll = () => <ChartBarBig {...P} />;
export const IconText = () => <Type {...P} />;
export const IconVideo = () => <Video {...P} />;
export const IconShare = () => <Share2 {...P} />;
export const IconShuffle = () => <Shuffle {...P} size={14} />;
export const IconMusic = () => <Music {...P} />;
export const IconX = () => <X {...P} />;
export const IconWarn = () => <TriangleAlert {...P} size={15} />;
