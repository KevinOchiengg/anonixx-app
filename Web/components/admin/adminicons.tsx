// Admin dashboard icons. Lucide at stroke 2, the same family as the app and the rest of the site.
import {
  Activity, Bell, Bot, Calendar, Check, Coins, Eye, FileText, Flag, LayoutDashboard, List, Megaphone, Menu,
  MessagesSquare, Music, RotateCcw, ShieldCheck, SquareKanban, SquarePlus, TrendingUp, Users, X,
} from "lucide-react";

const P = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

export const IcDash = () => <LayoutDashboard {...P} />;
export const IcPost = () => <SquarePlus {...P} />;
export const IcUsers = () => <Users {...P} />;
export const IcPosts = () => <FileText {...P} />;
export const IcShield = () => <ShieldCheck {...P} />;
export const IcRefund = () => <RotateCcw {...P} />;
export const IcChat = () => <MessagesSquare {...P} />;
export const IcMegaphone = () => <Megaphone {...P} />;
export const IcMusic = () => <Music {...P} />;
export const IcFlag = () => <Flag {...P} />;
export const IcCalendar = () => <Calendar {...P} />;
export const IcKanban = () => <SquareKanban {...P} />;
export const IcMenu = () => <Menu {...P} />;
export const IcBell = () => <Bell {...P} />;
export const IcClose = () => <X {...P} />;
export const IcCheck = () => <Check {...P} />;
export const IcCoin = () => <Coins {...P} />;
export const IcTrendUp = () => <TrendingUp {...P} />;
export const IcEye = () => <Eye {...P} />;
export const IcPulse = () => <Activity {...P} />;
export const IcBot = () => <Bot {...P} />;
export const IcList = () => <List {...P} />;
