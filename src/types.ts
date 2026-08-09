export type RevealStyle = "instant" | "delay";

export interface EventConfig {
  id: string;               // Unique slug/code for the event (e.g. "sarah-wedding")
  name: string;
  hostName: string;
  description: string;
  date: string;
  revealStyle: RevealStyle;
  isRevealed: boolean;      // In delay-reveal mode, determines if guests can see photos yet
  revealTime?: string;      // ISO string of when photos should reveal automatically
  imageLimit: number;       // Upload limit per guest (0 = unlimited)
  videoLimit: number;       // Video limit per guest (0 = unlimited)
  maxVideoDuration: number; // Max video duration in seconds (usually 30)
  saveDirectory: string;    // On-server save directory. Defaults to "D:\Wedding"
  localSyncHost: string;    // Configured local receiver IP/port (e.g., "http://localhost:8080")
  localSyncEnabled: boolean;// Enable automated forwarding to user's real local machine
  coverImage?: string;
  couplePhoto?: string;
}

export interface MediaItem {
  id: string;
  eventId: string;
  type: "photo" | "video";
  url: string;              // Server-relative static access path or data URL
  guestName: string;
  filter: string;           // Filter preset ID applied
  timestamp: string;        // ISO timestamp
  likes: number;
  duration?: number;        // Video duration in seconds
  caption?: string;         // AI generated or guest provided caption
}

export interface EventStats {
  photoCount: number;
  videoCount: number;
  uniqueguests: number;
  spaceUsedBytes: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  cssStyle: string;         // CSS styles to preview the filter
  canvasFilter?: string;    // Canvas context filter string (e.g. "contrast(1.2) sepia(0.3)")
  description: string;
  colorClass: string;       // Tailwind class representing the theme
  emoji: string;            // Emoji icon for visual identification
}

export const FILM_FILTERS: FilterPreset[] = [
  {
    id: "none",
    name: "Original",
    emoji: "✦",
    cssStyle: "none",
    canvasFilter: "none",
    description: "بدون فیلتر - کیفیت اصلی و طبیعی",
    colorClass: "bg-slate-100 text-slate-900"
  },
  {
    id: "wedding",
    name: "Wedding",
    emoji: "💍",
    cssStyle: "brightness(1.08) contrast(0.94) saturate(0.85) sepia(0.18) hue-rotate(5deg)",
    canvasFilter: "brightness(1.08) contrast(0.94) saturate(0.85) sepia(0.18) hue-rotate(5deg)",
    description: "روشن، گرم، و رمانتیک — ایده‌آل برای عروسی.",
    colorClass: "bg-rose-50 text-rose-900"
  },
  {
    id: "old",
    name: "Old Film",
    emoji: "🎞️",
    cssStyle: "sepia(0.72) contrast(1.08) brightness(0.9) saturate(0.65) hue-rotate(-8deg)",
    canvasFilter: "sepia(0.72) contrast(1.08) brightness(0.9) saturate(0.65) hue-rotate(-8deg)",
    description: "حال و هوای عکس‌های قدیمی دهه ۵۰ تا ۷۰.",
    colorClass: "bg-amber-100 text-amber-900"
  },
  {
    id: "polaroid",
    name: "Polaroid",
    emoji: "📷",
    cssStyle: "contrast(0.92) brightness(1.12) saturate(0.78) sepia(0.12) hue-rotate(3deg)",
    canvasFilter: "contrast(0.92) brightness(1.12) saturate(0.78) sepia(0.12) hue-rotate(3deg)",
    description: "رنگ‌های ملایم، فِید ملایم — مثل عکس‌های پولاروید واقعی.",
    colorClass: "bg-yellow-50 text-yellow-900"
  },
  {
    id: "vhs",
    name: "VHS Retro",
    emoji: "📼",
    cssStyle: "contrast(1.22) saturate(1.25) sepia(0.2) hue-rotate(-18deg) brightness(0.93)",
    canvasFilter: "contrast(1.22) saturate(1.25) sepia(0.2) hue-rotate(-18deg) brightness(0.93)",
    description: "حس و حال نوارهای قدیمی دهه ۹۰ با کنترلاست بالا.",
    colorClass: "bg-purple-100 text-purple-900"
  },
  {
    id: "noir",
    name: "B&W Noir",
    emoji: "🎬",
    cssStyle: "grayscale(1) contrast(1.2) brightness(0.9)",
    canvasFilter: "grayscale(1) contrast(1.2) brightness(0.9)",
    description: "سیاه و سفید تماشایی با کنترست بالا.",
    colorClass: "bg-zinc-100 text-zinc-900"
  },
  {
    id: "kodak",
    name: "Kodak Gold",
    emoji: "🌄",
    cssStyle: "contrast(1.06) brightness(1.05) saturate(1.18) sepia(0.1) hue-rotate(-5deg)",
    canvasFilter: "contrast(1.06) brightness(1.05) saturate(1.18) sepia(0.1) hue-rotate(-5deg)",
    description: "رنگ‌های گرم، اشباع‌شده — مثل فیلم Kodak Gold 200.",
    colorClass: "bg-amber-100 text-amber-900"
  },
  {
    id: "cinematic",
    name: "Cinematic",
    emoji: "🎥",
    cssStyle: "contrast(1.12) brightness(0.92) saturate(0.82) sepia(0.05) hue-rotate(10deg)",
    canvasFilter: "contrast(1.12) brightness(0.92) saturate(0.82) sepia(0.05) hue-rotate(10deg)",
    description: "پالت رنگی سینمایی — تیره، غنی، و دراماتیک.",
    colorClass: "bg-teal-100 text-teal-900"
  },
  {
    id: "west",
    name: "West Classic",
    emoji: "🌅",
    cssStyle: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    canvasFilter: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    description: "گرم و خوشایند با وینتیج ملایم.",
    colorClass: "bg-amber-100 text-amber-900"
  },
  {
    id: "portrait",
    name: "Portrait Soft",
    emoji: "🌸",
    cssStyle: "contrast(1.02) brightness(1.1) saturate(1.05) sepia(0.02)",
    canvasFilter: "contrast(1.02) brightness(1.1) saturate(1.05) sepia(0.02)",
    description: "نرمی تُن پوست و روشنایی ملایم، عالی برای پرتره.",
    colorClass: "bg-rose-100 text-rose-900"
  }
];
