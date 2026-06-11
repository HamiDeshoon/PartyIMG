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
    id: "none",
    name: "Classic Original",
    cssStyle: "filter-none",
    description: "No filter. Clean, sharp and natural.",
    colorClass: "bg-gray-100 text-gray-800"
  },
  {
    id: "vintage",
    name: "Vintage Film (1990)",
    cssStyle: "brightness(1.05) contrast(0.95) saturate(1.1) sepia(0.15) hue-rotate(-5deg)",
    canvasFilter: "brightness(1.05) contrast(0.95) saturate(1.1) sepia(0.15) hue-rotate(-5deg)",
    description: "Faded nostalgic Kodak vibes with soft shadows.",
    colorClass: "bg-amber-100 text-amber-900"
  },
  {
    id: "golden",
    name: "Golden Hour Warmth",
    cssStyle: "sepia(0.2) saturate(1.25) contrast(1.05) brightness(1.02)",
    canvasFilter: "sepia(0.25) saturate(1.25) contrast(1.05)",
    description: "Bathes photos in a rich, warm yellow and golden shimmer.",
    colorClass: "bg-orange-100 text-orange-900"
  },
  {
    id: "wedding",
    name: "Wedding Classic Glow",
    cssStyle: "brightness(1.08) contrast(0.92) saturate(1.15) grayscale(0.05)",
    canvasFilter: "brightness(1.08) contrast(0.92) saturate(1.15)",
    description: "High-key romantic pastel lighting with clean whites.",
    colorClass: "bg-rose-100 text-rose-900"
  },
  {
    id: "midnight",
    name: "Midnight Flash",
    cssStyle: "contrast(1.3) brightness(0.95) saturate(1.1)",
    canvasFilter: "contrast(1.3) brightness(0.95) saturate(1.1)",
    description: "High-contrast, gritty flash aesthetic. Perfect for party dance floors.",
    colorClass: "bg-indigo-100 text-indigo-900"
  },
  {
    id: "sepia",
    name: "Royal Sepia Glam",
    cssStyle: "sepia(0.85) contrast(0.95) brightness(0.95)",
    canvasFilter: "sepia(0.85) contrast(0.95) brightness(0.95)",
    description: "A rich, regal sepia tone that is elegant and timeless.",
    colorClass: "bg-yellow-100 text-yellow-950"
  },
  {
    id: "bw",
    name: "Retro Noir B&W",
    cssStyle: "grayscale(1) contrast(1.45) brightness(0.95)",
    canvasFilter: "grayscale(1) contrast(1.45) brightness(0.95)",
    description: "Deep, moody black and white film style.",
    colorClass: "bg-slate-200 text-slate-800"
  },
  {
    id: "cinematic",
    name: "Cinematic Teal",
    cssStyle: "contrast(1.15) saturate(1.25) hue-rotate(-12deg) brightness(0.98)",
    canvasFilter: "contrast(1.15) saturate(1.25) hue-rotate(-12deg) brightness(0.98)",
    description: "Deep blockbuster movie grade with teal shadows and orange tones.",
    colorClass: "bg-cyan-100 text-cyan-900"
  },
  {
    id: "emerald",
    name: "Emerald Sage",
    cssStyle: "contrast(1.05) saturate(0.85) sepia(0.1) hue-rotate(45deg)",
    canvasFilter: "contrast(1.05) saturate(0.85) sepia(0.1) hue-rotate(45deg)",
    description: "Sophisticated, organic jade green aesthetics.",
    colorClass: "bg-emerald-100 text-emerald-900"
  },
  {
    id: "cyberpunk",
    name: "Electric Cyber",
    cssStyle: "hue-rotate(180deg) saturate(1.6) contrast(1.1) brightness(0.95)",
    canvasFilter: "hue-rotate(180deg) saturate(1.6) contrast(1.1) brightness(0.95)",
    description: "Saturated cybernetic violet and pink shades.",
    colorClass: "bg-fuchsia-100 text-fuchsia-900"
  },
  {
    id: "lomo",
    name: "Lomo Toy Camera",
    cssStyle: "contrast(1.35) saturate(1.4) brightness(1.02)",
    canvasFilter: "contrast(1.35) saturate(1.4) brightness(1.02)",
    description: "Vibrant retro Toy Camera glow with high saturation.",
    colorClass: "bg-red-100 text-red-900"
  },
  {
    id: "rosegold",
    name: "Aesthetic Rosegold",
    cssStyle: "brightness(1.04) contrast(0.94) saturate(1.12) sepia(0.12) hue-rotate(-10deg)",
    canvasFilter: "brightness(1.04) contrast(0.94) saturate(1.12) sepia(0.12) hue-rotate(-10deg)",
    description: "Elegant matte pink highlights with subtle golden warmth.",
    colorClass: "bg-rose-50/80 text-rose-950"
  },
  {
    id: "vhs",
    name: "VHS Vintage Glitch",
    cssStyle: "contrast(1.25) saturate(1.4) brightness(1.05) sepia(0.08) hue-rotate(15deg)",
    canvasFilter: "contrast(1.25) saturate(1.4) brightness(1.05) sepia(0.08) hue-rotate(15deg)",
    description: "Analog tape VHS warm color shift with high scan contrast.",
    colorClass: "bg-purple-100 text-purple-950"
  },
  {
    id: "kodakgold",
    name: "Kodak Gold 200",
    cssStyle: "contrast(1.06) brightness(1.05) saturate(1.22) sepia(0.24) hue-rotate(-7deg)",
    canvasFilter: "contrast(1.06) brightness(1.05) saturate(1.22) sepia(0.24) hue-rotate(-7deg)",
    description: "Legendary warm golden skin tones and soft grainy response.",
    colorClass: "bg-yellow-50 text-yellow-900"
  }
];
