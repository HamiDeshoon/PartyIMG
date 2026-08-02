// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Download, Image, Loader, X, Video,
  CheckSquare, Square as SquareIcon, Filter,
  DownloadCloud, Search, User, Heart, Calendar,
  Sparkles, Users
} from "lucide-react";
import { FILM_FILTERS } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

interface LiveAlbumProps {
  eventId: string;
  onBackToHome: () => void;
}

type GroupTab = "all" | "filter" | "faces";
type FilterType = "all" | "photos" | "videos" | "most-liked";

export default function LiveAlbum({ eventId, onBackToHome }: LiveAlbumProps) {
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [currentGroupTab, setCurrentGroupTab] = useState<GroupTab>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const [filterTab, setFilterTab] = useState("all");
  const [searchGuest, setSearchGuest] = useState("");
  const [contentFilter, setContentFilter] = useState<FilterType>("all");

  const [faceProfiles, setFaceProfiles] = useState<any[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
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
      }
      const res = await fetch(`/api/events/${eventId}/media?limit=500&offset=0`);
      const data = await res.json();
      setMediaItems(data.media || []);
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

  // Poll for new uploads every 30 seconds, show toast notification when new items appear
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/media?limit=1&offset=0`);
        if (res.ok) {
          const data = await res.json();
          const newCount = data.media?.length || 0;
          const prev = prevMediaCount.current;
          if (prev > 0 && newCount > prev) {
            const diff = newCount - prev;
            toast.success(`${diff} عکس/ویدیوی جدید آپلود شد!`, {
              duration: 4000,
            });
            // Refresh the full list
            loadMedia();
          }
          prevMediaCount.current = newCount;
        }
      } catch {}
    };
    // Set initial count after first load
    const init = setTimeout(() => {
      prevMediaCount.current = mediaItems.length;
    }, 2000);
    const interval = setInterval(poll, 30000);
    return () => {
      clearInterval(interval);
      clearTimeout(init);
    };
  }, [eventId, loadMedia, mediaItems.length]);

  const photos = mediaItems.filter(m => m.type !== "video");
  const allFilters = [...new Set(mediaItems.map(m => m.filter))];
  const allGuests: string[] = [...new Set(mediaItems.map(m => m.guestName).filter(Boolean) as string[])];

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

  const getDisplayedItems = () => {
    let items = mediaItems;
    if (currentGroupTab === "filter") {
      items = filterTab === "all" ? mediaItems : mediaItems.filter(m => m.filter === filterTab);
    } else if (currentGroupTab === "faces") {
      if (selectedPersonId) {
        const p = faceProfiles.find(fp => fp.personId === selectedPersonId);
        if (p && p.photoNames && p.photoNames.length > 0) {
          items = items.filter(m => {
            if (!m.url) return false;
            const fileName = m.url.split('/').pop() || '';
            return p.photoNames.some((pName: string) => fileName.includes(pName) || pName.includes(fileName));
          });
        }
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
      items = [...items].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }
    return items;
  };

  const displayedItems = getDisplayedItems();

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
    <div dir="rtl" className="min-h-[100dvh] bg-[#2a1c22] text-white flex flex-col font-sans relative" id="live_album_viewport">
      
      {/* Ambient background orbs */}
      <div className="orb orb-rose" aria-hidden="true" />
      <div className="orb orb-amber" aria-hidden="true" />

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 glass-card border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={onBackToHome}
            className="p-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">آلبوم زنده</h1>
            <p className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">{eventName || eventId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-sans">
          {selectMode ? (
            <>
              <button type="button"
                onClick={selectAllVisible}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-300 transition-all cursor-pointer border border-white/10 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                انتخاب همه
              </button>
              {selectedIds.size > 0 && (
                <button type="button"
                  onClick={deselectAll}
                  className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-300 transition-all cursor-pointer border border-white/10"
                >
                  لغو انتخاب
                </button>
              )}
              <button type="button"
                onClick={handleDownloadSelected}
                disabled={selectedIds.size === 0}
                className="text-[11px] px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-500/30 text-white rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default flex items-center gap-1.5 font-bold shadow-lg"
              >
                <Download className="w-3.5 h-3.5" />
                دانلود ({selectedIds.size})
              </button>
              <button type="button"
                onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-slate-300 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button"
                onClick={() => setSelectMode(true)}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-300 transition-all cursor-pointer border border-white/10 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                انتخاب
              </button>
              <button type="button"
                onClick={handleDownloadAll}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-300 transition-all cursor-pointer border border-white/10 flex items-center gap-1.5"
                title="دانلود همه عکس‌ها"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                همه
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── FILTERS ── */}
      <div className="z-20 shrink-0 bg-[#2a1c22]/80 backdrop-blur-md">
        <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none border-b border-white/10">
          <button type="button"
            onClick={() => { setCurrentGroupTab("all"); setFilterTab("all"); }}
            className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
              currentGroupTab === "all"
                ? "bg-rose-500/20 border-rose-500/40 text-rose-300 font-bold"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            همه موارد ({mediaItems.length})
          </button>
          <button type="button"
            onClick={() => { setCurrentGroupTab("filter"); setFilterTab("all"); }}
            className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
              currentGroupTab === "filter"
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <Filter className="w-3 h-3" />
            دسته‌بندی
          </button>

          <button type="button"
            onClick={() => { setCurrentGroupTab("faces"); }}
            className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
              currentGroupTab === "faces"
                ? "bg-teal-500/20 border-teal-500/40 text-teal-300 font-bold shadow-sm"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3 h-3 text-teal-400" />
            افراد و چهره‌ها ({faceProfiles.length})
          </button>
        </div>

        <AnimatePresence>
          {currentGroupTab === "faces" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-3 border-b border-white/10 space-y-2.5 overflow-hidden bg-black/20"
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="text-[11px] font-bold text-slate-300">
                  پروفایل‌های شناسایی‌شده چهره
                </span>
              </div>

              <div className="flex gap-3 overflow-x-auto scrollbar-none py-1">
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  className={`flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-xl border transition-all cursor-pointer ${
                    selectedPersonId === null
                      ? "bg-teal-500/20 border-teal-400 text-white font-bold"
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
                            ? "bg-teal-500/25 border-teal-400 shadow-md ring-2 ring-teal-400/40"
                            : "bg-white/5 border-white/10 hover:border-white/25"
                        }`}
                      >
                        {/* ── face avatar — no photo count badge ── */}
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

          {currentGroupTab === "filter" && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 py-2 space-y-2 border-b border-white/10 overflow-hidden"
            >
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none items-center">
                <div className="relative flex items-center shrink-0">
                  <Search className="w-3 h-3 text-slate-400 absolute right-2" />
                  <input
                    type="text"
                    placeholder="جستجوی مهمان..."
                    value={searchGuest}
                    onChange={(e) => setSearchGuest(e.target.value)}
                    className="text-[10px] bg-white/5 border border-white/10 rounded-full px-6 py-1.5 text-white placeholder-slate-500 outline-none w-[130px] focus:border-rose-500/40 focus:ring-1 focus:ring-rose-500/30"
                  />
                </div>
                <div className="w-px h-4 bg-white/20 shrink-0 mx-1" />
                <button type="button" onClick={() => setContentFilter("all")} className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border shrink-0 ${contentFilter === "all" ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-white/5 border-white/10 text-slate-400"}`}>همه نوع</button>
                <button type="button" onClick={() => setContentFilter("photos")} className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1 shrink-0 ${contentFilter === "photos" ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-white/5 border-white/10 text-slate-400"}`}>
                  <Image className="w-2.5 h-2.5" /> عکس
                </button>
                <button type="button" onClick={() => setContentFilter("videos")} className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1 shrink-0 ${contentFilter === "videos" ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-white/5 border-white/10 text-slate-400"}`}>
                  <Video className="w-2.5 h-2.5" /> ویدیو
                </button>
                <button type="button" onClick={() => setContentFilter("most-liked")} className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1 shrink-0 ${contentFilter === "most-liked" ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-white/5 border-white/10 text-slate-400"}`}>
                  <Heart className="w-2.5 h-2.5" /> محبوب‌ها
                </button>
              </div>

              {allFilters.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pt-1">
                  <span className="text-[9px] text-slate-500 flex items-center mr-1 shrink-0">فیلتر:</span>
                  <button type="button" onClick={() => setFilterTab("all")} className={`text-[9px] px-2 py-0.5 rounded-full shrink-0 border ${filterTab === "all" ? "bg-white/20 border-white/30 text-white" : "bg-transparent border-white/10 text-slate-400"}`}>همه</button>
                  {allFilters.map(f => (
                    <button type="button" key={f} onClick={() => setFilterTab(f)} className={`text-[9px] px-2 py-0.5 rounded-full shrink-0 border flex items-center gap-1 ${filterTab === f ? "bg-white/20 border-white/30 text-white" : "bg-transparent border-white/10 text-slate-400"}`}>
                      {FILM_FILTERS.find(ff => ff.id === f)?.emoji} {FILM_FILTERS.find(ff => ff.id === f)?.name || f}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 z-10">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader className="w-8 h-8 text-rose-400 animate-spin stroke-1" />
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-500">
            <Image className="w-12 h-12 mb-3 opacity-30 stroke-1" />
            <p className="text-sm font-semibold">موردی یافت نشد</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {displayedItems.map((m, idx) => {
              const filterDef = FILM_FILTERS.find(f => f.id === m.filter);
              const isSelected = selectedIds.has(m.id);
              const hasTape = idx % 4 === 0 || idx % 5 === 2;
              // Alternate between warm yellow tape and cool blue tape for visual variety
              const tapeClass = hasTape ? (idx % 7 === 0 || idx % 9 === 3 ? "polaroid-tape-alt" : "polaroid-tape") : null;
              return (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.4) }}
                  className={`polaroid-mini cursor-pointer group ${isSelected ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#2a1c22]" : ""}`}
                  onClick={() => {
                    if (selectMode) toggleSelect(m.id);
                    else setSelectedIdx(idx);
                  }}
                  style={{ transform: !selectMode ? `rotate(${(idx % 3 === 0 ? -1.5 : idx % 2 === 0 ? 2 : -0.5)}deg)` : 'none', transition: 'transform 0.25s ease' }}
                >
                  {tapeClass && <div className={tapeClass} aria-hidden="true" />}
                  
                  <div className="relative aspect-[4/5] bg-slate-900 rounded-sm overflow-hidden select-none shadow-inner">
                    {m.type === "video" ? (
                      <div className="w-full h-full relative">
                        <video src={m.url} className="w-full h-full object-cover" playsInline preload="metadata" />
                        <span className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-md text-[9px] py-0.5 px-2 rounded-full flex items-center gap-1 text-white font-mono border border-white/10 shadow-md">
                          <Video className="w-2.5 h-2.5 text-rose-400" />
                          {m.duration ? `${m.duration}s` : ""}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={m.thumbnailUrl || m.url}
                        alt={m.guestName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => {
                          const t = e.currentTarget;
                          if (!t.src.includes('/api/thumbnail/')) t.src = `/api/thumbnail/${eventId}/${m.id}`;
                        }}
                      />
                    )}

                    {selectMode && (
                      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all shadow-lg ${isSelected ? "bg-emerald-500 border-emerald-400 scale-110" : "bg-black/50 border-white/60"}`}>
                          <CheckSquare className={`w-4 h-4 ${isSelected ? "text-white" : "text-transparent"}`} />
                        </div>
                      </div>
                    )}

                    {!selectMode && (
                      <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
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
                    
                    {filterDef && filterDef.id !== 'none' && (
                      <span className="absolute bottom-1.5 left-1.5 bg-black/70 backdrop-blur-md text-white/90 text-[8.5px] px-2 py-0.5 rounded-full font-sans tracking-wide border border-white/10 flex items-center gap-1 shadow-md">
                        <span>{filterDef.emoji}</span>
                        <span className="font-medium">{filterDef.name}</span>
                      </span>
                    )}
                  </div>
                  
                  <div className="h-11 flex items-center justify-between px-1.5" onClick={e => e.stopPropagation()}>
                    <span className="font-cursive text-slate-800 text-xl font-bold leading-none truncate pt-1 tracking-wide">{m.guestName}</span>
                    {m.likes > 0 && (
                      <span className="text-[10px] text-rose-600 font-mono font-extrabold flex items-center gap-1 bg-rose-100/80 border border-rose-200/60 px-2 py-0.5 rounded-full shadow-xs">
                        <Heart className="w-2.5 h-2.5 fill-rose-500 text-rose-500 animate-pulse" />
                        {m.likes}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── LIGHTBOX ── */}
      <AnimatePresence>
        {selectedIdx !== null && displayedItems[selectedIdx] && (
          <motion.div
            ref={lightboxRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0f0a0d]/95 backdrop-blur-2xl flex flex-col"
            onClick={() => setSelectedIdx(null)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedIdx(null)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">{displayedItems[selectedIdx]?.guestName}</span>
                  <span className="text-[10px] text-slate-400 font-sans mt-0.5">
                    {FILM_FILTERS.find(f => f.id === displayedItems[selectedIdx]?.filter)?.name}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(displayedItems[selectedIdx]?.url, `${eventId}-${displayedItems[selectedIdx]?.id}.${getExt(displayedItems[selectedIdx])}`)}
                className="btn-gradient px-4 py-1.5 rounded-xl text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              >
                <Download className="w-4 h-4" />
                دانلود
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center relative" onClick={e => e.stopPropagation()}>
              {displayedItems.length > 1 && (
                <button type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all cursor-pointer border border-white/20"
                >
                  <ArrowLeft className="w-5 h-5 rtl:-rotate-180" />
                </button>
              )}
              <motion.div 
                key={selectedIdx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full flex items-center justify-center p-4"
              >
                {displayedItems[selectedIdx]?.type === "video" ? (
                  <video
                    src={displayedItems[selectedIdx]?.url}
                    className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
                    controls autoPlay playsInline
                  />
                ) : (
                  <img
                    src={displayedItems[selectedIdx]?.url}
                    alt=""
                    className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
                    draggable={false}
                  />
                )}
              </motion.div>
              {displayedItems.length > 1 && (
                <button type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all cursor-pointer border border-white/20"
                >
                  <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                </button>
              )}
            </div>

            <div className="text-center py-4 border-t border-white/10 font-sans">
              <span className="bg-white/10 border border-white/10 text-white/90 text-xs py-1.5 px-4 rounded-full">
                {selectedIdx + 1} از {displayedItems.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
