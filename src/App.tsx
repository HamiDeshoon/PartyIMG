import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Toaster } from "sonner";
import { Camera, Images, Settings, Heart, Loader } from "lucide-react";

const AdminPanel = lazy(() => import("./components/AdminPanel"));
const GuestPanel = lazy(() => import("./components/GuestPanel"));
const LiveAlbum  = lazy(() => import("./components/LiveAlbum"));

interface AppRoute {
  panel: "hub" | "admin" | "guest" | "live";
  guestEventId?: string;
}

const panelVariants = {
  initial: { opacity: 0, scale: 0.97, y: 16 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.97, y: -16 },
};

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#2a1c22] flex items-center justify-center z-50">
      <Loader className="w-8 h-8 text-rose-400 animate-spin" strokeWidth={1.5} />
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>({ panel: "hub" });

  const parseHashRoute = () => {
    const hash = window.location.hash || "";
    if (hash === "" || hash === "#/") {
      setRoute({ panel: "hub" });
    } else if (hash.startsWith("#/admin")) {
      setRoute({ panel: "admin" });
    } else if (hash.startsWith("#/live/")) {
      const eventId = hash.split("/")[2];
      setRoute(eventId ? { panel: "live", guestEventId: eventId.toLowerCase().trim() } : { panel: "hub" });
    } else if (hash.startsWith("#/guest/")) {
      const eventId = hash.split("/")[2];
      setRoute(eventId ? { panel: "guest", guestEventId: eventId.toLowerCase().trim() } : { panel: "hub" });
    } else {
      setRoute({ panel: "hub" });
    }
  };

  useEffect(() => {
    parseHashRoute();
    window.addEventListener("hashchange", parseHashRoute);
    return () => window.removeEventListener("hashchange", parseHashRoute);
  }, []);

  const navigateTo = (panel: "hub" | "admin" | "guest" | "live", guestId?: string) => {
    if (panel === "hub")               window.location.hash = "/";
    else if (panel === "admin")        window.location.hash = "/admin";
    else if (panel === "live"  && guestId) window.location.hash = `/live/${guestId}`;
    else if (panel === "guest" && guestId) window.location.hash = `/guest/${guestId}`;
  };

  return (
    <div
      className="font-sans min-h-screen bg-[#2a1c22] text-white flex flex-col relative overflow-hidden select-none"
      id="app_frame"
      dir="rtl"
    >
      <Toaster position="top-center" theme="dark" richColors />

      {/* Ambient background orbs */}
      <div className="orb orb-rose" aria-hidden="true" />
      <div className="orb orb-amber" aria-hidden="true" />
      <div className="orb orb-rose-sm" aria-hidden="true" />

      <AnimatePresence mode="wait">
        {route.panel === "admin" && (
          <motion.div key="admin" variants={panelVariants} initial="initial" animate="animate" exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }} className="z-10 flex-1 flex flex-col">
            <Suspense fallback={<LoadingScreen />}>
              <AdminPanel onBackToHome={() => navigateTo("hub")} />
            </Suspense>
          </motion.div>
        )}

        {route.panel === "guest" && route.guestEventId && (
          <motion.div key="guest" variants={panelVariants} initial="initial" animate="animate" exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }} className="z-10 flex-1 flex flex-col">
            <Suspense fallback={<LoadingScreen />}>
              <GuestPanel eventId={route.guestEventId} onBackToHome={() => navigateTo("hub")} />
            </Suspense>
          </motion.div>
        )}

        {route.panel === "live" && route.guestEventId && (
          <motion.div key="live" variants={panelVariants} initial="initial" animate="animate" exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }} className="z-10 flex-1 flex flex-col">
            <Suspense fallback={<LoadingScreen />}>
              <LiveAlbum eventId={route.guestEventId} onBackToHome={() => navigateTo("hub")} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUB */}
      {route.panel === "hub" && (
        <div className="min-h-[100dvh] flex flex-col z-10" id="hub_viewport">
          <main className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-lg mx-auto w-full gap-8">

            {/* ─── POLAROID HERO ─── */}
            <motion.div
              initial={{ opacity: 0, y: 30, rotate: -9 }}
              animate={{ opacity: 1, y: 0, rotate: -3 }}
              transition={{ duration: 0.85, type: "spring", stiffness: 180, damping: 18 }}
              whileHover={{ rotate: 0, scale: 1.04 }}
              className="relative cursor-default"
              style={{ maxWidth: "200px" }}
              id="hub_hero_polaroid"
            >
              {/* Tape */}
              <div className="polaroid-tape" aria-hidden="true" />
              {/* Frame */}
              <div className="polaroid group">
                <div className="relative overflow-hidden bg-black/40" style={{ aspectRatio: "3/4" }}>
                  <img
                    src="/couple.jpg"
                    alt="Bride and Groom — Fatemeh & Hamid"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src =
                        "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
                </div>
                <div className="polaroid-caption">
                  <span className="font-cursive text-slate-400 text-2xl tracking-wide leading-none">
                    Fatemeh &amp; Hamid
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ─── BRAND TITLE ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.55, ease: "easeOut" }}
              className="text-center space-y-2"
            >
              <div className="flex items-center justify-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 p-px shadow-lg shadow-rose-500/25">
                  <div className="w-full h-full bg-[#2a1c22] rounded-[11px] flex items-center justify-center">
                    <Camera className="w-5 h-5 text-rose-300" strokeWidth={1.5} />
                  </div>
                </div>
                <h1 className="font-display text-4xl font-bold tracking-[0.18em] uppercase">
                  Shot<span className="bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent font-extrabold">Box</span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 font-sans tracking-wide">
                ثبت لحظات مراسم • سریع، امن و زیبا
              </p>
            </motion.div>

            {/* ─── ACTION CARDS ─── */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.55, ease: "easeOut" }}
              className="w-full grid grid-cols-1 gap-4"
              id="hub_cards_grid"
            >
              {/* Card 1 — Guest Photography (ShotBox Core Action) */}
              <div 
                role="button"
                tabIndex={0}
                id="hub_guest_card"
                aria-label="ورود به عکاسی مهمان مراسم فاطمه و حمید"
                onClick={() => navigateTo("guest", "fatemeh-hamid")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateTo("guest", "fatemeh-hamid");
                  }
                }}
                className="card-shotbox rounded-3xl p-6 relative overflow-hidden group cursor-pointer border backdrop-blur-2xl"
              >
                {/* Background Glow Mesh */}
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/15 via-amber-500/5 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                {/* Top Badge Bar */}
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                    مراسم فعال · عکاسی مهمان
                  </span>
                  <span className="text-[10px] text-amber-300/80 font-mono tracking-wider">
                    فاطمه & حمید
                  </span>
                </div>

                {/* Main Card Content */}
                <div className="flex items-center gap-4 mb-5 relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/30 to-amber-500/20 flex items-center justify-center border border-rose-500/40 shadow-xl shadow-rose-500/25 group-hover:scale-105 transition-transform duration-300">
                    <Camera className="w-7 h-7 text-rose-300 group-hover:text-amber-200 transition-colors" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-bold text-white tracking-wide">دوربین عکاسی مهمان</h2>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">ثبت سریع عکس و ویدیو با فیلترهای نوستالژیک بدون نیاز به نصب برنامه</p>
                  </div>
                </div>

                {/* Action CTA Button */}
                <motion.button
                  type="button"
                  id="hub_enter_ceremony_btn"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full btn-gradient py-3.5 px-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-2xl shadow-rose-600/35 relative z-10"
                  aria-label="ورود به مراسم"
                >
                  <Heart className="w-5 h-5 animate-heart-beat text-amber-200" />
                  ورود به مراسم فاطمه و حمید
                </motion.button>
              </div>

              {/* Cards 2+3 in a row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Card 2 — Live Album (Event Pulse Grid) */}
                <div 
                  role="button"
                  tabIndex={0}
                  id="hub_album_card"
                  aria-label="مشاهده آلبوم زنده تصاویر مراسم"
                  onClick={() => navigateTo("live", "fatemeh-hamid")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigateTo("live", "fatemeh-hamid");
                    }
                  }}
                  className="card-emerald rounded-3xl p-5 relative overflow-hidden group cursor-pointer border backdrop-blur-2xl flex flex-col justify-between"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40 shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
                        <Images className="w-5 h-5 text-emerald-300" />
                      </div>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono">
                        آلبوم زنده
                      </span>
                    </div>
                    <h2 className="text-base font-display font-bold text-white mb-1 relative z-10">گالری و آلبوم زنده</h2>
                    <p className="text-xs text-slate-300 leading-relaxed mb-4 relative z-10">مشاهده لحظه‌ای تصاویر و ویدیوهای ارسالی توسط مهمانان</p>
                  </div>
                  
                  <motion.button
                    type="button"
                    id="hub_live_album_btn"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 hover:border-emerald-400 text-emerald-200 hover:text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all relative z-10"
                  >
                    <Images className="w-4 h-4 text-emerald-300" />
                    مشاهده آلبوم
                  </motion.button>
                </div>

                {/* Card 3 — Admin Panel */}
                <div 
                  role="button"
                  tabIndex={0}
                  id="hub_admin_card"
                  aria-label="ورود به پنل مدیریت رویداد"
                  onClick={() => navigateTo("admin")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigateTo("admin");
                    }
                  }}
                  className="card-indigo rounded-3xl p-5 relative overflow-hidden group cursor-pointer border backdrop-blur-2xl flex flex-col justify-between"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-purple-500/5 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/40 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
                        <Settings className="w-5 h-5 text-indigo-300" />
                      </div>
                      <span className="text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
                        کنترل رویداد
                      </span>
                    </div>
                    <h2 className="text-base font-display font-bold text-white mb-1 relative z-10">پنل مدیریت رویداد</h2>
                    <p className="text-xs text-slate-300 leading-relaxed mb-4 relative z-10">تنظیمات کارت دعوت، شناسایی چهره و ذخیره‌سازی محتوا</p>
                  </div>
                  
                  <motion.button
                    type="button"
                    id="hub_admin_btn"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/40 hover:border-indigo-400 text-indigo-200 hover:text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all relative z-10"
                  >
                    <Settings className="w-4 h-4 text-indigo-300" />
                    ورود به مدیریت
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </main>

          <footer className="py-5 text-center text-[10px] text-slate-500 border-t border-white/8 shrink-0 font-sans z-10">
            ShotBox · سیستم ثبت تصاویر مهمانان
          </footer>
        </div>
      )}
    </div>
  );
}
