import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, Video, User, Plus, Sparkles, Heart, Image,
  Lock, Unlock, RotateCw, Play, Square, Check, AlertCircle, Loader, ArrowLeft, Trash2, WifiOff
} from "lucide-react";
import { FILM_FILTERS, FilterPreset } from "../types";

interface GuestPanelProps {
  eventId: string;
  onBackToHome: () => void;
}

export default function GuestPanel({ eventId, onBackToHome }: GuestPanelProps) {
  const [eventInfo, setEventInfo] = useState<any | null>(null);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [lockedFeed, setLockedFeed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Network state
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Guest registration state
  const [guestName, setGuestName] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [showInvitation, setShowInvitation] = useState(true);

  // Active filter
  const [selectedFilter, setSelectedFilter] = useState<FilterPreset>(FILM_FILTERS[0]);

  // Capture mode: "upload" | "camera"
  const [captureMode, setCaptureMode] = useState<"upload" | "camera">("upload");
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);

  // Filter Preview System states
  const [localFilePreview, setLocalFilePreview] = useState<string | null>(null);
  const [previewFileType, setPreviewFileType] = useState<"photo" | "video" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Filter Overview Overlay
  const [showFilterOverview, setShowFilterOverview] = useState(false);
  const [cameraSnapshot, setCameraSnapshot] = useState<string | null>(null);

  // Demo Preview Mode
  const [demoMode, setDemoMode] = useState(false);
  const [demoImg, setDemoImg] = useState("wedding");
  const [showOriginal, setShowOriginal] = useState(false);

  // Liked media state
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

  // Live Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraFlash, setCameraFlash] = useState(false);

  // Video Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<any>(null);

  // Guest upload counters
  const [snappedCount, setSnappedCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);

  // Full screen light-box
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  // Read event configuration & registration
  const loadEventAndMedia = async () => {
    try {
      setLoading(true);
      // Fetch event detail
      const evRes = await fetch(`/api/events/${eventId}`);
      if (!evRes.ok) {
        setEventInfo(null);
        setLoading(false);
        return;
      }
      const evData = await evRes.json();
      setEventInfo(evData);

      // Fetch media
      const mediaRes = await fetch(`/api/events/${eventId}/media`);
      const mediaData = await mediaRes.json();
      setLockedFeed(mediaData.locked || false);
      setMediaItems(mediaData.media || []);

      // Filter limits for guest
      const storedName = localStorage.getItem(`guest_name_${eventId}`);
      if (storedName) {
        setGuestName(storedName);
        setIsRegistered(true);
        calculateGuestLimits(storedName, mediaData.media || []);
      }
    } catch (e) {
      console.error("Failed to load guest room detail.", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEventAndMedia();
    return () => {
      stopCamera();
      if (localFilePreview && previewFileType === "video") {
        URL.revokeObjectURL(localFilePreview);
      }
    };
  }, [eventId]);

  const calculateGuestLimits = (name: string, allMedia: any[]) => {
    // Instead of relying on name, enforce limits strictly per device via localStorage
    const pCount = parseInt(localStorage.getItem(`snapped_${eventId}`) || "0", 10);
    const vCount = parseInt(localStorage.getItem(`video_${eventId}`) || "0", 10);
    setSnappedCount(pCount);
    setVideoCount(vCount);
  };

  const handleRegisterName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = guestName.trim() || `مهمان ناشناس ${Math.floor(100 + Math.random() * 900)}`;
    setGuestName(finalName);
    localStorage.setItem(`guest_name_${eventId}`, finalName);
    setIsRegistered(true);
    calculateGuestLimits(finalName, mediaItems);
  };

  const handleClearName = () => {
    localStorage.removeItem(`guest_name_${eventId}`);
    setIsRegistered(false);
    setGuestName("");
    stopCamera();
    setCaptureMode("upload");
  };

  // CAMERA INITIATION
  const startCamera = async () => {
    setCameraError("");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // prefer rear camera for capturing parties!
        audio: true // needed for video recording toasts
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setCaptureMode("camera");
    } catch (err: any) {
      console.warn("Camera init error:", err);
      // Fallback: try video-only if mic permissions block
      try {
        const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        setStream(videoOnlyStream);
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnlyStream;
        }
        setCaptureMode("camera");
      } catch (fallbackErr: any) {
        setCameraError("دسترسی به دوربین توسط دستگاه شما مسدود شده است یا امکان‌پذیر نیست. لطفاً از گزینه بارگذاری گالری در پایین استفاده کنید.");
        setCaptureMode("upload");
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (isRecording) {
      clearInterval(recordIntervalRef.current);
      setIsRecording(false);
      setRecordTimer(0);
    }
  };

  const toggleFilterGrid = () => {
    if (!showFilterOverview && videoRef.current) {
      const canvas = window.document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 120; // low res snapshot
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setCameraSnapshot(canvas.toDataURL("image/jpeg", 0.5));
      }
      setShowFilterOverview(true);
    } else {
      setShowFilterOverview(false);
    }
  };

  // APPLY RETRO FILTERS DYNAMICALLY VIA CANVAS CONTEXT PROCESSOR
  const applyFilterToImage = (imageSrc: string): Promise<string> => {
    return new Promise((resolve) => {
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

        // Apply equivalent canvas filter string
        if (selectedFilter.canvasFilter) {
          ctx.filter = selectedFilter.canvasFilter;
        }

        // Draw rotated / straight
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // Export high fidelity vintage jpg file data
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        resolve(imageSrc);
      };
    });
  };

  // SNAP LIVE PICTURE
  const snapLivePhoto = async () => {
    if (!videoRef.current) return;
    
    // Trigger visual flash overlay
    setCameraFlash(true);
    setTimeout(() => setCameraFlash(false), 200);

    const canvas = window.document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const rawBase64 = canvas.toDataURL("image/jpeg");
      
      // Post-process with retro filters baked onto canvas!
      setUploadProgress(true);
      setUploadStatusMsg("Baking vintage filter negatives...");
      const filteredBase64 = await applyFilterToImage(rawBase64);
      
      const success = await handleStreamingUpload(filteredBase64, "photo");
      if (success) {
        setUploadStatusMsg("با موفقیت ثبت شد!");
        setTimeout(() => {
          setUploadProgress(false);
        }, 1000);
      } else {
        setUploadProgress(false);
      }
    }
  };

  // RECORD 30S VIDEO SNAP
  const startRecordingVideo = () => {
    if (!stream) return;
    recordedChunksRef.current = [];
    const options = { mimeType: "video/webm;codecs=vp9" };
    let mediaRecorder: MediaRecorder;
    
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      try {
        mediaRecorder = new MediaRecorder(stream);
      } catch (err: any) {
        alert("Video recording formats not supported on this mobile user agent.");
        return;
      }
    }

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    // When recording stops naturally
    mediaRecorder.onstop = async () => {
      clearInterval(recordIntervalRef.current);
      setUploadProgress(true);
      setUploadStatusMsg("Assembling 30-second digital reel...");

      const blob = new Blob(recordedChunksRef.current, { type: "video/mp4" });
      
      const success = await handleStreamingUpload(blob, "video", recordTimer);
      setRecordTimer(0);
      
      if (success) {
        setUploadStatusMsg("با موفقیت ثبت شد!");
        setTimeout(() => {
          setUploadProgress(false);
        }, 1000);
      } else {
        setUploadProgress(false);
      }
    };

    mediaRecorder.start();
    setIsRecording(true);
    setRecordTimer(0);

    // Dynamic 30s TICK interval
    recordIntervalRef.current = setInterval(() => {
      setRecordTimer((prev) => {
        const maxDuration = eventInfo?.maxVideoDuration || 30;
        if (prev >= maxDuration - 1) {
          // Time out naturally at 30 seconds
          mediaRecorder.stop();
          setIsRecording(false);
          clearInterval(recordIntervalRef.current);
          return maxDuration;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecordingVideo = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Standard Gallery Input file uploader with live Filter Preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    // Check size limits
    if (files.some(f => f.size > 30 * 1024 * 1024)) {
      alert("حجم یکی از فایل‌های انتخاب شده از سقف ۳۰ مگابایت بیشتر است.");
      return;
    }

    const file = files[0];
    const isVideo = file.type.startsWith("video");

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
    setUploadPercent(10);
    setUploadStatusMsg("در حال آماده‌سازی فایل...");

    try {
      if (previewFileType === "video") {
        setUploadStatusMsg("در حال بارگذاری ویدیو...");
        setUploadPercent(40);
        await handleStreamingUpload(pendingFile, "video", 10);
      } else {
        setUploadStatusMsg("در حال اعمال فیلتر نگاتیو نوستالژیک...");
        setUploadPercent(30);
        // Apply retro filter baked onto canvas!
        const filteredBase64 = await applyFilterToImage(localFilePreview);
        setUploadPercent(60);
        setUploadStatusMsg("در حال بارگذاری عکس...");
        await handleStreamingUpload(filteredBase64, "photo");
      }

      setUploadPercent(100);
      setUploadStatusMsg("با موفقیت ثبت شد!");
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
      setTimeout(() => {
        setUploadProgress(false);
      }, 2500);
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

  const handleStreamingUpload = async (payload: string | Blob | File, type: "photo" | "video", durationSec: number = 0) => {
    try {
      const formData = new FormData();
      formData.append("guestName", guestName.trim());
      formData.append("filter", selectedFilter.id);
      formData.append("duration", durationSec.toString());
      
      let uploadFile: Blob | File;
      if (typeof payload === 'string') {
        const mime = type === 'video' ? 'video/mp4' : 'image/jpeg';
        uploadFile = base64ToBlob(payload, mime);
      } else {
        uploadFile = payload;
      }
      
      // Determine file extension
      const ext = type === 'video' ? 'mp4' : 'jpg';
      formData.append("fileData", uploadFile, `media.${ext}`);

      const res = await fetch(`/api/events/${eventId}/upload/streaming`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "از سقف مجاز ثبت فایل عبور کرده‌اید.");
        return false;
      }

      const uploadedItem = await res.json();
      
      // Update counters locally
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

      // Prepend to media list if unlocked
      if (!lockedFeed) {
        setMediaItems(prev => [uploadedItem, ...prev]);
      }

      return true;
    } catch (err) {
      console.error(err);
      alert("Submission dropped. Network failed.");
      return false;
    }
  };

  const handleDeleteMedia = async (mediaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("آیا از حذف این فایل مطمئن هستید؟ (فقط مجاز به حذف فایل‌های خودتان هستید)")) return;
    
    // Optimistic UI Update
    const itemToDelete = mediaItems.find(m => m.id === mediaId);
    if (!itemToDelete) return;

    setMediaItems(prev => prev.filter(m => m.id !== mediaId));
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
      
      // Update local storage on true success
      if (itemToDelete.type === "photo") {
        setSnappedCount(p => { localStorage.setItem(`snapped_${eventId}`, p.toString()); return p; });
      } else {
        setVideoCount(v => { localStorage.setItem(`video_${eventId}`, v.toString()); return v; });
      }
    } catch (err: any) {
      console.error(err);
      alert("خطا در حذف فایل یا عدم دسترسی: " + err.message);
      
      // Rollback
      setMediaItems(prev => {
        if (!prev.find(m => m.id === mediaId)) {
          const restored = [...prev, itemToDelete];
          restored.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return restored;
        }
        return prev;
      });
      if (itemToDelete.type === "photo") {
        setSnappedCount(p => p + 1);
      } else {
        setVideoCount(v => v + 1);
      }
    }
  };

  const handleLikeMedia = async (mediaId: string, e: React.MouseEvent) => {
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

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="space-y-3">
          <Loader className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
          <p className="text-sm">در حال اتصال به دوربین...</p>
        </div>
      </div>
    );
  }

  if (!eventInfo) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md space-y-4">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto stroke-1" />
          <div>
            <h2 className="text-xl font-display font-bold">ورود مجاز نیست</h2>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              رویداد با کد <code className="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-xs text-rose-400">#{eventId}</code> غیرفعال یا حذف شده است.
            </p>
          </div>
          <button 
            onClick={onBackToHome}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-6 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1"
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }

  if (showInvitation) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex-1 w-full h-full relative">
          <iframe 
            src="https://canva.link/kyqn7u6wjqmp4uq" 
            className="w-full h-full border-none"
            title="Event Invitation"
            allowFullScreen
          ></iframe>
        </div>
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 px-4 pointer-events-none">
          <button
            onClick={() => setShowInvitation(false)}
            className="pointer-events-auto bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold py-4 px-8 rounded-full shadow-2xl transition-all cursor-pointer flex items-center gap-2 transform hover:scale-105 active:scale-95"
          >
            <Camera className="w-5 h-5" />
            <span>ورود به دوربین / پنل</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className={`min-h-screen bg-transparent text-white font-sans flex flex-col relative ${!isOnline ? 'pt-7' : ''}`} id="guest_viewport">
      
      {/* Network Indicator */}
      {!isOnline && (
        <div className="absolute top-0 inset-x-0 bg-red-500 text-white text-[10px] sm:text-xs font-bold py-1.5 px-4 z-[100] flex justify-center items-center shadow-md animate-pulse space-x-2 rtl:space-x-reverse" id="network_indicator">
          <WifiOff className="w-3.5 h-3.5" />
          <span>ارتباط اینترنت قطع شده است. در صورت آپلود فایل ممکن است با مشکل مواجه شوید.</span>
        </div>
      )}

      {/* Lobby header section */}
      <header className="backdrop-blur-md bg-white/5 border-b border-white/10 px-4 py-3 shrink-0 flex items-center justify-between shadow-md" id="guest_header">
        <div className="flex items-center space-x-2.5 font-sans rtl:space-x-reverse">
          <button 
            id="guest_back_btn"
            onClick={onBackToHome} 
            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div className="min-w-0 pr-1">
            <h1 className="text-sm font-semibold truncate text-white">{eventInfo.name}</h1>
            <p className="text-[10px] text-slate-400 font-sans truncate">میزبان: {eventInfo.hostName}</p>
          </div>
        </div>
      </header>

      {/* GUEST REGISTER INVITATION */}
      {!isRegistered ? (
        <div className="flex-1 flex items-center justify-center p-6" id="guest_register_card">
          <div className="w-full max-w-sm backdrop-blur-2xl bg-slate-900/80 p-6 rounded-3xl border border-white/10 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <Camera className="w-12 h-12 text-pink-400 mx-auto stroke-1 animate-pulse" />
              <h2 className="text-lg font-display font-medium text-white">ثبت لحظات رویداد</h2>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                {eventInfo.description || "با ثبت نام، عکس‌ها و ویدیوهای خود را مستقیما در آلبوم رویداد ذخیره کنید."}
              </p>
            </div>

            <form onSubmit={handleRegisterName} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 tracking-wider mb-1.5 font-sans text-right">
                  نام خود را وارد کنید (اختیاری):
                </label>
                <div className="relative font-sans">
                  <User className="absolute right-3 top-2.5 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    maxLength={32}
                    className="w-full bg-black/45 border border-white/10 rounded-xl py-2 pr-9 pl-4 text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-pink-500 font-sans text-right"
                    placeholder="مثال: بابک (خالی بگذارید برای ناشناس)"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-pink-950/20 p-3.5 rounded-xl border border-pink-500/20 space-y-1.5 text-right text-[11px] text-pink-300">
                <div className="font-bold flex items-center gap-1 text-pink-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  قوانین آلبوم میزبان:
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-300 font-sans">
                  <li>حداکثر {eventInfo.imageLimit === 0 ? "نامحدود" : `${eventInfo.imageLimit}`} عکس مجاز است.</li>
                  <li>حداکثر {eventInfo.videoLimit === 0 ? "نامحدود" : `${eventInfo.videoLimit}`} ویدیوی ۳۰ ثانیه‌ای مجاز است.</li>
                  <li>فیلترهای جذاب دوربینی به صورت لحظه‌ای قابل اعمال است.</li>
                </ul>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 active:scale-98 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-lg shadow-rose-600/10 transition-all cursor-pointer inline-flex justify-center items-center gap-2"
              >
                ورود به گالری و دوربین
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* GUEST INTERACTIVE CAMERA STUDIO LOBBY */
        <div className="flex-1 flex flex-col h-full bg-transparent overflow-y-auto pb-8 z-10" id="guest_main_studio">
          
          {/* limits progress bar */}
          <div className="backdrop-blur-md bg-white/5 p-3 flex items-center justify-between border-b border-white/10 text-xs shrink-0 font-sans">
            <span className="text-slate-200">تعداد فایل‌های ثبت شده شما:</span>
            <div className="flex items-center gap-4 text-slate-300">
              <span dir="ltr">📸 <strong className="text-pink-300 font-mono">{snappedCount}</strong>{eventInfo.imageLimit > 0 && `/${eventInfo.imageLimit}`}</span>
              <span dir="ltr">🎥 <strong className="text-rose-400 font-mono">{videoCount}</strong>{eventInfo.videoLimit > 0 && `/${eventInfo.videoLimit}`}</span>
            </div>
          </div>

          {/* VIRTUAL SHOOTER VIEWPORT / INTERACTIVE PREVIEW */}
          <div className="p-4" id="viewfinder_area">
            <div className="w-full max-w-sm mx-auto bg-slate-900/65 rounded-3xl overflow-hidden border border-white/15 shadow-2xl relative">
              
              {captureMode === "camera" ? (
                /* LIVE HAND-HELD CAMERA PREVIEW CONTAINER */
                <div className="relative aspect-[3/4] bg-black overflow-hidden flex items-center justify-center">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    id="camera_video_feed"
                    className="w-full h-full object-cover transition-all"
                    style={{ filter: selectedFilter.cssStyle }}
                  />

                  {/* Camera Flash overlay trigger */}
                  {cameraFlash && (
                    <div className="absolute inset-0 bg-white z-20 animate-flash-burst pointer-events-none" />
                  )}

                  {/* 30s Recording feedback overlay counter */}
                  {isRecording && (
                    <div className="absolute top-4 right-4 z-10 bg-rose-600 border border-rose-500 py-1 px-3 rounded-full flex items-center gap-2 text-[11px] font-bold tracking-wide animate-pulse uppercase text-white" dir="ltr">
                      <div className="w-2 h-2 rounded-full bg-white" />
                      REC {recordTimer}s / {eventInfo.maxVideoDuration}s
                    </div>
                  )}

                  {/* Visual Filter overlay badge */}
                  <div className="absolute top-4 left-4 bg-slate-950/80 text-white text-[10px] uppercase tracking-wider font-mono px-2 py-1 rounded">
                    🚀 {selectedFilter.name}
                  </div>

                  {/* Virtual overlay crop guidelines */}
                  <div className="absolute inset-6 border border-white/10 pointer-events-none rounded-xl" />

                  {/* Instant Filter Overview Toggle & Grid */}
                  <div className="absolute bottom-4 right-4 z-10">
                    <button 
                      onClick={toggleFilterGrid}
                      className="bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full p-2 border border-white/20 shadow-lg text-white transition-all cursor-pointer"
                      title="Instant Filter Preview"
                    >
                      <Sparkles className="w-5 h-5 text-pink-400" />
                    </button>
                  </div>

                  {showFilterOverview && cameraSnapshot && (
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-lg z-30 flex flex-col items-center justify-center p-4">
                      <div className="absolute top-4 left-4">
                        <button 
                          onClick={() => setShowFilterOverview(false)}
                          className="text-white text-xs bg-white/10 px-3 py-1.5 rounded-lg border border-white/20 cursor-pointer"
                        >
                          بستن
                        </button>
                      </div>
                      <h4 className="text-white text-sm mb-4 font-bold tracking-widest text-pink-300">انتخاب فیلتر</h4>
                      <div className="grid grid-cols-3 gap-3 w-full h-[70%] overflow-y-auto pr-2 scrollbar-none">
                        {FILM_FILTERS.map((f) => (
                          <div 
                            key={f.id} 
                            onClick={() => { setSelectedFilter(f); setShowFilterOverview(false); }}
                            className={`flex flex-col items-center gap-1.5 cursor-pointer rounded-lg p-1 transition-all ${
                              selectedFilter.id === f.id ? "bg-white/20 border border-pink-400" : "hover:bg-white/10 border border-transparent"
                            }`}
                          >
                            <img 
                              src={cameraSnapshot} 
                              alt={f.name}
                              className="w-full aspect-[3/4] object-cover rounded shadow"
                              style={{ filter: f.cssStyle }}
                            />
                            <span className="text-[10px] text-white font-mono uppercase truncate w-full text-center">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                /* STANDARD GALLERY FILE PICKER or LIVE FILTER PREVIEW */
                localFilePreview ? (
                  <div className="relative aspect-[3/4] bg-black overflow-hidden flex flex-col justify-between">
                    {/* Live Preview Element */}
                    <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center bg-zinc-950">
                      {previewFileType === "video" ? (
                        <video 
                          src={localFilePreview} 
                          className="w-full h-full object-contain" 
                          controls
                          playsInline 
                        />
                      ) : (
                        <img 
                          src={localFilePreview} 
                          alt="Selected file preview" 
                          className="w-full h-full object-cover transition-all" 
                          style={{ filter: selectedFilter.cssStyle }}
                        />
                      )}

                      {/* Display the active filter badge overlay */}
                      {previewFileType === "photo" && (
                        <div className="absolute top-4 left-4 bg-slate-950/80 text-white text-[10px] uppercase tracking-wider font-mono px-2 py-1 rounded">
                          ✨ فیلتر: {selectedFilter.name}
                        </div>
                      )}
                    </div>

                    {/* Preview action bar */}
                    <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 backdrop-blur-md p-3 border-t border-white/10 flex items-center justify-between gap-2 z-10 font-sans">
                      <button
                        onClick={handleCancelPendingFile}
                        className="bg-transparent hover:bg-white/10 border border-white/20 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all shrink-0"
                      >
                        لغو انتخاب
                      </button>

                      <button
                        onClick={handleUploadPendingFile}
                        className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Check className="w-3.5 h-3.5 text-white" />
                        ارسال تصویر با فیلتر
                      </button>
                    </div>
                  </div>
                ) : demoMode ? (
                  /* DEMO PREVIEW MODE */
                  <div className="relative aspect-[3/4] bg-black overflow-hidden flex flex-col justify-between">
                    <div 
                      className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center bg-zinc-950"
                      onMouseDown={() => setShowOriginal(true)}
                      onMouseUp={() => setShowOriginal(false)}
                      onTouchStart={() => setShowOriginal(true)}
                      onTouchEnd={() => setShowOriginal(false)}
                    >
                      <img 
                        src={demoImg === "portrait" ? "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=800&auto=format&fit=crop" : demoImg === "wedding" ? "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop" : "https://images.unsplash.com/photo-1506744626753-1fa28f673b0c?q=80&w=800&auto=format&fit=crop"} 
                        alt="Sample Preview" 
                        className="w-full h-full object-cover transition-all" 
                        style={{ filter: showOriginal ? 'none' : selectedFilter.cssStyle }}
                      />
                      <div className="absolute top-4 left-4 bg-slate-950/80 text-white text-[10px] uppercase tracking-wider font-mono px-2 py-1 rounded">
                        {showOriginal ? 'بدون فیلتر (اصلی)' : `✨ فیلتر: ${selectedFilter.name}`}
                      </div>
                      <div className="absolute top-4 right-4 bg-pink-600/90 text-white text-[10px] uppercase tracking-wider font-sans px-2 py-1 rounded shadow animate-pulse">
                        برای مقایسه نگه دارید
                      </div>
                    </div>

                    <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 backdrop-blur-md p-3 border-t border-white/10 flex flex-col items-center gap-2 z-10 font-sans">
                      <div className="flex w-full justify-between items-center px-1">
                         <span className="text-xs text-slate-400">تغییر نمونه دمو:</span>
                         <div className="flex gap-2">
                           <button onClick={() => setDemoImg("portrait")} className={`px-2 py-1 rounded text-[10px] ${demoImg === "portrait" ? "bg-pink-500 text-white" : "bg-white/10 text-slate-300"} cursor-pointer`}>پرتره</button>
                           <button onClick={() => setDemoImg("wedding")} className={`px-2 py-1 rounded text-[10px] ${demoImg === "wedding" ? "bg-pink-500 text-white" : "bg-white/10 text-slate-300"} cursor-pointer`}>عروسی</button>
                           <button onClick={() => setDemoImg("landscape")} className={`px-2 py-1 rounded text-[10px] ${demoImg === "landscape" ? "bg-pink-500 text-white" : "bg-white/10 text-slate-300"} cursor-pointer`}>منظره</button>
                         </div>
                      </div>
                      <button
                        onClick={() => setDemoMode(false)}
                        className="w-full bg-transparent hover:bg-white/10 border border-white/20 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all shrink-0"
                      >
                        خروج از دمو و بازگشت به گالری
                      </button>
                    </div>
                  </div>
                ) : (
                  /* STANDARD GALLERY FILE PICKER */
                  <div className="aspect-[3/4] bg-black/40 flex flex-col items-center justify-center p-6 text-center relative border border-dashed border-white/10 m-2 rounded-2xl">
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-pink-400 text-lg border border-white/10 shadow-inner">
                        📸
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">بارگذاری فایل از گالری</h3>
                        <p className="text-[11px] text-slate-300 mt-1 max-w-[220px] mx-auto leading-normal">یک عکس یا ویدیوی جذاب (تا ۳۰ ثانیه) انتخاب کرده و با دیگران به اشتراک بگذارید.</p>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="inline-block bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 active:scale-95 text-white text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer shadow-md transition-all">
                          انتخاب فایل از دستگاه
                          <input 
                            type="file" 
                            accept="image/*,video/*" 
                            className="hidden" 
                            onChange={handleFileChange}
                          />
                        </label>

                        <button 
                          onClick={() => setDemoMode(true)}
                          className="bg-white/10 hover:bg-white/20 active:scale-95 text-white text-[11px] font-semibold px-5 py-2.5 rounded-xl cursor-pointer border border-white/10 transition-all flex items-center justify-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          تست فیلتر روی نمونه دمو
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* OVERLAY DYNAMIC PROGRESS CARD */}
              {uploadProgress && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center z-30 text-white select-none">
                  <Loader className="w-10 h-10 text-pink-400 animate-spin mb-4 stroke-1" />
                  <p className="text-sm font-medium tracking-wide mb-6">{uploadStatusMsg}</p>
                  
                  {/* Progress Bar Container */}
                  <div className="w-full max-w-[200px] h-2 bg-white/10 rounded-full overflow-hidden border border-white/5 relative">
                     <div 
                       className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 ease-out"
                       style={{ width: `${uploadPercent}%` }}
                     />
                  </div>
                  {uploadPercent > 0 && <span className="text-[10px] text-pink-300 font-mono mt-2 font-bold">{uploadPercent}%</span>}
                </div>
              )}

              {/* HAND-HELD CAMERA CONTROLS AND TOGGLERS */}
              <div className="bg-black/50 border-t border-white/15 p-4 shrink-0 flex items-center justify-between gap-2.5" id="shooter_controls_bar">
                {/* Switch capture option btn */}
                {captureMode === "camera" ? (
                  <button
                    onClick={() => {
                      stopCamera();
                      setCaptureMode("upload");
                    }}
                    className="p-3 bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white rounded-full transition-all font-sans text-xs flex items-center gap-1 cursor-pointer border border-white/10"
                    title="بارگذاری از گالری"
                  >
                    <Image className="w-4 h-4 ml-1" />
                    فایل‌ها
                  </button>
                ) : (
                  <button
                    onClick={startCamera}
                    className="p-3 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 hover:text-pink-200 rounded-full transition-all font-sans text-xs flex items-center gap-1 cursor-pointer border border-pink-500/20"
                    title="باز کردن دوربین زنده"
                  >
                    <Camera className="w-4 h-4 animate-pulse ml-1" />
                    دوربین زنده
                  </button>
                )}

                {/* Primary trigger snap buttons */}
                {captureMode === "camera" && (
                  <div className="flex items-center space-x-4">
                    {/* VIDEO RECORDER TOGGLE BUTTON */}
                    {isRecording ? (
                      <button
                        onClick={stopRecordingVideo}
                        className="bg-red-600 hover:bg-red-750 w-14 h-14 rounded-full flex items-center justify-center border-4 border-slate-900 text-white shadow-lg active:scale-90 transition-all cursor-pointer"
                        title="توقف ضبط ویدیو"
                      >
                        <Square className="w-5 h-5 animate-pulse text-white fill-white" />
                      </button>
                    ) : (
                      <button
                        onClick={startRecordingVideo}
                        className="bg-red-650 hover:bg-red-600 w-12 h-12 rounded-full flex items-center justify-center border-2 border-slate-800 text-white shadow-md active:scale-90 transition-all cursor-pointer"
                        title="ضبط ویدیوی کوتاه"
                      >
                        <Video className="w-4 h-4 text-white" />
                      </button>
                    )}

                    {/* PHOTO SHUTTER TOGGLE BUTTON */}
                    <button
                      onClick={snapLivePhoto}
                      disabled={isRecording}
                      className="bg-white hover:bg-slate-100 disabled:opacity-40 w-14 h-14 rounded-full flex items-center justify-center border-4 border-slate-800 shadow-xl active:scale-90 transition-transform shrink-0 cursor-pointer"
                      title="ثبت عکس"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center">
                        📸
                      </div>
                    </button>
                  </div>
                )}

                {cameraError && (
                  <div className="text-[10px] text-rose-500 font-sans mt-2 max-w-[300px] leading-tight text-center">
                    {cameraError}
                  </div>
                )}

                {/* Switch off camera altogether */}
                {captureMode === "camera" && (
                  <button
                    onClick={() => {
                      stopCamera();
                      setCaptureMode("upload");
                    }}
                    className="p-2.5 bg-slate-800 hover:bg-red-955/20 text-red-400 rounded-full transition-colors font-sans text-xs cursor-pointer px-4"
                    title="بستن دوربین"
                  >
                    بستن
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* DYNAMIC VINTAGE FILM FILTER PICKER BAR */}
          <div className="px-4 py-2" id="filter_carousel">
            <h3 className="text-center text-[11px] font-bold font-sans uppercase tracking-wider text-slate-400 mb-2">
              ✨ فیلترهای رنگی دوربین
            </h3>
            
            <div className="flex gap-2 overflow-x-auto pb-2 pl-4 pr-1 justify-start md:justify-center select-none scrollbar-none" id="filters_scroll" dir="ltr">
              {FILM_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border ${
                    selectedFilter.id === f.id
                      ? "bg-gradient-to-r from-rose-600 to-amber-600 border-rose-500 text-white font-bold shadow-sm shadow-rose-600/20"
                      : "backdrop-blur-md bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span 
                    className="w-3.5 h-3.5 rounded-full inline-block border border-white/30 shadow-inner shrink-0" 
                    style={{
                      filter: f.cssStyle,
                      background: "linear-gradient(135deg, #3b82f6 0%, #ec4899 50%, #f59e0b 100%)"
                    }}
                  />
                  {f.name}
                </button>
              ))}
            </div>
            <p className="text-center text-[10px] text-slate-450 leading-normal mt-1 max-w-xs mx-auto">
              فیلتر در حال اعمال: {selectedFilter.id === 'none' ? "بدون فیلتر" : `"${selectedFilter.name}"`}
            </p>
          </div>

          {/* EVENTS DISPOSABLE FEED AREA */}
          <hr className="border-white/10 my-4" />

          <div className="px-5 space-y-4" id="shared_disposable_feed">
            {lockedFeed ? (
              /* DELAYED DISPOSABLE REVEAL CARD BLOCK */
              <div className="backdrop-blur-xl bg-slate-900/40 rounded-3xl border border-white/15 p-6 text-center space-y-4 shadow-2xl select-none" id="developing_rolls">
                <Lock className="w-12 h-12 text-yellow-500 mx-auto stroke-1 animate-bounce" />
                
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-slate-200 tracking-widest font-sans">در حال ظاهر کردن فیلم</h3>
                  <p className="text-[11px] text-slate-350 leading-normal font-sans">
                    {eventInfo.hostName} این آلبوم را به صورت <strong>تاخیری</strong> تنظیم کرده است. عکس‌ها مستقیماً برای میزبان ارسال شده‌اند و فعلاً قفل هستند.
                  </p>
                </div>

                <div className="bg-black/55 p-5 rounded-2xl border border-white/10 space-y-2 inline-block">
                  <div className="text-[11px] font-mono text-pink-300">🚨 آلبوم قفل است</div>
                  <div className="text-2xl font-bold font-sans tracking-tight text-white mb-1">
                    {mediaItems.length} فایل ثبت شده!
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">میزبان در پایان مراسم آلبوم را باز خواهد کرد. به عکاسی ادامه دهید!</p>
                </div>
              </div>
            ) : (
              /* INSTANT REVEAL VIEW FEED ALBUM */
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-350 flex items-center gap-1.5 font-sans">
                    <Unlock className="w-3.5 h-3.5 text-green-500" />
                    آلبوم عمومی باز است
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">{mediaItems.length} فایل</span>
                </div>

                {mediaItems.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 select-none border border-dashed border-white/10 rounded-2xl bg-white/5 backdrop-blur-md">
                    <Image className="w-8 h-8 text-pink-400/65 mx-auto stroke-1 mb-2" />
                    <p className="text-xs font-semibold text-slate-300 font-sans">آلبوم خالی است</p>
                    <p className="text-[10px] text-slate-450 mt-0.5 font-sans">اولین عکاس مراسم باشید و لحظه‌ها را ثبت کنید!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3" id="guest_photos_grid">
                    {mediaItems.map((m, idx) => (
                      <div
                        key={m.id}
                        onClick={() => setActiveLightboxIndex(idx)}
                        className="backdrop-blur-md bg-white/5 rounded-2xl overflow-hidden cursor-pointer border border-white/10 hover:border-pink-500/30 hover:scale-[1.01] transition-all duration-200 group flex flex-col justify-between shadow-lg"
                      >
                        {/* Display media */}
                        <div className="relative aspect-square bg-black/60 overflow-hidden flex items-center justify-center select-none">
                          {m.type === "video" ? (
                            <div className="relative w-full h-full">
                              <video 
                                src={m.url} 
                                className="w-full h-full object-cover" 
                                controls 
                                playsInline 
                                referrerPolicy="no-referrer"
                              />
                              <span className="absolute top-2 right-2 bg-slate-950/80 text-[9px] py-0.5 px-1.5 rounded-full flex items-center gap-0.5 text-white">
                                <Video className="w-2.5 h-2.5 text-red-500" />
                                {m.duration ? `${m.duration}s` : ""}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={m.url}
                              alt={`Submited by ${m.guestName}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          )}

                          {/* Filter label badge overlay */}
                          <span className="absolute bottom-2 left-2 bg-slate-950/70 backdrop-blur-xs text-white text-[8px] tracking-wider px-1.5 py-0.5 rounded font-sans" dir="ltr">
                            {FILM_FILTERS.find(f => f.id === m.filter)?.name || m.filter}
                          </span>
                        </div>

                        {/* Guest name tag with inline like button */}
                        <div className="p-2.5 flex items-center justify-between gap-1.5 bg-black/45 shrink-0 select-none border-t border-white/5">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold truncate text-slate-200">توسط: {m.guestName}</div>
                            <div className="text-[9px] text-slate-500 truncate lowercase font-mono mt-0.5">
                              {new Date(m.timestamp).toLocaleTimeString("fa-IR", { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {m.guestName === guestName && (
                              <button
                                onClick={(e) => handleDeleteMedia(m.id, e)}
                                className="bg-white/10 hover:bg-red-600/20 p-1.5 rounded-lg flex items-center gap-1 cursor-pointer border border-white/5 transition-all text-red-500"
                                title="حذف فایل شما"
                              >
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleLikeMedia(m.id, e)}
                              disabled={likedMedia.has(m.id)}
                              className={`p-1.5 rounded-lg flex items-center gap-1 cursor-pointer border transition-all ${
                                likedMedia.has(m.id) 
                                  ? 'bg-rose-600/20 border-rose-500/30 text-rose-500 cursor-default' 
                                  : 'bg-white/10 hover:bg-rose-600/20 border-white/5 text-slate-300 hover:text-rose-500'
                              }`}
                            >
                              <Heart className={`w-3 h-3 ${likedMedia.has(m.id) ? 'text-rose-500 fill-rose-500' : 'text-current'}`} />
                              <span className="text-[10px] font-mono">{m.likes || 0}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* FULL SCREEN GALLERY LIGHTBOX MODAL */}
      {activeLightboxIndex !== null && (
        <div 
          onClick={() => setActiveLightboxIndex(null)}
          className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col justify-between p-4 cursor-zoom-out animate-fade-in"
          id="gallery_lightbox"
        >
          {/* Light-box navbar */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3 cursor-default select-none pt-2 font-sans" dir="rtl">
            <div>
              <h4 className="text-sm font-semibold text-white">عکاس: {mediaItems[activeLightboxIndex]?.guestName}</h4>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5" dir="ltr">
                Style: {FILM_FILTERS.find(f => f.id === mediaItems[activeLightboxIndex]?.filter)?.name || mediaItems[activeLightboxIndex]?.filter}
              </p>
            </div>
            
            <button 
              onClick={() => setActiveLightboxIndex(null)} 
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer transition-all"
            >
              بستن
            </button>
          </div>

          {/* Light-box image view */}
          <div className="flex-1 flex items-center justify-center max-h-[80vh] p-4">
            {mediaItems[activeLightboxIndex]?.type === "video" ? (
              <video
                src={mediaItems[activeLightboxIndex]?.url}
                className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
                controls
                autoPlay
                playsInline
                referrerPolicy="no-referrer"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={mediaItems[activeLightboxIndex]?.url}
                alt="Active visual"
                className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          {/* Bottom navigation indices */}
          <div className="text-center py-4 cursor-default select-none">
            <span className="bg-white/10 border border-white/10 text-slate-200 text-[11px] font-sans py-1 px-4 rounded-full">
              فایل {activeLightboxIndex + 1} از {mediaItems.length}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
