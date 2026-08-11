import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight, Gift, Copy, Check, CreditCard, Landmark, User,
  ImagePlus, Send, Loader, X, Sparkles, Heart, ShieldCheck,
} from "lucide-react";

interface GiftPageProps {
  eventId: string;
  onBackToHome: () => void;
}

interface GiftCard {
  enabled: boolean;
  title?: string;
  intro?: string;
  cardNumber?: string;
  cardHolder?: string;
  iban?: string;
  bankName?: string;
  note?: string;
}

/**
 * Warm, self-deprecating fallback copy. The admin can override this from the
 * gifts tab (gift_cards.intro); this is what guests see until they do.
 */
const DEFAULT_INTRO = `همین که خودتون تشریف آوردین برای ما هدیه بزرگیه 😀😀
راستش رو بخواید، ما هرچی فکر کردیم دیدیم هیچ کادویی به گرمی حضور خودتون نمی‌رسه؛ خنده‌هاتون، عکس‌هاتون و قدم‌هایی که تا اینجا برداشتین، همون هدیه‌ی اصلیه که تا آخر عمر یادمون می‌مونه 💐

ولی چون بعضی از شما لطف دارید و اصرار می‌کنید 😅 و ما هم آدم‌های بی‌رودربایستی هستیم، این پایین شماره کارت و شبا رو گذاشتیم — کاملاً اختیاری، بی‌هیچ اجباری، فقط محض اینکه شرمنده‌ی اصرارتون نشیم 🙈

اگر هم دلتون خواست، رسید و یه پیام کوچیک برامون بفرستید؛ خیالتون راحت باشه که فقط خودمون دو نفر می‌بینیمش و به کسی نشون نمی‌دیم 🤍`;

/** Groups a 16-digit card number into 4-4-4-4 for readability. */
function formatCardNumber(raw?: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

const MAX_RECEIPT_BYTES = 16 * 1024 * 1024;

export default function GiftPage({ eventId, onBackToHome }: GiftPageProps) {
  const [card, setCard] = useState<GiftCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const [senderName, setSenderName] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/gift-card`);
        const data = await res.json();
        if (alive) setCard(data);
      } catch {
        if (alive) setCard({ enabled: false });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [eventId]);

  // Object URLs are revoked on replace/unmount so long sessions don't leak blobs.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const copy = useCallback(async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success("کپی شد");
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      toast.error("امکان کپی وجود ندارد");
    }
  }, []);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("فقط تصویر رسید قابل ارسال است");
      return;
    }
    if (f.size > MAX_RECEIPT_BYTES) {
      toast.error("حجم تصویر باید کمتر از ۱۶ مگابایت باشد");
      return;
    }
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!file && !message.trim()) {
      toast.error("حداقل یک تصویر رسید یا یک پیام وارد کنید");
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append("senderName", senderName.trim());
      form.append("amount", amount.trim());
      form.append("message", message.trim());
      if (file) form.append("fileData", file);

      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/gift-receipts`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "خطا در ارسال");
      }
      setSent(true);
      setFile(null);
      setMessage("");
      setAmount("");
      toast.success("رسید شما با موفقیت ثبت شد ✨");
    } catch (err: any) {
      toast.error(err?.message || "ارسال انجام نشد");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#2a1c22]">
        <Loader className="w-7 h-7 text-rose-400 animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  // First non-empty line becomes the headline, the remainder become paragraphs.
  const introLines = (card?.intro?.trim() || DEFAULT_INTRO)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = [
    { key: "cardNumber", icon: CreditCard, label: "شماره کارت", value: formatCardNumber(card?.cardNumber), raw: String(card?.cardNumber || "").replace(/\D/g, ""), mono: true },
    { key: "iban", icon: Landmark, label: "شماره شبا", value: card?.iban, raw: card?.iban, mono: true },
    { key: "cardHolder", icon: User, label: "به نام", value: card?.cardHolder, raw: card?.cardHolder, mono: false },
  ].filter((r) => r.value);

  return (
    <div className="min-h-[100dvh] flex flex-col" dir="rtl" id="gift_page">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#2a1c22]/80 border-b border-white/8">
        <div className="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            aria-label="بازگشت به صفحه اصلی"
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
          >
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </button>
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-amber-300" strokeWidth={1.6} />
            <h1 className="font-display text-lg font-bold tracking-wide">
              {card?.title || "هدیه به عروس و داماد"}
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-7 space-y-6">
        {/* Intro: first line reads as the headline, the rest as body paragraphs. */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative rounded-3xl border border-white/10 bg-white/[0.035] px-5 py-6 overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="absolute -top-16 -right-10 w-44 h-44 rounded-full bg-amber-400/10 blur-3xl pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -left-12 w-44 h-44 rounded-full bg-rose-500/10 blur-3xl pointer-events-none"
          />

          {introLines.length > 0 && (
            <motion.h2
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5, type: "spring", stiffness: 170, damping: 16 }}
              className="font-display text-center text-lg sm:text-xl font-bold leading-relaxed text-amber-100 relative z-10"
            >
              {introLines[0]}
            </motion.h2>
          )}

          {introLines.length > 1 && (
            <div className="mt-3.5 space-y-3 relative z-10">
              <div
                aria-hidden="true"
                className="mx-auto w-16 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent"
              />
              {introLines.slice(1).map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.09, duration: 0.45 }}
                  className="text-center text-[13px] text-slate-300/90 leading-[1.95]"
                >
                  {line}
                </motion.p>
              ))}
            </div>
          )}
        </motion.section>

        {card?.enabled && rows.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.6, type: "spring", stiffness: 160, damping: 18 }}
            className="gift-card-shell rounded-3xl p-5 relative overflow-hidden"
            aria-label="اطلاعات کارت هدیه"
          >
            <div className="gift-card-sheen" aria-hidden="true" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/30">
                <Sparkles className="w-3 h-3" />
                {card.bankName || "کارت هدیه"}
              </span>
              <Heart className="w-4 h-4 text-rose-300/70 animate-heart-beat" />
            </div>

            <div className="space-y-2.5 relative z-10">
              {rows.map((row, i) => (
                <motion.div
                  key={row.key}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.07, duration: 0.4 }}
                  className="flex items-center gap-3 rounded-2xl bg-black/25 border border-white/8 px-3.5 py-3"
                >
                  <row.icon className="w-4 h-4 text-amber-300/80 shrink-0" strokeWidth={1.6} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400 mb-0.5">{row.label}</div>
                    <div
                      className={`text-sm text-white truncate ${row.mono ? "font-mono tracking-[0.12em]" : "font-semibold"}`}
                      dir={row.mono ? "ltr" : "rtl"}
                    >
                      {row.value}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(String(row.raw || ""), row.key)}
                    aria-label={`کپی ${row.label}`}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/40 flex items-center justify-center transition-colors shrink-0"
                  >
                    {copied === row.key
                      ? <Check className="w-3.5 h-3.5 text-emerald-300" />
                      : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                  </button>
                </motion.div>
              ))}
            </div>

            {card.note && (
              <p className="mt-4 text-[11px] text-slate-400 leading-relaxed relative z-10">{card.note}</p>
            )}
          </motion.section>
        )}

        {!card?.enabled && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <Gift className="w-8 h-8 text-slate-500 mx-auto mb-3" strokeWidth={1.4} />
            <p className="text-sm text-slate-400">این بخش هنوز فعال نشده است.</p>
          </div>
        )}

        {card?.enabled && (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5"
          >
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-6"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 220, damping: 14 }}
                    className="w-14 h-14 rounded-2xl mx-auto mb-4 bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center"
                  >
                    <Check className="w-7 h-7 text-emerald-300" />
                  </motion.div>
                  <h3 className="font-display text-lg font-bold mb-1">سپاس از محبت شما 💐</h3>
                  <p className="text-xs text-slate-400 mb-5">رسید شما ثبت شد و فقط برای عروس و داماد قابل مشاهده است.</p>
                  <button
                    type="button"
                    onClick={() => setSent(false)}
                    className="text-xs text-rose-300 hover:text-rose-200 underline underline-offset-4"
                  >
                    ارسال رسید دیگر
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={submit}
                  className="space-y-3.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-300" strokeWidth={1.7} />
                    <h2 className="text-sm font-bold text-white">ارسال رسید و پیام</h2>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed -mt-1">
                    تصویر رسید و پیام شما محرمانه است و تنها عروس و داماد آن را می‌بینند.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value.slice(0, 120))}
                      placeholder="نام شما"
                      aria-label="نام شما"
                      className="gift-input"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.slice(0, 40))}
                      placeholder="مبلغ (اختیاری)"
                      aria-label="مبلغ"
                      className="gift-input"
                    />
                  </div>

                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                    rows={3}
                    placeholder="پیام و آرزوی شما برای عروس و داماد..."
                    aria-label="پیام شما"
                    className="gift-input resize-none leading-relaxed"
                  />

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] || null)}
                  />

                  {preview ? (
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/30">
                      <img src={preview} alt="پیش‌نمایش رسید" className="w-full max-h-56 object-contain" />
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        aria-label="حذف تصویر"
                        className="absolute top-2 left-2 w-8 h-8 rounded-lg bg-black/60 hover:bg-rose-600/70 border border-white/15 flex items-center justify-center transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-2xl border-2 border-dashed border-white/12 hover:border-amber-400/40 bg-black/20 hover:bg-amber-500/5 py-7 flex flex-col items-center gap-2 transition-colors"
                    >
                      <ImagePlus className="w-6 h-6 text-amber-300/80" strokeWidth={1.5} />
                      <span className="text-xs text-slate-300 font-semibold">افزودن تصویر رسید</span>
                      <span className="text-[10px] text-slate-500">JPG یا PNG · حداکثر ۱۶ مگابایت</span>
                    </button>
                  )}

                  <motion.button
                    type="submit"
                    disabled={sending}
                    whileHover={sending ? undefined : { scale: 1.01 }}
                    whileTap={sending ? undefined : { scale: 0.98 }}
                    className="w-full btn-gradient py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-xl shadow-rose-600/30 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {sending
                      ? <><Loader className="w-4 h-4 animate-spin" /> در حال ارسال…</>
                      : <><Send className="w-4 h-4" /> ارسال رسید</>}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </main>

      <footer className="py-5 text-center text-[10px] text-slate-500 border-t border-white/8 shrink-0">
        ShotBox · هدیه شما با احترام نگهداری می‌شود
      </footer>
    </div>
  );
}
