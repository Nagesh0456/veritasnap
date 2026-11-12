import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Trash2, Upload } from "lucide-react";
import { formatBytes } from "../lib/api";

export function Spinner({ className = "h-4 w-4" }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />;
}

export function Button({ variant = "primary", loading = false, children, className = "", ...rest }) {
  const cls = variant === "ghost" ? "btn-ghost" : variant === "danger" ? "btn-danger" : "btn-primary";
  return (
    <button className={`${cls} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({ icon: Icon, title, subtitle, right, className = "" }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function Select({ className = "", children, ...rest }) {
  return (
    <div className="relative">
      <select className={`input appearance-none pr-9 ${className}`} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-white/10 bg-ink-900/60 px-3.5 py-3 text-left transition hover:border-white/20"
      aria-pressed={checked}
    >
      <span>
        <span className="block text-sm text-slate-200">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] text-slate-500">{description}</span>}
      </span>
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-400/80" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function Stat({ label, value, tone = "default", mono = true, sub }) {
  const tones = {
    default: "text-slate-100",
    mint: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    ice: "text-cyan-300",
    iris: "text-violet-300",
  };
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${mono ? "font-mono" : ""} ${tones[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function DataRow({ label, children, mono = true }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-slate-400">{label}</span>
      <span className={`text-right text-xs text-slate-200 ${mono ? "font-mono" : ""}`}>{children}</span>
    </div>
  );
}

export function BoolPill({ value, yes = "valid", no = "invalid" }) {
  const ok = value === true || value === "true";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok
          ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/25"
          : "bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-400/25"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />
      {ok ? yes : no}
    </span>
  );
}

export function CopyValue({ value, display, className = "" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value ?? "");
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`group inline-flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] ${className}`}
      title="Copy to clipboard"
    >
      <span className="truncate">{display ?? value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-slate-300" />
      )}
    </button>
  );
}

export function Dropzone({
  file,
  onFile,
  title = "Drop an image here",
  hint = "PNG, JPG, WEBP · up to ~20 MB",
  accept = "image/*",
  disabled = false,
  compact = false,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = () => !disabled && inputRef.current?.click();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onFile(dropped);
      }}
      className={`relative overflow-hidden rounded-xl border border-dashed transition ${
        dragging
          ? "border-emerald-400/70 bg-emerald-400/[0.06]"
          : "border-white/[0.12] bg-ink-900/50 hover:border-white/25 hover:bg-ink-900/70"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />

      {file && preview ? (
        <div className="flex items-center gap-3 p-3">
          <img
            src={preview}
            alt="Selected preview"
            className="h-14 w-14 shrink-0 rounded-lg border border-white/10 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{file.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              {formatBytes(file.size)} · {file.type || "image"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={pick}
              className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/10"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onFile(null)}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
              aria-label="Remove file"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          className={`flex w-full flex-col items-center justify-center gap-2 text-center ${
            compact ? "px-4 py-6" : "px-6 py-10"
          }`}
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-emerald-300">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-slate-200">{title}</span>
          <span className="font-mono text-[11px] text-slate-500">{hint}</span>
        </button>
      )}
    </div>
  );
}

export function JsonBlock({ value, maxHeight = "18rem" }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      className="overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-4 font-mono text-[11px] leading-relaxed text-slate-300"
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-500">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-sm font-medium text-slate-200">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
