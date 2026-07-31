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
    id: "west",
    name: "West Classic",
    emoji: "🌅",
    cssStyle: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    canvasFilter: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    description: "Clean, warm tones with subtle vintage warmth. Inspired by the iconic West iOS filter.",
    colorClass: "bg-amber-100 text-amber-900"
  },
  {
    id: "vhs",
    name: "VHS Retro",
    emoji: "📼",
    cssStyle: "contrast(1.2) saturate(1.2) sepia(0.2) hue-rotate(-15deg) brightness(0.95)",
    canvasFilter: "contrast(1.2) saturate(1.2) sepia(0.2) hue-rotate(-15deg) brightness(0.95)",
    description: "حس و حال نوارهای قدیمی دهه ۹۰ با کنترلاست بالا.",
    colorClass: "bg-purple-100 text-purple-900"
  },
  {
    id: "portrait",
    name: "Portrait Soft",
    emoji: "🌸",
    cssStyle: "contrast(1.02) brightness(1.1) saturate(1.05) sepia(0.02)",
    canvasFilter: "contrast(1.02) brightness(1.1) saturate(1.05) sepia(0.02)",
    description: "نرمی تُن پوست و روشنایی ملایم، عالی برای عکس‌های پرتره.",
    colorClass: "bg-rose-100 text-rose-900"
  }
];
