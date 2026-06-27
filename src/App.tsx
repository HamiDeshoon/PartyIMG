import { useState, useEffect, FormEvent, lazy, Suspense } from "react";
import { Camera, Settings, Plus, ArrowRight, Sparkles, Folder, Heart, Video, Images } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Toaster } from "sonner";

const AdminPanel = lazy(() => import("./components/AdminPanel"));
const GuestPanel = lazy(() => import("./components/GuestPanel"));
const LiveAlbum = lazy(() => import("./components/LiveAlbum"));

interface AppRoute {
  panel: "hub" | "admin" | "guest" | "live";
  guestEventId?: string;
}

function EventCardSkeleton() {
  return (
    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col space-y-5 animate-pulse">
      <div className="space-y-1">
        <div className="h-5 w-32 bg-white/20 rounded-lg" />
      </div>
      <div className="space-y-4 pt-2">
        <div className="flex gap-2.5">
          <div className="flex-1 h-12 bg-black/40 rounded-xl" />
          <div className="h-12 w-20 bg-white/20 rounded-xl" />
        </div>
        <div className="pt-2">
          <div className="h-3 w-24 bg-white/10 rounded mb-2" />
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-16 bg-white/10 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>({ panel: "hub" });
  const [joinCode, setJoinCode] = useState("");
  const [sampleEvents, setSampleEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const parseHashRoute = () => {
    const hash = window.location.hash || "";
    if (hash === "" || hash === "#/") {
      setRoute({ panel: "hub" });
    } else if (hash === "#/admin" || hash.startsWith("#/admin")) {
      setRoute({ panel: "admin" });
    } else if (hash.startsWith("#/live/")) {
      const parts = hash.split("/");
      const eventId = parts[2];
      if (eventId) {
        setRoute({ panel: "live", guestEventId: eventId.toLowerCase().trim() });
      } else {
        setRoute({ panel: "hub" });
      }
    } else if (hash.startsWith("#/guest/")) {
      const parts = hash.split("/");
      const eventId = parts[2];
      if (eventId) {
        setRoute({ panel: "guest", guestEventId: eventId.toLowerCase().trim() });
      } else {
        setRoute({ panel: "hub" });
      }
    } else {
      setRoute({ panel: "hub" });
    }
  };

  useEffect(() => {
    parseHashRoute();
    window.addEventListener("hashchange", parseHashRoute);

    const savedCode = localStorage.getItem("lastJoinCode");
    if (savedCode) {
      setJoinCode(savedCode);
    }

    setEventsLoading(true);
    fetch("/api/events")
      .then(res => res.json())
      .then(data => setSampleEvents(data))
      .catch(e => console.error(e))
      .finally(() => setEventsLoading(false));

    return () => {
      window.removeEventListener("hashchange", parseHashRoute);
    };
  }, []);

  const navigateTo = (panel: "hub" | "admin" | "guest" | "live", guestId?: string) => {
    if (panel === "hub") {
      window.location.hash = "/";
    } else if (panel === "admin") {
      window.location.hash = "/admin";
    } else if (panel === "live" && guestId) {
      window.location.hash = `/live/${guestId}`;
    } else if (panel === "guest" && guestId) {
      window.location.hash = `/guest/${guestId}`;
    }
  };

  const handleJoinByCode = (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const cleanedCode = joinCode.toLowerCase().trim().replace(/[^a-z0-9\-]/g, "");
    localStorage.setItem("lastJoinCode", cleanedCode);
    navigateTo("guest", cleanedCode);
  };

  return (
    <div className="font-sans min-h-screen bg-[#2a1c22] text-slate-150 flex flex-col relative overflow-hidden select-none" id="app_frame" dir="rtl">
      <Toaster position="top-center" theme="dark" richColors />

      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-rose-600/15 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-600/15 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s' }} />
        <div className="absolute top-[20%] right-[10%] w-[35%] h-[35%] bg-rose-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute bottom-[30%] left-[5%] w-[25%] h-[25%] bg-amber-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDuration: '14s' }} />
      </div>

      <AnimatePresence mode="wait">
        {route.panel === "admin" && (
          <motion.div
            key="admin"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="z-10 flex-1 flex flex-col"
          >
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/50">در حال بارگذاری...</div>}>
              <AdminPanel onBackToHome={() => navigateTo("hub")} />
            </Suspense>
          </motion.div>
        )}

        {route.panel === "guest" && route.guestEventId && (
          <motion.div
            key="guest"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="z-10 flex-1 flex flex-col"
          >
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/50">در حال بارگذاری...</div>}>
              <GuestPanel eventId={route.guestEventId} onBackToHome={() => navigateTo("hub")} />
            </Suspense>
          </motion.div>
        )}

        {route.panel === "live" && route.guestEventId && (
          <motion.div
            key="live"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="z-10 flex-1 flex flex-col"
          >
            <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/50">در حال بارگذاری...</div>}>
              <LiveAlbum eventId={route.guestEventId} onBackToHome={() => navigateTo("hub")} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {route.panel === "hub" && (
        <div className="min-h-[100dvh] flex flex-col justify-between z-10" id="hub_viewport">
          <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 max-w-4xl mx-auto w-full space-y-8 z-10">
            <div className="text-center space-y-6 max-w-xl flex flex-col items-center w-full">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full max-w-[280px] sm:max-w-sm mx-auto relative mb-4"
              >
                <div className="relative rounded-[2rem] overflow-hidden border-[2px] border-white/15 shadow-2xl aspect-[3/4] bg-black/40 group animate-glow-pulse">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#2a1c22] via-transparent to-transparent z-10 opacity-60" />
                  <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 to-transparent z-10" />
                  <img
                    src="/couple.jpg"
                    alt="Bride and Groom"
                    className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop";
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#2a1c22] to-transparent pointer-events-none z-20" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
                className="flex flex-col items-center gap-4"
              >
                <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-tr from-rose-600 to-amber-500 p-[2px] shadow-xl shadow-rose-500/20">
                  <div className="w-full h-full bg-[#2a1c22] rounded-[22px] flex items-center justify-center">
                    <Camera className="w-7 h-7 text-rose-300 drop-shadow-md" strokeWidth={1.5} />
                  </div>
                </div>

                <h1 className="text-4xl font-cinzel font-bold tracking-[0.2em] text-white mb-1 uppercase text-center">
                  Shot<span className="text-rose-500 font-extrabold bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">Box</span>
                </h1>

                <div className="text-center space-y-3 mt-1 border-t border-white/10 pt-4 w-full">
                  <h2 className="text-5xl font-charming text-transparent bg-clip-text bg-gradient-to-r from-orange-200 via-rose-300 to-amber-200 tracking-wide font-normal py-1 select-none leading-none">
                    Fatemeh & Hamid
                  </h2>
                  <p className="text-xs text-slate-300 font-serif italic tracking-wider opacity-85 leading-relaxed font-normal max-w-sm mx-auto px-4 select-none">
                    "Una mattina mi sono svegliato, o bella ciao, bella ciao, bella ciao ciao ciao..."
                  </p>
                </div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
              className="w-full grid grid-cols-1 md:grid-cols-3 gap-4"
              id="hub_cards_grid"
            >
              {eventsLoading ? (
                <EventCardSkeleton />
              ) : (
                <>
                  {/* Card 1: Join as guest photographer */}
                  <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-5 shadow-2xl flex flex-col space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-white flex items-center gap-2">
                        <Camera className="w-4 h-4 text-rose-400" />
                        عکاسی مهمان
                      </h3>
                    </div>

                    <form onSubmit={handleJoinByCode} className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          className="flex-1 bg-black/50 border border-white/20 rounded-xl py-2.5 px-3 focus:outline-hidden focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500/50 text-white font-mono text-xs uppercase placeholder-slate-500 transition-all text-left shadow-inner shadow-black/20"
                          placeholder="کد رویداد"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value)}
                          dir="ltr"
                        />
                        <button
                          type="submit"
                          className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 active:scale-95 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center cursor-pointer shadow-md shrink-0"
                        >
                          ورود
                          <ArrowRight className="w-3.5 h-3.5 mr-1.5 rtl:-scale-x-100" />
                        </button>
                      </div>

                      <motion.button
                        type="button"
                        onClick={() => navigateTo("guest", "fatemeh-hamid")}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-gradient-to-r from-rose-600/20 to-amber-600/20 hover:from-rose-600/35 hover:to-amber-600/35 border border-rose-500/30 hover:border-rose-400 text-rose-300 hover:text-white font-medium py-2 px-3 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-inner"
                      >
                        <Heart className="w-3.5 h-3.5 text-rose-400 animate-heart-beat" />
                        ورود به مراسم فاطمه و حمید
                      </motion.button>
                    </form>
                  </div>

                  {/* Card 2: Live Album - NEW */}
                  <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-5 shadow-2xl flex flex-col space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-white flex items-center gap-2">
                        <Images className="w-4 h-4 text-emerald-400" />
                        آلبوم زنده
                      </h3>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        مشاهده و دانلود عکس‌های مراسم در نمای گالری
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      onClick={() => navigateTo("live", "fatemeh-hamid")}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/35 hover:to-teal-600/35 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 hover:text-white font-medium py-2.5 px-4 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-inner"
                    >
                      <Images className="w-4 h-4 text-emerald-400" />
                      مشاهده آلبوم زنده
                    </motion.button>
                  </div>

                  {/* Card 3: Admin */}
                  <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-5 shadow-2xl flex flex-col space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-white flex items-center gap-2">
                        <Settings className="w-4 h-4 text-slate-400" />
                        مدیریت
                      </h3>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        پنل مدیریت رویداد و تنظیمات
                      </p>
                    </div>
                    <motion.button
                      onClick={() => navigateTo("admin")}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full bg-white/15 hover:bg-white/25 border border-white/15 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      ورود به پنل میزبان
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </main>

          <footer className="py-6 border-t border-white/10 backdrop-blur-md bg-black/20 text-center text-[10px] text-slate-450 select-none font-sans shrink-0">
            سیستم ثبت تصاویر مهمانان • امن، سریع و زیبا در مرورگر شما
          </footer>
        </div>
      )}
    </div>
  );
}
