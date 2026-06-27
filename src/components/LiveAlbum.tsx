import { useState, useEffect } from "react";
import { ArrowLeft, Download, Heart, Image, Loader, Filter, X, Video } from "lucide-react";
import { FILM_FILTERS } from "../types";

interface LiveAlbumProps {
  eventId: string;
  onBackToHome: () => void;
}

export default function LiveAlbum({ eventId, onBackToHome }: LiveAlbumProps) {
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [filterBy, setFilterBy] = useState<string>("all");

  const loadMedia = async () => {
    try {
      setLoading(true);
      const evRes = await fetch(`/api/events/${eventId}`);
      if (evRes.ok) {
        const ev = await evRes.json();
        setEventName(ev.name || eventId);
      }
      const res = await fetch(`/api/events/${eventId}/media?limit=200&offset=0`);
      const data = await res.json();
      setMediaItems(data.media || []);
    } catch (e) {
      console.error("Failed to load album", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, [eventId]);

  const filteredItems = filterBy === "all"
    ? mediaItems
    : mediaItems.filter(m => m.filter === filterBy);

  const filters = ["all", ...new Set(mediaItems.map(m => m.filter))];

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

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-[#1a1a2e] text-white flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#1a1a2e]/90 border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToHome}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white">آلبوم زنده</h1>
            <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{eventName || eventId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
            {filteredItems.length} عکس
          </span>
        </div>
      </header>

      {/* Filter bar */}
      {filters.length > 1 && (
        <div className="px-4 py-2.5 overflow-x-auto scrollbar-none border-b border-white/5">
          <div className="flex gap-1.5">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setFilterBy(f)}
                className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-all cursor-pointer border ${
                  filterBy === f
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-300 font-semibold"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {f === "all" ? "همه" : FILM_FILTERS.find(ff => ff.id === f)?.name || f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader className="w-8 h-8 text-rose-400 animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-500">
            <Image className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">هیچ عکسی یافت نشد</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 md:columns-4 gap-3 space-y-3">
            {filteredItems.map((m, idx) => {
              const filterName = FILM_FILTERS.find(f => f.id === m.filter)?.name || m.filter;
              return (
                <div
                  key={m.id}
                  className="break-inside-avoid rounded-2xl overflow-hidden bg-white/5 border border-white/10 group cursor-pointer transition-all hover:border-rose-500/30 hover:shadow-lg hover:shadow-rose-500/5"
                  onClick={() => setSelectedIdx(idx)}
                >
                  <div className="relative">
                    {m.type === "video" ? (
                      <video
                        src={m.url}
                        className="w-full object-cover"
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={m.thumbnailUrl || m.url}
                        alt={m.guestName}
                        className="w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                    <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(m.url, `${eventId}-${m.id}.jpg`);
                        }}
                        className="bg-black/70 hover:bg-black/90 backdrop-blur-sm p-1.5 rounded-lg text-white transition-all cursor-pointer border border-white/20"
                        title="دانلود"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-200 truncate">{m.guestName}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {new Date(m.timestamp).toLocaleDateString("fa-IR")}
                      </p>
                    </div>
                    <span className="text-[9px] bg-white/10 text-slate-300 px-2 py-0.5 rounded-full shrink-0 border border-white/5">
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
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={() => setSelectedIdx(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedIdx(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm text-white font-medium">
                {filteredItems[selectedIdx]?.guestName}
              </span>
            </div>
            <button
              onClick={() => handleDownload(filteredItems[selectedIdx]?.url, `${eventId}-${filteredItems[selectedIdx]?.id}.jpg`)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs"
            >
              <Download className="w-4 h-4" />
              دانلود
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            {filteredItems[selectedIdx]?.type === "video" ? (
              <video
                src={filteredItems[selectedIdx]?.url}
                className="max-w-full max-h-full rounded-xl object-contain"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={filteredItems[selectedIdx]?.url}
                alt=""
                className="max-w-full max-h-full rounded-xl object-contain"
              />
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 text-xs text-slate-400" onClick={e => e.stopPropagation()}>
            <span>
              فیلتر: {FILM_FILTERS.find(f => f.id === filteredItems[selectedIdx]?.filter)?.name || filteredItems[selectedIdx]?.filter}
            </span>
            <span>
              {selectedIdx + 1} از {filteredItems.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
