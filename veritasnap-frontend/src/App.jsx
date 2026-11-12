import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Github,
  RefreshCw,
  ScanSearch,
  ShieldPlus,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import BootScreen from "./components/BootScreen";
import Logo from "./components/Logo";
import VerifyPanel from "./components/VerifyPanel";
import CapturePanel from "./components/CapturePanel";
import RegistryPanel from "./components/RegistryPanel";
import { api } from "./lib/api";

const TABS = [
  { id: "verify", label: "Verify", icon: ScanSearch },
  { id: "capture", label: "Register", icon: ShieldPlus },
  { id: "ledger", label: "Ledger", icon: Database },
];

const EMPTY_REGISTRY = { items: [], total: 0, roots: 0, edits: 0, zkp_protected: 0 };

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, 5200);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  const isError = toast.type === "error";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-20 sm:justify-end sm:px-0">
      <div
        className={`anim-pop pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
          isError
            ? "border-rose-400/30 bg-rose-950/80 text-rose-100"
            : "border-emerald-400/30 bg-emerald-950/80 text-emerald-50"
        }`}
        role="status"
      >
        {isError ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        )}
        <p className="flex-1 text-[13px] leading-relaxed">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-0.5 rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState("verify");
  const [registry, setRegistry] = useState(EMPTY_REGISTRY);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [status, setStatus] = useState("checking");
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = "error") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const loadRegistry = useCallback(
    async (silent = false) => {
      if (!silent) setRegistryLoading(true);
      try {
        const data = await api.registry(200);
        setRegistry({ ...EMPTY_REGISTRY, ...data });
        setStatus("online");
      } catch (err) {
        setStatus("offline");
        if (!silent) notify(err.message, "error");
      } finally {
        setRegistryLoading(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    loadRegistry(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "ledger") loadRegistry(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const activeIndex = TABS.findIndex((t) => t.id === tab);
  const online = status === "online";

  return (
    <div className="app-shell">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-ink-900" />
        <div className="absolute inset-0 bg-grid opacity-[0.55]" />
        <div className="absolute inset-0 bg-aurora" />
        <div className="page-orb -left-40 top-[-10rem] h-[28rem] w-[28rem] bg-emerald-500/10" />
        <div className="page-orb -right-40 top-24 h-[26rem] w-[26rem] bg-violet-500/10" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
      </div>

      <div
        key={booting ? "pre" : "post"}
        className={`relative z-10 transition-opacity duration-700 ${
          booting ? "opacity-0" : "opacity-100"
        }`}
      >
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-900/70 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 -z-10 rounded-xl bg-emerald-400/20 blur-lg" />
                <Logo size={34} />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold tracking-tight text-slate-100">
                    VeritaSnap
                  </span>
                  <span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-emerald-300">
                    V2
                  </span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  provenance engine
                </span>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:ml-0 sm:order-3">
              <button
                type="button"
                onClick={() => loadRegistry(false)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition ${
                  online
                    ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300"
                    : status === "checking"
                      ? "border-white/10 bg-white/[0.03] text-slate-400"
                      : "border-rose-400/25 bg-rose-400/[0.07] text-rose-300"
                }`}
                title={online ? `API: ${api.base}` : "Backend unreachable — click to retry"}
              >
                {online ? (
                  <Wifi className="h-3 w-3" />
                ) : status === "checking" ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {online ? "engine online" : status === "checking" ? "connecting" : "offline"}
              </button>

              <a
                href="https://github.com/Nagesh0456/veritasnap"
                target="_blank"
                rel="noreferrer"
                className="hidden rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-400 transition hover:border-white/20 hover:text-slate-200 lg:block"
                aria-label="View source on GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            </div>

            <nav className="order-last w-full sm:order-2 sm:ml-auto sm:w-[300px] lg:w-[336px]">
              <div className="relative grid grid-cols-3 rounded-xl border border-white/10 bg-ink-900/80 p-1">
                <span
                  className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%_-_0.5rem)/3)] rounded-lg border border-white/10 bg-white/[0.08] shadow-sm transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(${activeIndex * 100}%)` }}
                />
                {TABS.map((item) => {
                  const active = item.id === tab;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`relative z-10 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                        active ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <item.icon className={`h-3.5 w-3.5 ${active ? "text-emerald-300" : ""}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-7 sm:px-6 sm:pt-10">
          <div className={tab === "verify" ? "" : "hidden"}>
            <VerifyPanel notify={notify} onRegistryChange={() => loadRegistry(true)} />
          </div>
          <div className={tab === "capture" ? "" : "hidden"}>
            <CapturePanel notify={notify} onRegistryChange={() => loadRegistry(true)} />
          </div>
          <div className={tab === "ledger" ? "" : "hidden"}>
            <RegistryPanel
              data={registry}
              loading={registryLoading}
              onRefresh={() => loadRegistry(false)}
              onGoRegister={() => setTab("capture")}
              notify={notify}
            />
          </div>

          <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">
              VeritaSnap V2 · local-first forensic provenance
            </p>
            <div className="flex items-center gap-4 font-mono text-[10px] text-slate-600">
              <span>EBCH(64,48)</span>
              <span className="text-slate-700">·</span>
              <span>STDM</span>
              <span className="text-slate-700">·</span>
              <span>Ed25519</span>
              <span className="text-slate-700">·</span>
              <span>Schnorr NIZK</span>
            </div>
          </footer>
        </main>
      </div>

      {booting && <BootScreen onDone={() => setBooting(false)} />}
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
