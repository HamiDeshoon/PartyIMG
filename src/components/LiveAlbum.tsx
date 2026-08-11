// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowLeft, Download, Image, Loader, X, Video,
  CheckSquare, Square as SquareIcon,
  DownloadCloud, Search, User, Heart, Calendar,
  Sparkles, Users, LayoutGrid, Grid, Film, Palette,
  Maximize2, Share2, ChevronLeft, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

interface LiveAlbumProps {
  eventId: string;
  onBackToHome: () => void;
}

type GroupTab = "all" | "faces";
type FilterType = "all" | "photos" | "videos" | "most-liked";
type ViewMode = "scatter" | "grid";
type ThemeSkin = "velvet" | "golden" | "emerald";

export default function LiveAlbum({ eventId, onBackToHome }: LiveAlbumProps) {
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [currentGroupTab, setCurrentGroupTab] = useState<GroupTab>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const [searchGuest, setSearchGuest] = useState("");
  const [contentFilter, setContentFilter] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("scatter");
  const [themeSkin, setThemeSkin] = useState<ThemeSkin>("velvet");

  const [faceProfiles, setFaceProfiles] = useState<any[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [likesMap, setLikesMap] = useState<Record<string, number>>({});
  const [popHeartId, setPopHeartId] = useState<string | null>(null);
  const prevMediaCount = useRef(0);

  const loadFaceProfiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/face-profiles`);
      if (res.ok) {
        const data = await res.json();
        setFaceProfiles(data.profiles || []);
      }
    } catch (e) {
      console.error("Failed to load face profiles", e);
    }
  }, [eventId]);

  const loadMedia = useCallback(async () => {
    try {
      setLoading(true);
      const evRes = await fetch(`/api/events/${eventId}`);
      if (evRes.ok) {
        const ev = await evRes.json();
        setEventName(ev.name || eventId);
        if (typeof ev.mediaCount === "number") prevMediaCount.current = ev.mediaCount;
      }
      const res = await fetch(`/api/events/${eventId}/media?limit=500&offset=0`);
      const data = await res.json();
      const items = data.media || [];
      setMediaItems(items);
      // Seed the like counts from the server so hearts survive a reload.
      setLikesMap(Object.fromEntries(items.map((m: any) => [m.id, m.likes || 0])));
      await loadFaceProfiles();
    } catch (e) {
      console.error("Failed to load album", e);
    } finally {
      setLoading(false);
    }
  }, [eventId, loadFaceProfiles]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Live updates over the websocket the server already broadcasts on, with a
  // slow poll as a fallback for proxies that drop the upgrade.
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: any = null;
    let closed = false;

    const connect = () => {
      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(`${proto}//${window.location.host}`);
        socket.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.data?.eventId && msg.data.eventId !== eventId) return;
            if (msg.type === "media:uploaded" && msg.data?.media) {
              setMediaItems((prev) => (prev.some((m) => m.id === msg.data.media.id) ? prev : [msg.data.media, ...prev]));
              prevMediaCount.current += 1;
              toast.success("عکس جدیدی به آلبوم اضافه شد!", { duration: 3000 });
            } else if (msg.type === "media:deleted" && msg.data?.mediaId) {
              setMediaItems((prev) => prev.filter((m) => m.id !== msg.data.mediaId));
            } else if (msg.type === "media:updated" && msg.data?.media) {
              // A video finished its background re-encode: swap in the new URL
              // in place, without re-announcing it as a new upload.
              setMediaItems((prev) => prev.map((m) => (m.id === msg.data.media.id ? { ...m, ...msg.data.media } : m)));
            } else if (msg.type === "media:liked" && msg.data?.media) {
              setLikesMap((prev) => ({ ...prev, [msg.data.media.id]: msg.data.media.likes || 0 }));
            }
          } catch {}
        };
        socket.onclose = () => {
          if (!closed) retry = setTimeout(connect, 8000);
        };
      } catch {}
    };
    connect();

    const poll = setInterval(async () => {
      if (socket && socket.readyState === WebSocket.OPEN) return;
      try {
        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) return;
        const ev = await res.json();
        if (typeof ev.mediaCount === "number" && ev.mediaCount > prevMediaCount.current) {
          const diff = ev.mediaCount - prevMediaCount.current;
          toast.success(`${diff} عکس/ویدیوی جدید آپلود شد!`, { duration: 4000 });
          loadMedia();
        }
      } catch {}
    }, 30000);

    return () => {
      closed = true;
      clearInterval(poll);
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [eventId, loadMedia]);

  const photos = useMemo(() => mediaItems.filter(m => m.type !== "video"), [mediaItems]);
  const allGuests: string[] = useMemo(
    () => [...new Set(mediaItems.map(m => m.guestName).filter(Boolean) as string[])],
    [mediaItems]
  );

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

  const handleDownloadSelected = async () => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      const m = mediaItems.find(mm => mm.id === id);
      if (m) {
        await handleDownload(m.url, `${eventId}-${m.id}.${getExt(m)}`);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleDownloadAll = async () => {
    for (const m of mediaItems) {
      await handleDownload(m.url, `${eventId}-${m.id}.${getExt(m)}`);
      await new Promise(r => setTimeout(r, 300));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const allIds = new Set(getDisplayedItems().map(m => m.id));
    setSelectedIds(allIds);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleToggleLike = async (mId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPopHeartId(mId);
    setTimeout(() => setPopHeartId(null), 900);
    // Optimistic bump, then persist so likes survive reloads and reach other guests.
    setLikesMap(prev => ({ ...prev, [mId]: (prev[mId] || 0) + 1 }));
    try {
      const res = await fetch(`/api/events/${eventId}/media/${mId}/like`, { method: "POST" });
      if (res.ok) {
        const media = await res.json();
        if (media && typeof media.likes === "number") {
          setLikesMap(prev => ({ ...prev, [mId]: media.likes }));
        }
      }
    } catch {
      // Keep the optimistic value; a refresh will reconcile it.
    }
  };

  const getThemeSkinClass = () => {
    if (themeSkin === "golden") return "theme-golden";
    if (themeSkin === "emerald") return "theme-emerald";
    return "theme-velvet";
  };

  const displayedItems = useMemo(() => {
    let items = mediaItems;
    if (currentGroupTab === "faces" && selectedPersonId) {
      const p = faceProfiles.find(fp => fp.personId === selectedPersonId);
      if (p && p.photoNames && p.photoNames.length > 0) {
        items = items.filter(m => {
          if (!m.url) return false;
          const fileName = m.url.split('/').pop() || '';
          return p.photoNames.some((pName: string) => fileName.includes(pName) || pName.includes(fileName));
        });
      }
    }

    if (searchGuest.trim()) {
      const q = searchGuest.trim().toLowerCase();
      items = items.filter(m => m.guestName?.toLowerCase().includes(q));
    }
    if (contentFilter === "photos") {
      items = items.filter(m => m.type !== "video");
    } else if (contentFilter === "videos") {
      items = items.filter(m => m.type === "video");
    } else if (contentFilter === "most-liked") {
      items = [...items].sort((a, b) => (likesMap[b.id] ?? b.likes ?? 0) - (likesMap[a.id] ?? a.likes ?? 0));
    }
    return items;
  }, [mediaItems, currentGroupTab, selectedPersonId, faceProfiles, searchGuest, contentFilter, likesMap]);

  const getDisplayedItems = () => displayedItems;

  const navigateLightbox = (direction: number) => {
    setSelectedIdx(prev => {
      if (prev === null) return prev;
      const len = displayedItems.length;
      if (len === 0) return null;
      const next = prev + direction;
      if (next < 0) return len - 1;
      if (next >= len) return 0;
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIdx === null) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); navigateLightbox(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); navigateLightbox(1); }
      if (e.key === "Escape") { setSelectedIdx(null); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIdx, displayedItems.length]);

  const lightboxRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef<number | null>(null);

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

  return (
    <div dir="rtl" className={`min-h-[100dvh] ${getThemeSkinClass()} text-white flex flex-col font-sans relative transition-colors duration-500`} id="live_album_viewport">
      
      {/* Ambient background orbs & wall vignette */}
      <div className="orb orb-rose" aria-hidden="true" />
      <div className="orb orb-amber" aria-hidden="true" />
      <div className="wall-vignette" aria-hidden="true" />

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 glass-card border-b border-white/10 px-4 py-3 flex flex-wrap items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={onBackToHome}
            className="p-2 bg-white/5 hover:bg-white/15 rounded-xl text-white transition-all cursor-pointer border border-white/10 shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white leading-tight">آلبوم زنده خاطرات</h1>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/30 font-mono font-bold">
                {mediaItems.length} فایل
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[180px] mt-0.5">{eventName || eventId}</p>
          </div>
        </div>

        {/* View Mode & Theme Switchers */}
        <div className="flex items-center gap-2 font-sans flex-wrap">
          {/* Theme Skin Picker */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setThemeSkin("velvet")}
              title="تم مخملی"
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-all flex items-center gap-1 ${themeSkin === "velvet" ? "bg-rose-500/30 text-rose-200 border border-rose-400/40 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              <span>🍷</span>
              <span className="hidden sm:inline">مخملی</span>
            </button>
            <button
              type="button"
              onClick={() => setThemeSkin("golden")}
              title="تم طلایی"
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-all flex items-center gap-1 ${themeSkin === "golden" ? "bg-amber-500/30 text-amber-200 border border-amber-400/40 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              <span>✨</span>
              <span className="hidden sm:inline">طلایی</span>
            </button>
            <button
              type="button"
              onClick={() => setThemeSkin("emerald")}
              title="تم زمردی"
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-all flex items-center gap-1 ${themeSkin === "emerald" ? "bg-teal-500/30 text-teal-200 border border-teal-400/40 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              <span>🌿</span>
              <span className="hidden sm:inline">زمردی</span>
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setViewMode("scatter")}
              title="دیوار خاطرات"
              className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs ${viewMode === "scatter" ? "bg-white/20 text-white font-bold shadow-md" : "text-slate-400 hover:text-white"}`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden md:inline text-[11px]">پولاروید</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="شبکه مدرن"
              className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs ${viewMode === "grid" ? "bg-white/20 text-white font-bold shadow-md" : "text-slate-400 hover:text-white"}`}
            >
              <Grid className="w-4 h-4" />
              <span className="hidden md:inline text-[11px]">مدرن</span>
            </button>
          </div>

          {/* Selection & Actions */}
          {selectMode ? (
            <div className="flex items-center gap-1.5">
              <button type="button"
                onClick={selectAllVisible}
                className="text-[11px] px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-slate-200 transition-all cursor-pointer border border-white/10 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                همه
              </button>
              {selectedIds.size > 0 && (
                <button type="button"
                  onClick={deselectAll}
                  className="text-[11px] px-2.5 py-1.5 bg-white/5 hover:bg-white/15 rounded-xl text-slate-300 transition-all cursor-pointer border border-white/10"
                >
                  لغو
                </button>
              )}
              <button type="button"
                onClick={handleDownloadSelected}
                disabled={selectedIds.size === 0}
                className="text-[11px] px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-500/30 text-white rounded-xl transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5 font-bold shadow-lg"
              >
                <Download className="w-3.5 h-3.5" />
                ({selectedIds.size})
              </button>
              <button type="button"
                onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-slate-300 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button type="button"
                onClick={() => setSelectMode(true)}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-xl text-slate-300 transition-all cursor-pointer border border-white/10 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                انتخاب
              </button>
              <button type="button"
                onClick={handleDownloadAll}
                className="text-[11px] px-3 py-1.5 shimmer-gold rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                title="دانلود همه عکس‌ها"
              >
                <DownloadCloud className="w-3.5 h-3.5 text-slate-900" />
                دانلود همگی
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── TABS & CONTENT FILTER ── */}
      <div className="z-20 shrink-0 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="px-4 py-2 flex items-center justify-between gap-3 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5">
            <button type="button"
              onClick={() => setCurrentGroupTab("all")}
              className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                currentGroupTab === "all"
                  ? "bg-rose-500/25 border-rose-500/50 text-rose-300 font-bold shadow-sm"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              همه ({mediaItems.length})
            </button>

            <button type="button"
              onClick={() => { setCurrentGroupTab("faces"); }}
              className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
                currentGroupTab === "faces"
                  ? "bg-teal-500/25 border-teal-500/50 text-teal-300 font-bold shadow-sm"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3 h-3 text-teal-400" />
              چهره‌ها ({faceProfiles.length})
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative flex items-center shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5" />
            <input
              type="text"
              placeholder="جستجوی مهمان..."
              value={searchGuest}
              onChange={(e) => setSearchGuest(e.target.value)}
              aria-label="جستجوی مهمان"
              className="text-[11px] bg-white/10 border border-white/15 rounded-full pr-8 pl-3 py-1 text-white placeholder-slate-400 outline-none w-[140px] sm:w-[170px] focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/40 transition-all"
            />
          </div>
        </div>

        {/* Content type chips — always visible now that the film-filter panel is gone */}
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none items-center" role="group" aria-label="نوع رسانه">
          {([
            { id: "all", label: "همه رسانه‌ها", Icon: null, accent: "rose" },
            { id: "photos", label: "عکس‌ها", Icon: Image, accent: "rose" },
            { id: "videos", label: "ویدیوها", Icon: Video, accent: "rose" },
            { id: "most-liked", label: "محبوب‌ترین‌ها", Icon: Heart, accent: "amber" },
          ] as const).map(({ id, label, Icon, accent }) => {
            const active = contentFilter === id;
            const activeCls = accent === "amber"
              ? "bg-amber-500/30 border-amber-500/50 text-amber-200 font-bold"
              : "bg-rose-500/30 border-rose-500/50 text-rose-200 font-bold";
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setContentFilter(id as FilterType)}
                className={`text-[10px] px-3 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border shrink-0 flex items-center gap-1 ${
                  active ? activeCls : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                }`}
              >
                {Icon && <Icon className={`w-3 h-3 ${id === "most-liked" ? "text-rose-400 fill-rose-400" : ""}`} />}
                {label}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {currentGroupTab === "faces" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-3 border-t border-white/10 space-y-2.5 overflow-hidden bg-black/30"
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-300">
                  فیلتر بر اساس مهمانان شناسایی‌شده
                </span>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none py-1">
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  className={`flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-xl border transition-all cursor-pointer ${
                    selectedPersonId === null
                      ? "bg-teal-500/25 border-teal-400 text-white font-bold"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                    <Users className="w-5 h-5 text-teal-300" />
                  </div>
                  <span className="text-[10px]">همه افراد</span>
                </button>

                {faceProfiles
                  .filter(p => p.avatarUrl && (p.photoCount === undefined || p.photoCount > 0))
                  .map((p) => {
                    const isSelected = selectedPersonId === p.personId;
                    return (
                      <motion.button
                        key={p.personId}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setSelectedPersonId(isSelected ? null : p.personId)}
                        className={`flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? "bg-teal-500/30 border-teal-400 shadow-md ring-2 ring-teal-400/40"
                            : "bg-white/5 border-white/10 hover:border-white/25"
                        }`}
                      >
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 bg-slate-900 shadow-md flex items-center justify-center">
                          {p.avatarUrl ? (
                            <img 
                              src={p.avatarUrl} 
                              alt={p.displayName} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <User className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-200 truncate max-w-[65px]">
                          {p.displayName}
                        </span>
                      </motion.button>
                    );
                  })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── MAIN MEDIA DISPLAY ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-16 z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-36 gap-3">
            <Loader className="w-10 h-10 text-amber-400 animate-spin stroke-1" />
            <p className="text-xs text-slate-400 font-bold">در حال بارگذاری خاطرات آلبوم...</p>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 gap-2">
            <Image className="w-14 h-14 opacity-25 stroke-1" />
            <p className="text-base font-bold text-slate-300">موردی برای نمایش یافت نشد</p>
            <p className="text-xs text-slate-500">فیلترهای جستجو را تغییر دهید یا فایل جدید آپلود کنید.</p>
          </div>
        ) : viewMode === "scatter" ? (
          /* 📌 SCATTER POLAROID WALL MODE */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-16 pt-6 px-2">
            {displayedItems.map((m, idx) => {
              const isSelected = selectedIds.has(m.id);
              const likesCount = likesMap[m.id] ?? m.likes ?? 0;

              const rotClass = selectMode ? "" : `polaroid-rot-${(idx % 12) + 1}`;
              const colOffsets = ["mt-0", "mt-8", "mt-4", "mt-12"];
              const colOffset = selectMode ? "" : colOffsets[idx % 4];

              // Varied accents: Yellow, Grid, Pink, Sage Green, Gold Foil, Paperclip, Pushpin, Wax Seal
              const showGoldTape = idx % 7 === 1;
              const showPaperclip = idx % 6 === 2;
              const showWaxSeal = idx % 8 === 4;
              const showTape = !showGoldTape && !showPaperclip && !showWaxSeal && idx % 3 !== 2;
              const tapeClasses = ["polaroid-tape-yellow", "polaroid-tape-grid", "polaroid-tape-pink", "polaroid-tape-green"];
              const tapeVariant = tapeClasses[idx % 4];
              const showPushpin = !showTape && !showGoldTape && !showPaperclip && !showWaxSeal;
              const pushpinClass = idx % 2 === 0 ? "polaroid-pushpin-red" : "polaroid-pushpin-brass";

              const showPostmark = idx % 5 === 1;
              const showCornerMounts = idx % 6 === 3;

              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 30, scale: 0.88, rotate: idx % 2 === 0 ? -6 : 6 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{ duration: 0.45, delay: Math.min(idx * 0.03, 0.5), ease: [0.22, 1, 0.36, 1] }}
                  className={`polaroid-mini cursor-pointer group ${rotClass} ${colOffset} ${isSelected ? "ring-4 ring-emerald-400 ring-offset-4 ring-offset-[#2a1c22]" : ""}`}
                  onClick={() => {
                    if (selectMode) toggleSelect(m.id);
                    else setSelectedIdx(idx);
                  }}
                  whileHover={{ y: -14, scale: 1.07, rotate: 0, zIndex: 35, transition: { duration: 0.25 } }}
                >
                  {/* Accents */}
                  {showTape && !selectMode && <div className={tapeVariant} aria-hidden="true" />}
                  {showGoldTape && !selectMode && <div className="polaroid-tape-gold" aria-hidden="true" />}
                  {showPushpin && !selectMode && <div className={pushpinClass} aria-hidden="true" />}
                  {showPaperclip && !selectMode && <div className="scrapbook-paperclip" aria-hidden="true" />}
                  {showWaxSeal && !selectMode && <div className="polaroid-wax-seal" aria-hidden="true">★</div>}

                  {/* Photo area */}
                  <div className="relative overflow-hidden select-none" style={{ aspectRatio: "1/1" }}>
                    {showCornerMounts && (
                      <>
                        <div className="scrapbook-corner-mount scrapbook-corner-tl" />
                        <div className="scrapbook-corner-mount scrapbook-corner-tr" />
                        <div className="scrapbook-corner-mount scrapbook-corner-bl" />
                        <div className="scrapbook-corner-mount scrapbook-corner-br" />
                      </>
                    )}

                    {showPostmark && !selectMode && <div className="scrapbook-postmark" aria-hidden="true" />}

                    {m.type === "video" ? (
                      <div className="w-full h-full relative bg-slate-900">
                        <video src={m.url} className="w-full h-full object-cover" playsInline preload="metadata" />
                        <span className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-md text-[9px] py-0.5 px-2 rounded-full flex items-center gap-1 text-white font-mono border border-white/15 shadow-md z-10">
                          <Video className="w-2.5 h-2.5 text-rose-400" />
                          {m.duration ? `${m.duration}s` : "ویدیو"}
                        </span>
                      </div>
                    ) : (
                      <div className="w-full h-full relative bg-slate-800">
                        <img
                          src={m.thumbnailUrl || m.url}
                          alt={m.guestName}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            const t = e.currentTarget;
                            if (!t.src.includes('/api/thumbnail/')) t.src = `/api/thumbnail/${eventId}/${m.id}`;
                          }}
                        />
                        <div className="absolute inset-0 bg-radial-gradient pointer-events-none" style={{
                          background: "radial-gradient(ellipse at center, transparent 55%, rgba(30,15,5,0.25) 100%)"
                        }} />
                      </div>
                    )}

                    {/* Floating Heart Pop */}
                    <AnimatePresence>
                      {popHeartId === m.id && (
                        <motion.div
                          initial={{ opacity: 1, scale: 0.5, y: 0 }}
                          animate={{ opacity: 0, scale: 2.2, y: -40 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.8 }}
                          className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                        >
                          <Heart className="w-14 h-14 text-rose-500 fill-rose-500 drop-shadow-lg" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Select Overlay */}
                    {selectMode && (
                      <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${isSelected ? "bg-emerald-500 border-emerald-400 scale-110" : "bg-black/50 border-white/60"}`}>
                          <CheckSquare className={`w-4 h-4 ${isSelected ? "text-white" : "text-transparent"}`} />
                        </div>
                      </div>
                    )}

                    {/* Download hover button */}
                    {!selectMode && (
                      <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDownload(m.url, `${eventId}-${m.id}.${getExt(m)}`); }}
                          className="bg-black/70 hover:bg-rose-500 backdrop-blur-md p-1.5 rounded-full text-white transition-all cursor-pointer border border-white/20 shadow-md"
                          title="دانلود"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Caption & Like Bar */}
                  <div
                    className="relative flex items-center justify-between px-2 z-10"
                    style={{ height: "38px" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <span className="font-cursive text-[#2d1e14] text-lg font-bold line-clamp-1 leading-snug tracking-wide">
                      {m.guestName || "مهمان عزیز"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleToggleLike(m.id, e)}
                      className="flex items-center gap-1 text-[11px] font-mono font-extrabold text-rose-800 hover:text-rose-600 transition-colors cursor-pointer bg-white/40 hover:bg-white/70 px-2 py-0.5 rounded-full border border-amber-900/10"
                    >
                      <Heart className={`w-3 h-3 ${likesCount > 0 ? "fill-rose-600 text-rose-600" : "text-rose-700"}`} />
                      <span>{likesCount}</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* ✨ MODERN LUXURY GLASS GRID MODE */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-2">
            {displayedItems.map((m, idx) => {
              const isSelected = selectedIds.has(m.id);
              const likesCount = likesMap[m.id] ?? m.likes ?? 0;

              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.02, 0.4) }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  className={`group relative glass-card rounded-2xl overflow-hidden border border-white/15 cursor-pointer shadow-xl ${isSelected ? "ring-4 ring-emerald-400" : ""}`}
                  onClick={() => {
                    if (selectMode) toggleSelect(m.id);
                    else setSelectedIdx(idx);
                  }}
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-900">
                    {m.type === "video" ? (
                      <video src={m.url} className="w-full h-full object-cover" playsInline preload="metadata" />
                    ) : (
                      <img
                        src={m.thumbnailUrl || m.url}
                        alt={m.guestName}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const t = e.currentTarget;
                          if (!t.src.includes('/api/thumbnail/')) t.src = `/api/thumbnail/${eventId}/${m.id}`;
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                    {/* Guest name badge & Likes */}
                    <div className="absolute bottom-2.5 right-2.5 left-2.5 flex items-center justify-between z-10">
                      <span className="text-xs font-bold text-white truncate max-w-[70%]">
                        {m.guestName}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleToggleLike(m.id, e)}
                        className="flex items-center gap-1 text-[10px] bg-black/60 hover:bg-rose-500/80 backdrop-blur-md px-2 py-0.5 rounded-full text-white transition-all border border-white/10 font-bold"
                      >
                        <Heart className={`w-3 h-3 ${likesCount > 0 ? "fill-rose-400 text-rose-400" : "text-white"}`} />
                        <span>{likesCount}</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── LIGHTBOX MODAL ── */}
      <AnimatePresence>
        {selectedIdx !== null && displayedItems[selectedIdx] && (
          <motion.div
            ref={lightboxRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col"
            onClick={() => setSelectedIdx(null)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedIdx(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white">{displayedItems[selectedIdx]?.guestName}</span>
                  <span className="text-[11px] text-slate-400 font-sans mt-0.5">
                    {displayedItems[selectedIdx]?.timestamp
                      ? new Date(displayedItems[selectedIdx].timestamp).toLocaleString("fa-IR", {
                          dateStyle: "medium", timeStyle: "short",
                        })
                      : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleToggleLike(displayedItems[selectedIdx]?.id, e)}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  aria-label="پسندیدن"
                >
                  <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                  <span>{likesMap[displayedItems[selectedIdx]?.id] ?? displayedItems[selectedIdx]?.likes ?? 0}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(displayedItems[selectedIdx]?.url, `${eventId}-${displayedItems[selectedIdx]?.id}.${getExt(displayedItems[selectedIdx])}`)}
                  className="shimmer-gold px-4 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  دانلود
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center relative p-4" onClick={e => e.stopPropagation()}>
              {displayedItems.length > 1 && (
                <button type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all cursor-pointer border border-white/20 shadow-xl"
                >
                  <ArrowLeft className="w-6 h-6 rtl:-rotate-180" />
                </button>
              )}
              <motion.div 
                key={selectedIdx}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="w-full h-full flex items-center justify-center"
              >
                {displayedItems[selectedIdx]?.type === "video" ? (
                  <video
                    src={displayedItems[selectedIdx]?.url}
                    className="max-w-full max-h-[82vh] rounded-2xl object-contain shadow-2xl border border-white/10"
                    controls autoPlay playsInline
                  />
                ) : (
                  <img
                    src={displayedItems[selectedIdx]?.url}
                    alt=""
                    className="max-w-full max-h-[82vh] rounded-2xl object-contain shadow-2xl border border-white/10"
                    draggable={false}
                  />
                )}
              </motion.div>
              {displayedItems.length > 1 && (
                <button type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all cursor-pointer border border-white/20 shadow-xl"
                >
                  <ArrowLeft className="w-6 h-6 rtl:rotate-180" />
                </button>
              )}
            </div>

            <div className="text-center py-3 border-t border-white/10 font-sans bg-black/40">
              <span className="bg-white/10 border border-white/15 text-white/90 text-xs py-1.5 px-4 rounded-full font-mono font-bold">
                {selectedIdx + 1} از {displayedItems.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
