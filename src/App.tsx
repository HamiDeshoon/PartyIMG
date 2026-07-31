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
              className="w-full grid grid-cols-1 gap-3"
              id="hub_cards_grid"
            >
              {/* Card 1 — Guest Photography */}
              <div className="glass-card rounded-2xl p-5 shadow-2xl" id="hub_guest_card">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                    <Camera className="w-4 h-4 text-rose-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">عکاسی مهمان</h2>
                    <p className="text-[10px] text-slate-400 leading-tight">لحظات مراسم را ثبت کنید</p>
                  </div>
                </div>
                <motion.button
                  type="button"
                  id="hub_enter_ceremony_btn"
                  onClick={() => navigateTo("guest", "fatemeh-hamid")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full btn-gradient py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
                  aria-label="ورود به مراسم فاطمه و حمید"
                >
                  <Heart className="w-4 h-4 animate-heart-beat" />
                  ورود به مراسم فاطمه و حمید
                </motion.button>
              </div>

              {/* Cards 2+3 in a row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Card 2 — Live Album */}
                <div className="glass-card rounded-2xl p-4 shadow-2xl" id="hub_album_card">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 mb-3">
                    <Images className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h2 className="text-xs font-semibold text-white mb-1">آلبوم زنده</h2>
                  <p className="text-[9px] text-slate-400 leading-tight mb-3">مشاهده و دانلود عکس‌ها</p>
                  <motion.button
                    type="button"
                    id="hub_live_album_btn"
                    onClick={() => navigateTo("live", "fatemeh-hamid")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 hover:text-white font-semibold py-2 px-2 rounded-xl text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <Images className="w-3 h-3" />
                    مشاهده
                  </motion.button>
                </div>

                {/* Card 3 — Admin */}
                <div className="glass-card rounded-2xl p-4 shadow-2xl" id="hub_admin_card">
                  <div className="w-8 h-8 rounded-lg bg-slate-500/20 flex items-center justify-center border border-slate-500/30 mb-3">
                    <Settings className="w-4 h-4 text-slate-400" />
                  </div>
                  <h2 className="text-xs font-semibold text-white mb-1">مدیریت</h2>
                  <p className="text-[9px] text-slate-400 leading-tight mb-3">پنل مدیریت رویداد</p>
                  <motion.button
                    type="button"
                    id="hub_admin_btn"
                    onClick={() => navigateTo("admin")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="w-full bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold py-2 px-2 rounded-xl text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    ورود
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
