import React, { useState, useEffect, FormEvent, useMemo, useRef } from "react";
import {
  Plus, QrCode, Clipboard, Check, Trash2, Folder,
  Settings, Sparkles, Download, Heart, Eye, Play,
  RefreshCw, FileText, Terminal, ArrowLeft, Image, Video, Users, User, Printer, Activity, Share2, X,
  LogOut, Edit, Calendar, UserPlus,
  ChevronLeft, ChevronRight, ChevronDown, Upload, CheckSquare, Square,
  Gift, CreditCard, MessageSquare, EyeOff, Save, Lock, HardDrive, Cpu
} from "lucide-react";
import QRCode from "qrcode";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { toast } from "sonner";


interface AdminPanelProps {
  onBackToHome: () => void;
}

/** Human-readable size for the storage counters. */
function formatBytes(bytes: number): string {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
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
  const [formMaxDuration, setFormMaxDuration] = useState(30);
  const [formImgLimit, setFormImgLimit] = useState(0);
  const [formVidLimit, setFormVidLimit] = useState(0);
  const [formSaveDir, setFormSaveDir] = useState("D:\\Wedding");
  const [customGuestAddress, setCustomGuestAddress] = useState("");

  // Multi-select media batch deletion state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // Face recognition state
  const [faceProfiles, setFaceProfiles] = useState<any[]>([]);
  const [isSyncingFaces, setIsSyncingFaces] = useState(false);
  const [faceTolerance, setFaceTolerance] = useState<number>(() => {
    const saved = localStorage.getItem("faceTolerance");
    return saved ? parseFloat(saved) : 0.2;
  });
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selectedPeopleForMerge, setSelectedPeopleForMerge] = useState<string[]>([]);
  const [isClearingFaces, setIsClearingFaces] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // VIP Reference Face state
  const [showVipModal, setShowVipModal] = useState(false);
  const [vipName, setVipName] = useState("");
  const [vipFile, setVipFile] = useState<File | null>(null);
  const [isUploadingVip, setIsUploadingVip] = useState(false);

  // Gift inbox state (admin-only: card details + guest receipts)
  const [giftCard, setGiftCard] = useState<any>({ enabled: true });
  const [giftSaving, setGiftSaving] = useState(false);
  const [giftReceipts, setGiftReceipts] = useState<any[]>([]);
  const [giftCounts, setGiftCounts] = useState<{ total: number; unseen: number }>({ total: 0, unseen: 0 });
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftPreview, setGiftPreview] = useState<any | null>(null);

  const fetchGiftData = async (eventId: string) => {
    setGiftLoading(true);
    try {
      const [cardRes, listRes] = await Promise.all([
        fetch(`/api/events/${eventId}/gift-card`),
        fetch(`/api/events/${eventId}/gift-receipts`),
      ]);
      if (cardRes.ok) {
        const card = await cardRes.json();
        setGiftCard({ enabled: true, ...card });
      }
      if (listRes.ok) {
        const data = await listRes.json();
        setGiftReceipts(data.items || []);
        setGiftCounts({ total: data.total || 0, unseen: data.unseen || 0 });
      }
    } catch (e) {
      console.error("Failed to load gift data", e);
    } finally {
      setGiftLoading(false);
    }
  };

  const saveGiftCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) return;
    setGiftSaving(true);
    try {
      const res = await fetch(`/api/events/${selectedEventId}/gift-card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(giftCard),
      });
      if (!res.ok) throw new Error();
      toast.success("اطلاعات کارت هدیه ذخیره شد");
    } catch {
      toast.error("ذخیره اطلاعات کارت انجام نشد");
    } finally {
      setGiftSaving(false);
    }
  };

  const toggleReceiptSeen = async (receipt: any) => {
    if (!selectedEventId) return;
    const next = !receipt.seen;
    setGiftReceipts(prev => prev.map(r => (r.id === receipt.id ? { ...r, seen: next } : r)));
    setGiftCounts(prev => ({ ...prev, unseen: Math.max(0, prev.unseen + (next ? -1 : 1)) }));
    try {
      await fetch(`/api/events/${selectedEventId}/gift-receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seen: next }),
      });
    } catch {
      toast.error("به‌روزرسانی انجام نشد");
    }
  };

  const deleteReceipt = async (receipt: any) => {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/events/${selectedEventId}/gift-receipts/${receipt.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setGiftReceipts(prev => prev.filter(r => r.id !== receipt.id));
      setGiftCounts(prev => ({
        total: Math.max(0, prev.total - 1),
        unseen: Math.max(0, prev.unseen - (receipt.seen ? 0 : 1)),
      }));
      if (giftPreview?.id === receipt.id) setGiftPreview(null);
      toast.success("رسید حذف شد");
    } catch {
      toast.error("حذف رسید انجام نشد");
    }
  };

  const handleUploadVipFace = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !vipFile) {
      toast.error("لطفا تصویر چهره مرجع را انتخاب کنید.");
      return;
    }
    setIsUploadingVip(true);
    try {
      const formData = new FormData();
      formData.append("fileData", vipFile);
      formData.append("displayName", vipName.trim() || "شخص مهم (VIP)");

      const res = await fetch(`/api/events/${selectedEventId}/vip-faces/upload`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (res.ok) {
        toast.success("عکس مرجع VIP با موفقیت ذخیره شد. در حال شناسایی چهره...");
        setShowVipModal(false);
        setVipFile(null);
        setVipName("");
        await handleSyncFaces();
      } else {
        toast.error(data.error || "خطا در آپلود عکس مرجع");
      }
    } catch (err: any) {
      toast.error("خطا در ارتباط با سرور: " + err.message);
    } finally {
      setIsUploadingVip(false);
    }
  };

  const toggleSelectMedia = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisibleMedia = () => {
    const allIds = new Set(mediaItems.map(m => m.id));
    setSelectedIds(allIds);
  };

  const deselectAllMedia = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteSelectedMedia = async () => {
    if (!selectedEventId || selectedIds.size === 0) return;
    const count = selectedIds.size;

    setConfirmAction({
      message: `آیا از حذف ${count} فایل انتخاب شده مطمئن هستید؟ (این عمل غیرقابل برگشت است)`,
      onConfirm: async () => {
        setIsBatchDeleting(true);
        const toDeleteIds = Array.from(selectedIds);
        
        // Optimistic UI update
        setMediaItems(prev => prev.filter(m => !selectedIds.has(m.id)));

        let successCount = 0;
        try {
          for (const id of toDeleteIds) {
            const res = await fetch(`/api/events/${selectedEventId}/media/${id}`, { method: "DELETE" });
            if (res.ok) successCount++;
          }
          toast.success(`تعداد ${successCount} فایل با موفقیت حذف شد.`);
          setSelectedIds(new Set());
          setSelectMode(false);
          fetchMedia(selectedEventId);
        } catch (err: any) {
          console.error(err);
          toast.error("خطا در حذف برخی فایل‌ها: " + err.message);
          if (selectedEventId) fetchMedia(selectedEventId);
        } finally {
          setIsBatchDeleting(false);
        }
      }
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedEventId) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    try {
      const res = await fetch(`/api/events/${selectedEventId}/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        toast.success("رسانه‌ها با موفقیت آپلود شدند");
        fetchMedia(selectedEventId);
      } else {
        toast.error("خطا در آپلود رسانه");
      }
    } catch (err: any) {
      toast.error("خطا در آپلود: " + err.message);
    }
  };

  // Face sync handler
  const handleSyncFaces = async () => {
    if (!selectedEventId) return;
    setIsSyncingFaces(true);
    try {
      const res = await fetch(`/api/events/${selectedEventId}/sync-faces?tolerance=${faceTolerance}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`شناسایی چهره انجام شد: ${data.processedCount || 0} عکس پردازش شد`);
        // Refresh face profiles
        const profileRes = await fetch(`/api/events/${selectedEventId}/face-profiles`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setFaceProfiles(profileData.profiles || []);
        }
      } else {
        toast.error(data.error || "خطا در شناسایی چهره");
      }
    } catch (err: any) {
      toast.error("خطا در ارتباط با سرور: " + err.message);
    } finally {
      setIsSyncingFaces(false);
    }
  };

  // Clear face index handler
  const handleClearFaces = async () => {
    if (!selectedEventId) return;
    setConfirmAction({
      message: "آیا از پاک کردن کامل شاخص چهره‌ها و شروع مجدد مطمئن هستید؟",
      onConfirm: async () => {
        setIsClearingFaces(true);
        try {
          const res = await fetch(`/api/events/${selectedEventId}/sync-faces`, { method: "DELETE" });
          if (res.ok) {
            toast.info("شاخص با موفقیت پاک شد. در حال اسکن مجدد تصاویر...");
            setFaceProfiles([]);
            await handleSyncFaces();
          } else {
            toast.error("خطا در پاک کردن شاخص چهره‌ها");
          }
        } catch (err: any) {
          toast.error("خطا در ارتباط با سرور: " + err.message);
        } finally {
          setIsClearingFaces(false);
        }
      }
    });
  };

  // Rename person profile handler
  const handleRenamePerson = async (personId: string, displayName: string) => {
    if (!selectedEventId || !displayName.trim()) return;
    try {
      // Optimistic update
      setFaceProfiles(prev => prev.map(p => p.personId === personId ? { ...p, displayName: displayName.trim() } : p));
      setEditingPersonId(null);

      const res = await fetch(`/api/events/${selectedEventId}/face-profiles/${personId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() })
      });
      if (res.ok) {
        toast.success("نام با موفقیت تغییر کرد ✨");
        const profileRes = await fetch(`/api/events/${selectedEventId}/face-profiles`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setFaceProfiles(profileData.profiles || []);
        }
      } else {
        toast.error("خطا در تغییر نام");
      }
    } catch (err: any) {
      toast.error("خطا در ارتباط با سرور: " + err.message);
    }
  };

  // Delete person profile handler
  const handleDeletePerson = async (personId: string) => {
    if (!selectedEventId) return;
    setConfirmAction({
      message: "آیا از حذف این پروفایل مطمئن هستید؟",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/events/${selectedEventId}/face-profiles/${personId}`, { method: "DELETE" });
          if (res.ok) {
            toast.success("پروفایل چهره با موفقیت حذف شد.");
            // Refresh
            const profileRes = await fetch(`/api/events/${selectedEventId}/face-profiles`);
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              setFaceProfiles(profileData.profiles || []);
            }
          } else {
            toast.error("خطا در حذف پروفایل چهره");
          }
        } catch (err: any) {
          toast.error("خطا در ارتباط با سرور: " + err.message);
        }
      }
    });
  };

  // Merge person profiles handler
  const handleMergePersons = async (targetId: string, sourceIds: string[]) => {
    if (!selectedEventId || sourceIds.length === 0) return;
    try {
      const res = await fetch(`/api/events/${selectedEventId}/face-profiles/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPersonId: targetId, sourcePersonIds: sourceIds })
      });
      if (res.ok) {
        toast.success("پروفایل‌ها با موفقیت ادغام شدند.");
        setSelectedPeopleForMerge([]);
        // Refresh
        const profileRes = await fetch(`/api/events/${selectedEventId}/face-profiles`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setFaceProfiles(profileData.profiles || []);
        }
      } else {
        toast.error("خطا در ادغام پروفایل‌ها");
      }
    } catch (err: any) {
      toast.error("خطا در ارتباط با سرور: " + err.message);
    }
  };

  // Load face profiles when event changes
  useEffect(() => {
    if (selectedEventId) {
      fetch(`/api/events/${selectedEventId}/face-profiles`)
        .then(res => res.ok ? res.json() : { profiles: [] })
        .then(data => setFaceProfiles(data.profiles || []))
        .catch(() => setFaceProfiles([]));
    }
  }, [selectedEventId]);

  // Sync state settings
  const [localSyncEnabled, setLocalSyncEnabled] = useState(false);
  const [localSyncHost, setLocalSyncHost] = useState("http://localhost:8080");
  const [activeSyncDir, setActiveSyncDir] = useState("D:\\Wedding");

  // Two-tier storage: what is still on the local disk vs. moved to the external drive.
  const [archiveStatus, setArchiveStatus] = useState<any | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // System statistics
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<string>("media");

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

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
        setActiveSyncDir(ev.saveDirectory || "D:\\Wedding");
        fetchMedia(selectedEventId);
        fetchGiftData(selectedEventId);
      }
    } else {
      setSelectedEvent(null);
      setMediaItems([]);
      setGiftReceipts([]);
      setGiftCounts({ total: 0, unseen: 0 });
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

  // Poll the tiered-storage counters only while the storage tab is visible, so
  // the panel doesn't keep hitting the disk in the background all evening.
  useEffect(() => {
    if (!isAuthenticated || !selectedEventId || activeTab !== "sync") return;
    fetchArchiveStatus();
    const timer = setInterval(fetchArchiveStatus, 15000);
    return () => clearInterval(timer);
  }, [isAuthenticated, selectedEventId, activeTab]);

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
                setMediaItems(prev => prev.map(m => m.id === msg.data.media.id ? { ...m, ...msg.data.media } : m));
              }
            } else if (msg.type === 'media:updated' && msg.data.eventId === selectedEventId) {
              // Background video re-encode landed — refresh that row in place.
              if (msg.data.media) {
                setMediaItems(prev => prev.map(m => m.id === msg.data.media.id ? { ...m, ...msg.data.media } : m));
              }
            } else if (msg.type === 'media:deleted' && msg.data.eventId === selectedEventId) {
              setMediaItems(prev => prev.filter(m => m.id !== msg.data.mediaId));
            } else if (msg.type === 'face-index-complete') {
              // Auto-refresh face profiles when background or manual indexing completes
              fetch(`/api/events/${selectedEventId}/face-profiles`)
                .then(r => r.json())
                .then(data => setFaceProfiles(data.profiles || []))
                .catch(() => {});
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

  /** Pulls the tiered-storage counters (local vs. archived) for the storage card. */
  const fetchArchiveStatus = async () => {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/events/${selectedEventId}/archive-status`);
      if (!res.ok) return;
      setArchiveStatus(await res.json());
    } catch { /* transient — the card just keeps the previous numbers */ }
  };

  const handleArchiveNow = async () => {
    if (!selectedEventId) return;
    setIsArchiving(true);
    try {
      const res = await fetch(`/api/events/${selectedEventId}/archive-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "خطا در انتقال فایل‌ها");
      if (data.moved > 0) toast.success(`${data.moved} فایل به درایو خارجی منتقل شد.`);
      else toast.info(data.reason || data.lastPass || "چیزی برای انتقال نبود.");
      await fetchArchiveStatus();
    } catch (err: any) {
      toast.error(err?.message || "انتقال انجام نشد.");
    } finally {
      setIsArchiving(false);
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
    
    setConfirmAction({
      message: "آیا از حذف این فایل مطمئن هستید؟ (این عمل غیرقابل برگشت است)",
      onConfirm: async () => {
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
      }
    });
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

  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const swipeStartX = useRef<number | null>(null);

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



  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-2xl bg-slate-900/80 rounded-3xl border border-slate-700/50 p-8 md:p-10 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white font-vazir">پنل مدیریت PartyIMG</h1>
              <p className="text-slate-400 mt-2 font-vazir">ورود به پنل ادمین برای مدیریت رویدادها</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2 font-vazir">نام کاربری</label>
                <input
                  id="username"
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all font-vazir"
                  placeholder="نام کاربری"
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2 font-vazir">رمز عبور</label>
                <input
                  id="password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all font-vazir"
                  placeholder="رمز عبور"
                  autoComplete="current-password"
                  required
                />
              </div>
              {authError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm font-vazir text-center animate-shake">
                  {authError}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    در حال ورود...
                  </>
                ) : (
                  <>
                    <LogOut className="w-5 h-5" />
                    ورود به پنل مدیریت
                  </>
                )}
              </button>
            </form>
            
            <div className="mt-8 text-center">
              <p className="text-slate-500 text-sm font-vazir">PartyIMG v2.0 • Wedding Album Platform</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans" dir="rtl">
      {/* Top Navigation */}
      <header className="backdrop-blur-2xl bg-slate-900/80 border-b border-slate-800/50 sticky top-0 z-40">
        <div className="max-w-full mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16 md:h-18">
            <div className="flex items-center gap-4">
              <button
                onClick={onBackToHome}
                className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700/50"
                aria-label="بازگشت به صفحه اصلی"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white font-vazir">پنل مدیریت</h1>
                  <p className="text-xs text-slate-400 font-vazir">PartyIMG Wedding Album Platform</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-xs font-mono text-slate-300">{wsConnected ? 'متصل' : 'قطع شده'}</span>
              </div>

              {/* Event Selector */}
              <div className="relative">
                <select
                  value={selectedEventId || ""}
                  onChange={(e) => setSelectedEventId(e.target.value || null)}
                  className="appearance-none bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent cursor-pointer min-w-[200px] font-vazir"
                >
                  <option value="">-- انتخاب رویداد --</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name} ({ev.id})</option>
                  ))}
                </select>
                <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-lg"
              >
                <Plus className="w-4 h-4" />
                رویداد جدید
              </button>

              <button
                onClick={handleLogout}
                className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700/50"
                aria-label="خروج از سیستم"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-full mx-auto px-4 md:px-6 py-6 pb-16">
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-400 font-vazir">در حال بارگذاری پنل مدیریت...</p>
            </div>
          </div>
        ) : !selectedEventId ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
              <Folder className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-white font-vazir mb-2">هیچ رویدادی انتخاب نشده</h2>
            <p className="text-slate-400 font-vazir mb-6">از منوی بالا یک رویداد را انتخاب کنید یا رویداد جدیدی بسازید</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-semibold rounded-xl transition-all cursor-pointer shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span className="font-vazir">ساختن رویداد جدید</span>
            </button>
          </div>
        ) : (
          <>
            {/* Event Header */}
            <div className="mb-6 animate-slide-up">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white font-vazir">{selectedEvent?.name || "بدون نام"}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-slate-400 text-sm font-vazir">
                    <span className="flex items-center gap-1"><FileText className="w-4 h-4" /> کد: <code className="font-mono text-amber-300">{selectedEventId}</code></span>
                    {selectedEvent?.hostName && <span className="flex items-center gap-1"><User className="w-4 h-4" /> میزبان: {selectedEvent.hostName}</span>}
                    {selectedEvent?.date && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {selectedEvent.date}</span>}
                    <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {analyticsData.totalGuests} مهمان</span>
                    <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> {mediaItems.length} رسانه</span>
                    <span className="flex items-center gap-1"><Download className="w-4 h-4" /> {analyticsData.totalStorage}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleNativeShare}
                    className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white transition-all cursor-pointer border border-slate-700/50 rounded-xl flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="font-vazir text-sm">اشتراک‌گذاری</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6 animate-slide-up">
              <div className="flex gap-1 bg-slate-900/50 rounded-2xl p-1 border border-slate-800/50 overflow-x-auto">
                {[
                  { id: "media", label: "رسانه‌ها", icon: Image, count: mediaItems.length },
                  { id: "analytics", label: "تحلیل‌ها", icon: BarChart },
                  { id: "faces", label: "شناسایی چهره", icon: User, badge: faceProfiles.length },
                  { id: "gifts", label: "هدیه‌ها", icon: Gift, badge: giftCounts.total },
                  { id: "sync", label: "همگام‌سازی", icon: RefreshCw },
                  { id: "settings", label: "تنظیمات", icon: Settings },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? "bg-white/10 text-white shadow-md"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="font-vazir">{tab.label}</span>
                    {(tab.count !== undefined || tab.badge !== undefined) && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-300 font-mono">
                        {tab.count !== undefined ? tab.count : tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm Action Modal */}
            {confirmAction && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full mx-4 animate-slide-up">
                  <p className="text-white font-vazir mb-6">{confirmAction.message}</p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setConfirmAction(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all font-vazir"
                    >
                      انصراف
                    </button>
                    <button
                      onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
                      className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl transition-all font-vazir"
                    >
                      تایید
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab Content */}
            <div className="animate-fade-in">
              {/* Media Tab */}
              {activeTab === "media" && (
                <div className="space-y-6">
                  {/* Media Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => setSelectMode(!selectMode)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          selectMode
                            ? "bg-red-500/20 text-red-300 border border-red-500/30"
                            : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/50"
                        }`}
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span className="font-vazir">{selectMode ? "انصراف انتخاب" : "حالت انتخاب"}</span>
                      </button>
                      {selectMode && (
                        <>
                          <button
                            onClick={selectAllVisibleMedia}
                            disabled={selectedIds.size === mediaItems.length}
                            className="px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all text-sm font-vazir border border-slate-700/50 disabled:opacity-50"
                          >
                            همه را انتخاب
                          </button>
                          <button
                            onClick={deselectAllMedia}
                            disabled={selectedIds.size === 0}
                            className="px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all text-sm font-vazir border border-slate-700/50 disabled:opacity-50"
                          >
                            لغو انتخاب
                          </button>
                          <button
                            onClick={handleDeleteSelectedMedia}
                            disabled={selectedIds.size === 0 || isBatchDeleting}
                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 rounded-xl transition-all text-sm font-vazir border border-red-500/30 disabled:opacity-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف انتخاب‌ها ({selectedIds.size})
                          </button>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        id="media-upload"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleMediaUpload}
                        className="hidden"
                      />
                      <label
                        htmlFor="media-upload"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-lg"
                      >
                        <Upload className="w-4 h-4" />
                        <span className="font-vazir">آپلود رسانه</span>
                      </label>
                    </div>
                  </div>

                  {/* Media Grid */}
                  {mediaItems.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                      <Image className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                      <h3 className="text-xl font-semibold text-slate-400 font-vazir mb-2">هنوز رسانه‌ای آپلود نشده</h3>
                      <p className="text-slate-500 font-vazir">دکمه «آپلود رسانه» را بزنید تا عکس یا ویدیو اضافه کنید</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                      {mediaItems.map((media) => (
                        <MediaCard
                          key={media.id}
                          media={media}
                          selected={selectedIds.has(media.id)}
                          selectMode={selectMode}
                          onToggleSelect={toggleSelectMedia}
                          onDelete={handleDeleteMedia}
                          onLike={handleLikeMedia}
                          isLiked={likedMedia.has(media.id)}
                          onOpenLightbox={() => setActiveLightboxIndex(mediaItems.findIndex(m => m.id === media.id))}
                          downloadMedia={handleDownload}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analytics Tab */}
              {activeTab === "analytics" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="مجموع مهمانان" value={analyticsData.totalGuests} icon={Users} color="blue" />
                    <StatCard title="مجموع رسانه" value={mediaItems.length} icon={Image} color="green" />
                    <StatCard title="فضای اشغال شده" value={analyticsData.totalStorage} icon={Download} color="amber" />
                    <StatCard title="پروفایل‌های چهره" value={faceProfiles.length} icon={User} color="purple" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ChartCard title="زمان‌بندی آپلودها">
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={analyticsData.timeline}>
                          <defs>
                            <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis dataKey="time" stroke="#6b7280" fontSize={11} tick={{ fill: '#9ca3af' }} />
                          <YAxis stroke="#6b7280" fontSize={11} tick={{ fill: '#9ca3af' }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} labelStyle={{ color: '#f3f4f6' }} />
                          <Area type="monotone" dataKey="uploads" stroke="#f59e0b" fillOpacity={1} fill="url(#colorUploads)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="بیشترین آپلودکنندگان">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={analyticsData.guestCounts} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                          <XAxis type="number" stroke="#6b7280" fontSize={11} tick={{ fill: '#9ca3af' }} />
                          <YAxis dataKey="name" type="category" width={120} stroke="#6b7280" fontSize={11} tick={{ fill: '#9ca3af' }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} labelStyle={{ color: '#f3f4f6' }} />
                          <Bar dataKey="uploads" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>
                </div>
              )}



              {/* Faces Tab */}
              {activeTab === "faces" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <h3 className="text-lg font-semibold text-white font-vazir">پروفایل‌های چهره شناسایی شده</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-400 font-vazir">تلrance:</label>
                        <input
                          type="range"
                          min="0.05"
                          max="0.7"
                          step="0.05"
                          value={faceTolerance}
                          onChange={(e) => setFaceTolerance(parseFloat(e.target.value))}
                          className="w-32 accent-amber-500"
                        />
                        <span className="text-sm font-mono text-amber-300 w-10">{faceTolerance.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={() => setShowVipModal(true)}
                        className="px-4 py-2 bg-teal-600/80 hover:bg-teal-500 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-2 border border-teal-500/30"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span className="font-vazir">آپلود عکس دسته‌جمعی / مرجع (مخفی)</span>
                      </button>
                      <button
                        onClick={handleSyncFaces}
                        disabled={isSyncingFaces}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${isSyncingFaces ? 'animate-spin' : ''}`} />
                        <span className="font-vazir">{isSyncingFaces ? 'در حال پردازش...' : 'شناسایی چهره'}</span>
                      </button>
                      <button
                        onClick={handleClearFaces}
                        disabled={isClearingFaces}
                        className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/50 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="font-vazir text-sm">پاک کردن شاخص</span>
                      </button>
                    </div>
                  </div>

                  {/* VIP Reference Face Modal */}
                  {showVipModal && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <h3 className="text-lg font-bold text-white font-vazir flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-teal-400" />
                            آپلود عکس دسته‌جمعی / چهره‌های مرجع
                          </h3>
                          <button onClick={() => setShowVipModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 font-vazir leading-relaxed">
                          عکس‌های دسته‌جمعی یا چهره‌هایی که آپلود می‌کنید برای شناسایی چهره دوستانتان استفاده شده و <strong className="text-amber-400">در آلبوم عمومی به مهمانان نشان داده نخواهد شد</strong>.
                        </p>
                        <form onSubmit={handleUploadVipFace} className="space-y-4 pt-2">
                          <div>
                            <label className="block text-xs text-slate-400 font-vazir mb-1">نام یا عنوان اولیه (اختیاری)</label>
                            <input
                              type="text"
                              value={vipName}
                              onChange={(e) => setVipName(e.target.value)}
                              placeholder="مثال: عکس دسته‌جمعی دوستان / علی"
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 font-vazir"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 font-vazir mb-1">انتخاب عکس دسته‌جمعی یا مرجع *</label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => setVipFile(e.target.files?.[0] || null)}
                              className="w-full text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 cursor-pointer focus:outline-none"
                              required
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => setShowVipModal(false)}
                              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-vazir"
                            >
                              انصراف
                            </button>
                            <button
                              type="submit"
                              disabled={isUploadingVip}
                              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm font-vazir flex items-center gap-2 disabled:opacity-50"
                            >
                              {isUploadingVip ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                              آپلود و شناسایی چهره‌ها
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {faceProfiles.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                      <User className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                      <h3 className="text-xl font-semibold text-slate-400 font-vazir mb-2">هیچ پروفایل چهره‌ای یافت نشد</h3>
                      <p className="text-slate-500 font-vazir mb-6">دکمه «شناسایی چهره» را بزنید تا تصاویر اسکن شوند</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {faceProfiles.map((profile) => (
                        <FaceProfileCard
                          key={profile.personId}
                          profile={profile}
                          editing={editingPersonId === profile.personId}
                          editName={editingName}
                          onEditNameChange={(val: string) => setEditingName(val)}
                          onEditClick={() => { setEditingPersonId(profile.personId); setEditingName(profile.displayName || `شخص ${profile.personId.slice(0,6)}`); }}
                          onSaveClick={() => handleRenamePerson(profile.personId, editingName)}
                          onCancelClick={() => { setEditingPersonId(null); setEditingName(""); }}
                          onDeleteClick={() => handleDeletePerson(profile.personId)}
                          onMergeClick={() => { if (selectedPeopleForMerge.includes(profile.personId)) { setSelectedPeopleForMerge(prev => prev.filter(id => id !== profile.personId)); } else { setSelectedPeopleForMerge(prev => [...prev, profile.personId]); } }}
                          isSelectedForMerge={selectedPeopleForMerge.includes(profile.personId)}
                          canMerge={selectedPeopleForMerge.length > 0 && selectedPeopleForMerge[0] !== profile.personId}
                          onMergeInto={() => handleMergePersons(selectedPeopleForMerge[0], [profile.personId])}
                        />
                      ))}
                    </div>
                  )}

                  {selectedPeopleForMerge.length > 0 && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                          <span className="text-amber-300 font-vazir">{selectedPeopleForMerge.length} پروفایل برای ادغام انتخاب شده</span>
                        </div>
                        <button
                          onClick={() => setSelectedPeopleForMerge([])}
                          className="px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all text-sm font-vazir border border-slate-700/50"
                        >
                          لغو
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Gifts Tab — private inbox, never exposed to guests */}
              {activeTab === "gifts" && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-amber-500/10 via-slate-900/50 to-slate-900/50 rounded-2xl border border-amber-500/20 p-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-4 h-4 text-amber-300" />
                      <h3 className="text-lg font-semibold text-white font-vazir">اطلاعات کارت هدیه</h3>
                    </div>
                    <p className="text-sm text-slate-400 font-vazir mb-6">
                      این اطلاعات در صفحه هدیه به مهمانان نشان داده می‌شود. رسیدهای ارسالی فقط در همین صفحه قابل مشاهده است.
                    </p>

                    <form onSubmit={saveGiftCard} className="space-y-4">
                      <label className="flex items-center justify-between bg-slate-900/60 rounded-xl border border-slate-800/60 px-4 py-3 cursor-pointer">
                        <span className="text-white font-vazir text-sm">نمایش صفحه هدیه برای مهمانان</span>
                        <input
                          type="checkbox"
                          checked={giftCard.enabled !== false}
                          onChange={(e) => setGiftCard((c: any) => ({ ...c, enabled: e.target.checked }))}
                          className="w-4 h-4 accent-amber-500"
                        />
                      </label>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { key: "title", label: "عنوان صفحه", placeholder: "هدیه به عروس و داماد" },
                          { key: "bankName", label: "نام بانک", placeholder: "بانک ..." },
                          { key: "cardNumber", label: "شماره کارت", placeholder: "6037 xxxx xxxx xxxx", mono: true },
                          { key: "iban", label: "شماره شبا", placeholder: "IR...", mono: true },
                          { key: "cardHolder", label: "نام صاحب کارت", placeholder: "نام و نام خانوادگی" },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-xs text-slate-400 font-vazir mb-1.5">{f.label}</label>
                            <input
                              type="text"
                              value={giftCard[f.key] || ""}
                              onChange={(e) => setGiftCard((c: any) => ({ ...c, [f.key]: e.target.value }))}
                              placeholder={f.placeholder}
                              dir={f.mono ? "ltr" : "rtl"}
                              className={`w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500/60 transition-colors ${f.mono ? "font-mono tracking-wider" : "font-vazir"}`}
                            />
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 font-vazir mb-1.5">
                          متن معرفی <span className="text-slate-500">(خط اول تیتر می‌شود — خالی بگذارید تا متن پیش‌فرض نمایش داده شود)</span>
                        </label>
                        <textarea
                          rows={7}
                          value={giftCard.intro || ""}
                          onChange={(e) => setGiftCard((c: any) => ({ ...c, intro: e.target.value }))}
                          placeholder="همین که خودتون تشریف آوردین برای ما هدیه بزرگیه 😀😀"
                          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-vazir outline-none focus:border-amber-500/60 resize-y leading-relaxed"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 font-vazir mb-1.5">یادداشت پایین کارت</label>
                        <input
                          type="text"
                          value={giftCard.note || ""}
                          onChange={(e) => setGiftCard((c: any) => ({ ...c, note: e.target.value }))}
                          className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-vazir outline-none focus:border-amber-500/60"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="submit"
                          disabled={giftSaving}
                          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-900 font-bold rounded-xl transition-all font-vazir text-sm flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          {giftSaving ? "در حال ذخیره..." : "ذخیره اطلاعات کارت"}
                        </button>
                        <a
                          href={`#/gift/${selectedEventId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2.5 bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-white rounded-xl transition-all font-vazir text-sm flex items-center gap-2 border border-slate-700/50"
                        >
                          <Eye className="w-4 h-4" />
                          مشاهده صفحه هدیه
                        </a>
                      </div>
                    </form>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-rose-300" />
                        <h3 className="text-lg font-semibold text-white font-vazir">رسیدهای دریافتی</h3>
                        {giftCounts.unseen > 0 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-rose-500/20 text-rose-300 font-mono">
                            {giftCounts.unseen} جدید
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => selectedEventId && fetchGiftData(selectedEventId)}
                        className="p-2 bg-slate-800/60 hover:bg-slate-700/60 rounded-xl text-slate-300 transition-all"
                        title="بازآوری"
                      >
                        <RefreshCw className={`w-4 h-4 ${giftLoading ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    {giftReceipts.length === 0 ? (
                      <div className="text-center py-14 text-slate-500">
                        <Gift className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-vazir text-sm">هنوز رسیدی ارسال نشده است.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {giftReceipts.map(r => (
                          <div
                            key={r.id}
                            className={`rounded-2xl border overflow-hidden transition-all ${
                              r.seen ? "border-slate-800/60 bg-slate-950/40" : "border-amber-500/40 bg-amber-500/5"
                            }`}
                          >
                            {r.imageUrl ? (
                              <button
                                type="button"
                                onClick={() => setGiftPreview(r)}
                                className="block w-full aspect-[4/3] bg-slate-900 overflow-hidden group"
                              >
                                <img
                                  src={r.imageUrl}
                                  alt={`رسید ${r.senderName}`}
                                  loading="lazy"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              </button>
                            ) : (
                              <div className="aspect-[4/3] bg-slate-900/60 flex items-center justify-center">
                                <MessageSquare className="w-8 h-8 text-slate-700" />
                              </div>
                            )}
                            <div className="p-4 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-white font-vazir truncate">{r.senderName}</span>
                                {r.amount && (
                                  <span className="text-[11px] font-mono text-amber-300 shrink-0">{r.amount}</span>
                                )}
                              </div>
                              {r.message && (
                                <p className="text-xs text-slate-300 font-vazir leading-relaxed line-clamp-3">{r.message}</p>
                              )}
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {r.timestamp ? new Date(r.timestamp).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : ""}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => toggleReceiptSeen(r)}
                                    title={r.seen ? "علامت‌گذاری به عنوان خوانده‌نشده" : "علامت‌گذاری به عنوان خوانده‌شده"}
                                    className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 transition-all"
                                  >
                                    {r.seen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => setConfirmAction({
                                      message: `رسید «${r.senderName}» حذف شود؟`,
                                      onConfirm: () => deleteReceipt(r),
                                    })}
                                    title="حذف"
                                    className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-300 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {giftPreview?.imageUrl && (
                    <div
                      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
                      onClick={() => setGiftPreview(null)}
                    >
                      <button
                        type="button"
                        onClick={() => setGiftPreview(null)}
                        className="absolute top-5 left-5 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white"
                        aria-label="بستن"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <div className="max-w-3xl w-full space-y-3" onClick={e => e.stopPropagation()}>
                        <img
                          src={giftPreview.imageUrl}
                          alt={`رسید ${giftPreview.senderName}`}
                          className="w-full max-h-[75vh] object-contain rounded-2xl border border-white/10"
                        />
                        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-bold text-white font-vazir">{giftPreview.senderName}</span>
                            {giftPreview.amount && <span className="text-xs font-mono text-amber-300">{giftPreview.amount}</span>}
                          </div>
                          {giftPreview.message && (
                            <p className="text-xs text-slate-300 font-vazir leading-relaxed">{giftPreview.message}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sync Tab */}
              {activeTab === "sync" && (
                <div className="space-y-6">
                  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <h3 className="text-lg font-semibold text-white font-vazir mb-6">تنظیمات همگام‌سازی محلی</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-vazir">فعال‌سازی همگام‌سازی محلی</p>
                          <p className="text-sm text-slate-400 font-vazir">ارسال خودکار فایل‌ها به سرور محلی</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={localSyncEnabled}
                            onChange={(e) => {
                              setLocalSyncEnabled(e.target.checked);
                              handleUpdateSyncSettings({ localSyncEnabled: e.target.checked });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>
                      
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">آدرس سرور محلی</label>
                        <input
                          type="text"
                          value={localSyncHost}
                          onChange={(e) => {
                            setLocalSyncHost(e.target.value);
                            handleUpdateSyncSettings({ localSyncHost: e.target.value });
                          }}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-mono text-sm"
                          placeholder="http://localhost:8080"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">دایرکتوری ذخیره‌سازی فعال</label>
                        <input
                          type="text"
                          value={activeSyncDir}
                          onChange={(e) => {
                            setActiveSyncDir(e.target.value);
                            handleUpdateSyncSettings({ saveDirectory: e.target.value });
                          }}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-mono text-sm"
                          placeholder="D:\\Wedding"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                          <HardDrive className="w-5 h-5 text-amber-300" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white font-vazir">ذخیره‌سازی دو مرحله‌ای</h3>
                          <p className="text-xs text-slate-400 font-vazir">
                            فایل‌ها اول روی دیسک داخلی ذخیره می‌شوند و در زمان بیکاری سیستم به درایو خارجی منتقل می‌شوند.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleArchiveNow}
                        disabled={isArchiving || !archiveStatus?.enabled}
                        className="px-4 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700/50 flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${isArchiving ? "animate-spin" : ""}`} />
                        <span className="font-vazir text-sm">{isArchiving ? "در حال انتقال..." : "انتقال همین حالا"}</span>
                      </button>
                    </div>

                    {!archiveStatus ? (
                      <p className="text-sm text-slate-500 font-vazir">در حال دریافت وضعیت...</p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                            <p className="text-[11px] text-slate-400 font-vazir mb-1">کل فایل‌ها</p>
                            <p className="text-xl font-bold text-white">{archiveStatus.total}</p>
                          </div>
                          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                            <p className="text-[11px] text-slate-400 font-vazir mb-1">روی دیسک داخلی</p>
                            <p className="text-xl font-bold text-amber-300">{archiveStatus.pending}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{formatBytes(archiveStatus.pendingBytes)}</p>
                          </div>
                          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                            <p className="text-[11px] text-slate-400 font-vazir mb-1">منتقل‌شده</p>
                            <p className="text-xl font-bold text-emerald-300">{archiveStatus.archived}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{formatBytes(archiveStatus.archivedBytes)}</p>
                          </div>
                          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
                            <p className="text-[11px] text-slate-400 font-vazir mb-1">بار پردازنده</p>
                            <p className="text-xl font-bold text-white flex items-center gap-1">
                              <Cpu className="w-4 h-4 text-slate-400" />
                              {archiveStatus.cpuBusyPercent}%
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs font-vazir">
                          <span className={`px-2.5 py-1 rounded-full border ${archiveStatus.enabled ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-slate-700/30 text-slate-400 border-slate-600/40"}`}>
                            {archiveStatus.enabled ? "آرشیو فعال" : "آرشیو خاموش"}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full border ${archiveStatus.archiveMounted ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-rose-500/10 text-rose-300 border-rose-500/30"}`}>
                            {archiveStatus.archiveMounted ? "درایو خارجی متصل است" : "درایو خارجی متصل نیست"}
                          </span>
                          <span className={`px-2.5 py-1 rounded-full border ${archiveStatus.idle ? "bg-sky-500/10 text-sky-300 border-sky-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"}`}>
                            {archiveStatus.idle ? "سیستم بیکار است" : `مشغول: ${archiveStatus.idleReason}`}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 font-mono break-all space-y-1">
                          <p>مسیر اول: {archiveStatus.primaryRoot || "—"}</p>
                          <p>مسیر آرشیو: {archiveStatus.archiveRoot}</p>
                          <p>آخرین اجرا: {archiveStatus.lastPass}</p>
                        </div>

                        {!archiveStatus.archiveMounted && archiveStatus.enabled && (
                          <p className="text-xs text-rose-300/90 font-vazir leading-relaxed">
                            تا وقتی درایو خارجی وصل نشده، همه فایل‌ها سالم روی دیسک داخلی می‌مانند و به‌محض اتصال، خودکار منتقل می‌شوند.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <h3 className="text-lg font-semibold text-white font-vazir mb-4">کد QR مستقل مهمان</h3>
                    <p className="text-slate-400 font-vazir mb-6">این کد QR مستقیماً به صفحه آپلود مهمان‌ها اشاره دارد (بدون واسطه لندینگ).</p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                      <div className="p-4 bg-white rounded-xl">
                        {qrCodeDataUrl ? (
                          <img src={qrCodeDataUrl} alt="Guest QR Code" className="w-64 h-64" />
                        ) : (
                          <div className="w-64 h-64 flex items-center justify-center bg-slate-200 text-slate-400 font-vazir">در حال تولید...</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={downloadStandaloneQR}
                          className="px-6 py-3 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-semibold rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-2"
                        >
                          <Download className="w-5 h-5" />
                          <span className="font-vazir">دانلود کد QR</span>
                        </button>
                        <button
                          onClick={copyGuestLink}
                          className="px-6 py-3 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer border border-slate-700/50 flex items-center gap-2"
                        >
                          <Clipboard className="w-5 h-5" />
                          <span className="font-vazir">{copiedLink ? 'کپی شد!' : 'کپی لینک مهمان'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <h3 className="text-lg font-semibold text-white font-vazir mb-6">تنظیمات رویداد</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">نام رویداد</label>
                        <input
                          type="text"
                          value={selectedEvent?.name || ""}
                          onChange={(e) => handleUpdateSyncSettings({ name: e.target.value })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">نام میزبان</label>
                        <input
                          type="text"
                          value={selectedEvent?.hostName || ""}
                          onChange={(e) => handleUpdateSyncSettings({ hostName: e.target.value })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">تاریخ رویداد</label>
                        <input
                          type="text"
                          value={selectedEvent?.date || ""}
                          onChange={(e) => handleUpdateSyncSettings({ date: e.target.value })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">آدرس مهمان سفارشی</label>
                        <div className="flex gap-2">
                          <span className="flex items-center px-4 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-400 font-mono">http://192.168.70.32:80/</span>
                          <input
                            type="text"
                            value={customGuestAddress}
                            onChange={(e) => setCustomGuestAddress(e.target.value)}
                            className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                            placeholder="custom-name"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm text-slate-400 font-vazir mb-1">توضیحات رویداد</label>
                        <textarea
                          value={selectedEvent?.description || ""}
                          onChange={(e) => handleUpdateSyncSettings({ description: e.target.value })}
                          rows={3}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">حد عکس (0 = نامحدود)</label>
                        <input
                          type="number"
                          value={selectedEvent?.imageLimit || 0}
                          onChange={(e) => handleUpdateSyncSettings({ imageLimit: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-slate-400 font-vazir mb-1">حد ویدیو (0 = نامحدود)</label>
                        <input
                          type="number"
                          value={selectedEvent?.videoLimit || 0}
                          onChange={(e) => handleUpdateSyncSettings({ videoLimit: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                          min="0"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm text-slate-400 font-vazir mb-1">سبک نمایش</label>
                        <select
                          value={selectedEvent?.revealStyle || "instant"}
                          onChange={(e) => handleUpdateSyncSettings({ revealStyle: e.target.value })}
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                        >
                          <option value="instant">فوری (Instant)</option>
                          <option value="delay">با تاخیر (Delay)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <h3 className="text-lg font-semibold text-white font-vazir mb-6">عملیات خطرناک</h3>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <button
                        onClick={() => handleDeleteEvent(selectedEventId!)}
                        className="flex-1 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 rounded-xl transition-all cursor-pointer border border-red-500/30 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-5 h-5" />
                        <span className="font-vazir font-semibold">حذف رویداد و تمام داده‌ها</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}



        {/* Create Event Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-900 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
              <div className="flex items-center justify-between p-6 border-b border-slate-700">
                <h2 className="text-xl font-bold text-white font-vazir">ایجاد رویداد جدید</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateEvent} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm text-slate-400 font-vazir mb-1">کد رویداد *</label>
                  <input
                    type="text"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ""))}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-mono"
                    placeholder="my-wedding-2024"
                    required
                    maxLength={50}
                  />
                  <p className="text-xs text-slate-500 font-vazir mt-1">فقط حروف انگلیسی، اعداد و خط تیره (برای لینک کوتاه)</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 font-vazir mb-1">نام رویداد *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                    placeholder="مراسم عروسی فاطمه و حمید"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 font-vazir mb-1">نام میزبان</label>
                  <input
                    type="text"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                    placeholder="فاطمه و حمید"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 font-vazir mb-1">توضیحات</label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir resize-none"
                    placeholder="توضیحات برای مهمانان..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 font-vazir mb-1">سبک نمایش</label>
                    <select
                      value={formReveal}
                      onChange={(e) => setFormReveal(e.target.value as "instant" | "delay")}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                    >
                      <option value="instant">فوری</option>
                      <option value="delay">با تاخیر</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 font-vazir mb-1">مدت ماکس ویدیو (ثانیه)</label>
                    <input
                      type="number"
                      value={formMaxDuration}
                      onChange={(e) => setFormMaxDuration(parseInt(e.target.value) || 30)}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                      min="5"
                      max="300"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 font-vazir mb-1">حد عکس (۰ = نامحدود)</label>
                    <input
                      type="number"
                      value={formImgLimit}
                      onChange={(e) => setFormImgLimit(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 font-vazir mb-1">حد ویدیو (۰ = نامحدود)</label>
                    <input
                      type="number"
                      value={formVidLimit}
                      onChange={(e) => setFormVidLimit(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-vazir"
                      min="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 font-vazir mb-1">دایرکتوری ذخیره‌سازی</label>
                  <input
                    type="text"
                    value={formSaveDir}
                    onChange={(e) => setFormSaveDir(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent font-mono text-sm"
                    placeholder="D:\\Wedding"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-6 py-3 bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-xl transition-all font-vazir font-semibold border border-slate-700/50"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white rounded-xl transition-all font-vazir font-semibold shadow-lg"
                  >
                    ایجاد رویداد
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lightbox */}
        {activeLightboxIndex !== null && mediaItems[activeLightboxIndex] && (
          <MediaLightbox
            media={mediaItems[activeLightboxIndex]}
            onClose={() => setActiveLightboxIndex(null)}
            onNavigate={navigateLightbox}
            onDownload={handleDownload}
            onLike={handleLikeMedia}
            isLiked={likedMedia.has(mediaItems[activeLightboxIndex].id)}
            index={activeLightboxIndex}
            total={mediaItems.length}
          />
        )}
      </main>
    </div>
  );
}

// ─── Helper Components ─────────────────────────────────────────────

const MediaCard = React.memo(function MediaCard({ 
  media, selected, selectMode, onToggleSelect, onDelete, onLike, isLiked, onOpenLightbox, downloadMedia 
}: any) {
  const isVideo = media.type === 'video';
  const thumbUrl = media.thumbnailUrl || media.url;
  
  return (
    <div className={`relative group bg-slate-900/50 rounded-2xl overflow-hidden border transition-all cursor-pointer ${selectMode ? 'select-none' : ''} ${selected ? 'ring-2 ring-amber-400 scale-[0.98]' : 'border-slate-800/50 hover:border-amber-500/30'}`}>
      <div className="aspect-square relative overflow-hidden">
        {isVideo ? (
          <video
            src={thumbUrl}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            muted
            preload="metadata"
          />
        ) : (
          <img
            src={thumbUrl}
            alt={media.guestName}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="w-12 h-12 text-white/90 drop-shadow-lg" />
          </div>
        )}
        {selectMode && (
          <div className="absolute top-2 right-2 z-10">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              selected ? 'bg-amber-400 border-amber-400' : 'bg-black/50 border-white/30'
            }`}>
              {selected && <Check className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onLike(media.id); }}
            className={`p-2 rounded-xl backdrop-blur-sm transition-all ${isLiked ? 'bg-rose-500 text-white' : 'bg-black/50 text-white/80 hover:bg-white/10'}`}
            aria-label={isLiked ? "لایک شده" : "لایک"}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenLightbox(); }}
            className="p-2 rounded-xl bg-black/50 text-white/80 hover:bg-white/10 backdrop-blur-sm transition-all"
            aria-label="مشاهده تمام صفحه"
          >
            <Eye className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium font-vazir truncate">{media.guestName || "مهمان ناشناس"}</p>
            <p className="text-xs text-slate-400 font-vazir truncate">{new Date(media.timestamp).toLocaleString('fa-IR')}</p>
          </div>
          {!selectMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(media.id); }}
              className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 transition-all opacity-0 group-hover:opacity-100"
              aria-label="حذف"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

const MediaLightbox = ({ media, onClose, onNavigate, onDownload, onLike, isLiked, index, total }: any) => {
  const isVideo = media.type === 'video';
  
  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="relative w-full h-full max-w-6xl max-h-[90vh] p-2 md:p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 text-white/70 hover:text-white transition-all">
              <X className="w-6 h-6" />
            </button>
            <span className="text-white font-vazir text-sm">{index + 1} / {total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onLike(media.id); }}
              className={`p-2 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 transition-all ${isLiked ? 'text-rose-400' : 'text-white/70 hover:text-white'}`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(media.url, `${media.guestName || 'media'}.${isVideo ? 'mp4' : 'jpg'}`); }}
              className="p-2 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 text-white/70 hover:text-white transition-all"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="relative aspect-video max-h-[75vh] flex items-center justify-center">
          {isVideo ? (
            <video
              src={media.url}
              controls
              className="max-w-full max-h-full rounded-xl shadow-2xl"
              autoPlay
            />
          ) : (
            <img
              src={media.url}
              alt={media.guestName}
              className="max-w-full max-h-full rounded-xl shadow-2xl"
            />
          )}
        </div>
        
        <div className="mt-4 p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center">
              <span className="text-white font-bold font-vazir">{media.guestName?.[0] || "?"}</span>
            </div>
            <div>
              <p className="text-white font-medium font-vazir">{media.guestName || "مهمان ناشناس"}</p>
              <p className="text-slate-400 text-sm font-vazir">{new Date(media.timestamp).toLocaleString('fa-IR')}</p>
            </div>
          </div>
        </div>
        
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
            disabled={index === 0}
            className="p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 text-white/70 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
            disabled={index === total - 1}
            className="p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 text-white/70 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => {
  const colors = {
    blue: "from-blue-500 to-blue-600",
    green: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-amber-600",
    purple: "from-violet-500 to-violet-600",
  };
  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm font-vazir">{title}</p>
          <p className="text-3xl font-bold text-white font-vazir mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};

const ChartCard = ({ title, children }: any) => (
  <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
    <h3 className="text-lg font-semibold text-white font-vazir mb-4">{title}</h3>
    <div className="h-72">{children}</div>
  </div>
);

const FaceProfileCard = ({ 
  profile, editing, editName, onEditNameChange, onEditClick, onSaveClick, onCancelClick, onDeleteClick, onMergeClick, onMergeInto, isSelectedForMerge, canMerge 
}: any) => {
  const faceCount = profile.faceCount || 0;
  const displayName = profile.displayName || `شخص ${profile.personId.slice(0,6)}`;
  const avatarSrc = profile.representativeImage || profile.avatarUrl;
  
  return (
    <div className={`bg-slate-900/50 rounded-2xl border overflow-hidden transition-all ${isSelectedForMerge ? 'ring-2 ring-amber-400 bg-amber-500/10' : 'border-slate-800/50 hover:border-amber-500/30'}`}>
      <div className="aspect-square relative overflow-hidden bg-slate-800 flex items-center justify-center group/card">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <User className="w-12 h-12 text-slate-600" />
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {!editing && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditClick(); }}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-amber-500 text-white transition-all shadow-md cursor-pointer"
              title="ویرایش نام"
            >
              <Edit className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteClick(); }}
            className="p-1.5 rounded-lg bg-red-500/30 hover:bg-red-500 text-red-100 transition-all shadow-md cursor-pointer"
            title="حذف پروفایل"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {canMerge && !isSelectedForMerge && (
          <button
            onClick={(e) => { e.stopPropagation(); onMergeInto(); }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-white text-xs font-vazir rounded-full transition-all shadow-lg"
          >
            ادغام در انتخاب شده
          </button>
        )}
      </div>
      <div className="p-4">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveClick();
                if (e.key === 'Escape') onCancelClick();
              }}
              autoFocus
              placeholder="نام شخص..."
              className="flex-1 bg-slate-800 border border-amber-500/60 rounded-xl px-3 py-1.5 text-white text-sm font-vazir focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button onClick={(e) => { e.stopPropagation(); onSaveClick(); }} className="p-2 rounded-xl bg-green-500/30 hover:bg-green-500/50 text-green-200 transition-all cursor-pointer shrink-0" title="ذخیره"><Check className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); onCancelClick(); }} className="p-2 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 transition-all cursor-pointer shrink-0" title="انصراف"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div>
            <div 
              onClick={onEditClick}
              className="flex items-center justify-between group/title cursor-pointer py-0.5 mb-1"
              title="برای تغییر نام کلیک کنید"
            >
              <h4 className="text-white font-bold font-vazir truncate text-base group-hover/title:text-amber-400 transition-colors">
                {displayName}
              </h4>
              <Edit className="w-3.5 h-3.5 text-slate-500 group-hover/title:text-amber-400 transition-colors shrink-0" />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-vazir">
              <span>{faceCount} تصویر مرتبط</span>
              <button
                onClick={(e) => { e.stopPropagation(); onMergeClick(); }}
                className={`px-2.5 py-0.5 rounded-full text-xs transition-all ${isSelectedForMerge ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50 font-bold' : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/50'}`}
              >
                {isSelectedForMerge ? '✓ انتخاب شده' : 'ادغام'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};