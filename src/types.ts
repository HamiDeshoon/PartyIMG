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
  saveDirectory: string;    // On-server save directory. Defaults to "./uploads"
  localSyncHost: string;    // Configured local receiver IP/port (e.g., "http://localhost:8080")
  localSyncEnabled: boolean;// Enable automated forwarding to user's real local machine
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
}

export const FILM_FILTERS: FilterPreset[] = [
  {
    id: "west",
    name: "West Classic",
    cssStyle: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    canvasFilter: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    description: "Clean, warm tones with subtle vintage warmth. Inspired by the iconic West iOS filter.",
    colorClass: "bg-amber-100 text-amber-900"
  }
];
