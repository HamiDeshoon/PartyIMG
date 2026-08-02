import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  X, Download, Printer, Image, Palette, Sparkles, Heart, 
  ChevronLeft, ChevronRight, QrCode, Upload, Camera, 
  Layout, Type, Settings, Copy, Check, Trash2, Eye,
  RotateCcw, Save, Loader2, Sun, Moon, Layers,
  Wand2, Zap, Droplet, Flower2, Crown, Gem
} from "lucide-react";
import QRCode from "qrcode";

interface WeddingCardDesignerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEvent: any;
  qrCodeDataUrl: string;
  onPrint: () => void;
  onDownload: () => void;
}

export default function WeddingCardDesigner({ 
  isOpen, 
  onClose, 
  selectedEvent, 
  qrCodeDataUrl,
  onPrint,
  onDownload 
}: WeddingCardDesignerProps) {
  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════════════════════════
  // ENHANCED TEMPLATE SYSTEM WITH VISUAL THEMES
  // ═══════════════════════════════════════════════════════════════════════
  
  interface Template {
    id: string;
    name: string;
    nameFa: string;
    category: "classic" | "modern" | "floral" | "luxury" | "minimal" | "cultural";
    preview: string;
    thumbnail: string;
    colors: {
      bg: string;
      bgGradient?: string;
      text: string;
      accent: string;
      accentLight: string;
      secondary: string;
    };
    fontPairing: {
      display: string;
      body: string;
    };
    decorations: {
      showParticles: boolean;
      showBorder: boolean;
      borderStyle: "ornate" | "clean" | "floral" | "geometric" | "none";
      cornerStyle: "classic" | "floral" | "geometric" | "none";
      patternOverlay: "dots" | "lines" | "mesh" | "floral" | "none";
    };
    effects: {
      glow: boolean;
      texture: "paper" | "velvet" | "silk" | "marble" | "none";
      vignette: boolean;
    };
  }

  const templates: Template[] = [
    // CLASSIC CATEGORY
    {
      id: "royal-gold",
      name: "Royal Gold",
      nameFa: "طلاي شاهانه",
      category: "classic",
      preview: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      thumbnail: "radial-gradient(ellipse at center, #1a1a2e 0%, #0f3460 100%)",
      colors: {
        bg: "#1a1a2e",
        bgGradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        text: "#ffffff",
        accent: "#d4af37",
        accentLight: "#f4d58d",
        secondary: "#c9b037"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "ornate",
        cornerStyle: "classic",
        patternOverlay: "dots"
      },
      effects: { glow: true, texture: "velvet", vignette: true }
    },
    {
      id: "midnight-velvet",
      name: "Midnight Velvet",
      nameFa: "مخمل نصف شب",
      category: "luxury",
      preview: "linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%)",
      thumbnail: "radial-gradient(ellipse at center, #0d0d0d 0%, #16213e 100%)",
      colors: {
        bg: "#0a0a0a",
        bgGradient: "linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%)",
        text: "#ffffff",
        accent: "#bb86fc",
        accentLight: "#e1bee7",
        secondary: "#9d6bff"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "geometric",
        cornerStyle: "geometric",
        patternOverlay: "mesh"
      },
      effects: { glow: true, texture: "velvet", vignette: true }
    },
    
    // FLORAL CATEGORY
    {
      id: "blush-romance",
      name: "Blush Romance",
      nameFa: "رومانس صورتی",
      category: "floral",
      preview: "linear-gradient(135deg, #ffeef8 0%, #fce4ec 50%, #f8bbd0 100%)",
      thumbnail: "radial-gradient(ellipse at center, #ffeef8 0%, #f8bbd0 100%)",
      colors: {
        bg: "#fff9fb",
        bgGradient: "linear-gradient(135deg, #ffeef8 0%, #fce4ec 50%, #f8bbd0 100%)",
        text: "#4a148c",
        accent: "#ec407a",
        accentLight: "#f8bbd0",
        secondary: "#d81b60"
      },
      fontPairing: { display: "'Vazirmatn', cursive", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "floral",
        cornerStyle: "floral",
        patternOverlay: "floral"
      },
      effects: { glow: false, texture: "paper", vignette: false }
    },
    {
      id: "rose-garden",
      name: "Rose Garden",
      nameFa: "گلستان سرخ",
      category: "floral",
      preview: "linear-gradient(135deg, #fef7f7 0%, #fdeaea 50%, #fbd5d5 100%)",
      thumbnail: "radial-gradient(ellipse at center, #fef7f7 0%, #fbd5d5 100%)",
      colors: {
        bg: "#fef7f7",
        bgGradient: "linear-gradient(135deg, #fef7f7 0%, #fdeaea 50%, #fbd5d5 100%)",
        text: "#7b241c",
        accent: "#c0392b",
        accentLight: "#e74c3c",
        secondary: "#a93226"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "floral",
        cornerStyle: "floral",
        patternOverlay: "floral"
      },
      effects: { glow: false, texture: "paper", vignette: false }
    },
    {
      id: "lavender-haze",
      name: "Lavender Haze",
      nameFa: "مه ارغوانی",
      category: "floral",
      preview: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ce93d8 100%)",
      thumbnail: "radial-gradient(ellipse at center, #f3e5f5 0%, #ce93d8 100%)",
      colors: {
        bg: "#faf5fa",
        bgGradient: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ce93d8 100%)",
        text: "#4a148c",
        accent: "#8e24aa",
        accentLight: "#ba68c8",
        secondary: "#7b1fa2"
      },
      fontPairing: { display: "'Vazirmatn', cursive", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "ornate",
        cornerStyle: "classic",
        patternOverlay: "dots"
      },
      effects: { glow: true, texture: "silk", vignette: true }
    },

    // NATURE CATEGORY
    {
      id: "emerald-elegance",
      name: "Emerald Elegance",
      nameFa: "شکوفه‌ی زمردی",
      category: "classic",
      preview: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 50%, #a5d6a7 100%)",
      thumbnail: "radial-gradient(ellipse at center, #e8f5e9 0%, #a5d6a7 100%)",
      colors: {
        bg: "#f1f8e9",
        bgGradient: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 50%, #a5d6a7 100%)",
        text: "#1b5e20",
        accent: "#2e7d32",
        accentLight: "#81c784",
        secondary: "#388e3c"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "clean",
        cornerStyle: "classic",
        patternOverlay: "lines"
      },
      effects: { glow: false, texture: "paper", vignette: false }
    },
    {
      id: "sage-serenity",
      name: "Sage Serenity",
      nameFa: "سبزی سرسبز",
      category: "minimal",
      preview: "linear-gradient(135deg, #f1f8e9 0%, #dcedc8 50%, #c5e1a5 100%)",
      thumbnail: "radial-gradient(ellipse at center, #f1f8e9 0%, #c5e1a5 100%)",
      colors: {
        bg: "#f6faf4",
        bgGradient: "linear-gradient(135deg, #f1f8e9 0%, #dcedc8 50%, #c5e1a5 100%)",
        text: "#2e4a2e",
        accent: "#558b2f",
        accentLight: "#9ccc65",
        secondary: "#689f38"
      },
      fontPairing: { display: "'Vazirmatn', sans-serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: false,
        showBorder: true,
        borderStyle: "clean",
        cornerStyle: "none",
        patternOverlay: "none"
      },
      effects: { glow: false, texture: "paper", vignette: false }
    },

    // LUXURY CATEGORY
    {
      id: "champagne-dreams",
      name: "Champagne Dreams",
      nameFa: "روای شاندن",
      category: "luxury",
      preview: "linear-gradient(135deg, #fff8e1 0%, #ffecb3 50%, #ffe082 100%)",
      thumbnail: "radial-gradient(ellipse at center, #fff8e1 0%, #ffe082 100%)",
      colors: {
        bg: "#faf6ed",
        bgGradient: "linear-gradient(135deg, #fff8e1 0%, #ffecb3 50%, #ffe082 100%)",
        text: "#5d4037",
        accent: "#c49a2a",
        accentLight: "#e6c87a",
        secondary: "#b8860b"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "ornate",
        cornerStyle: "classic",
        patternOverlay: "mesh"
      },
      effects: { glow: true, texture: "silk", vignette: true }
    },
    {
      id: "pearl-essence",
      name: "Pearl Essence",
      nameFa: "روح مروارید",
      category: "luxury",
      preview: "linear-gradient(135deg, #fafafa 0%, #f5f5f5 50%, #eeeeee 100%)",
      thumbnail: "radial-gradient(ellipse at center, #fafafa 0%, #eeeeee 100%)",
      colors: {
        bg: "#fcfcfc",
        bgGradient: "linear-gradient(135deg, #fafafa 0%, #f5f5f5 50%, #eeeeee 100%)",
        text: "#212121",
        accent: "#f57c00",
        accentLight: "#ffb74d",
        secondary: "#ef6c00"
      },
      fontPairing: { display: "'Vazirmatn', sans-serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "geometric",
        cornerStyle: "geometric",
        patternOverlay: "mesh"
      },
      effects: { glow: false, texture: "silk", vignette: false }
    },

    // MODERN CATEGORY
    {
      id: "modern-minimal",
      name: "Modern Minimal",
      nameFa: "مینیمال مدرن",
      category: "modern",
      preview: "linear-gradient(135deg, #ffffff 0%, #fafafa 50%, #f5f5f5 100%)",
      thumbnail: "radial-gradient(ellipse at center, #ffffff 0%, #f5f5f5 100%)",
      colors: {
        bg: "#ffffff",
        bgGradient: "linear-gradient(135deg, #ffffff 0%, #fafafa 50%, #f5f5f5 100%)",
        text: "#1a1a1a",
        accent: "#2563eb",
        accentLight: "#60a5fa",
        secondary: "#1d4ed8"
      },
      fontPairing: { display: "'Vazirmatn', sans-serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: false,
        showBorder: false,
        borderStyle: "none",
        cornerStyle: "none",
        patternOverlay: "none"
      },
      effects: { glow: false, texture: "none", vignette: false }
    },
    {
      id: "neon-dreams",
      name: "Neon Dreams",
      nameFa: "روای نئونی",
      category: "modern",
      preview: "linear-gradient(135deg, #0f0f0f 0%, #1a0033 50%, #001a33 100%)",
      thumbnail: "radial-gradient(ellipse at center, #0f0f0f 0%, #001a33 100%)",
      colors: {
        bg: "#0a0a0a",
        bgGradient: "linear-gradient(135deg, #0f0f0f 0%, #1a0033 50%, #001a33 100%)",
        text: "#ffffff",
        accent: "#00ff88",
        accentLight: "#66ffaa",
        secondary: "#ff0066"
      },
      fontPairing: { display: "'Vazirmatn', sans-serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "geometric",
        cornerStyle: "geometric",
        patternOverlay: "lines"
      },
      effects: { glow: true, texture: "none", vignette: true }
    },

    // CULTURAL CATEGORY
    {
      id: "persian-heritage",
      name: "Persian Heritage",
      nameFa: "میراث فارسی",
      category: "cultural",
      preview: "linear-gradient(135deg, #2c1810 0%, #4a2c20 50%, #6b3a2a 100%)",
      thumbnail: "radial-gradient(ellipse at center, #2c1810 0%, #6b3a2a 100%)",
      colors: {
        bg: "#1f120c",
        bgGradient: "linear-gradient(135deg, #2c1810 0%, #4a2c20 50%, #6b3a2a 100%)",
        text: "#f5f0e1",
        accent: "#daa520",
        accentLight: "#f0d67a",
        secondary: "#b8860b"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "ornate",
        cornerStyle: "classic",
        patternOverlay: "dots"
      },
      effects: { glow: true, texture: "paper", vignette: true }
    },
    {
      id: "azure-tradition",
      name: "Azure Tradition",
      nameFa: "سنت لاجوردی",
      category: "cultural",
      preview: "linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)",
      thumbnail: "radial-gradient(ellipse at center, #0d1b2a 0%, #415a77 100%)",
      colors: {
        bg: "#0a1628",
        bgGradient: "linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)",
        text: "#e0e8f0",
        accent: "#00b4d8",
        accentLight: "#48cae4",
        secondary: "#0096c7"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "geometric",
        cornerStyle: "geometric",
        patternOverlay: "mesh"
      },
      effects: { glow: true, texture: "velvet", vignette: true }
    },
    {
      id: "saffron-sunset",
      name: "Saffron Sunset",
      nameFa: "غروب زعفرانی",
      category: "cultural",
      preview: "linear-gradient(135deg, #3d1a0a 0%, #8b4513 50%, #da7500 100%)",
      thumbnail: "radial-gradient(ellipse at center, #3d1a0a 0%, #da7500 100%)",
      colors: {
        bg: "#2a1208",
        bgGradient: "linear-gradient(135deg, #3d1a0a 0%, #8b4513 50%, #da7500 100%)",
        text: "#fff8e7",
        accent: "#ff8c00",
        accentLight: "#ffb340",
        secondary: "#e67300"
      },
      fontPairing: { display: "'Vazirmatn', serif", body: "'Vazirmatn', sans-serif" },
      decorations: {
        showParticles: true,
        showBorder: true,
        borderStyle: "ornate",
        cornerStyle: "classic",
        patternOverlay: "dots"
      },
      effects: { glow: true, texture: "paper", vignette: true }
    }
  ];

  const [selectedTemplateId, setSelectedTemplateId] = useState("royal-gold");
  const [cardData, setCardData] = useState({
    greeting: "به آلبوم دیجیتال عروسی ما خوش آمدید!",
    title: "مراسم عروسی فاطمه و حمید",
    subtitle: "اسکن کنید و لحظات زیبای خود را ثبت کنید",
    instructions: "کد را با دوربین گوشی اسکن کنید، عکس یا ویدیو بگیرید و در آلبوم دیجیتال ما ثبت کنید.",
    footer: "با عشق، فاطمه و حمید • Fatemeh & Hamid",
    customImage: "",
    qrCodeUrl: ""
  });

  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "customize" | "preview" | "effects">("templates");
  const [previewScale, setPreviewScale] = useState(0.7);
  const [showGrid, setShowGrid] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("auto");
  const [savedPresets, setSavedPresets] = useState<Array<{id: string, name: string, data: any, templateId: string}>>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [renderQuality, setRenderQuality] = useState<"standard" | "high" | "print">("high");
  
  // Animation refs
  const particleRef = useRef<HTMLCanvasElement>(null);
  const particleCtx = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameRef = useRef<number>();
  const particlesRef = useRef<Array<{x: number, y: number, vx: number, vy: number, size: number, opacity: number, color: string}>>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];
  const categoryColors = {
    classic: "#d4af37",
    modern: "#2563eb",
    floral: "#ec407a",
    luxury: "#c49a2a",
    minimal: "#558b2f",
    cultural: "#daa520"
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PARTICLE SYSTEM FOR VISUAL EFFECTS
  // ═══════════════════════════════════════════════════════════════════════
  
  const initParticles = useCallback(() => {
    const canvas = particleRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    particleCtx.current = ctx;

    const width = canvas.width = canvas.offsetWidth * 2;
    const height = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const templateColors = [selectedTemplate.colors.accent, selectedTemplate.colors.accentLight, selectedTemplate.colors.secondary];
    particlesRef.current = Array.from({ length: 30 }, () => ({
      x: Math.random() * width / 2,
      y: Math.random() * height / 2,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.1,
      color: templateColors[Math.floor(Math.random() * templateColors.length)]
    }));
  }, [selectedTemplate]);

  const animateParticles = useCallback(() => {
    const canvas = particleRef.current;
    const ctx = particleCtx.current;
    if (!canvas || !ctx) return;

    const width = canvas.width / 2;
    const height = canvas.height / 2;

    ctx.clearRect(0, 0, width, height);

    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Bounce off edges
      if (p.x <= 0 || p.x >= width) p.vx *= -1;
      if (p.y <= 0 || p.y >= height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${Math.floor(p.opacity * 255).toString(16).padStart(2, '0')}`;
      ctx.fill();
    });

    animationFrameRef.current = requestAnimationFrame(animateParticles);
  }, []);

  useEffect(() => {
    initParticles();
    animateParticles();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [initParticles, animateParticles]);

  // ═══════════════════════════════════════════════════════════════════════
  // DATA & EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  // Update card data from selected event
  useEffect(() => {
    if (selectedEvent) {
      setCardData(prev => ({
        ...prev,
        title: selectedEvent.name || prev.title,
        greeting: selectedEvent.hostName ? `خوش آمدید از طرف ${selectedEvent.hostName}` : prev.greeting,
        subtitle: "اسکن کنید و لحظات زیبای خود را ثبت کنید",
        instructions: selectedEvent.description || prev.instructions,
        footer: `با عشق، ${selectedEvent.hostName || "فاطمه و حمید"} • ${selectedEvent.date ? selectedEvent.date + " • " : ""}PartyIMG`,
        qrCodeUrl: qrCodeDataUrl
      }));
    }
  }, [selectedEvent, qrCodeDataUrl]);

  // Generate QR Code with template colors
  useEffect(() => {
    if (selectedEvent) {
      const guestLink = `http://192.168.70.32:80/`;
      QRCode.toDataURL(guestLink, { 
        margin: 1, 
        width: 512,
        color: {
          dark: selectedTemplate.colors.accent,
          light: "#ffffff00"
        }
      }).then(url => {
        setCardData(prev => ({ ...prev, qrCodeUrl: url }));
      }).catch(err => console.error("Error generating QR:", err));
    }
  }, [selectedEvent, selectedTemplateId]);

  // Load saved presets from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wedding_card_presets');
      if (stored) {
        setSavedPresets(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load presets:", e);
    }
  }, []);

  const savePreset = (name: string) => {
    const preset = {
      id: Date.now().toString(),
      name,
      data: { ...cardData },
      templateId: selectedTemplateId
    };
    const updated = [...savedPresets, preset];
    setSavedPresets(updated);
    localStorage.setItem('wedding_card_presets', JSON.stringify(updated));
  };

  const loadPreset = (preset: any) => {
    setCardData(preset.data);
    setSelectedTemplateId(preset.templateId);
    setActiveTab("preview");
  };

  const deletePreset = (id: string) => {
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem('wedding_card_presets', JSON.stringify(updated));
  };

  // ═══════════════════════════════════════════════════════════════════════
  // ADVANCED CANVAS RENDERING WITH EFFECTS
  // ═══════════════════════════════════════════════════════════════════════

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const qualityMultiplier = renderQuality === "print" ? 4 : renderQuality === "high" ? 2 : 1;
    const width = 800;
    const height = 1200;
    
    canvas.width = width * qualityMultiplier;
    canvas.height = height * qualityMultiplier;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(qualityMultiplier, qualityMultiplier);

    const { bg, bgGradient, text, accent, accentLight, secondary } = selectedTemplate.colors;
    const decorations = selectedTemplate.decorations;
    const effects = selectedTemplate.effects;

    // ─── BACKGROUND ────────────────────────────────────────────────────
    if (bgGradient) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      // Parse gradient stops from the gradient string
      const stops = bgGradient.match(/#[0-9a-fA-F]{6}/g) || [bg, accentLight];
      if (stops.length >= 2) {
        grad.addColorStop(0, stops[0]);
        grad.addColorStop(1, stops[stops.length - 1]);
      } else {
        grad.addColorStop(0, bg);
        grad.addColorStop(1, accentLight);
      }
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = bg;
    }
    ctx.fillRect(0, 0, width, height);

    // ─── TEXTURE OVERLAY ──────────────────────────────────────────────
    if (effects.texture !== "none") {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = width;
      textureCanvas.height = height;
      const tctx = textureCanvas.getContext("2d")!;
      
      // Generate noise texture
      const imageData = tctx.createImageData(width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.random() * 30 - 15;
        data[i] = noise;
        data[i + 1] = noise;
        data[i + 2] = noise;
        data[i + 3] = effects.texture === "paper" ? 15 : effects.texture === "velvet" ? 10 : 8;
      }
      tctx.putImageData(imageData, 0, 0);
      
      ctx.globalAlpha = 0.08;
      ctx.drawImage(textureCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    // ─── PATTERN OVERLAY ──────────────────────────────────────────────
    if (decorations.patternOverlay !== "none") {
      ctx.fillStyle = text.includes("#fff") ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)";
      
      switch (decorations.patternOverlay) {
        case "dots":
          for (let x = 0; x < width; x += 40) {
            for (let y = 0; y < height; y += 40) {
              ctx.beginPath();
              ctx.arc(x, y, 1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          break;
        case "lines":
          ctx.strokeStyle = text.includes("#fff") ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.02)";
          ctx.lineWidth = 0.5;
          for (let x = 0; x < width; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
          }
          for (let y = 0; y < height; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          }
          break;
        case "mesh":
          ctx.strokeStyle = `${accent}15`;
          ctx.lineWidth = 0.5;
          for (let x = 0; x < width; x += 60) {
            for (let y = 0; y < height; y += 60) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + 60, y + 60);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(x + 60, y);
              ctx.lineTo(x, y + 60);
              ctx.stroke();
            }
          }
          break;
        case "floral":
          // Simple floral pattern using small circles
          for (let x = 60; x < width; x += 120) {
            for (let y = 60; y < height; y += 120) {
              ctx.fillStyle = `${accent}10`;
              for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(x + Math.cos(angle) * 15, y + Math.sin(angle) * 15, 4, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          break;
      }
    }

    // ─── VIGNETTE EFFECT ──────────────────────────────────────────────
    if (effects.vignette) {
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) * 0.7
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    // ─── GLOW EFFECT PREPARATION ──────────────────────────────────────
    if (effects.glow) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 20;
    }

    // ─── DECORATIVE BORDER ────────────────────────────────────────────
    if (decorations.showBorder) {
      const borderInset = 20;
      
      switch (decorations.borderStyle) {
        case "ornate":
          // Double border with corner ornaments
          ctx.strokeStyle = accent;
          ctx.lineWidth = 4;
          ctx.strokeRect(borderInset, borderInset, width - borderInset * 2, height - borderInset * 2);
          
          ctx.strokeStyle = accentLight;
          ctx.lineWidth = 1;
          ctx.strokeRect(borderInset + 15, borderInset + 15, width - borderInset * 2 - 30, height - borderInset * 2 - 30);
          
          // Corner ornaments
          const drawOrnateCorner = (x: number, y: number, flipX: boolean, flipY: boolean) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            
            // Main curve
            ctx.beginPath();
            ctx.moveTo(0, 60);
            ctx.quadraticCurveTo(0, 0, 60, 0);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Inner accent
            ctx.beginPath();
            ctx.arc(18, 18, 5, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.fill();
            
            // Decorative dots
            for (let i = 1; i <= 3; i++) {
              ctx.beginPath();
              ctx.arc(i * 12, 8, 1.5, 0, Math.PI * 2);
              ctx.fillStyle = accentLight;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(8, i * 12, 1.5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          };
          
          drawOrnateCorner(borderInset + 5, borderInset + 5, false, false);
          drawOrnateCorner(width - borderInset - 5, borderInset + 5, true, false);
          drawOrnateCorner(borderInset + 5, height - borderInset - 5, false, true);
          drawOrnateCorner(width - borderInset - 5, height - borderInset - 5, true, true);
          break;

        case "clean":
          ctx.strokeStyle = `${accent}80`;
          ctx.lineWidth = 2;
          ctx.strokeRect(borderInset, borderInset, width - borderInset * 2, height - borderInset * 2);
          break;

        case "floral":
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(borderInset, borderInset, width - borderInset * 2, height - borderInset * 2);
          
          // Floral corners
          const drawFloralCorner = (x: number, y: number, flipX: boolean, flipY: boolean) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            
            ctx.fillStyle = accent;
            for (let i = 0; i < 6; i++) {
              const angle = (i / 6) * Math.PI * 2;
              ctx.beginPath();
              ctx.arc(Math.cos(angle) * 20, Math.sin(angle) * 20, 6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fillStyle = accentLight;
            ctx.fill();
            ctx.restore();
          };
          
          drawFloralCorner(borderInset + 20, borderInset + 20, false, false);
          drawFloralCorner(width - borderInset - 20, borderInset + 20, true, false);
          drawFloralCorner(borderInset + 20, height - borderInset - 20, false, true);
          drawFloralCorner(width - borderInset - 20, height - borderInset - 20, true, true);
          break;

        case "geometric":
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(borderInset, borderInset, width - borderInset * 2, height - borderInset * 2);
          
          // Geometric corners
          const drawGeoCorner = (x: number, y: number, flipX: boolean, flipY: boolean) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            
            ctx.beginPath();
            ctx.moveTo(0, 40);
            ctx.lineTo(0, 0);
            ctx.lineTo(40, 0);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Inner square
            ctx.strokeStyle = accentLight;
            ctx.lineWidth = 1;
            ctx.strokeRect(8, 8, 24, 24);
            
            // Diagonal
            ctx.beginPath();
            ctx.moveTo(8, 8);
            ctx.lineTo(32, 32);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(32, 8);
            ctx.lineTo(8, 32);
            ctx.stroke();
            ctx.restore();
          };
          
          drawGeoCorner(borderInset + 10, borderInset + 10, false, false);
          drawGeoCorner(width - borderInset - 10, borderInset + 10, true, false);
          drawGeoCorner(borderInset + 10, height - borderInset - 10, false, true);
          drawGeoCorner(width - borderInset - 10, height - borderInset - 10, true, true);
          break;
      }
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // ─── CUSTOM BACKGROUND IMAGE ──────────────────────────────────────
    if (cardData.customImage) {
      const img = new Image();
      img.src = cardData.customImage;
      if (img.complete) {
        ctx.globalAlpha = 0.15;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    }

    // ─── TYPOGRAPHY ───────────────────────────────────────────────────
    ctx.textAlign = "center";
    
    // Greeting
    const displayFont = selectedTemplate.fontPairing.display;
    const bodyFont = selectedTemplate.fontPairing.body;
    
    ctx.fillStyle = accent;
    ctx.font = `600 28px ${displayFont}`;
    ctx.letterSpacing = "3px";
    if (effects.glow) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 15;
    }
    ctx.fillText(cardData.greeting, width / 2, 130);
    ctx.shadowColor = "transparent";

    // Divider
    ctx.fillStyle = accentLight;
    ctx.font = "28px serif";
    ctx.fillText("✧ ✦ ✧", width / 2, 180);

    // Main Title
    ctx.fillStyle = text;
    ctx.font = `800 68px ${displayFont}`;
    if (bg.includes("#fff") || bg.includes("#fef") || bg.includes("#faf")) {
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
    } else if (effects.glow) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 20;
    }
    // Wrap long titles
    const titleLines = wrapText(ctx, cardData.title, width - 100, 68);
    titleLines.forEach((line, i) => {
      ctx.fillText(line, width / 2, 250 + i * 75);
    });
    ctx.shadowColor = "transparent";

    // Subtitle
    ctx.fillStyle = text.includes("#ffffff") || text.includes("#f5f") ? "#888888" : "#555555";
    ctx.font = `400 28px ${bodyFont}`;
    ctx.fillText(cardData.subtitle, width / 2, 350);

    // ─── QR CODE AREA ─────────────────────────────────────────────────
    const qrSize = 360;
    const qrx = width / 2 - qrSize / 2;
    const qry = 400;

    // QR Frame with glow
    if (effects.glow) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 30;
    }
    
    // Outer frame
    const framePadding = 12;
    const frameGradient = ctx.createLinearGradient(
      qrx - framePadding, qry - framePadding,
      qrx + qrSize + framePadding, qry + qrSize + framePadding
    );
    frameGradient.addColorStop(0, accent);
    frameGradient.addColorStop(1, accentLight);
    ctx.fillStyle = frameGradient;
    roundRect(ctx, qrx - framePadding, qry - framePadding, qrSize + framePadding * 2, qrSize + framePadding * 2, 24);
    ctx.fill();

    // White QR background
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, qrx, qry, qrSize, qrSize, 18);
    ctx.fill();
    
    ctx.shadowColor = "transparent";

    // Draw QR
    if (cardData.qrCodeUrl) {
      const qrImg = new Image();
      qrImg.onload = () => {
        ctx.drawImage(qrImg, qrx + 20, qry + 20, qrSize - 40, qrSize - 40);
      };
      qrImg.src = cardData.qrCodeUrl;
    }

    // Scan indicator
    ctx.fillStyle = accent;
    ctx.font = "20px 'Vazirmatn', sans-serif";
    ctx.fillText("اسکن کنید 📱", width / 2, qry + qrSize + 35);

    // ─── INSTRUCTIONS BOX ─────────────────────────────────────────────
    const boxY = qry + qrSize + 60;
    const boxW = width - 120;
    const boxH = 170;
    const boxX = 60;
    const radius = 24;

    // Box background
    const boxGradient = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    if (text.includes("#fff")) {
      boxGradient.addColorStop(0, "rgba(255,255,255,0.12)");
      boxGradient.addColorStop(1, "rgba(255,255,255,0.06)");
    } else {
      boxGradient.addColorStop(0, "rgba(0,0,0,0.08)");
      boxGradient.addColorStop(1, "rgba(0,0,0,0.04)");
    }
    ctx.fillStyle = boxGradient;
    roundRect(ctx, boxX, boxY, boxW, boxH, radius);
    ctx.fill();

    // Box border
    ctx.strokeStyle = `${accent}40`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, boxX, boxY, boxW, boxH, radius);
    ctx.stroke();

    // Camera icon with accent
    ctx.fillStyle = accent;
    ctx.font = "40px 'Vazirmatn', sans-serif";
    ctx.fillText("📷", width / 2, boxY + 58);

    // Instructions text
    ctx.fillStyle = text;
    ctx.font = `400 24px ${bodyFont}`;
    const words = cardData.instructions.split(" ");
    let line = "";
    let lineY = boxY + 115;
    const maxWidth = boxW - 80;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, width / 2, lineY);
        line = words[n] + " ";
        lineY += 36;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, width / 2, lineY);

    // ─── BOTTOM DIVIDER ───────────────────────────────────────────────
    ctx.fillStyle = accent;
    ctx.font = "28px serif";
    ctx.fillText("✧ ✦ ✧", width / 2, height - 110);

    // ─── FOOTER ───────────────────────────────────────────────────────
    ctx.fillStyle = text.includes("#ffffff") || text.includes("#f5f") ? "#999999" : "#777777";
    ctx.font = `600 22px ${bodyFont}`;
    ctx.letterSpacing = "1.5px";
    ctx.fillText(cardData.footer, width / 2, height - 55);

    // ─── GRID OVERLAY (for alignment) ─────────────────────────────────
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,0,0,0.3)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      // Center lines
      ctx.strokeStyle = "rgba(0,255,0,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }
  }, [selectedTemplate, cardData, renderQuality, showGrid]);

  // Helper function for rounded rect
  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  // Helper for text wrapping
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) => {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    
    for (const word of words) {
      const testLine = currentLine + word + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine.trim());
    return lines.length > 0 ? lines : [text];
  };

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT / PRINT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  const handleDownload = async () => {
    setIsRendering(true);
    setRenderQuality("print");
    
    // Wait for render
    await new Promise(r => setTimeout(r, 500));
    
    const canvas = canvasRef.current;
    if (canvas) {
      const link = document.createElement("a");
      link.download = `${selectedEvent?.id || "wedding-card"}-${selectedTemplateId}-print.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
    }
    
    setRenderQuality("high");
    setIsRendering(false);
  };

  const handlePrint = () => {
    setRenderQuality("print");
    setTimeout(() => {
      onPrint();
      window.print();
      setTimeout(() => setRenderQuality("high"), 1000);
    }, 300);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // IMAGE UPLOAD
  // ═══════════════════════════════════════════════════════════════════════

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("حجم فایل نباید بیشتر از 5 مگابایت باشد");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCardData(prev => ({ ...prev, customImage: ev.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════════════════════════

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      handleDownload();
    }
    if (e.ctrlKey && e.key === "p") {
      e.preventDefault();
      handlePrint();
    }
    if (e.key === "ArrowLeft") {
      const idx = templates.findIndex(t => t.id === selectedTemplateId);
      if (idx > 0) setSelectedTemplateId(templates[idx - 1].id);
    }
    if (e.key === "ArrowRight") {
      const idx = templates.findIndex(t => t.id === selectedTemplateId);
      if (idx < templates.length - 1) setSelectedTemplateId(templates[idx + 1].id);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  // TEMPLATE CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════

  const categories = [
    { id: "all", label: "همه", icon: Layout },
    { id: "classic", label: "کلاسیک", icon: Crown },
    { id: "luxury", label: "لوکس", icon: Gem },
    { id: "floral", label: "گلدار", icon: Flower2 },
    { id: "modern", label: "مدرن", icon: Zap },
    { id: "minimal", label: "مینیمال", icon: Droplet },
    { id: "cultural", label: "فرهنگی", icon: Heart }
  ] as const;

  const [activeCategory, setActiveCategory] = useState<typeof categories[number]["id"]>("all");
  const filteredTemplates = activeCategory === "all" 
    ? templates 
    : templates.filter(t => t.category === activeCategory);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-3 md:p-6 z-50 animate-fade-in font-sans" dir="rtl" role="dialog" aria-modal="true" aria-label="طراح کارت دعوت عروسی">
      {/* Particle Background */}
      <canvas
        ref={particleRef}
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ width: "100%", height: "100%" }}
      />

      <div className="backdrop-blur-3xl bg-slate-900/95 rounded-3xl w-full max-w-7xl overflow-hidden border border-amber-500/20 shadow-2xl flex flex-col max-h-[95vh] relative">
        {/* Subtle border glow */}
        <div className="absolute inset-0 rounded-3xl border border-amber-500/10 pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-amber-500/20 bg-gradient-to-r from-slate-900/80 to-slate-800/80 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white font-vazir">استودیو کارت دعوت</h2>
              <p className="text-amber-300/80 text-sm mt-0.5 font-vazir">طراحی کارت دعوت اختصاصی برای مراسم شما</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "auto" : "dark")}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer border border-white/10"
              title={`تم: ${theme === "dark" ? "تیره" : theme === "light" ? "روشن" : "خودکار"}`}
            >
              {theme === "dark" ? <Moon className="w-5 h-5" /> : theme === "light" ? <Sun className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </button>
            
            {/* Grid Toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-2 rounded-xl transition-all cursor-pointer border ${showGrid ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"}`}
              title="نمایش شبکه راهنما"
            >
              <Layout className="w-5 h-5" />
            </button>

            {/* Quality Selector */}
            <select
              value={renderQuality}
              onChange={(e) => setRenderQuality(e.target.value as any)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-vazir focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
            >
              <option value="standard">استاندارد</option>
              <option value="high">کیفیت بالا</option>
              <option value="print">چاپ (پرینت)</option>
            </select>

            <button
              onClick={handleDownload}
              disabled={isRendering}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-50"
            >
              {isRendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              دانلود
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-2 border border-white/10"
            >
              <Printer className="w-4 h-4" />
              چاپ
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-white/15 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer border border-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="px-6 py-2 bg-slate-900/50 border-b border-amber-500/10 text-center text-xs text-white/40 font-vazir hidden md:block">
          کلیدهای میانبر: <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/60">←</kbd> <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/60">→</kbd> تغییر قالب • <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/60">Ctrl+S</kbd> دانلود • <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/60">Ctrl+P</kbd> چاپ
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative z-10">
          {/* Left Sidebar - Templates & Settings */}
          <div className="w-72 md:w-80 lg:w-96 flex-shrink-0 border-l border-amber-500/20 bg-slate-950/50 flex flex-col overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex border-b border-amber-500/10 bg-slate-900/50">
              {[
                { id: "templates", label: "قالب‌ها", icon: Layout },
                { id: "customize", label: "شخصی‌سازی", icon: Settings },
                { id: "effects", label: "افکت‌ها", icon: Wand2 },
                { id: "preview", label: "پیش‌نمایش", icon: Eye }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 transition-all relative overflow-hidden ${
                    activeTab === tab.id
                      ? "text-amber-400 font-semibold"
                      : "text-white/50 hover:text-white/70"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline font-vazir text-sm">{tab.label}</span>
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-1 bg-gradient-to-r from-amber-500 to-rose-500 rounded-t-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* TEMPLATES TAB */}
              {activeTab === "templates" && (
                <div className="space-y-4 animate-fade-in">
                  {/* Category Filter */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-vazir transition-all flex items-center gap-1 ${
                          activeCategory === cat.id
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
                        }`}
                      >
                        <cat.icon className="w-3 h-3" />
                        <span>{cat.label}</span>
                        <span className="text-white/30">({templates.filter(t => cat.id === "all" || t.category === cat.id).length})</span>
                      </button>
                    ))}
                  </div>

                  <h3 className="text-amber-300 font-semibold text-sm font-vazir mb-3">قالب‌های پیش‌فرض</h3>
                  <p className="text-white/40 text-xs font-vazir mb-4">روی هر قالب کلیک کنید تا انتخاب شود • دابل‌کلیک برای پیش‌نمایش بزرگ</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {filteredTemplates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => {
                          setSelectedTemplateId(template.id);
                          setActiveTab("preview");
                        }}
                        onDoubleClick={() => setActiveTab("preview")}
                        className={`relative aspect-[2/3] rounded-2xl overflow-hidden border-2 transition-all cursor-pointer group ${
                          selectedTemplateId === template.id
                            ? "border-amber-400 ring-2 ring-amber-400/50 scale-[1.02]"
                            : "border-white/10 hover:border-amber-500/50"
                        }`}
                      >
                        {/* Template thumbnail with category badge */}
                        <div className="w-full h-full relative" style={{ background: template.thumbnail }}>
                          {/* Category indicator */}
                          <div className="absolute top-2 right-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-vazir ${
                              template.category === "classic" ? "bg-amber-500/30 text-amber-300" :
                              template.category === "luxury" ? "bg-yellow-500/30 text-yellow-300" :
                              template.category === "floral" ? "bg-pink-500/30 text-pink-300" :
                              template.category === "modern" ? "bg-blue-500/30 text-blue-300" :
                              template.category === "minimal" ? "bg-green-500/30 text-green-300" :
                              "bg-orange-500/30 text-orange-300"
                            }`}>
                              {template.category}
                            </span>
                          </div>
                          
                          {/* Preview overlay pattern */}
                          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent" />
                          
                          {/* Selected indicator */}
                          {selectedTemplateId === template.id && (
                            <div className="absolute inset-0 bg-amber-500/10 flex items-center justify-center">
                              <Check className="w-8 h-8 text-amber-300 bg-black/50 rounded-full p-1" />
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                          <p className="text-white font-semibold font-vazir text-sm truncate">{template.nameFa}</p>
                          <p className="text-amber-200/80 text-xs font-vazir truncate">{template.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {filteredTemplates.length === 0 && (
                    <div className="text-center py-8 text-white/40 font-vazir">
                      قالبی در این دسته یافت نشد
                    </div>
                  )}
                </div>
              )}

              {/* CUSTOMIZE TAB */}
              {activeTab === "customize" && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-amber-300 font-semibold text-sm font-vazir">تنظیمات متن</h3>
                  
                  <div className="space-y-3">
                    <label className="block text-white/60 text-xs font-vazir mb-1">سلامت‌نامه</label>
                    <textarea
                      value={cardData.greeting}
                      onChange={(e) => setCardData(prev => ({ ...prev, greeting: e.target.value }))}
                      className="w-full bg-slate-800/50 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-vazir text-sm resize-none min-h-[80px]"
                      placeholder="متن خوش‌آمدگویی..."
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-white/60 text-xs font-vazir mb-1">عنوان اصلی</label>
                    <input
                      type="text"
                      value={cardData.title}
                      onChange={(e) => setCardData(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-slate-800/50 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-vazir text-base"
                      placeholder="عنوان مراسم"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-white/60 text-xs font-vazir mb-1">زیرعنوان</label>
                    <input
                      type="text"
                      value={cardData.subtitle}
                      onChange={(e) => setCardData(prev => ({ ...prev, subtitle: e.target.value }))}
                      className="w-full bg-slate-800/50 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-vazir text-sm"
                      placeholder="زیرعنوان"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-white/60 text-xs font-vazir mb-1">دستورالعمل اسکن</label>
                    <textarea
                      value={cardData.instructions}
                      onChange={(e) => setCardData(prev => ({ ...prev, instructions: e.target.value }))}
                      className="w-full bg-slate-800/50 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-vazir text-sm resize-none min-h-[80px]"
                      placeholder="دستورالعمل برای مهمانان..."
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-white/60 text-xs font-vazir mb-1">پاورقی</label>
                    <input
                      type="text"
                      value={cardData.footer}
                      onChange={(e) => setCardData(prev => ({ ...prev, footer: e.target.value }))}
                      className="w-full bg-slate-800/50 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-vazir text-sm"
                      placeholder="متن پاورقی"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <label className="block text-white/60 text-xs font-vazir mb-2 flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      تصویر پس‌زمینه سفارشی
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="border-2 border-dashed border-white/10 hover:border-amber-500/50 rounded-xl p-6 text-center transition-all">
                        <Upload className="w-10 h-10 mx-auto text-white/30 mb-2" />
                        <p className="text-white/50 text-sm font-vazir">کلیک یا کشیدن فایل اینجا</p>
                        <p className="text-white/30 text-xs font-vazir mt-1">PNG, JPG, WebP تا 5MB</p>
                      </div>
                    </div>
                    {cardData.customImage && (
                      <div className="relative mt-3">
                        <img 
                          src={cardData.customImage} 
                          alt="Custom background"
                          className="w-full h-32 object-cover rounded-xl border border-white/10"
                        />
                        <button
                          onClick={() => setCardData(prev => ({ ...prev, customImage: "" }))}
                          className="absolute top-2 left-2 p-1 bg-red-500/80 hover:bg-red-500 rounded-full text-white transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span className="absolute bottom-2 right-2 text-xs text-white/60 bg-black/50 px-2 py-1 rounded">
                          پس‌زمینه سفارشی فعال است
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Presets Section */}
                  {savedPresets.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white/60 text-xs font-vazir">پیش‌تنظیم‌های ذخیره شده</h4>
                        <button
                          onClick={() => {
                            const name = prompt("نام پیش‌تنظیم را وارد کنید:");
                            if (name) savePreset(name);
                          }}
                          className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-lg text-xs font-vazir hover:bg-amber-500/30 transition-colors flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" />
                          ذخیره
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {savedPresets.slice(-5).map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => loadPreset(preset)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (confirm(`حذف پیش‌تنظیم "${preset.name}"؟`)) deletePreset(preset.id);
                            }}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-vazir text-white/80 transition-all flex items-center gap-1"
                            title="راست‌کلیک برای حذف"
                          >
                            <span className="truncate max-w-[100px]">{preset.name}</span>
                            <RotateCcw className="w-3 h-3 text-white/40" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* EFFECTS TAB */}
              {activeTab === "effects" && (
                <div className="space-y-6 animate-fade-in">
                  <h3 className="text-amber-300 font-semibold text-sm font-vazir">جلوه‌های بصری</h3>
                  
                  {/* Particle Controls */}
                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <h4 className="flex items-center gap-2 text-white/80 text-sm font-vazir">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      سیستم ذرات
                    </h4>
                    <div className="space-y-3 text-white/60 text-xs font-vazir">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTemplate.decorations.showParticles}
                          onChange={() => {}}
                          className="w-4 h-4 accent-amber-500"
                        />
                        فعال‌سازی ذرات متحرک (تنظیم شده بر اساس قالب)
                      </label>
                      <p className="text-white/40 ml-7">قالب فعلی: {selectedTemplate.decorations.showParticles ? "ذرات فعال" : "بدون ذرات"}</p>
                    </div>
                  </div>

                  {/* Border Style Preview */}
                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <h4 className="flex items-center gap-2 text-white/80 text-sm font-vazir">
                      <Layers className="w-4 h-4 text-amber-400" />
                      استایل حاشیه
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: "ornate", label: "کلاسیک", icon: Crown },
                        { key: "clean", label: "تمیز", icon: Droplet },
                        { key: "floral", label: "گلدار", icon: Flower2 },
                        { key: "geometric", label: "هندسی", icon: Zap },
                        { key: "none", label: "بدون", icon: X }
                      ].map(style => (
                        <button
                          key={style.key}
                          className={`p-3 rounded-xl text-center transition-all text-xs font-vazir ${
                            selectedTemplate.decorations.borderStyle === style.key
                              ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                              : "bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
                          }`}
                        >
                          <style.icon className="w-5 h-5 mx-auto mb-1" />
                          <div>{style.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Texture Options */}
                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <h4 className="flex items-center gap-2 text-white/80 text-sm font-vazir">
                      <Gem className="w-4 h-4 text-amber-400" />
                      بافت و اثر
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "none", label: "بدون", desc: "مسطح" },
                        { key: "paper", label: "کاغذ", desc: "متن‌کنده" },
                        { key: "velvet", label: "مخمل", desc: "نرم" },
                        { key: "silk", label: "ابریشم", desc: "براق" },
                        { key: "marble", label: "مرمر", desc: "مُلمع" }
                      ].map(tex => (
                        <button
                          key={tex.key}
                          className={`p-3 rounded-xl text-center transition-all text-xs font-vazir ${
                            selectedTemplate.effects.texture === tex.key
                              ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                              : "bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
                          }`}
                        >
                          <div className="font-medium">{tex.label}</div>
                          <div className="text-white/40">{tex.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Palette */}
                  <div className="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <h4 className="flex items-center gap-2 text-white/80 text-sm font-vazir">
                      <Palette className="w-4 h-4 text-amber-400" />
                      پالت رنگی قالب
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "پس‌زمینه", color: selectedTemplate.colors.bg },
                        { label: "متن اصلی", color: selectedTemplate.colors.text },
                        { label: "اکسنت", color: selectedTemplate.colors.accent },
                        { label: "اکسنت روشن", color: selectedTemplate.colors.accentLight },
                        { label: "ثانویه", color: selectedTemplate.colors.secondary }
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2 group">
                          <div 
                            className="w-10 h-10 rounded-lg border border-white/10 flex-shrink-0 relative"
                            style={{ backgroundColor: item.color }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/20" />
                          </div>
                          <div className="group-hover:opacity-100 opacity-0 transition-opacity min-w-[120px]">
                            <span className="text-white/70 text-xs font-vazir">{item.label}</span>
                            <span className="text-amber-300 text-xs font-mono ml-1">{item.color}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PREVIEW TAB */}
              {activeTab === "preview" && (
                <div className="space-y-4 animate-fade-in">
                  <h3 className="text-amber-300 font-semibold text-sm font-vazir">پیش‌نمایش زنده</h3>
                  
                  {/* Scale Control */}
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-white/50 text-xs font-vazir">مقیاس:</span>
                    <input
                      type="range"
                      min="0.3"
                      max="1"
                      step="0.05"
                      value={previewScale}
                      onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <span className="text-amber-300 text-xs font-vazir w-12 text-left">{Math.round(previewScale * 100)}%</span>
                    <button
                      onClick={() => setPreviewScale(0.7)}
                      className="px-2 py-1 text-xs text-white/50 hover:text-white transition-colors font-vazir"
                    >
                      ریست
                    </button>
                  </div>

                  {/* Canvas Preview */}
                  <div className="relative" style={{ transform: `scale(${previewScale})`, transformOrigin: "top center" }}>
                    <canvas
                      ref={canvasRef}
                      className="mx-auto bg-slate-900 rounded-xl shadow-2xl border border-white/10"
                    />
                  </div>

                  {/* Template Indicator */}
                  <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-1.5 pointer-events-none">
                    {templates.map(t => (
                      <div
                        key={t.id}
                        className={`w-2 h-2 rounded-full transition-all ${
                          selectedTemplateId === t.id
                            ? "bg-amber-400 w-6"
                            : "bg-white/20 hover:bg-white/40"
                        }`} />
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleDownload}
                      disabled={isRendering}
                      className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50"
                    >
                      <Download className="w-5 h-5" />
                      <span className="font-vazir">دانلود با کیفیت بالا</span>
                    </button>
                    <button
                      onClick={handlePrint}
                      className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-white/10"
                    >
                      <Printer className="w-5 h-5" />
                      <span className="font-vazir">نسخه چاپ</span>
                    </button>
                  </div>

                  {/* Template Info Card */}
                  <div className="mt-4 p-4 bg-slate-900/50 rounded-2xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl" style={{ background: selectedTemplate.thumbnail }} />
                      <div className="flex-1">
                        <h4 className="text-white font-semibold font-vazir">{selectedTemplate.nameFa}</h4>
                        <p className="text-amber-300/80 text-sm font-vazir">{selectedTemplate.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-vazir ${
                            selectedTemplate.category === "classic" ? "bg-amber-500/30 text-amber-300" :
                            selectedTemplate.category === "luxury" ? "bg-yellow-500/30 text-yellow-300" :
                            selectedTemplate.category === "floral" ? "bg-pink-500/30 text-pink-300" :
                            selectedTemplate.category === "modern" ? "bg-blue-500/30 text-blue-300" :
                            selectedTemplate.category === "minimal" ? "bg-green-500/30 text-green-300" :
                            "bg-orange-500/30 text-orange-300"
                          }`}>
                            {selectedTemplate.category}
                          </span>
                          <span className="text-white/40 text-xs font-vazir">فونت: {selectedTemplate.fontPairing.display.replace(/'/g, "").split(",")[0]}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Live Preview */}
          <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-amber-300 font-semibold text-lg font-vazir">پیش‌نمایش آنی</h3>
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs font-vazir">قالب فعال:</span>
                <span className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-xs font-vazir">
                  {selectedTemplate.nameFa}
                </span>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center overflow-auto bg-slate-900/50 rounded-2xl border border-white/10 relative">
              {/* Large Preview Canvas */}
              <div className="relative" style={{ transform: `scale(0.85)`, transformOrigin: "top center" }}>
                <canvas
                  ref={canvasRef}
                  className="bg-slate-900 rounded-xl shadow-2xl"
                />
              </div>
              
              {/* Template Indicator Dots */}
              <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-2 pointer-events-none">
                {templates.map(t => (
                  <div
                    key={t.id}
                    className={`w-2 h-2 rounded-full transition-all ${
                      selectedTemplateId === t.id
                        ? "bg-amber-400 w-6"
                        : "bg-white/20 hover:bg-white/40"
                    }`} />
                ))}
              </div>
            </div>

            {/* Color Palette Preview */}
            <div className="mt-4 p-4 bg-slate-900/50 rounded-2xl border border-white/10">
              <h4 className="text-white/60 text-xs font-vazir mb-3">پالت رنگی قالب</h4>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "پس‌زمینه", color: selectedTemplate.colors.bg },
                  { label: "متن", color: selectedTemplate.colors.text },
                  { label: "اکسنت", color: selectedTemplate.colors.accent },
                  { label: "اکسنت روشن", color: selectedTemplate.colors.accentLight },
                  { label: "ثانویه", color: selectedTemplate.colors.secondary }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <div 
                      className="w-8 h-8 rounded-lg border border-white/10 flex-shrink-0 relative"
                      style={{ backgroundColor: item.color }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/20" />
                    </div>
                    <div className="group-hover:opacity-100 opacity-0 transition-opacity">
                      <span className="text-white/70 text-xs font-vazir">{item.label}</span>
                      <span className="text-amber-300 text-xs font-mono ml-1">{item.color}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Animations
const style = document.createElement('style');
style.textContent = `
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in { animation: fade-in 0.3s ease-out; }
  .animate-slide-up { animation: slide-up 0.4s ease-out; }
  .animate-shake { animation: shake 0.5s ease-in-out; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
  }
`;
if (typeof document !== 'undefined' && !document.head.querySelector('style[data-wedding-card]')) {
  style.setAttribute('data-wedding-card', 'true');
  document.head.appendChild(style);
}