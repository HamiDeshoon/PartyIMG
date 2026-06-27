import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Download, Image, Loader, X, Video,
  CheckSquare, Square as SquareIcon, Users, Filter,
  DownloadCloud, Search
} from "lucide-react";
import { FILM_FILTERS } from "../types";

interface LiveAlbumProps {
  eventId: string;
  onBackToHome: () => void;
}

const MODELS_CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.8.2/model/";

type GroupTab = "all" | "faces" | "filter";

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

  // Face grouping state
  const [faceGroups, setFaceGroups] = useState<FaceGroup[]>([]);
  const [faceGrouping, setFaceGrouping] = useState(false);
  const [faceGroupActive, setFaceGroupActive] = useState(false);
  const [activeFaceGroup, setActiveFaceGroup] = useState(0);
  const faceApiRef = useRef<any>(null);

  // Filter tab state
  const [filterTab, setFilterTab] = useState("all");

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

  // Derived data for display groups
  const photos = mediaItems.filter(m => m.type !== "video");
  const allFilters = [...new Set(mediaItems.map(m => m.filter))];

  const filteredItems = currentGroupTab === "faces"
    ? (faceGroups[activeFaceGroup]?.items || []).map(f => f.media)
    : currentGroupTab === "filter"
    ? (filterTab === "all" ? mediaItems : mediaItems.filter(m => m.filter === filterTab))
    : mediaItems;

  // Face grouping
  const runFaceGrouping = async () => {
    setFaceGrouping(true);
    try {
      if (!faceApiRef.current) {
        const script = window.document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.8.2/dist/face-api.min.js";
        script.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = reject;
          window.document.head.appendChild(script);
        });
        // @ts-ignore
        faceApiRef.current = window.faceapi;
      }
      const faceapi = faceApiRef.current;

      await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_CDN);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_CDN);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_CDN);

      const results: { media: any; descriptor?: Float32Array; faceCount: number }[] = [];
      const batchSize = 5;
      for (let i = 0; i < photos.length; i += batchSize) {
        const batch = photos.slice(i, i + batchSize);
        const promises = batch.map(async (m) => {
          try {
            const img = window.document.createElement("img");
            img.crossOrigin = "anonymous";
            img.src = m.thumbnailUrl || m.url;
            await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; });
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

      // Try to further split solo faces using descriptor similarity
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
        ...(noFace.length > 0 ? [{ label: `بدون چهره (${noFace.length})`, items: noFace.map(r => ({ media: r.media, descriptor: r.descriptor })) }] : []),
        ...(faceClusters.length > 0 ? faceClusters.map((c, i) => ({ label: `چهره ${i + 1} (${c.length})`, items: c })) : []),
        ...(pairs.length > 0 ? [{ label: `دو نفره (${pairs.length})`, items: pairs.map(r => ({ media: r.media, descriptor: r.descriptor })) }] : []),
        ...(groups.length > 0 ? [{ label: `گروهی (${groups.length})`, items: groups.map(r => ({ media: r.media, descriptor: r.descriptor })) }] : []),
      ];
      setFaceGroups(built);
      setFaceGroupActive(true);
      setActiveFaceGroup(0);
      setCurrentGroupTab("faces");
    } catch (err) {
      console.error("Face grouping failed", err);
    } finally {
      setFaceGrouping(false);
    }
  };

  // Batch download
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
        await handleDownload(m.url, `${eventId}-${m.id}.jpg`);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleDownloadAll = async () => {
    for (const m of mediaItems) {
      await handleDownload(m.url, `${eventId}-${m.id}.jpg`);
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

  const currentItems = currentGroupTab === "faces"
    ? (faceGroups[activeFaceGroup]?.items || []).map(f => f.media)
    : currentGroupTab === "filter"
    ? (filterTab === "all" ? mediaItems : mediaItems.filter(m => m.filter === filterTab))
    : mediaItems;

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
            <h1 className="text-sm font-semibold text-white">آلبوم زنده</h1>
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
                لغو
              </button>
              <button
                onClick={handleDownloadSelected}
                disabled={selectedIds.size === 0}
                className="text-[11px] px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                دانلود ({selectedIds.size})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectMode(true)}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                انتخاب
              </button>
              <button
                onClick={handleDownloadAll}
                className="text-[11px] px-3 py-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-slate-400 transition-all cursor-pointer border border-white/5"
                title="دانلود همه"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-none border-b border-white/5">
        <button
          onClick={() => { setCurrentGroupTab("all"); setFilterTab("all"); }}
          className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
            currentGroupTab === "all"
              ? "bg-rose-500/20 border-rose-500/40 text-rose-300 font-semibold"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
          }`}
        >
          همه ({mediaItems.length})
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
          {faceGrouping ? "در حال تشخیص..." : "چهره‌ها"}
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
          فیلتر
        </button>
      </div>

      {/* Sub-tabs for faces / filter */}
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
        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setFilterTab("all")}
            className={`text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
              filterTab === "all"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-white/5 border-white/5 text-slate-500 hover:text-white"
            }`}
          >
            همه
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
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader className="w-8 h-8 text-rose-400 animate-spin" />
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-600">
            <Image className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">هیچ عکسی یافت نشد</p>
          </div>
        ) : faceGrouping ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <Loader className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
            <p className="text-sm">در حال تشخیص چهره‌ها...</p>
            <p className="text-[10px] text-slate-600 mt-1">پردازش {photos.length} عکس</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2.5 space-y-2.5">
            {currentItems.map((m, idx) => {
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
                      const globalIdx = mediaItems.indexOf(m);
                      if (globalIdx !== -1) setSelectedIdx(globalIdx);
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
                            handleDownload(m.url, `${eventId}-${m.id}.jpg`);
                          }}
                          className="bg-black/60 hover:bg-black/80 backdrop-blur-sm p-1.5 rounded-lg text-white transition-all cursor-pointer border border-white/10"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-2 flex items-center justify-between gap-1.5">
                    <p className="text-[10px] text-slate-400 truncate">{m.guestName}</p>
                    <span className="text-[8px] bg-white/5 text-slate-500 px-1.5 py-0.5 rounded-full shrink-0">
                      {filterName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setSelectedIdx(null)}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedIdx(null)}
                className="p-1.5 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm text-white font-medium">{mediaItems[selectedIdx]?.guestName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload(mediaItems[selectedIdx]?.url, `${eventId}-${mediaItems[selectedIdx]?.id}.jpg`)}
                className="p-2 bg-white/5 hover:bg-white/15 rounded-lg text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs"
              >
                <Download className="w-4 h-4" />
                دانلود
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {mediaItems[selectedIdx]?.type === "video" ? (
              <video src={mediaItems[selectedIdx]?.url} className="max-w-full max-h-full rounded-xl object-contain" controls autoPlay playsInline />
            ) : (
              <img src={mediaItems[selectedIdx]?.url} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 text-[11px] text-slate-500" onClick={e => e.stopPropagation()}>
            <span>
              {FILM_FILTERS.find(f => f.id === mediaItems[selectedIdx]?.filter)?.name || mediaItems[selectedIdx]?.filter}
            </span>
            <span>
              {selectedIdx + 1} از {mediaItems.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
