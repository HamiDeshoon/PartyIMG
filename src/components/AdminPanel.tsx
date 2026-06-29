import React, { useState, useEffect, FormEvent, useMemo, useRef } from "react";
import { 
  Plus, QrCode, Clipboard, Check, Trash2, Folder, 
  Settings, Sparkles, Download, Heart, Eye, Play, 
  RefreshCw, FileText, Terminal, ArrowLeft, Image, Video, Users, Printer, Activity, Share2, X,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { EventConfig, FILM_FILTERS } from "../types";
import QRCode from "qrcode";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { toast } from "sonner";

interface AdminPanelProps {
  onBackToHome: () => void;
}

export default function AdminPanel({ onBackToHome }: AdminPanelProps) {
  // Override local fetch to automatically include credentials
  const originalFetch = window.fetch;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    return originalFetch(input, { ...init, credentials: "include" });
  };

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [likedMedia, setLikedMedia] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('admin_liked');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });
  
  // Create / Edit Event form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCopiedCommand, setIsCopiedCommand] = useState(false);
  
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formReveal, setFormReveal] = useState<"instant" | "delay">("instant");
  const [formImgLimit, setFormImgLimit] = useState(0);
  const [formVidLimit, setFormVidLimit] = useState(0);
  const [formSaveDir, setFormSaveDir] = useState("./uploads");

  // Sync state settings
  const [localSyncEnabled, setLocalSyncEnabled] = useState(false);
  const [localSyncHost, setLocalSyncHost] = useState("http://localhost:8080");
  const [activeSyncDir, setActiveSyncDir] = useState("./uploads");

  // System statistics
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Postal Card Customizable state
  const [showCardStudio, setShowCardStudio] = useState(false);
  const [cardGreeting, setCardGreeting] = useState("SCAN TO SNAP INSTANT FRAMES");
  const [cardTitle, setCardTitle] = useState("");
  const [cardSubtitle, setCardSubtitle] = useState("Scan to join our collaborative digital live roll");
  const [cardInstructions, setCardInstructions] = useState("");
  const [cardFooter, setCardFooter] = useState("");
  const [cardTheme, setCardTheme] = useState<"slate" | "cream" | "neon" | "sage">("slate");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  // Use a default personalized image (e.g., couple photo) for cards
  const [cardCustomImage, setCardCustomImage] = useState<string | null>("/couple.jpg");
  const [customGuestAddress, setCustomGuestAddress] = useState("");

  // Enhanced Print Card options
  const [cardPaperSize, setCardPaperSize] = useState('4x6');
  const [cardOrientation, setCardOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [cardShowBleed, setCardShowBleed] = useState(true);

  const PAPER_SIZES: Record<string, { width: number; height: number; label: string }> = {
    '4x6': { width: 4, height: 6, label: '4×6"' },
    '5x7': { width: 5, height: 7, label: '5×7"' },
    'a6': { width: 4.1, height: 5.8, label: 'A6' },
    'table-tent': { width: 5, height: 4, label: 'Table Tent' },
  };

  // Inject print styles for card preview
  useEffect(() => {
    const style = window.document.createElement('style');
    style.id = 'card-print-styles';
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        #card-preview, #card-preview * { visibility: visible; }
        #card-preview { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
        @page { margin: 0; }
      }
    `;
    window.document.head.appendChild(style);
    return () => { const s = window.document.getElementById('card-print-styles'); if (s) s.remove(); };
  }, []);

  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const swipeStartX = useRef<number | null>(null);

  const handleCardImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCardCustomImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Analytics Computation
  const analyticsData = useMemo(() => {
    if (!mediaItems || mediaItems.length === 0) return { timeline: [], guestCounts: [], totalStorage: "0 MB", totalGuests: 0 };
    
    const sorted = [...mediaItems].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalBytes = 0;
    const timelineMap = new Map();
    const guestSet = new Set();
    const guestCountsMap = new Map();
    
    sorted.forEach(m => {
       totalBytes += m.type === 'video' ? 15 * 1024 * 1024 : 2.5 * 1024 * 1024; // Mock size
       guestSet.add(m.guestName);
       
       const date = new Date(m.timestamp);
       const timeLabel = date.toLocaleTimeString([], { hour: 'numeric' }); // Group by hour
       
       if(!timelineMap.has(timeLabel)) {
           timelineMap.set(timeLabel, { time: timeLabel, uploads: 0, photos: 0, videos: 0 });
       }
       const tl = timelineMap.get(timeLabel);
       tl.uploads += 1;
       if(m.type === 'photo') tl.photos += 1;
       if(m.type === 'video') tl.videos += 1;

       guestCountsMap.set(m.guestName, (guestCountsMap.get(m.guestName) || 0) + 1);
    });

    const activeGuests = Array.from(guestCountsMap.entries())
      .map(([name, count]) => ({ name, uploads: count }))
      .sort((a,b) => b.uploads - a.uploads)
      .slice(0, 5);

    return { 
       timeline: Array.from(timelineMap.values()),
       guestCounts: activeGuests,
       totalStorage: (totalBytes / (1024*1024)).toFixed(1) + " MB",
       totalGuests: guestSet.size
    };
  }, [mediaItems]);

  // Fetch events
  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
      if (data.length > 0 && !selectedEventId) {
        setSelectedEventId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Base URL for QR links using provided IP and port
  // Base URL points to the landing hub page (album & admin options)
  const baseQrUrl = "http://192.168.70.32:80/";
  // QR now points to the landing page (hub) to allow access to album and admin options
  const guestLink = customGuestAddress.trim()
    ? `${baseQrUrl}/${customGuestAddress.trim().replace(/^\/+/, '')}`
    : baseQrUrl;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      if (!res.ok) throw new Error("Invalid credentials");
      setIsAuthenticated(true);
      fetchEvents();
    } catch (err: any) {
      setAuthError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAuthenticated(false);
    setEvents([]);
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/admin/check");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setIsAuthenticated(true);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchEvents();
  }, [isAuthenticated]);

  // Sync selected event changes
  useEffect(() => {
    if (selectedEventId) {
      const ev = events.find(e => e.id === selectedEventId);
      if (ev) {
        setSelectedEvent(ev);
        setLocalSyncEnabled(ev.localSyncEnabled || false);
        setLocalSyncHost(ev.localSyncHost || "http://localhost:8080");
        setActiveSyncDir(ev.saveDirectory || "./uploads");
        fetchMedia(selectedEventId);

        // Initialize postal card printable templates
        setCardTitle(ev.name || "");
        setCardInstructions(ev.description || "Help us capture every magic memory. Scan this code with your phone camera to load a customized vintage disposable camera. Snap candid retro polaroids, apply vintage filters, and save directly into our secure localhost sync database directory!");
        const formattedDate = ev.date ? ` • ${ev.date}` : "";
        setCardFooter(`Organised by ${ev.hostName || "Sophia Miller"}${formattedDate} • Power by LENS:SHARE`);
      }
    } else {
      setSelectedEvent(null);
      setMediaItems([]);
    }
  }, [selectedEventId, events]);

  // Handle local offline high-res QR code rendering
  useEffect(() => {
    if (guestLink) {
      QRCode.toDataURL(guestLink, { 
        margin: 1, 
        width: 512,
        color: {
          dark: "#0f172a",
          light: "#ffffff"
        }
      })
      .then(url => setQrCodeDataUrl(url))
      .catch(err => console.error("Error generating QR:", err));
    } else {
      setQrCodeDataUrl("");
    }
  }, [guestLink]);

  // WebSocket real-time updates
  useEffect(() => {
    if (!selectedEventId || !isAuthenticated || showCreateModal) return;

    // Initial fetch
    fetchMedia(selectedEventId);

    // WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => setWsConnected(true);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'media:uploaded' && msg.data.eventId === selectedEventId) {
              setMediaItems(prev => [msg.data.media, ...prev]);
            } else if (msg.type === 'media:liked' && msg.data.eventId === selectedEventId) {
              if (msg.data.media) {
                setMediaItems(prev => prev.map(m => m.id === msg.data.mediaId ? { ...m, ...msg.data.media } : m));
              }
            } else if (msg.type === 'media:deleted' && msg.data.eventId === selectedEventId) {
              setMediaItems(prev => prev.filter(m => m.id !== msg.data.mediaId));
            }
          } catch(e) {}
        };
        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => { ws?.close(); };
      } catch(e) {}
    };

    connect();
    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [selectedEventId, isAuthenticated, showCreateModal]);

  // Fetch media for specific event
  const fetchMedia = async (id: string) => {
    try {
      const res = await fetch(`/api/events/${id}/media?isAdmin=true&limit=1000`);
      const data = await res.json();
      setMediaItems(data.media || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!formId || !formName) {
      toast.error("Please provide an Event Code and Event Name.");
      return;
    }

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: formId,
          name: formName,
          hostName: formHost,
          description: formDesc,
          revealStyle: formReveal,
          imageLimit: formImgLimit,
          videoLimit: formVidLimit,
          saveDirectory: formSaveDir
        })
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save event");
        return;
      }

      await fetchEvents();
      setSelectedEventId(formId.toLowerCase().trim().replace(/[^a-z0-9\-]/g, ""));
      setShowCreateModal(false);
      // Reset form
      setFormId("");
      setFormName("");
      setFormHost("");
      setFormDesc("");
      setFormReveal("instant");
      setFormImgLimit(0);
      setFormVidLimit(0);
    } catch (err) {
      console.error(err);
      toast.error("Connection error when saving event.");
    }
  };

  const handleUpdateSyncSettings = async (updates: any) => {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/events/${selectedEventId}/sync-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      // Update local copy
      setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, ...data } : e));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Are you absolutely sure you want to delete this event? This will wipe all uploaded photos and videos in the sandbox.")) {
      return;
    }
    
    // Optimistic UI update
    const eventToDelete = events.find(e => e.id === id);
    setEvents(prev => prev.filter(e => e.id !== id));
    if (selectedEventId === id) setSelectedEventId(null);

    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Error deleting event: " + err.message);
      // Rollback
      if (eventToDelete) {
        setEvents(prev => [...prev, eventToDelete]);
        if (selectedEventId === null) setSelectedEventId(id);
      }
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!selectedEventId) return;
    if (!window.confirm("آیا از حذف این فایل مطمئن هستید؟ (این عمل غیرقابل برگشت است)")) return;
    
    // Optimistic UI update
    const mediaToDelete = mediaItems.find(m => m.id === mediaId);
    setMediaItems(prev => prev.filter(m => m.id !== mediaId));

    try {
      const res = await fetch(`/api/events/${selectedEventId}/media/${mediaId}`, { 
        method: "DELETE" 
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
    } catch (err: any) {
      console.error(err);
      toast.error("خطا در حذف فایل: " + err.message);
      // Rollback
      if (mediaToDelete) {
        setMediaItems(prev => {
          const restored = [...prev, mediaToDelete];
          restored.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return restored;
        });
      }
    }
  };

  const handleLikeMedia = async (mediaId: string) => {
    if (!selectedEventId || likedMedia.has(mediaId)) return;
    try {
      const res = await fetch(`/api/events/${selectedEventId}/media/${mediaId}/like`, { method: "POST" });
      const updatedItem = await res.json();
      setMediaItems(prev => prev.map(m => m.id === mediaId ? updatedItem : m));
      setLikedMedia(prev => {
        const next = new Set(prev).add(mediaId);
        localStorage.setItem('admin_liked', JSON.stringify(Array.from(next)));
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const getExt = (m: any) => {
    if (!m.url) return "jpg";
    const parts = m.url.split(".");
    const ext = parts[parts.length - 1]?.split("?")[0] || "jpg";
    if (m.type === "video" && ext === "jpg") return "mp4";
    return ext;
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = window.document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  const navigateLightbox = (direction: number) => {
    setActiveLightboxIndex(prev => {
      if (prev === null) return prev;
      const len = mediaItems.length;
      if (len === 0) return null;
      const next = prev + direction;
      if (next < 0) return len - 1;
      if (next >= len) return 0;
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeLightboxIndex === null) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); navigateLightbox(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); navigateLightbox(1); }
      if (e.key === "Escape") { setActiveLightboxIndex(null); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLightboxIndex, mediaItems.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null) return;
    const diff = swipeStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 60) {
      navigateLightbox(diff > 0 ? 1 : -1);
    }
    swipeStartX.current = null;
  };

  const copyGuestLink = () => {
    navigator.clipboard.writeText(guestLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `دعوت به ${selectedEvent?.name || 'مراسم'}`,
          text: `شما به رویداد دیجیتال ما دعوت شده‌اید! از طریق این لینک خاطرات را به اشتراک بگذارید:`,
          url: guestLink
        });
      } catch (err) {
        console.error("Error sharing", err);
      }
    } else {
      toast.error("مرورگر شما از قابلیت اشتراک‌گذاری بومی پشتیبانی نمی‌کند.");
    }
  };

  const downloadStandaloneQR = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement("a");
    a.href = qrCodeDataUrl;
    a.download = `${selectedEventId || "event"}-standalone-guest-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const drawWrappedText = (
    ctx: CanvasRenderingContext2D, 
    text: string, 
    x: number, 
    y: number, 
    maxWidth: number, 
    lineHeight: number
  ) => {
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
  };

  const downloadPostalCard = () => {
    if (!selectedEvent) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Background Fill and Borders according to theme
    if (cardTheme === "slate") {
      const grad = ctx.createLinearGradient(0, 0, 0, 1500);
      grad.addColorStop(0, "#090d16");
      grad.addColorStop(0.5, "#0b0f19");
      grad.addColorStop(1, "#120a1c");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1000, 1500);

      // Neon frame borders
      ctx.strokeStyle = "rgba(236, 72, 153, 0.4)"; // bright pink
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, 940, 1440);
      ctx.strokeStyle = "rgba(139, 92, 246, 0.25)"; // indigo purple
      ctx.lineWidth = 1.5;
      ctx.strokeRect(38, 38, 924, 1424);

      // Elegant pink markers in the 4 corners
      ctx.fillStyle = "rgba(236, 72, 153, 0.7)";
      ctx.fillRect(25, 25, 12, 12);
      ctx.fillRect(963, 25, 12, 12);
      ctx.fillRect(25, 1463, 12, 12);
      ctx.fillRect(963, 1463, 12, 12);
    } else if (cardTheme === "cream") {
      ctx.fillStyle = "#faf6ee"; // Ivory/cream
      ctx.fillRect(0, 0, 1000, 1500);

      // Gold-inspired classical frame
      ctx.strokeStyle = "#c2933d"; 
      ctx.lineWidth = 6;
      ctx.strokeRect(35, 35, 930, 1430);
      ctx.strokeStyle = "rgba(194, 147, 61, 0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(45, 45, 910, 1410);

      // Corner dots
      ctx.fillStyle = "#c2933d";
      ctx.beginPath();
      ctx.arc(35, 35, 8, 0, Math.PI * 2);
      ctx.arc(965, 35, 8, 0, Math.PI * 2);
      ctx.arc(35, 1465, 8, 0, Math.PI * 2);
      ctx.arc(965, 1465, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (cardTheme === "neon") {
      ctx.fillStyle = "#0a0710"; // Midnight void
      ctx.fillRect(0, 0, 1000, 1500);

      const bGrad = ctx.createLinearGradient(0, 0, 1000, 1500);
      bGrad.addColorStop(0, "#c084fc"); // lighter purple
      bGrad.addColorStop(1, "#f472b6"); // lighter pink
      ctx.strokeStyle = bGrad;
      ctx.lineWidth = 8;
      ctx.strokeRect(25, 25, 950, 1450);
    } else if (cardTheme === "sage") {
      ctx.fillStyle = "#f4f6f4"; // Herb leaf green tint
      ctx.fillRect(0, 0, 1000, 1500);

      ctx.strokeStyle = "#2d4a34"; // Organic olive border
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, 920, 1420);
      ctx.strokeStyle = "rgba(45, 74, 52, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(48, 48, 904, 1404);
    }

    const textThemeColor = (light: string, dark: string) => (cardTheme === "cream" || cardTheme === "sage") ? light : dark;

    // Header label
    ctx.textAlign = "center";
    ctx.fillStyle = textThemeColor("#706148", "#ec4899");
    if (cardTheme === "sage") ctx.fillStyle = "#3f5e46";
    if (cardTheme === "neon") ctx.fillStyle = "#f472b6";
    ctx.font = "bold 24px 'Inter', system-ui, sans-serif";
    ctx.fillText(cardGreeting.toUpperCase(), 500, 120);

    // Title / Header Name
    ctx.fillStyle = textThemeColor("#1a202c", "#ffffff");
    if (cardTheme === "sage") ctx.fillStyle = "#1e3022";
    ctx.font = "bold 56px 'Inter', system-ui, sans-serif";
    ctx.fillText(cardTitle, 500, 210);

    // Subtitle Link Text
    ctx.fillStyle = textThemeColor("#4a5568", "#cbd5e1");
    if (cardTheme === "sage") ctx.fillStyle = "#3a4c40";
    ctx.font = "bold 26px 'Inter', system-ui, sans-serif";
    ctx.fillText(cardSubtitle, 500, 275);

    // Mid Divider Line
    ctx.strokeStyle = textThemeColor("rgba(194, 147, 61, 0.35)", "rgba(236, 72, 153, 0.25)");
    if (cardTheme === "sage") ctx.strokeStyle = "rgba(45, 74, 52, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(350, 315);
    ctx.lineTo(650, 315);
    ctx.stroke();

    // QR Image size frame setup
    const qrSize = 390;
    const qrx = 500 - qrSize / 2;
    const qry = 380;

    // Outer polaroid border background shadow
    ctx.fillStyle = textThemeColor("rgba(0, 0, 0, 0.05)", "rgba(0, 0, 0, 0.45)");
    ctx.fillRect(qrx - 15, qry - 15, qrSize + 30, qrSize + 30);

    // Clean Polaroid style card body
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(qrx - 10, qry - 10, qrSize + 20, qrSize + 20);

    const finalizeCard = (mainImgElem: HTMLImageElement, isCustomImage: boolean) => {
      // Draw main image (QR or Custom)
      ctx.drawImage(mainImgElem, qrx, qry, qrSize, qrSize);

      // If we used a custom image, append a smaller QR code in the bottom-right corner for scanning
      if (isCustomImage && qrCodeDataUrl) {
        const miniQrSize = 120;
        const miniQr = new window.Image();
        miniQr.onload = () => {
          // outer padding for mini QR
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(qrx + qrSize - miniQrSize - 10, qry + qrSize - miniQrSize - 10, miniQrSize + 20, miniQrSize + 20);
          ctx.drawImage(miniQr, qrx + qrSize - miniQrSize, qry + qrSize - miniQrSize, miniQrSize, miniQrSize);
          continueDrawingText();
        };
        miniQr.src = qrCodeDataUrl;
      } else {
        continueDrawingText();
      }
    };

    const continueDrawingText = () => {
      // Polaroid caption decoration
      ctx.fillStyle = textThemeColor("#b45309", "#ec4899");
      if (cardTheme === "sage") ctx.fillStyle = "#2d4a34";
      if (cardTheme === "neon") ctx.fillStyle = "#c084fc";
      ctx.font = "38px 'Inter', system-ui, sans-serif";
      ctx.fillText("📸", 500, qry + qrSize + 70);

      // Mid Instructions wrapped text lines
      ctx.fillStyle = textThemeColor("#2d3748", "#e2e8f0");
      if (cardTheme === "slate") ctx.fillStyle = "#cbd5e1";
      if (cardTheme === "neon") ctx.fillStyle = "#f3f4f6";
      ctx.font = "bold 25px 'Inter', system-ui, sans-serif";
      const instructionY = qry + qrSize + 130;
      drawWrappedText(ctx, cardInstructions, 500, instructionY, 760, 38);

      // Card footer details
      ctx.fillStyle = textThemeColor("#718096", "rgba(255, 255, 255, 0.4)");
      if (cardTheme === "neon") ctx.fillStyle = "rgba(192, 132, 252, 0.7)";
      ctx.font = "bold 20px 'Inter', system-ui, sans-serif";
      ctx.fillText(cardFooter, 500, 1420);

      // Trigger standard instant PNG download payload
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${selectedEventId || "event"}-printable-invitation-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    const mainImg = new window.Image();
    mainImg.onload = () => finalizeCard(mainImg, !!cardCustomImage);
    mainImg.src = cardCustomImage || qrCodeDataUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  };

  const printPostalCard = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocker prevented physical print template! Please allow popups for this site so the system can launch standard physical printing output.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Guest QR Card - LensShare</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: 'Inter', sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background-color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .postcard {
              width: 4.2in;
              height: 6.2in;
              border: 5px double ${cardTheme === 'cream' ? '#c2933d' : cardTheme === 'sage' ? '#2d4a34' : '#ec4899'};
              box-sizing: border-box;
              background-color: ${cardTheme === 'cream' ? '#faf6ee' : cardTheme === 'sage' ? '#f4f6f4' : '#08050e'};
              color: ${cardTheme === 'cream' ? '#1a202c' : cardTheme === 'sage' ? '#1e3022' : '#ffffff'};
              padding: 0.3in;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              text-align: center;
              position: relative;
            }
            .greeting {
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 1.5px;
              color: ${cardTheme === 'cream' ? '#8a734e' : cardTheme === 'sage' ? '#3f5e46' : '#ec4899'};
              margin: 0;
              text-transform: uppercase;
            }
            .title {
              font-size: 21px;
              font-weight: 800;
              margin: 4px 0;
              line-height: 1.25;
            }
            .subtitle {
              font-size: 11px;
              opacity: 0.85;
              margin: 0 0 10px 0;
              font-weight: 600;
            }
            .qr-container {
              background-color: #ffffff;
              padding: 10px;
              border-radius: 8px;
              box-shadow: 0 3px 12px rgba(0,0,0,0.15);
              display: inline-block;
            }
            .qr-image {
              width: 150px;
              height: 150px;
              display: block;
            }
            .instructions {
              font-size: 10px;
              line-height: 1.45;
              max-width: 90%;
              margin-top: 10px;
              font-weight: 600;
              color: ${cardTheme === 'cream' ? '#2d3748' : cardTheme === 'sage' ? '#3a4c40' : '#e2e8f0'};
            }
            .symbol {
              font-size: 16px;
              margin: 4px 0;
            }
            .footer {
              font-size: 8px;
              opacity: 0.6;
              margin-top: 6px;
              letter-spacing: 0.5px;
              font-weight: 500;
            }
            @media print {
              body {
                background: none;
              }
              .postcard {
                border-radius: 0;
                box-shadow: none;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="postcard">
            <div>
              <p class="greeting">${cardGreeting}</p>
              <h1 class="title">${cardTitle}</h1>
              <p class="subtitle">${cardSubtitle}</p>
            </div>
            
            <div class="qr-container" style="position: relative;">
              <img class="qr-image" src="${cardCustomImage || qrCodeDataUrl}" alt="Card Main Image" style="object-fit: cover;" />
              ${cardCustomImage ? `<div style="position: absolute; bottom: 10px; right: 10px; padding: 5px; background: white; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"><img src="${qrCodeDataUrl}" style="width: 50px; height: 50px; display: block;" /></div>` : ''}
            </div>

            <div>
              <div class="symbol">📸</div>
              <p class="instructions">${cardInstructions}</p>
              <div class="footer">${cardFooter}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 600);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const downloadSyncScriptUrl = selectedEventId 
    ? `/api/events/${selectedEventId}/sync-script` 
    : "";

  const localSyncCLICommand = selectedEventId
    ? `node sync-agent-${selectedEventId}.js "./Local_Photos"`
    : "";

  const copyCLICommand = () => {
    navigator.clipboard.writeText(localSyncCLICommand);
    setIsCopiedCommand(true);
    setTimeout(() => setIsCopiedCommand(false), 2000);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 min-h-screen bg-[#2a1c22] flex items-center justify-center p-6" id="admin_login_view">
        <form onSubmit={handleLogin} className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
          <div className="text-center">
            <h2 className="text-2xl font-display font-medium text-white flex items-center justify-center gap-2">
              <Settings className="w-6 h-6 text-pink-400 animate-spin-slow" />
              Admin Portal
            </h2>
            <p className="text-xs text-slate-400 mt-2">Enter credentials to manage settings.</p>
          </div>
          
          {authError && <div className="bg-red-500/20 border border-red-500/50 text-red-200 text-xs p-3 rounded-xl text-center">{authError}</div>}
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">Username</label>
              <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-pink-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-widest mb-1">Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-pink-400" />
            </div>
          </div>
          
          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-medium py-3 rounded-xl disabled:opacity-50">
             {loading ? 'Authenticating...' : 'Login'}
          </button>
          
          <div className="pt-2 text-center">
             <button type="button" onClick={onBackToHome} className="text-xs text-slate-400 hover:text-white transition-colors">Return to Home</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white font-sans" id="admin_viewport" dir="rtl">
      {/* Admin Navbar */}
      <nav id="admin_nav" className="sticky top-0 z-25 flex items-center justify-between px-6 py-4 backdrop-blur-md bg-white/5 border-b border-white/10 text-white shadow-lg">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <button type="button"
            id="admin_back_btn"
            onClick={onBackToHome} 
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
            title="بازگشت به صفحه اصلی"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div>
            <h1 className="text-xl font-display font-medium tracking-tight text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-pink-400 animate-spin-slow" />
              LENS:SHARE <span className="text-xs font-mono text-pink-400 border border-pink-400/35 px-2 py-0.5 rounded-full uppercase" dir="ltr">Admin</span>
              <span className={`inline-block w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} title={wsConnected ? 'Connected' : 'Disconnected'} />
            </h1>
            <p className="text-xs font-sans text-slate-400 mt-0.5">مدیریت حرفه‌ای مراسم و گالری تصاویر</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={handleLogout}
            className="hidden md:flex border border-white/20 hover:bg-white/10 text-white font-medium py-2 px-4 rounded-xl text-sm items-center gap-2 transition-all cursor-pointer"
          >
            خروج
          </button>
          <button type="button"
            id="admin_create_event_trigger"
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-medium py-2 px-4 rounded-xl text-sm flex items-center gap-2 transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            ایجاد مراسم جدید
          </button>
        </div>
      </nav>

      {/* Primary Layout Grid */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6" id="admin_main_grid">
        
        {/* Left column: Event selection sidebar */}
        <div className="lg:col-span-1 space-y-4 font-sans" id="admin_event_picker_sidebar">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
            <h2 className="text-xs font-bold tracking-wider text-slate-300 mb-3 flex items-center justify-between">
              <span>رویدادهای فعال</span>
              <span className="bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] py-0.5 px-2.5 rounded-full font-mono">{events.length}</span>
            </h2>

            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400">در حال بارگذاری...</div>
            ) : events.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400 rounded-xl bg-black/25 border border-dashed border-white/10 p-4 leading-relaxed">
                مراسمی یافت نشد. برای شروع، یک رویداد جدید بسازید.
              </div>
            ) : (
              <div className="space-y-1 max-h-[450px] overflow-y-auto pr-1">
                {events.map(ev => (
                  <button type="button"
                    key={ev.id}
                    id={`event_btn_${ev.id}`}
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                      selectedEventId === ev.id 
                        ? 'bg-white/25 border-r-4 border-pink-500 text-white font-medium shadow-lg' 
                        : 'bg-black/20 hover:bg-white/10 text-slate-300 hover:text-white border-r-4 border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate text-white">{ev.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">#{ev.id}</div>
                    </div>
                    <span className="bg-white/10 border border-white/15 text-pink-300 text-[10px] font-mono py-0.5 px-2 rounded-full shrink-0 shadow-2xs group-hover:bg-white/20 transition-colors">
                      {ev.mediaCount || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedEvent && (
            <div className="backdrop-blur-xl bg-white/5 border border-rose-500/25 rounded-2xl p-4 shadow-xl" id="danger_zone">
              <h3 className="text-xs font-bold text-rose-400 mb-2">منطقه خطر</h3>
              <p className="text-[11px] text-slate-350 mb-3 leading-relaxed">حذف این رویداد، تمامی فایل‌های مهمانان را برای همیشه پاک می‌کند.</p>
              <button type="button"
                id="delete_event_btn"
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="w-full bg-rose-950/20 hover:bg-rose-900/40 text-rose-300 border border-rose-500/30 text-xs font-medium py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                حذف رویداد
              </button>
            </div>
          )}
        </div>

        {/* Right column(s): Selected event workspaces */}
        <div className="lg:col-span-3 space-y-6" id="admin_workspace">
          {selectedEvent ? (
            <>
              {/* Event Header Banner */}
              <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center md:items-start justify-between gap-6" id="event_work_hdr" dir="rtl">
                <div className="space-y-1.5 flex-1 max-w-xl text-right">
                  <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] py-1 px-2.5 rounded-full font-medium inline-block">
                    میزبان: <span dir="ltr">{selectedEvent.hostName}</span>
                  </span>
                  <h2 className="text-2xl font-display font-medium text-white mt-1">{selectedEvent.name}</h2>
                  <p className="text-sm text-slate-305 leading-relaxed font-sans">{selectedEvent.description}</p>
                  
                  <div className="flex flex-wrap gap-2 pt-2 justify-start" id="event_badge_bar">
                    <span className="bg-white/10 border border-white/10 text-slate-300 text-xs py-1 px-3 rounded-lg flex items-center gap-1.5 font-sans">
                      تاریخ ورود: <span className="font-semibold text-white" dir="ltr">{new Date(selectedEvent.createdAt).toLocaleDateString("fa-IR")}</span>
                    </span>
                    <span className="bg-pink-500/10 text-pink-300 border border-pink-500/20 text-xs py-1 px-3 rounded-lg flex items-center gap-1.5">
                      زمان نمایش آلبوم:
                      <span className="font-semibold text-[10px] bg-pink-950/40 border border-pink-500/30 px-1.5 py-0.5 rounded-md text-pink-200">
                        {selectedEvent.revealStyle === "instant" ? "آنی" : "پس از مراسم"}
                      </span>
                    </span>
                    <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs py-1 px-3 rounded-lg flex items-center gap-1">
                      سقف مجاز:
                      <span className="font-semibold text-white truncate max-w-[120px]" dir="ltr">
                        {selectedEvent.imageLimit === 0 ? "نامحدود" : `${selectedEvent.imageLimit}📸`} / {selectedEvent.videoLimit === 0 ? "نامحدود" : `${selectedEvent.videoLimit}🎥`}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Event Key QR Code Panel */}
                <div className="backdrop-blur-md bg-black/25 rounded-2xl p-4 border border-white/15 flex flex-col items-center shrink-0 w-full md:w-auto shadow-lg" id="qr_card">
                  <div className="bg-white p-2.5 rounded-xl mb-2 shadow-inner relative group cursor-pointer" onClick={() => setShowCardStudio(true)} title="برای طراحی کارت دعوت کلیک کنید">
                    {qrCodeDataUrl ? (
                      <img
                        src={qrCodeDataUrl}
                        alt="Guest QR Code"
                        className="w-28 h-28 select-none rounded"
                      />
                    ) : (
                      <div className="w-28 h-28 bg-slate-150 flex items-center justify-center text-slate-500 text-xs font-mono">طراحی...</div>
                    )}
                    <span className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-[9px] text-white font-bold rounded gap-1 select-none">
                      <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
                      کارت دعوت
                    </span>
                  </div>
                  
                  <div className="w-full space-y-2 text-center font-sans">
                    <button type="button"
                      id="copy_guest_link_btn"
                      onClick={copyGuestLink}
                      className="text-xs bg-white/10 hover:bg-white/15 text-white font-bold py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 justify-center w-full cursor-pointer border border-white/5"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Clipboard className="w-3.5 h-3.5 text-slate-400" />}
                      {copiedLink ? "لینک کپی شد" : "کپی لینک دسترسی"}
                    </button>


                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      <button type="button"
                        onClick={downloadStandaloneQR}
                        className="text-[9px] bg-black/40 hover:bg-black/60 text-slate-300 hover:text-white font-bold py-1.5 px-1 rounded-lg transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border border-white/10"
                        title="دانلود تصویر خام کد QR"
                      >
                        <Download className="w-3 h-3 text-pink-400" />
                        ذخیره QR
                      </button>
                      <button type="button"
                        onClick={handleNativeShare}
                        className="text-[9px] bg-black/40 hover:bg-black/60 text-slate-300 hover:text-white font-bold py-1.5 px-1 rounded-lg transition-all flex flex-col items-center justify-center gap-1 cursor-pointer border border-white/10"
                        title="ارسال لینک رویداد"
                      >
                        <Share2 className="w-3 h-3 text-sky-400" />
                        ارسال لینک
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Event Analytics Dashboard */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl space-y-6" id="event_analytics_deck" dir="rtl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h3 className="text-base font-display font-medium text-white flex items-center gap-2">
                      <Activity className="w-5 h-5 text-pink-400" />
                      آمار لحظه‌ای و فضای ذخیره‌سازی
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      نظارت بر نمودار دریافت فایل‌ها و میزان مشارکت مهمانان در رویداد.
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 shrink-0 text-center">
                      <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase mb-1">فضای مصرفی</div>
                      <div className="text-lg font-bold text-white font-mono" dir="ltr">{analyticsData.totalStorage}</div>
                    </div>
                    <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 shrink-0 text-center">
                      <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase mb-1">مهمانان فعال</div>
                      <div className="text-lg font-bold text-pink-300 font-mono" dir="ltr">{analyticsData.totalGuests}</div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Upload Timeline Area Chart */}
                  <div className="lg:col-span-2 p-4 rounded-xl bg-black/30 border border-white/10 h-[260px] flex flex-col">
                    <h4 className="text-[11px] font-bold text-slate-400 tracking-widest mb-4 flex items-center justify-between">
                      <span>نمودار دریافت فایل (امروز)</span>
                    </h4>
                    {analyticsData.timeline.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={analyticsData.timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} 
                            itemStyle={{ color: '#fff' }}
                          />
                          <Area type="monotone" dataKey="uploads" stroke="#ec4899" strokeWidth={2} fillOpacity={1} fill="url(#colorUploads)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-xs text-slate-500 font-sans border border-dashed border-white/5 rounded-lg bg-black/20">هنوز فایلی دریافت نشده است</div>
                    )}
                  </div>

                  {/* Guest Contributions Bar Chart */}
                  <div className="p-4 rounded-xl bg-black/30 border border-white/10 h-[260px] flex flex-col">
                    <h4 className="text-[11px] font-bold text-slate-400 tracking-widest mb-4">بیشترین مشارکت</h4>
                    {analyticsData.guestCounts.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%" dir="ltr">
                        <BarChart data={analyticsData.guestCounts} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis type="number" stroke="rgba(255,255,255,0.4)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} hide />
                          <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.6)" fontSize={11} tickLine={false} axisLine={false} width={75} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          />
                          <Bar dataKey="uploads" fill="#a855f7" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                       <div className="flex-1 flex items-center justify-center text-xs text-slate-500 font-sans border border-dashed border-white/5 rounded-lg bg-black/20 text-center px-4">در انتظار میهمانان...</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Local Save & Hot-Swap Sync Host controls */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl space-y-6" id="save_and_sync_deck">
                <div>
                  <h3 className="text-base font-display font-medium text-white flex items-center gap-2">
                    <Folder className="w-5 h-5 text-pink-400" />
                    Target Physical Folder & Local syncing
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Control exactly where guest memories are committed on your hard drive, or download the lightweight desktop agent to stream photos/videos directly in high-res!
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6 p-4 rounded-xl bg-black/30 border border-white/10">
                  {/* Left sync controls */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-350 mb-1">
                        Active Server-Side Save Directory:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-black/30 border border-white/10 rounded-lg py-1.5 px-3 text-xs font-mono text-white focus:outline-hidden focus:ring-1 focus:ring-pink-500"
                          value={activeSyncDir}
                          onChange={(e) => {
                            setActiveSyncDir(e.target.value);
                          }}
                          placeholder="e.g. C:/EventMedia/Weddings"
                        />
                        <button type="button"
                          onClick={() => handleUpdateSyncSettings({ saveDirectory: activeSyncDir })}
                          className="bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs px-3 rounded-lg font-medium transition-all cursor-pointer"
                        >
                          Save Path
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-450 mt-1">
                        Any relative path saves locally in your sandbox folder. Absolute paths (e.g. <code className="bg-purple-950/20 text-purple-300 px-1 rounded font-mono text-[9px] border border-purple-500/10">/var/data</code>) attempt disk writes on the server container.
                      </p>
                    </div>

                    {/* Cover Image */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-350 mb-1">Event Cover Image:</label>
                      <div className="flex gap-2 items-center">
                        {selectedEvent.coverImage && (
                          <img src={selectedEvent.coverImage} className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                        )}
                        <input type="file" accept="image/*" className="hidden" id="coverImageUpload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append("fileData", file);
                            formData.append("imageType", "coverImage");
                            const res = await fetch(`/api/events/${selectedEventId}/upload/event-image`, {
                              method: "POST", credentials: "include", body: formData
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setSelectedEvent((prev: any) => ({ ...prev, coverImage: data.url }));
                              toast.success("Cover image uploaded");
                            }
                          }}
                        />
                        <label htmlFor="coverImageUpload" className="bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all">Upload</label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-350 mb-1">Couple Photo:</label>
                      <div className="flex gap-2 items-center">
                        {selectedEvent.couplePhoto && (
                          <img src={selectedEvent.couplePhoto} className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                        )}
                        <input type="file" accept="image/*" className="hidden" id="couplePhotoUpload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append("fileData", file);
                            formData.append("imageType", "couplePhoto");
                            const res = await fetch(`/api/events/${selectedEventId}/upload/event-image`, {
                              method: "POST", credentials: "include", body: formData
                            });
                            if (res.ok) {
                              const data = await res.json();
                              setSelectedEvent((prev: any) => ({ ...prev, couplePhoto: data.url }));
                              toast.success("Couple photo uploaded");
                            }
                          }}
                        />
                        <label htmlFor="couplePhotoUpload" className="bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all">Upload</label>
                      </div>
                    </div>

                    <hr className="border-white/10" />

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-300">
                          Automatic Synced Reveal Status
                        </label>
                        <span className={`text-[10px] font-mono py-0.5 px-2 rounded-full uppercase border ${selectedEvent.isRevealed ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'}`}>
                          {selectedEvent.isRevealed ? "Developed / Instant" : "Locked / Developing"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 mb-2">
                        If delayed-reveal, click below to develop the physical negatives so all guests can look at the album.
                      </p>
                      <button type="button"
                        onClick={() => handleUpdateSyncSettings({ isRevealed: !selectedEvent.isRevealed })}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          selectedEvent.isRevealed 
                            ? 'bg-white/10 hover:bg-white/20 text-white border border-white/10' 
                            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-xs'
                        }`}
                      >
                        {selectedEvent.isRevealed ? <Eye className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {selectedEvent.isRevealed ? "Lock Album Film (Delayed Mode)" : "Develop Prints / Reveal Album Now!"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Uploaded Media items overview */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl space-y-4" id="uploaded_grid_deck">
                <div className="flex items-center justify-between border-b border-white/10 pb-3" dir="rtl">
                  <div>
                    <h3 className="text-base font-display font-medium text-white">
                      دیوار عکس‌های مراسم ({mediaItems.length} فایل)
                    </h3>
                    <p className="text-xs text-slate-350 mt-0.5">مشاهده عکس‌ها و مدیریت فایل‌ها</p>
                  </div>
                  
                  <button type="button"
                    onClick={() => fetchMedia(selectedEventId)} 
                    className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    title="به روز رسانی گالری"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {mediaItems.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 bg-black/20 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center p-6 font-sans">
                    <Image className="w-10 h-10 text-slate-400 mb-2 stroke-1" />
                    <p className="text-sm font-medium text-slate-205 text-white">فایلی دریافت نشده است</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs leading-normal">
                      برای اشتراک گذاری عکس و ویدیو از لینک مهمان استفاده کنید.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="admin_media_grid">
                    {mediaItems.map((m, idx) => (
                      <div key={m.id} onClick={() => setActiveLightboxIndex(idx)} className="relative group bg-white/5 border border-white/15 rounded-xl overflow-hidden flex flex-col justify-between shadow-lg hover:border-pink-500/40 transition-all font-sans cursor-pointer">
                        
                        {/* Media display content */}
                        <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                          {m.type === "video" ? (
                            <div className="relative w-full h-full">
                              <video 
                                src={m.url} 
                                className="w-full h-full object-cover" 
                                controls 
                                playsInline 
                                referrerPolicy="no-referrer"
                              />
                              <span className="absolute top-2 right-2 bg-slate-900/80 text-white text-[9px] font-semibold py-0.5 px-2 rounded-full flex items-center gap-0.5">
                                <Video className="w-2.5 h-2.5 text-red-500" />
                                {m.duration ? `${m.duration}s` : "vdo"}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={m.thumbnailUrl || m.url}
                              alt={`Snapped by ${m.guestName}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          )}

                          {/* Filter applied overlay */}
                          <div className="absolute bottom-2 left-2 pointer-events-none">
                            <span className="bg-black/70 backdrop-blur-xs text-white text-[9px] font-mono py-0.5 px-1.5 rounded uppercase">
                              {FILM_FILTERS.find(f => f.id === m.filter)?.name || m.filter}
                            </span>
                          </div>
                        </div>

                        {/* Description content */}
                        <div className="p-2.5 bg-black/35 text-slate-200 text-xs flex flex-col justify-between flex-1 gap-2 border-t border-white/10">
                          <div className="min-w-0" dir="rtl">
                            <div className="font-semibold text-white truncate text-right">عکاس: {m.guestName}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5 truncate tracking-widest font-mono text-right" dir="ltr">
                              {new Date(m.timestamp).toLocaleTimeString("fa-IR", { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between border-t border-white/5 pt-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <button type="button"
                                onClick={() => handleDeleteMedia(m.id)}
                                className="text-slate-400 hover:text-red-400 transition-colors py-0.5 px-1 hover:bg-white/5 rounded"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button type="button"
                                onClick={() => handleLikeMedia(m.id)}
                                disabled={likedMedia.has(m.id)}
                                className={`transition-colors flex items-center gap-1 text-[11px] font-medium py-0.5 px-1 rounded ${
                                  likedMedia.has(m.id)
                                    ? 'text-rose-400 cursor-default'
                                    : 'text-slate-300 hover:text-rose-400 hover:bg-white/5 cursor-pointer'
                                }`}
                              >
                                <Heart className={`w-3.5 h-3.5 ${likedMedia.has(m.id) ? 'text-rose-500 fill-rose-500' : 'text-current'}`} />
                                <span>{m.likes || 0}</span>
                              </button>
                            </div>
                            
                            <span 
                              className="text-[9px] bg-white/5 text-slate-405 font-mono py-0.5 px-1.5 rounded border border-white/10 max-w-[100px] truncate"
                              title={m.systemSavePath}
                              dir="ltr"
                            >
                              {m.systemSavePath ? m.systemSavePath.split(/[/\\]/).pop() : "No-local"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-12 text-center shadow-2xl flex flex-col items-center justify-center space-y-4" id="workspace_empty" dir="rtl">
              <QrCode className="w-16 h-16 text-pink-400 shrink-0 stroke-1 animate-pulse" />
              <div>
                <h3 className="text-lg font-display font-medium text-white">یک رویداد ایجاد کنید یا انتخاب کنید</h3>
                <p className="text-sm text-slate-300 max-w-sm mx-auto mt-1 leading-normal">
                  از منوی کناری رویداد مورد نظر را انتخاب کنید و یا با زدن دکمه زیر یک مراسم جدید بسازید.
                </p>
              </div>
              <button type="button"
                onClick={() => setShowCreateModal(true)}
                className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold py-2 px-6 rounded-xl text-sm shadow-md transition-all cursor-pointer"
              >
                ایجاد مراسم جدید
              </button>
            </div>
          )}
        </div>

      </div>

      {/* CREATE EVENT MODAL DIALOG */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" id="create_modal">
          <div className="backdrop-blur-3xl bg-slate-900/95 rounded-3xl w-full max-w-lg overflow-hidden border border-white/20 shadow-2xl flex flex-col">
            <div className="bg-white/5 border-b border-white/10 p-6">
              <h3 className="text-xl font-display font-medium text-white">Instantiate Event Environment</h3>
              <p className="text-xs text-slate-350 mt-1">Boot up a digital polaroid dashboard with upload limits and filter decks.</p>
            </div>

            <form onSubmit={handleCreateEvent} className="p-6 space-y-4 text-xs font-sans text-slate-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Event Domain Code (Slug)*
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-white font-mono text-xs uppercase"
                    placeholder="sarah-wedding"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Safe URL slug. e.g. sarah-wedding</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Host Organiser Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-white text-xs"
                    placeholder="Sophia Miller"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Event Display Title*
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-white text-xs"
                  placeholder="e.g. Sarah & Mark's Golden Wedding"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Wedding Greeting / Info text
                </label>
                <textarea
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 h-20 text-white text-xs leading-relaxed resize-none"
                  placeholder="Welcome to our Wedding Disposable! Snap, choose retro filters, record 30-sec toast videos which save straight onto our localhost computer database!"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Photo Reveal setting
                  </label>
                  <select
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-white text-xs"
                    value={formReveal}
                    onChange={(e: any) => setFormReveal(e.target.value)}
                  >
                    <option value="instant" className="bg-slate-900 text-white">Instant Digital Album</option>
                    <option value="delay" className="bg-slate-900 text-white">Delayed Disposable Reveal (reveals later)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Direct local Server Save Dir
                  </label>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 font-mono text-white text-xs"
                    value={formSaveDir}
                    onChange={(e) => setFormSaveDir(e.target.value)}
                    placeholder="./uploads"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-black/45 border border-white/10 rounded-2xl">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-300 mb-1">
                    📸 Photo Limit per Guest
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-black/30 border border-white/15 rounded-lg py-1.5 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-white text-xs"
                    value={formImgLimit}
                    onChange={(e) => setFormImgLimit(Number(e.target.value))}
                  />
                  <p className="text-[9px] text-slate-450 mt-0.5">0 = Unlimited snaps</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-pink-300 mb-1">
                    🎥 Video Limit per Guest (30s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-black/30 border border-white/15 rounded-lg py-1.5 px-3 focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-white text-xs"
                    value={formVidLimit}
                    onChange={(e) => setFormVidLimit(Number(e.target.value))}
                  />
                  <p className="text-[9px] text-slate-450 mt-0.5">0 = Unlimited snaps</p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="bg-white/10 hover:bg-white/15 text-slate-300 font-medium py-2 px-4 rounded-xl cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold py-2 px-5 rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Deploy Deck
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card Studio Modal */}
      {showCardStudio && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="backdrop-blur-3xl bg-slate-900/95 rounded-3xl w-full max-w-2xl overflow-hidden border border-white/20 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-white/5 border-b border-white/10 p-4 flex items-center justify-between">
              <h3 className="text-lg font-display font-medium text-white flex items-center gap-2">
                <Printer className="w-5 h-5 text-pink-400" />
                Card Studio
              </h3>
              <button type="button" onClick={() => setShowCardStudio(false)}
                className="p-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-white/60 hover:text-white transition-all cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-3">
                <h4 className="text-sm font-semibold text-white">Print Settings</h4>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Paper Size</label>
                    <select value={cardPaperSize} onChange={e => setCardPaperSize(e.target.value)}
                      className="bg-white/10 border border-white/20 text-white text-xs rounded-lg px-2 py-1.5">
                      {Object.entries(PAPER_SIZES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label} ({v.width}×{v.height}")</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Orientation</label>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setCardOrientation('portrait')}
                        className={`text-xs px-2 py-1.5 rounded-lg border ${cardOrientation === 'portrait' ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'bg-white/10 border-white/20 text-white/60'}`}>
                        Portrait
                      </button>
                      <button type="button" onClick={() => setCardOrientation('landscape')}
                        className={`text-xs px-2 py-1.5 rounded-lg border ${cardOrientation === 'landscape' ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : 'bg-white/10 border-white/20 text-white/60'}`}>
                        Landscape
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Bleed</label>
                    <button type="button" onClick={() => setCardShowBleed(p => !p)}
                      className={`text-xs px-2 py-1.5 rounded-lg border ${cardShowBleed ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300' : 'bg-white/10 border-white/20 text-white/60'}`}>
                      3mm {cardShowBleed ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
              <div id="card-preview" className={`relative mx-auto ${cardOrientation === 'portrait' ? 'max-w-[320px]' : 'max-w-[420px]'}`}
                style={{ aspectRatio: cardOrientation === 'portrait' ? `${PAPER_SIZES[cardPaperSize].width}/${PAPER_SIZES[cardPaperSize].height}` : `${PAPER_SIZES[cardPaperSize].height}/${PAPER_SIZES[cardPaperSize].width}` }}>
                <div className="w-full h-full bg-white rounded-xl overflow-hidden shadow-lg relative">
                  {cardShowBleed && (
                    <div className="absolute inset-0 border-2 border-dashed border-red-400/50 rounded-xl m-[3mm] pointer-events-none z-10" />
                  )}
                  <div className="p-4 h-full flex flex-col items-center justify-center gap-2 text-gray-900">
                    {qrCodeDataUrl && <img src={qrCodeDataUrl} className="w-24 h-24" alt="QR" />}
                    <p className="text-xs font-semibold text-center leading-tight">{selectedEvent?.name || 'Event Name'}</p>
                    <p className="text-[10px] text-gray-500 text-center leading-tight">
                      {guestLink.replace(/.*\//, '') || 'party/event-id'}
                    </p>
                    <p className="text-[8px] text-gray-400 mt-auto">Scan to upload photos</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <button type="button"
                  onClick={() => { setShowCardStudio(false); setTimeout(() => window.print(), 100); }}
                  className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                  🖨 Print Card
                </button>
                <button type="button"
                  onClick={() => { setShowCardStudio(false); setTimeout(() => window.print(), 100); }}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeLightboxIndex !== null && mediaItems[activeLightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={() => setActiveLightboxIndex(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveLightboxIndex(null)}
                className="p-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm text-white font-medium">{mediaItems[activeLightboxIndex]?.guestName}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const m = mediaItems[activeLightboxIndex];
                handleDownload(m?.url, `${selectedEventId}-${m?.id}.${getExt(m)}`);
              }}
              className="p-2 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative" onClick={e => e.stopPropagation()}>
            {mediaItems.length > 1 && (
              <button type="button"
                onClick={() => navigateLightbox(-1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all cursor-pointer border border-white/10"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-full h-full flex items-center justify-center p-4 max-w-[90vw] max-h-[85vh]">
              {mediaItems[activeLightboxIndex]?.type === "video" ? (
                <video
                  src={mediaItems[activeLightboxIndex]?.url}
                  className="max-w-full max-h-full rounded-xl object-contain"
                  controls autoPlay playsInline
                />
              ) : (
                <img
                  src={mediaItems[activeLightboxIndex]?.url}
                  alt=""
                  className="max-w-full max-h-full rounded-xl object-contain"
                  draggable={false}
                />
              )}
            </div>
            {mediaItems.length > 1 && (
              <button type="button"
                onClick={() => navigateLightbox(1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all cursor-pointer border border-white/10"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-[11px] text-slate-500" onClick={e => e.stopPropagation()}>
            <span>
              {FILM_FILTERS.find(f => f.id === mediaItems[activeLightboxIndex]?.filter)?.name || mediaItems[activeLightboxIndex]?.filter}
            </span>
            <span className="text-white/70 text-xs">
              {activeLightboxIndex + 1} of {mediaItems.length}
            </span>
          </div>
        </div>
      )}


    </div>
  );
}
