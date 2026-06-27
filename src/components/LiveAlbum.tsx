import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Download, Image, Loader, X, Video,
  CheckSquare, Square as SquareIcon, Users, Filter,
  DownloadCloud, Search, User, Heart, Calendar
} from "lucide-react";
import { FILM_FILTERS } from "../types";

interface LiveAlbumProps {
  eventId: string;
  onBackToHome: () => void;
}

const MODELS_CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.8.2/model/";

type GroupTab = "all" | "faces" | "filter";
type FilterType = "all" | "photos" | "videos" | "most-liked";

interface FaceGroup {
  label: string;
  items: { media: any; descriptor?: Float32Array }[];
}

export default function LiveAlbum({ eventId, onBackToHome }: LiveAlbumProps) {
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [currentGroupTab, setCurrentGroupTab] = useState<GroupTab>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const [faceGroups, setFaceGroups] = useState<FaceGroup[]>([]);
  const [faceGrouping, setFaceGrouping] = useState(false);
  const [faceGroupActive, setFaceGroupActive] = useState(false);
  const [activeFaceGroup, setActiveFaceGroup] = useState(0);
  const faceApiRef = useRef<any>(null);
  const faceGroupsCacheRef = useRef<FaceGroup[] | null>(null);

  const [filterTab, setFilterTab] = useState("all");
  const [searchGuest, setSearchGuest] = useState("");
  const [contentFilter, setContentFilter] = useState<FilterType>("all");

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
    } catch (e) {
      console.error("Failed to load album", e);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const photos = mediaItems.filter(m => m.type !== "video");
  const allFilters = [...new Set(mediaItems.map(m => m.filter))];
  const allGuests = [...new Set(mediaItems.map(m => m.guestName).filter(Boolean))];

  const faceGroupingInProgress = faceGrouping;

  const runFaceGrouping = async () => {
    if (faceGroupsCacheRef.current) {
      setFaceGroups(faceGroupsCacheRef.current);
      setFaceGroupActive(true);
      setActiveFaceGroup(0);
      setCurrentGroupTab("faces");
      return;
    }
    setFaceGrouping(true);
    try {
      if (!faceApiRef.current) {
        const script = window.document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.8.2/dist/face-api.min.js";
        script.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load face-api library"));
          window.document.head.appendChild(script);
        });
        faceApiRef.current = (window as any).faceapi;
      }
      const faceapi = faceApiRef.current;
      if (!faceapi) throw new Error("Face API not loaded");

      await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_CDN);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_CDN);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_CDN);

      const results: { media: any; descriptor?: Float32Array; faceCount: number }[] = [];
      const batchSize = 8;
      for (let i = 0; i < photos.length; i += batchSize) {
        const batch = photos.slice(i, i + batchSize);
        const promises = batch.map(async (m) => {
          try {
            const img = window.document.createElement("img");
            img.crossOrigin = "anonymous";
            img.src = m.thumbnailUrl || m.url;
            await new Promise<void>((res, rej) => {
              img.onload = () => res();
              img.onerror = () => rej(new Error("Image load failed"));
            });
            const detections = await faceapi
              .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
              .withFaceLandmarks(true)
              .withFaceDescriptors();
            return {
              media: m,
              descriptor: detections.length > 0 ? detections[0].descriptor : undefined,
              faceCount: detections.length,
            };
          } catch {
            return { media: m, descriptor: undefined, faceCount: 0 };
          }
        });
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      const solo = results.filter(r => r.faceCount === 1);
      const pairs = results.filter(r => r.faceCount === 2);
      const groups = results.filter(r => r.faceCount >= 3);
      const noFace = results.filter(r => r.faceCount === 0);

      const faceClusters: { media: any; descriptor?: Float32Array }[][] = [];
      const used = new Set<number>();
      for (let i = 0; i < solo.length; i++) {
        if (used.has(i)) continue;
        const cluster: { media: any; descriptor?: Float32Array }[] = [solo[i]];
        used.add(i);
        if (solo[i].descriptor) {
          for (let j = i + 1; j < solo.length; j++) {
            if (used.has(j) || !solo[j].descriptor) continue;
            const dist = faceapi.euclideanDistance(solo[i].descriptor!, solo[j].descriptor!);
            if (dist < 0.6) {
              cluster.push(solo[j]);
              used.add(j);
            }
          }
        }
        faceClusters.push(cluster);
      }

      const built: FaceGroup[] = [
        ...(noFace.length > 0 ? [{ label: ` بدون چهره (${noFace.length})`, items: noFace.map(r => ({ media: r.media, descriptor: r.descriptor })) }] : []),
        ...(faceClusters.length > 0 ? faceClusters.map((c, i) => ({ label: ` چهره ${i + 1} (${c.length})`, items: c })) : []),
        ...(pairs.length > 0 ? [{ label: ` دو نفره (${pairs.length})`, items: pairs.map(r => ({ media: r.media, descriptor: r.descriptor })) }] : []),
        ...(groups.length > 0 ? [{ label: ` گروهی (${groups.length})`, items: groups.map(r => ({ media: r.media, descriptor: r.descriptor })) }] : []),
      ];
      faceGroupsCacheRef.current = built;
      setFaceGroups(built);
      setFaceGroupActive(true);
      setActiveFaceGroup(0);
      setCurrentGroupTab("faces");
    } catch (err) {
      console.error("Face grouping failed", err);
      setFaceGrouping(false);
    } finally {
      setFaceGrouping(false);
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
    let items = currentGroupTab === "faces"
      ? (faceGroups[activeFaceGroup]?.items || []).map(f => f.media)
      : currentGroupTab === "filter"
      ? (filterTab === "all" ? mediaItems : mediaItems.filter(m => m.filter === filterTab))
      : mediaItems;

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
    <div dir="rtl" className="min-h-[100dvh] bg-[#0f0f1a] text-white flex flex-col font-sans">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0f0f1a]/95 border-b border-white/5 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="p-2 bg-white/5 hover:bg-white/15 rounded-xl text-white transition-all cursor-pointer border border-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white"> </h1>
            <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{eventName || eventId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <button
                onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5"
              >
                
              </button>
              <button
                onClick={selectAllVisible}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={deselectAll}
                  className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5"
                >
                  
                </button>
              )}
              <button
                onClick={handleDownloadSelected}
                disabled={selectedIds.size === 0}
                className="text-[11px] px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                 ({selectedIds.size})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectMode(true)}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                
              </button>
              <button
                onClick={handleDownloadAll}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5"
                title=" "
              >
                <DownloadCloud className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none border-b border-white/5">
        <button
          onClick={() => { setCurrentGroupTab("all"); setFilterTab("all"); }}
          className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
            currentGroupTab === "all"
              ? "bg-rose-500/20 border-rose-500/40 text-rose-300 font-semibold"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
          }`}
        >
           ({mediaItems.length})
        </button>
        <button
          onClick={runFaceGrouping}
          disabled={faceGrouping}
          className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
            currentGroupTab === "faces"
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-semibold"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
          }`}
        >
          {faceGrouping ? (
            <Loader className="w-3 h-3 animate-spin" />
          ) : (
            <Users className="w-3 h-3" />
          )}
          {faceGrouping ? "  ..." : " "}
        </button>
        <button
          onClick={() => { setCurrentGroupTab("filter"); setFilterTab("all"); }}
          className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border flex items-center gap-1.5 ${
            currentGroupTab === "filter"
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
          }`}
        >
          <Filter className="w-3 h-3" />
          
        </button>
      </div>

      {currentGroupTab === "faces" && faceGroupActive && (
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          {faceGroups.map((g, i) => (
            <button
              key={i}
              onClick={() => setActiveFaceGroup(i)}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                activeFaceGroup === i
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {currentGroupTab === "filter" && (
        <div className="px-4 pb-2 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setFilterTab("all")}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                filterTab === "all"
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                  : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
              }`}
            >
              
            </button>
            {allFilters.map(f => (
              <button
                key={f}
                onClick={() => setFilterTab(f)}
                className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                  filterTab === f
                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
                }`}
              >
                {FILM_FILTERS.find(ff => ff.id === f)?.name || f}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none items-center">
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-slate-500 absolute right-2" />
              <input
                type="text"
                placeholder="  ..."
                value={searchGuest}
                onChange={(e) => setSearchGuest(e.target.value)}
                className="text-[10px] bg-white/5 border border-white/10 rounded-full px-6 py-1.5 text-white placeholder-slate-600 outline-none w-[130px] focus:border-amber-500/30"
              />
            </div>
            <button
              onClick={() => setContentFilter("all")}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                contentFilter === "all" ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
              }`}
            >
              
            </button>
            <button
              onClick={() => setContentFilter("photos")}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                contentFilter === "photos" ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
              }`}
            >
              <Image className="w-3 h-3 inline ml-0.5" />
              
            </button>
            <button
              onClick={() => setContentFilter("videos")}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                contentFilter === "videos" ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
              }`}
            >
              <Video className="w-3 h-3 inline ml-0.5" />
              
            </button>
            <button
              onClick={() => setContentFilter("most-liked")}
              className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                contentFilter === "most-liked" ? "bg-rose-500/15 border-rose-500/30 text-rose-300" : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
              }`}
            >
              <Heart className="w-3 h-3 inline ml-0.5" />
              
            </button>
          </div>

          {searchGuest && (
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {allGuests.filter(g => g.toLowerCase().includes(searchGuest.toLowerCase())).slice(0, 10).map(g => (
                <button
                  key={g}
                  onClick={() => setSearchGuest(g)}
                  className="text-[9px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
                >
                  <User className="w-2.5 h-2.5 inline ml-0.5" />
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader className="w-8 h-8 text-rose-400 animate-spin" />
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-600">
            <Image className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">     </p>
          </div>
        ) : faceGroupingInProgress ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <Loader className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
            <p className="text-sm">   ...</p>
            <p className="text-[10px] text-slate-600 mt-1"> {photos.length} </p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2.5 space-y-2.5">
            {displayedItems.map((m) => {
              const filterName = FILM_FILTERS.find(f => f.id === m.filter)?.name || m.filter;
              const isSelected = selectedIds.has(m.id);
              return (
                <div
                  key={m.id}
                  className={`break-inside-avoid rounded-xl overflow-hidden bg-white/[0.03] border transition-all group cursor-pointer relative ${
                    isSelected
                      ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
                      : "border-white/5 hover:border-white/20"
                  }`}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelect(m.id);
                    } else {
                      const idx = displayedItems.indexOf(m);
                      if (idx !== -1) setSelectedIdx(idx);
                    }
                  }}
                >
                  <div className="relative">
                    {m.type === "video" ? (
                      <video src={m.url} className="w-full object-cover" playsInline preload="metadata" />
                    ) : (
                      <img
                        src={m.thumbnailUrl || m.url}
                        alt={m.guestName}
                        className="w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {selectMode && (
                      <div className="absolute top-2 right-2 z-10">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-emerald-400 drop-shadow-lg" />
                        ) : (
                          <SquareIcon className="w-5 h-5 text-white/40 drop-shadow-lg" />
                        )}
                      </div>
                    )}
                    {!selectMode && (
                      <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDownload(m.url, `${eventId}-${m.id}.${getExt(m)}`);
                          }}
                          className="bg-black/60 hover:bg-black/80 backdrop-blur-sm p-1.5 rounded-lg text-white transition-all cursor-pointer border border-white/10"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 text-[8px] bg-black/60 backdrop-blur-sm text-white/60 px-1 py-0.5 rounded-full z-10">
                      {filterName}
                    </span>
                  </div>
                  <div className="p-2 flex items-center justify-between gap-1.5">
                    <p className="text-[10px] text-slate-400 truncate">{m.guestName}</p>
                    {m.likes > 0 && (
                      <span className="text-[8px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                        <Heart className="w-2 h-2 fill-rose-400" />
                        {m.likes}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedIdx !== null && displayedItems[selectedIdx] && (
        <div
          ref={lightboxRef}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={() => setSelectedIdx(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedIdx(null)}
                className="p-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm text-white font-medium">{displayedItems[selectedIdx]?.guestName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload(displayedItems[selectedIdx]?.url, `${eventId}-${displayedItems[selectedIdx]?.id}.${getExt(displayedItems[selectedIdx])}`)}
                className="p-2 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs"
              >
                <Download className="w-4 h-4" />
                
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative" onClick={e => e.stopPropagation()}>
            {displayedItems.length > 1 && (
              <button
                onClick={() => navigateLightbox(-1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all cursor-pointer border border-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <div className="w-full h-full flex items-center justify-center p-4 max-w-[90vw] max-h-[85vh]">
              {displayedItems[selectedIdx]?.type === "video" ? (
                <video
                  src={displayedItems[selectedIdx]?.url}
                  className="max-w-full max-h-full rounded-xl object-contain"
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={displayedItems[selectedIdx]?.url}
                  alt=""
                  className="max-w-full max-h-full rounded-xl object-contain"
                  draggable={false}
                  style={{ cursor: "default" }}
                />
              )}
            </div>
            {displayedItems.length > 1 && (
              <button
                onClick={() => navigateLightbox(1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all cursor-pointer border border-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-[11px] text-slate-500" onClick={e => e.stopPropagation()}>
            <span>
              {FILM_FILTERS.find(f => f.id === displayedItems[selectedIdx]?.filter)?.name || displayedItems[selectedIdx]?.filter}
            </span>
            <span className="text-white/70 text-xs">
              {selectedIdx + 1}  {displayedItems.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}