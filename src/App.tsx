import { useState, useEffect, FormEvent, lazy, Suspense } from "react";
import { Camera, Settings, Plus, ArrowRight, Sparkles, Folder, Heart, Video } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { Toaster } from "sonner";

const AdminPanel = lazy(() => import("./components/AdminPanel"));
const GuestPanel = lazy(() => import("./components/GuestPanel"));

// Custom route parsing
interface AppRoute {
  panel: "hub" | "admin" | "guest";
  guestEventId?: string;
}

// Skeleton loader component for event cards
function EventCardSkeleton() {
  return (
    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col space-y-5 animate-pulse">
      <div className="space-y-1">
        <div className="h-5 w-32 bg-white/20 rounded-lg"></div>
      </div>
      <div className="space-y-4 pt-2">
        <div className="flex gap-2.5">
          <div className="flex-1 h-12 bg-black/40 rounded-xl"></div>
          <div className="h-12 w-20 bg-white/20 rounded-xl"></div>
        </div>
        <div className="pt-2">
          <div className="h-3 w-24 bg-white/10 rounded mb-2"></div>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-7 w-16 bg-white/10 rounded-lg"></div>
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

  // Monitor window URL hash updates
  const parseHashRoute = () => {
    const hash = window.location.hash || "";
    if (hash === "" || hash === "#/") {
      setRoute({ panel: "hub" });
    } else if (hash === "#/admin" || hash.startsWith("#/admin")) {
      setRoute({ panel: "admin" });
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
    
    // Load last join code from local storage
    const savedCode = localStorage.getItem("lastJoinCode");
    if (savedCode) {
      setJoinCode(savedCode);
    }
    
    // Fetch active directories/events to present as quick-joins
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

  const navigateTo = (panel: "hub" | "admin" | "guest", guestId?: string) => {
    if (panel === "hub") {
      window.location.hash = "/";
    } else if (panel === "admin") {
      window.location.hash = "/admin";
    } else if (panel === "guest" && guestId) {
      window.location.hash = `/guest/${guestId}`;
    }
  };

  const handleJoinByCode = (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const cleanedCode = joinCode.toLowerCase().trim().replace(/[^a-z0-9\-]/g, "");
    
    // Save to local storage
    localStorage.setItem("lastJoinCode", cleanedCode);
    
    navigateTo("guest", cleanedCode);
  };

  return (
    <div className="font-sans min-h-screen bg-[#2a1c22] text-slate-150 flex flex-col relative overflow-hidden select-none" id="app_frame" dir="rtl">
      <Toaster position="top-center" theme="dark" richColors />
      
      {/* Frosted Glass Background Orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-rose-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s' }}></div>
        <div className="absolute top-[20%] right-[10%] w-[35%] h-[35%] bg-rose-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s' }}></div>
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
      </AnimatePresence>

      {route.panel === "hub" && (
        <div className="min-h-screen flex flex-col justify-between z-10" id="hub_viewport">
          
          {/* Main Hero Header */}
          <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 max-w-4xl mx-auto w-full space-y-10 z-10">
            
            <div className="text-center space-y-6 max-w-xl flex flex-col items-center w-full">
              {/* Couple's Photo */}
              <div className="w-full max-w-[280px] sm:max-w-sm mx-auto rounded-[2rem] overflow-hidden border-[3px] border-white/10 shadow-2xl relative aspect-[3/4] bg-black/40 group mb-4">
                 {/* 
                    Note: Upload your photo as 'couple.jpg' into the 'public' folder!
                 */}
                 <img 
                   src="/couple.jpg" 
                   alt="Bride and Groom" 
                   className="w-full h-full object-cover opacity-90 transition-opacity duration-700 group-hover:opacity-100"
                   onError={(e) => {
                     // Fallback if the photo isn't uploaded yet
                     e.currentTarget.src = "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=800&auto=format&fit=crop";
                   }}
                 />
                 <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0f172a] to-transparent pointer-events-none"></div>
              </div>

              {/* Simple Logo & Romantic Quote */}
              <div className="flex flex-col items-center gap-4">
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
              </div>
            </div>

            {/* Quick interactive joins & launchers */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6" id="hub_cards_grid">
              
              {/* Card 1: Guest join code */}
              {eventsLoading ? (
                <EventCardSkeleton />
              ) : (
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col space-y-5">
                  <div className="space-y-1">
                    <h3 className="text-base font-medium text-white flex items-center gap-2">
                      <span className="text-xl">📸</span> ورود به آلبوم
                    </h3>
                  </div>

                  <form onSubmit={handleJoinByCode} className="space-y-4 pt-2">
                    <div className="flex gap-2.5">
                      <input
                        type="text"
                        required
                        className="flex-1 bg-black/40 border border-white/15 rounded-xl py-3 px-4 focus:outline-hidden focus:ring-1 focus:ring-pink-500 focus:border-pink-500 text-white font-mono text-sm uppercase placeholder-slate-500 transition-all text-left"
                        placeholder="کد رویداد"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        dir="ltr"
                      />
                      <button
                        type="submit"
                        className="bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 active:scale-95 text-white font-semibold py-3 px-5 rounded-xl text-sm transition-all flex items-center justify-center cursor-pointer shadow-md shrink-0"
                      >
                        ورود
                        <ArrowRight className="w-4 h-4 mr-2 rtl:-scale-x-100" />
                      </button>
                    </div>

                    {sampleEvents.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[10px] text-slate-400 font-semibold tracking-wider mb-1.5 flex items-center gap-1">رویدادهای فعال:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {sampleEvents.slice(0, 4).map(ev => (
                            <button
                              key={ev.id}
                              onClick={() => navigateTo("guest", ev.id)}
                              className={`border text-[10px] font-mono py-1 px-2.5 rounded-lg transition-all cursor-pointer ${
                                ev.id === 'test' 
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300' 
                                  : 'bg-white/5 hover:bg-white/15 border border-white/10 text-white'
                              }`}
                              dir="ltr"
                            >
                              #{ev.id}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => navigateTo("guest", "test")}
                        className="w-full bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/35 hover:to-teal-600/35 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 hover:text-white font-medium py-2.5 px-4 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-inner"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        ورود سریع به مراسم تست (Sandbox test)
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Card 2: Host Admin Portal launcher */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl flex flex-col space-y-5">
                <div className="space-y-1">
                  <h3 className="text-base font-medium text-white flex items-center gap-2">
                    <span className="text-xl">⚙️</span> مدیریت میزبان
                  </h3>
                </div>

                <div className="space-y-4 pt-2">
                  <button
                    onClick={() => navigateTo("admin")}
                    className="w-full bg-white/15 hover:bg-white/25 border border-white/15 text-white font-semibold py-3 px-5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    ورود به پنل میزبان
                    <ArrowRight className="w-4 h-4 text-rose-400 rtl:-scale-x-100" />
                  </button>
                </div>
              </div>

            </div>
          </main>

          {/* Humble clean footer */}
          <footer className="py-6 border-t border-white/10 backdrop-blur-md bg-black/20 text-center text-[10px] text-slate-450 select-none font-sans shrink-0">
            سیستم ثبت تصاویر مهمانان • امن، سریع و زیبا در مرورگر شما
          </footer>

        </div>
      )}

    </div>
  );
}
