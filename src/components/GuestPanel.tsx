import React, { useState, useEffect, useRef } from "react";
import {
  Camera, Video, User, Sparkles, Heart, Image, X,
  Lock, Unlock, Check, AlertCircle, Loader, ArrowLeft, Trash2, WifiOff,
  ChevronLeft, ChevronRight, Download, LogOut, RefreshCw, UploadCloud, Cog, Film
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FILM_FILTERS, FilterPreset } from "../types";
import { toast } from "sonner";

interface GuestPanelProps {
  eventId: string;
  onBackToHome: () => void;
}

/** One row of the batch upload tracker shown while several files are in flight. */
type UploadJob = {
  id: string;
  name: string;
  type: "photo" | "video";
  sizeBytes: number;
  /** queued → sending bytes → server is processing → finished/failed. */
  status: "queued" | "uploading" | "processing" | "done" | "error" | "duplicate";
  percent: number;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaSkeletonCard() {
  return (
    <div className="backdrop-blur-md bg-white/5 rounded-2xl overflow-hidden border border-white/10 flex flex-col animate-pulse">
      <div className="relative aspect-square bg-black/60">
        <div className="absolute inset-0 bg-white/10" />
      </div>
      <div className="p-2.5 bg-black/45 border-t border-white/5">
        <div className="h-3 w-24 bg-white/10 rounded mb-1.5" />
        <div className="h-2 w-16 bg-white/10 rounded" />
      </div>
    </div>
  );
}

const POLAROID_ROTATIONS = [-1.5, 1.2, -0.8, 1.8, 0.4, -1.2, 0.8, -0.4, 1.5, -1.0, 0.3, -1.8];

export default function GuestPanel({ eventId, onBackToHome }: GuestPanelProps) {
  const [eventInfo, setEventInfo] = useState<any | null>(null);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [lockedFeed, setLockedFeed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [guestName, setGuestName] = useState(() => {
    try {
      return localStorage.getItem(`guest_name_${eventId}`) || "";
    } catch {
      return "";
    }
  });
  const [isRegistered, setIsRegistered] = useState(() => {
    try {
      return Boolean(localStorage.getItem(`guest_name_${eventId}`));
    } catch {
      return false;
    }
  });
  const [showInvitation, _setShowInvitation] = useState(false);

  const [selectedFilter, setSelectedFilter] = useState<FilterPreset>(FILM_FILTERS[0]);

  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);

  // Per-file tracker for multi-select uploads. Rendered as a full-screen sheet so
  // there is always visible motion on screen, even during a long video transfer.
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [batchActive, setBatchActive] = useState(false);

  // The guest's own uploads, fetched from /my-media so they survive a reload and
  // are not limited to whatever page of the shared feed happens to be loaded.
  const [myMedia, setMyMedia] = useState<any[]>([]);
  const [myMediaLoading, setMyMediaLoading] = useState(false);

  const [localFilePreview, setLocalFilePreview] = useState<string | null>(null);
  const [previewFileType, setPreviewFileType] = useState<"photo" | "video" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const [showOriginal, setShowOriginal] = useState(false);
  const [downloadingMyPhotos, setDownloadingMyPhotos] = useState(false);

  const [likedMedia, setLikedMedia] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`liked_${eventId}`);
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [snappedCount, setSnappedCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);

  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  const [mediaOffset, setMediaOffset] = useState(0);
  const [hasMoreMedia, setHasMoreMedia] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const MEDIA_LIMIT = 24;

  const loadEventAndMedia = async () => {
    try {
      setLoading(true);
      const evRes = await fetch(`/api/events/${eventId}`);
      if (!evRes.ok) {
        setEventInfo(null);
        setLoading(false);
        return;
      }
      const evData = await evRes.json();
      setEventInfo(evData);

      const mediaRes = await fetch(`/api/events/${eventId}/media?limit=${MEDIA_LIMIT}&offset=0`);
      const mediaData = await mediaRes.json();
      setLockedFeed(mediaData.locked || false);
      const fetchedMedia = mediaData.media || [];
      setMediaItems(fetchedMedia);

      setMediaOffset(fetchedMedia.length);
      setHasMoreMedia(fetchedMedia.length === MEDIA_LIMIT);

      const storedName = localStorage.getItem(`guest_name_${eventId}`);
      if (storedName) {
        const trimmedName = storedName.trim();
        setGuestName(trimmedName);
        setIsRegistered(true);
        calculateGuestLimits(trimmedName, fetchedMedia);
        // Load the guest's personal uploads immediately so they're visible
        // on first paint without waiting for the useEffect to fire.
        loadMyMedia(trimmedName);
      }
    } catch (e) {
      console.error("Failed to load guest room detail.", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMedia = async () => {
    if (isLoadingMore || !hasMoreMedia) return;
    try {
      setIsLoadingMore(true);
      const mediaRes = await fetch(`/api/events/${eventId}/media?limit=${MEDIA_LIMIT}&offset=${mediaOffset}`);
      const mediaData = await mediaRes.json();
      const newMedia = mediaData.media || [];

      if (newMedia.length > 0) {
        setMediaItems(prev => [...prev, ...newMedia]);
        setMediaOffset(prev => prev + newMedia.length);
      }
      if (newMedia.length < MEDIA_LIMIT) {
        setHasMoreMedia(false);
      }
    } catch (e) {
      console.error("Failed to load more media.", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    loadEventAndMedia();
    return () => {
      if (localFilePreview && previewFileType === "video") {
        URL.revokeObjectURL(localFilePreview);
      }
    };
  }, [eventId]);

  /** Loads (or refreshes) this guest's own uploads. */
  const loadMyMedia = async (name?: string) => {
    const who = (name ?? guestName).trim();
    if (!who) {
      setMyMedia([]);
      return;
    }
    try {
      setMyMediaLoading(true);
      const res = await fetch(`/api/events/${eventId}/my-media?guestName=${encodeURIComponent(who)}`);
      if (!res.ok) return;
      const data = await res.json();
      const mine = data.media || [];
      setMyMedia(mine);

      // The server is the source of truth for "how many did I send" — keep the
      // localStorage counters in step so the badges never drift after a reload.
      const photos = mine.filter((m: any) => m.type !== "video").length;
      const videos = mine.filter((m: any) => m.type === "video").length;
      setSnappedCount(photos);
      setVideoCount(videos);
      localStorage.setItem(`snapped_${eventId}`, String(photos));
      localStorage.setItem(`video_${eventId}`, String(videos));
    } catch (e) {
      console.error("Failed to load personal uploads.", e);
    } finally {
      setMyMediaLoading(false);
    }
  };

  useEffect(() => {
    if (isRegistered && guestName.trim()) loadMyMedia(guestName);
  }, [isRegistered, guestName, eventId]);

  const calculateGuestLimits = (name: string, allMedia: any[]) => {
    const pCount = parseInt(localStorage.getItem(`snapped_${eventId}`) || "0", 10);
    const vCount = parseInt(localStorage.getItem(`video_${eventId}`) || "0", 10);
    setSnappedCount(pCount);
    setVideoCount(vCount);
  };

  const handleRegisterName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = guestName.trim() || `مهمان ناشناس ${Math.floor(100 + Math.random() * 900)}`;
    setGuestName(finalName);
    localStorage.setItem(`guest_name_${eventId}`, finalName);

    setIsRegistered(true);
    calculateGuestLimits(finalName, mediaItems);
    // Immediately load their uploads so the "my uploads" section isn't empty
    // after registering (especially if they already uploaded before naming themselves).
    loadMyMedia(finalName);
  };

  const handleClearName = () => {
    localStorage.removeItem(`guest_name_${eventId}`);
    setIsRegistered(false);
    setGuestName("");
  };

  const applyFilterToImage = (imageSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      if (!selectedFilter.canvasFilter || selectedFilter.id === 'none') {
        resolve(imageSrc);
        return;
      }

      const img = window.document.createElement("img");
      img.src = imageSrc;
      img.onload = () => {
        const canvas = window.document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(imageSrc);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        if (selectedFilter.canvasFilter && selectedFilter.canvasFilter !== 'none') {
          ctx.filter = selectedFilter.canvasFilter;
        }

        ctx.drawImage(img, 0, 0, img.width, img.height);

        resolve(canvas.toDataURL("image/jpeg", 0.98));
      };
      img.onerror = () => resolve(imageSrc);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (files.length > 1) {
      // Reset the input immediately so picking the same files again still fires.
      e.target.value = '';
      await runBatchUpload(files);
      return;
    }

    // Single file: show preview
    const file = files[0];
    const isVideo = file.type.startsWith("video");
    e.target.value = '';

    if (isVideo) {
      setPreviewFileType("video");
      const url = URL.createObjectURL(file);
      setLocalFilePreview(url);
      setPendingFile(file);
    } else {
      setPreviewFileType("photo");
      try {
        const resultBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setLocalFilePreview(resultBase64);
        setPendingFile(file);
      } catch (err) {
        console.error("Error loading preview", err);
      }
    }
  };

  const handleUploadPendingFile = async () => {
    if (!pendingFile || !localFilePreview) return;

    setUploadProgress(true);
    setUploadPercent(0);
    setUploadStatusMsg("در حال آماده‌سازی فایل...");

    // Real byte progress from XHR, plus a distinct "server is working" message so
    // a video never sits at 100% with no explanation.
    const hooks = {
      onProgress: (p: number) => {
        setUploadPercent(p);
        setUploadStatusMsg(previewFileType === "video" ? "در حال ارسال ویدیو..." : "در حال ارسال عکس...");
      },
      onProcessing: () => {
        setUploadPercent(100);
        setUploadStatusMsg(previewFileType === "video" ? "ارسال شد، در حال پردازش روی سرور..." : "در حال ذخیره‌سازی...");
      },
    };

    try {
      let result: "ok" | "duplicate" | "error";
      if (previewFileType === "video") {
        result = await handleStreamingUpload(pendingFile, "video", 0, hooks);
      } else if (!selectedFilter.canvasFilter || selectedFilter.id === 'none') {
        result = await handleStreamingUpload(pendingFile, "photo", 0, hooks);
      } else {
        setUploadStatusMsg("در حال اعمال فیلتر تصویر...");
        const filteredBase64 = await applyFilterToImage(localFilePreview);
        result = await handleStreamingUpload(filteredBase64, "photo", 0, hooks);
      }

      if (result === "error") throw new Error("upload failed");

      setUploadPercent(100);
      setUploadStatusMsg(result === "duplicate" ? "این فایل قبلاً ثبت شده بود." : "با موفقیت ثبت شد!");
      setTimeout(() => {
        setUploadProgress(false);
        setUploadStatusMsg("");
        setUploadPercent(0);
        if (localFilePreview && previewFileType === "video") {
           URL.revokeObjectURL(localFilePreview);
        }
        setLocalFilePreview(null);
        setPreviewFileType(null);
        setPendingFile(null);
      }, 1500);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatusMsg("خطا در بارگذاری فایل. لطفاً مجدداً تلاش کنید.");
      setUploadPercent(0);
      setTimeout(() => setUploadProgress(false), 2500);
    }
  };

  const handleCancelPendingFile = () => {
    if (localFilePreview && previewFileType === "video") {
      URL.revokeObjectURL(localFilePreview);
    }
    setLocalFilePreview(null);
    setPreviewFileType(null);
    setPendingFile(null);
  };

  function base64ToBlob(base64: string, mime: string): Blob {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
  }

  /**
   * POSTs one file with XHR rather than fetch — fetch gives no upload progress
   * events, which is exactly what makes a big video look like a frozen page.
   * `onProgress` receives 0-100 for the bytes actually pushed to the server, and
   * `onProcessing` fires once the last byte is out and the server takes over.
   */
  const uploadWithProgress = (
    formData: FormData,
    onProgress?: (percent: number) => void,
    onProcessing?: () => void
  ): Promise<{ status: number; body: any }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/events/${eventId}/upload/streaming`);

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        // Cap at 99% — the last percent belongs to the server-side response.
        const pct = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
        onProgress?.(pct);
      };
      xhr.upload.onload = () => onProcessing?.();

      xhr.onload = () => {
        let body: any = null;
        try { body = JSON.parse(xhr.responseText); } catch { body = null; }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.onabort = () => reject(new Error("aborted"));
      xhr.send(formData);
    });
  };

  const handleStreamingUpload = async (
    payload: string | Blob | File,
    type: "photo" | "video",
    durationSec: number = 0,
    hooks?: { onProgress?: (p: number) => void; onProcessing?: () => void }
  ): Promise<"ok" | "duplicate" | "error"> => {
    try {
      let activeName = guestName.trim();
      if (!activeName) {
        activeName = `مهمان ناشناس ${Math.floor(100 + Math.random() * 900)}`;
        setGuestName(activeName);
        localStorage.setItem(`guest_name_${eventId}`, activeName);
        setIsRegistered(true);
      }

      const formData = new FormData();
      formData.append("guestName", activeName);
      formData.append("filter", selectedFilter.id);
      formData.append("duration", durationSec.toString());

      let uploadFile: Blob | File;
      if (typeof payload === 'string') {
        const mime = type === 'video' ? 'video/mp4' : 'image/jpeg';
        uploadFile = base64ToBlob(payload, mime);
      } else {
        uploadFile = payload;
      }

      // Keep the real filename when we have one so the server can sniff the
      // container properly (a .mov renamed to .mp4 confuses ffmpeg's probe).
      const fallbackName = `media.${type === 'video' ? 'mp4' : 'jpg'}`;
      const fileName = (uploadFile instanceof File && uploadFile.name) ? uploadFile.name : fallbackName;
      formData.append("fileData", uploadFile, fileName);

      const { status, body } = await uploadWithProgress(formData, hooks?.onProgress, hooks?.onProcessing);

      if (status === 409) {
        toast.warning("این فایل قبلاً آپلود شده است");
        return "duplicate";
      }

      if (status < 200 || status >= 300) {
        toast.error(body?.error || "از سقف مجاز ثبت فایل عبور کرده‌اید.");
        return "error";
      }

      const uploadedItem = body;

      if (type === "photo") {
        setSnappedCount(p => {
          const np = p + 1;
          localStorage.setItem(`snapped_${eventId}`, np.toString());
          return np;
        });
      } else {
        setVideoCount(v => {
          const nv = v + 1;
          localStorage.setItem(`video_${eventId}`, nv.toString());
          return nv;
        });
      }

      if (uploadedItem) {
        if (!lockedFeed) setMediaItems(prev => [uploadedItem, ...prev]);
        setMyMedia(prev => [uploadedItem, ...prev.filter(m => m.id !== uploadedItem.id)]);
      }

      return "ok";
    } catch (err) {
      console.error(err);
      toast.error("ارسال ناموفق بود. اتصال شبکه را بررسی کنید.");
      return "error";
    }
  };

  /**
   * Uploads a multi-select batch one file at a time (the server pools its heavy
   * work, so hammering it in parallel just makes every file slower), while the
   * tracker sheet reports per-file bytes plus overall progress.
   * Photos go first: they finish in milliseconds, so the guest sees real results
   * immediately instead of waiting behind a large video.
   */
  const runBatchUpload = async (files: File[]) => {
    const jobs: UploadJob[] = files.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      name: file.name || (file.type.startsWith("video") ? "ویدیو" : "عکس"),
      type: file.type.startsWith("video") ? "video" : "photo",
      sizeBytes: file.size,
      status: "queued",
      percent: 0,
    }));

    const order = files
      .map((file, i) => ({ file, job: jobs[i] }))
      .sort((a, b) => (a.job.type === b.job.type ? 0 : a.job.type === "photo" ? -1 : 1));

    setUploadJobs(jobs);
    setBatchActive(true);
    setPendingFiles(files);
    setBatchProgress({ current: 0, total: files.length });

    const patch = (id: string, next: Partial<UploadJob>) =>
      setUploadJobs(prev => prev.map(j => (j.id === id ? { ...j, ...next } : j)));

    let finished = 0;
    for (const { file, job } of order) {
      patch(job.id, { status: "uploading", percent: 0 });
      try {
        const result = await handleStreamingUpload(
          file,
          job.type,
          0,
          {
            onProgress: (p) => patch(job.id, { status: "uploading", percent: p }),
            onProcessing: () => patch(job.id, { status: "processing", percent: 100 }),
          }
        );
        patch(job.id, {
          status: result === "ok" ? "done" : result === "duplicate" ? "duplicate" : "error",
          percent: 100,
        });
      } catch (err) {
        console.error("Batch upload item failed", err);
        patch(job.id, { status: "error", percent: 100 });
      }
      finished++;
      setBatchProgress({ current: finished, total: files.length });
    }

    // Reconcile with the server so counters and the personal grid are exact.
    void loadMyMedia();
    setPendingFiles([]);
  };

  const handleDeleteMedia = async (mediaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("آیا از حذف این فایل مطمئن هستید؟ (فقط مجاز به حذف فایل‌های خودتان هستید)")) return;

    // The item may live only in the personal list (the shared feed is paginated).
    const itemToDelete = myMedia.find(m => m.id === mediaId) || mediaItems.find(m => m.id === mediaId);
    if (!itemToDelete) return;

    setMediaItems(prev => prev.filter(m => m.id !== mediaId));
    setMyMedia(prev => prev.filter(m => m.id !== mediaId));
    if (itemToDelete.type === "photo") {
      setSnappedCount(p => Math.max(0, p - 1));
    } else {
      setVideoCount(v => Math.max(0, v - 1));
    }

    try {
      const res = await fetch(`/api/events/${eventId}/media/${mediaId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName })
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }

      if (itemToDelete.type === "photo") {
        setSnappedCount(p => { localStorage.setItem(`snapped_${eventId}`, p.toString()); return p; });
      } else {
        setVideoCount(v => { localStorage.setItem(`video_${eventId}`, v.toString()); return v; });
      }
      toast.success("فایل حذف شد");
    } catch (err: any) {
      console.error(err);
      toast.error("خطا در حذف فایل یا عدم دسترسی: " + err.message);

      const restoreSorted = (prev: any[]) => {
        if (prev.find(m => m.id === mediaId)) return prev;
        const restored = [...prev, itemToDelete];
        restored.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return restored;
      };
      setMediaItems(restoreSorted);
      setMyMedia(restoreSorted);
      if (itemToDelete.type === "photo") {
        setSnappedCount(p => p + 1);
      } else {
        setVideoCount(v => v + 1);
      }
    }
  };

  const handleLikeMedia = async (mediaId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (likedMedia.has(mediaId)) return;
    try {
      const res = await fetch(`/api/events/${eventId}/media/${mediaId}/like`, { method: "POST" });
      const updated = await res.json();
      setMediaItems(prev => prev.map(m => m.id === mediaId ? updated : m));

      setLikedMedia(prev => {
        const next = new Set(prev).add(mediaId);
        localStorage.setItem(`liked_${eventId}`, JSON.stringify(Array.from(next)));
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadMyPhotos = async () => {
    setDownloadingMyPhotos(true);
    try {
      const res = await fetch(`/api/events/${eventId}/download-my-photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestName })
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to download");
        return;
      }
      const blob = await res.blob();
      const a = window.document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${eventId}-${guestName}-photos.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
      toast.error("Download failed");
    } finally {
      setDownloadingMyPhotos(false);
    }
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

  const getExt = (m: any) => {
    if (!m.url) return "jpg";
    const parts = m.url.split(".");
    const ext = parts[parts.length - 1]?.split("?")[0] || "jpg";
    if (m.type === "video" && ext === "jpg") return "mp4";
    return ext;
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

  // ─── LOADING STATE ───────────────────────────────────────────────
  if (loading) {
    return (
      <div dir="rtl" className="min-h-[100dvh] bg-[#2a1c22] text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 polaroid animate-pulse-glow flex items-center justify-center">
            <Camera className="w-8 h-8 text-rose-400 stroke-1" />
          </div>
          <Loader className="w-5 h-5 text-rose-400 animate-spin" />
          <p className="text-sm text-slate-400">در حال اتصال به دوربین...</p>
        </div>
      </div>
    );
  }

  // ─── NOT FOUND ────────────────────────────────────────────────────
  if (!eventInfo) {
    return (
      <div dir="rtl" className="min-h-[100dvh] bg-[#2a1c22] text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-sm space-y-5 flex flex-col items-center">
          <AlertCircle className="w-14 h-14 text-rose-500 stroke-1" />
          <div>
            <h2 className="text-xl font-bold text-white mb-1">رویداد یافت نشد</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              رویداد <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-xs text-rose-400">#{eventId}</code> غیرفعال یا حذف شده است.
            </p>
          </div>
          <button type="button" onClick={onBackToHome}
            className="btn-gradient py-2.5 px-8 rounded-xl text-sm cursor-pointer">
            بازگشت
          </button>
        </div>
      </div>
    );
  }

  // ─── BATCH TRACKER FRAGMENTS ─────────────────────────────────────
  const batchDone = uploadJobs.filter(j => j.status === "done" || j.status === "duplicate").length;
  const batchFailed = uploadJobs.filter(j => j.status === "error").length;
  const batchSettled = batchDone + batchFailed;
  const batchTotal = uploadJobs.length;
  const batchAllSettled = batchTotal > 0 && batchSettled === batchTotal;
  // Overall progress counts each file's own byte progress, so the bar keeps
  // creeping forward even while one large video is mid-transfer.
  const batchOverall = batchTotal === 0
    ? 0
    : Math.round(uploadJobs.reduce((sum, j) => sum + (j.status === "queued" ? 0 : j.percent), 0) / batchTotal);
  const batchHasVideo = uploadJobs.some(j => j.type === "video");

  const batchTrackerHeader = (
    <div className="px-5 pt-5 pb-4 border-b border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
          {batchAllSettled
            ? <Check className="w-5 h-5 text-emerald-400" strokeWidth={3} />
            : <UploadCloud className="w-5 h-5 text-rose-300 animate-pulse" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white leading-tight">
            {batchAllSettled ? "بارگذاری تمام شد 🎉" : `در حال بارگذاری ${batchTotal} فایل...`}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {batchAllSettled
              ? `${batchDone} فایل ثبت شد${batchFailed > 0 ? ` • ${batchFailed} فایل ناموفق` : ""}`
              : `${batchSettled} از ${batchTotal} کامل شد — صفحه را نبندید`}
          </p>
        </div>
        <span className="text-sm font-mono font-bold text-rose-300 shrink-0" dir="ltr">{batchOverall}%</span>
      </div>

      <div className="mt-3.5 h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="progress-bar h-full rounded-full"
          animate={{ width: `${batchOverall}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>

      {!batchAllSettled && batchHasVideo && (
        <p className="mt-2.5 text-[10px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 leading-relaxed">
          ⏳ ویدیوها حجم بیشتری دارند و کمی بیشتر طول می‌کشند — صفحه فریز نشده، در حال ارسال است.
        </p>
      )}
    </div>
  );

  const batchTrackerList = (
    <div className="max-h-[45vh] overflow-y-auto divide-y divide-white/5">
      {uploadJobs.map(job => (
        <div key={job.id} className="px-5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            {job.status === "done" ? <Check className="w-4 h-4 text-emerald-400" strokeWidth={3} />
              : job.status === "duplicate" ? <Check className="w-4 h-4 text-slate-400" />
              : job.status === "error" ? <X className="w-4 h-4 text-red-400" />
              : job.status === "processing" ? <Cog className="w-4 h-4 text-amber-300 animate-spin" />
              : job.type === "video" ? <Film className="w-4 h-4 text-rose-300" />
              : <Image className="w-4 h-4 text-rose-300" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-white truncate" title={job.name}>{job.name}</p>
              <span className="text-[10px] text-slate-500 font-mono shrink-0" dir="ltr">{formatBytes(job.sizeBytes)}</span>
            </div>
            <div className="mt-1.5 h-1.5 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  job.status === "error" ? "bg-red-500"
                    : job.status === "done" ? "bg-emerald-500"
                    : job.status === "duplicate" ? "bg-slate-500"
                    : job.status === "processing" ? "bg-amber-400"
                    : "progress-bar"
                }`}
                animate={{ width: `${job.percent}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
            <p className="text-[9.5px] text-slate-400 mt-1">
              {job.status === "queued" ? "در نوبت..."
                : job.status === "uploading" ? `در حال ارسال ${job.percent}%`
                : job.status === "processing" ? "در حال پردازش روی سرور..."
                : job.status === "done" ? "ثبت شد ✓"
                : job.status === "duplicate" ? "تکراری بود — رد شد"
                : "ناموفق — دوباره تلاش کنید"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  const batchTrackerFooter = (
    <div className="px-5 py-4 border-t border-white/10">
      {batchAllSettled ? (
        <button
          type="button"
          id="batch_tracker_close_btn"
          onClick={() => { setBatchActive(false); setUploadJobs([]); setBatchProgress({ current: 0, total: 0 }); }}
          className="w-full btn-gradient py-3 rounded-xl text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          بستن
        </button>
      ) : (
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <Loader className="w-3.5 h-3.5 animate-spin text-rose-400" />
          لطفاً تا پایان بارگذاری صبر کنید
        </div>
      )}
    </div>
  );

  // ─── MAIN RENDER ─────────────────────────────────────────────────
  return (
    <div dir="rtl" className={`min-h-[100dvh] bg-transparent text-white font-sans flex flex-col relative ${!isOnline ? 'pt-7' : ''}`} id="guest_viewport">

      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 bg-red-500 text-white text-[10px] font-bold py-1.5 px-4 z-[100] flex justify-center items-center gap-2 shadow-md" id="network_indicator">
          <WifiOff className="w-3.5 h-3.5" />
          <span>ارتباط اینترنت قطع شده است</span>
        </div>
      )}

      {/* ─── HEADER ─────────────────────────────────── */}
      <header className="sticky top-0 z-40 glass-card border-b border-white/10 px-4 py-3 flex items-center justify-between" id="guest_header">
        <div className="flex items-center gap-2.5">
          <button type="button" id="guest_back_btn" onClick={onBackToHome}
            aria-label="بازگشت"
            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all cursor-pointer border border-white/10">
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate text-white leading-tight">{eventInfo.name}</h1>
            <p className="text-[10px] text-slate-400 truncate">میزبان: {eventInfo.hostName}</p>
          </div>
        </div>
        {isRegistered && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/25 px-3 py-1 rounded-full font-sans flex items-center gap-1.5">
              <User className="w-3 h-3 text-rose-400" />
              {guestName}
            </span>
            <button
              type="button"
              id="guest_logout_btn"
              onClick={handleClearName}
              title="خروج و تغییر نام مهمان"
              aria-label="خروج حساب کاربری مهمان"
              className="flex items-center gap-1 text-xs text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 px-2.5 py-1 rounded-xl transition-all cursor-pointer font-medium active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        )}
      </header>

      {/* ─── REGISTRATION ───────────────────────────── */}
      {!isRegistered ? (
        <div className="flex-1 flex items-center justify-center p-5" id="guest_register_card">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="w-full max-w-sm glass-card rounded-3xl p-6 shadow-2xl space-y-5"
          >
            {/* Polaroid welcome photo */}
            <div className="flex justify-center">
              <div className="relative" style={{ transform: 'rotate(-2.5deg)' }}>
                <div className="polaroid-tape" />
                <div className="polaroid">
                  <div className="w-48 h-56 sm:w-56 sm:h-64 bg-slate-900 overflow-hidden flex items-center justify-center rounded-xs">
                    <img 
                      src="/guest-welcome.jpg" 
                      alt="خوش‌آمدگویی مهمانان" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = eventInfo.couplePhoto || "/couple.jpg";
                      }}
                    />
                  </div>
                  <div className="polaroid-caption">
                    <span className="font-cursive text-slate-800 text-2xl font-bold pt-1">
                      {eventInfo.name || "لحظات زیبا"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Title & Emojis */}
            <div className="text-center space-y-2 pt-1">
              <h2 className="text-base font-bold text-white leading-snug flex items-center justify-center gap-1">
                <span>✨📸</span>
                <span>اسم خودتونو برامون بنویسید تا بدونیم کدومتون عکسای قشنگ‌تری می‌گیرین!</span>
                <span>😉</span>
              </h2>
              <p className="text-[11px] text-rose-200/80 bg-rose-500/10 border border-rose-500/20 py-2 px-3 rounded-xl font-medium leading-relaxed">
                💡 البته که نوشتن اسمتون اختیاریه (می‌تونید ناشناس هم عکس بفرستین) ✨
              </p>
            </div>

            {/* Name form */}
            <form onSubmit={handleRegisterName} className="space-y-3" id="guest_name_form">
              <div className="relative">
                <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400" />
                <input
                  type="text"
                  id="guest_name_input"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="نام یا اسم مستعار شما (اختیاری)..."
                  className="w-full bg-black/50 border border-white/20 rounded-xl py-3 pr-10 pl-4 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-400 transition-all"
                  aria-label="نام مهمان"
                  autoComplete="name"
                />
              </div>

              <motion.button
                type="submit"
                id="guest_register_submit_btn"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full btn-gradient py-3.5 px-4 rounded-xl text-sm font-extrabold shadow-lg shadow-rose-600/30 cursor-pointer flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                ورود به دوربین و ثبت عکس
              </motion.button>
            </form>
          </motion.div>
        </div>
      ) : (

      /* ─── MAIN GUEST PANEL ──────────────────────── */
      <div className="flex-1 flex flex-col justify-between overflow-y-auto pb-10 z-10" id="guest_main_studio">

        {/* ── Viewfinder Card ── */}
        <div className="px-4 pt-4 pb-3" id="viewfinder_section">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#3d2530]" style={{ aspectRatio: '3/4' }}>

            {/* Preview / Placeholder */}
            {localFilePreview ? (
              <>
                {previewFileType === "video" ? (
                  <video src={localFilePreview} className="w-full h-full object-cover" playsInline muted />
                ) : (
                  <img
                    src={localFilePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    style={{ filter: selectedFilter.cssStyle !== 'none' ? selectedFilter.cssStyle : undefined }}
                  />
                )}

                {/* Overlay controls */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-0 inset-x-0 p-4 flex gap-3">
                  <motion.button
                    type="button"
                    onClick={handleCancelPendingFile}
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 py-3 rounded-xl bg-black/60 border border-white/20 text-white text-sm font-semibold backdrop-blur-sm cursor-pointer"
                  >
                    لغو
                  </motion.button>
                  <motion.button
                    type="button"
                    id="viewfinder_upload_btn"
                    onClick={handleUploadPendingFile}
                    whileTap={{ scale: 0.95 }}
                    className="flex-[2] py-3 rounded-xl btn-gradient text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    ثبت در آلبوم
                  </motion.button>
                </div>

                {/* Upload overlay */}
                {uploadProgress && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-20 select-none">
                    <Loader className="w-10 h-10 text-rose-400 animate-spin stroke-1" />
                    <p className="text-sm font-medium text-white">{uploadStatusMsg}</p>
                    {batchProgress.total > 0 && (
                      <p className="text-[11px] text-slate-400 font-mono">{batchProgress.current} / {batchProgress.total}</p>
                    )}
                    <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="progress-bar h-full rounded-full" style={{ width: `${uploadPercent}%` }} />
                    </div>
                    {uploadPercent > 0 && <span className="text-xs text-rose-300 font-mono font-bold">{uploadPercent}%</span>}
                  </div>
                )}
              </>
            ) : (
              /* Empty state placeholder */
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/8 to-amber-500/5 pointer-events-none" />
                <div className="text-5xl animate-float-y">📷</div>
                <div className="text-center">
                  <p className="text-base font-semibold text-white mb-1">بارگذاری فایل از گالری</p>
                  <p className="text-xs text-slate-400">عکس یا ویدیو انتخاب کنید</p>
                </div>
                <div className="flex flex-col gap-2.5 w-full max-w-[210px]">
                  <label
                    className="btn-gradient py-3 px-4 rounded-xl text-sm font-bold cursor-pointer flex items-center justify-center gap-2 text-center shadow-lg"
                    id="viewfinder_gallery_btn"
                  >
                    <Image className="w-4 h-4" />
                    انتخاب از گالری
                    <input type="file" accept="image/*,video/*" className="hidden" multiple onChange={handleFileChange} />
                  </label>
                  <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                    می‌توانید چند فایل را همزمان انتخاب کنید 📎
                  </p>
                </div>
                {/* Guest counter badge */}
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="bg-black/60 text-white text-[9px] px-2 py-1 rounded-full font-mono border border-white/10">
                    📷 {snappedCount}
                  </span>
                  <span className="bg-black/60 text-white text-[9px] px-2 py-1 rounded-full font-mono border border-white/10">
                    🎬 {videoCount}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Filter Strip ── */}
        <div className="px-4 py-3" id="filter_carousel">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
            <span>🎞</span> فیلترهای دوربین
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none" dir="ltr">
            {FILM_FILTERS.map((f, fIdx) => (
              <motion.button
                key={f.id}
                onClick={() => setSelectedFilter(f)}
                whileTap={{ scale: 0.88 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: fIdx * 0.07, duration: 0.3 }}
                className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer outline-none select-none"
                aria-label={`فیلتر ${f.name}`}
                aria-pressed={selectedFilter.id === f.id}
              >
                <motion.div
                  animate={{ rotate: selectedFilter.id === f.id ? 0 : (fIdx % 2 === 0 ? -2 : 1.5), scale: selectedFilter.id === f.id ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className={`filter-swatch ${selectedFilter.id === f.id ? 'active' : ''}`}
                >
                  <img
                    src="/filter-sample.jpg"
                    alt={f.name}
                    style={{ width: 62, height: 62, objectFit: 'cover', filter: f.cssStyle, borderRadius: '2px', display: 'block' }}
                  />
                  <div className="filter-swatch-label">{f.name}</div>
                  {selectedFilter.id === f.id && (
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center shadow"
                    >
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </motion.div>
                  )}
                </motion.div>
                <motion.span animate={{ opacity: selectedFilter.id === f.id ? 1 : 0.45 }} className="text-base leading-none">
                  {f.emoji}
                </motion.span>
              </motion.button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-sans">
            {selectedFilter.id === 'none' ? 'بدون فیلتر' : `فیلتر "${selectedFilter.name}" انتخاب شده`}
          </p>
        </div>

        {/* ── My Uploads ── */}
        <div className="px-4 pt-2 pb-6" id="my_uploads_section">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span>🗂</span>
              فایل‌های ارسالی من
              <span className="text-rose-300 font-mono normal-case">({myMedia.length})</span>
            </h3>
            <button
              type="button"
              id="my_uploads_refresh_btn"
              onClick={() => loadMyMedia()}
              aria-label="بروزرسانی فایل‌های من"
              className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${myMediaLoading ? 'animate-spin' : ''}`} />
              بروزرسانی
            </button>
          </div>

          {myMedia.length === 0 ? (
            <div className="glass-card rounded-2xl border border-white/10 p-6 text-center space-y-1.5">
              <UploadCloud className="w-8 h-8 text-slate-500 mx-auto stroke-1" />
              <p className="text-xs text-slate-400">هنوز فایلی ارسال نکرده‌اید</p>
              <p className="text-[10px] text-slate-500">هر چیزی که بفرستید همین‌جا نمایش داده می‌شود و می‌توانید حذفش کنید.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              <AnimatePresence initial={false}>
                {myMedia.map((m, idx) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.2, delay: Math.min(idx, 8) * 0.02 }}
                    className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40 aspect-square"
                  >
                    <img
                      src={m.thumbnailUrl || m.url}
                      alt={`فایل ارسالی ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {m.type === "video" && (
                      <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-md border border-white/10 flex items-center gap-1">
                        <Film className="w-2.5 h-2.5" />
                        ویدیو
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteMedia(m.id, e)}
                      title="حذف این فایل"
                      aria-label={`حذف فایل ارسالی ${idx + 1}`}
                      className="absolute top-1.5 left-1.5 bg-black/70 hover:bg-red-500 border border-white/15 text-white p-1.5 rounded-lg transition-all cursor-pointer active:scale-90"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ─── BATCH UPLOAD TRACKER ────────────────────
          Full-screen while several files are in flight. Shows real byte progress
          per file (XHR) plus a distinct "processing on the server" state, so a
          large video never reads as a frozen page. */}
      <AnimatePresence>
        {batchActive && (
          <motion.div
            key="batch-tracker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-[#160f13]/95 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-6"
            id="batch_upload_tracker"
            role="dialog"
            aria-modal="true"
            aria-label="وضعیت بارگذاری فایل‌ها"
          >
            <motion.div
              initial={{ y: 40, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="w-full sm:max-w-md glass-card rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              {batchTrackerHeader}
              {batchTrackerList}
              {batchTrackerFooter}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── LIGHTBOX ────────────────────────────────── */}
      <AnimatePresence>
        {activeLightboxIndex !== null && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setActiveLightboxIndex(null)}
            className="fixed inset-0 bg-[#0f0a0d]/95 backdrop-blur-2xl z-50 flex flex-col p-4 cursor-zoom-out"
            id="gallery_lightbox"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 cursor-default select-none pt-1" dir="rtl" onClick={e => e.stopPropagation()}>
              <div>
                <h4 className="text-sm font-semibold text-white">{mediaItems[activeLightboxIndex]?.guestName}</h4>
                <p className="text-[10px] text-slate-400 mt-0.5" dir="ltr">
                  {FILM_FILTERS.find(f => f.id === mediaItems[activeLightboxIndex]?.filter)?.emoji} {FILM_FILTERS.find(f => f.id === mediaItems[activeLightboxIndex]?.filter)?.name || mediaItems[activeLightboxIndex]?.filter}
                </p>
              </div>
              <button type="button" onClick={() => setActiveLightboxIndex(null)}
                className="bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs px-3 py-1.5 rounded-xl cursor-pointer transition-all">
                بستن ✕
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center max-h-[80vh] relative" onClick={e => e.stopPropagation()}>
              <motion.div key={activeLightboxIndex}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="w-full h-full flex items-center justify-center p-4">
                {mediaItems[activeLightboxIndex]?.type === "video" ? (
                  <video src={mediaItems[activeLightboxIndex]?.url}
                    className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" controls autoPlay playsInline referrerPolicy="no-referrer" />
                ) : (
                  <img src={mediaItems[activeLightboxIndex]?.url} alt="عکس"
                    className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" referrerPolicy="no-referrer" draggable={false} />
                )}
              </motion.div>

              {mediaItems.length > 1 && (
                <>
                  <button type="button" onClick={e => { e.stopPropagation(); navigateLightbox(-1); }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 border border-white/10 p-2 rounded-full text-white cursor-pointer z-10 transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); navigateLightbox(1); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 border border-white/10 p-2 rounded-full text-white cursor-pointer z-10 transition-all">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center justify-between py-3 cursor-default select-none" onClick={e => e.stopPropagation()}>
              <button type="button"
                onClick={e => { e.stopPropagation(); const m = mediaItems[activeLightboxIndex!]; handleDownload(m?.url, `${eventId}-${m?.id}.${getExt(m)}`); }}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/10 text-white text-[11px] px-4 py-2 rounded-xl cursor-pointer transition-all">
                <Download className="w-3.5 h-3.5" />
                دانلود
              </button>
              <span className="bg-white/10 border border-white/10 text-slate-200 text-[11px] py-1 px-4 rounded-full font-sans">
                {activeLightboxIndex! + 1} از {mediaItems.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

