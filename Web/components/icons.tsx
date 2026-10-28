const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Heart = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
);
export const Comment = () => (
  <svg {...base}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);
export const Share = () => (
  <svg {...base}><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>
);
export const Bookmark = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
);
export const More = () => (
  <svg {...base}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
);
export const Home = () => (
  <svg {...base}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
);
export const Plus = () => (
  <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
);
export const Inbox = () => (
  <svg {...base}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></svg>
);
export const User = () => (
  <svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
);
export const Flame = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-10z" /></svg>
);
export const Door = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill="none"><path d="M13 4h5a1 1 0 0 1 1 1v15" /><path d="M3 20h18" /><path d="M13 3.5 6 5v15h7z" fill={filled ? "currentColor" : "none"} /><circle cx="10.5" cy="12.5" r="0.6" fill={filled ? "#0b0f18" : "currentColor"} /></svg>
);
export const Requests = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9z" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const Person = ({ filled = false }: { filled?: boolean }) => (
  <svg {...base} fill={filled ? "currentColor" : "none"}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
);
