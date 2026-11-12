import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Fingerprint,
  GitBranch,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  ScanLine,
  Search,
  ShieldCheck,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { api, formatMs, imgSrc, isOk, truncateMiddle } from "../lib/api";
import {
  BoolPill,
  Button,
  Card,
  CopyValue,
  DataRow,
  Dropzone,
  Field,
  PanelHeader,
  Select,
  Stat,
} from "./ui";

const VERDICT_MAP = {
  VERIFIED_AUTHENTIC: {
    tone: "emerald",
    icon: ShieldCheck,
    label: "Verified authentic",
    ring: "border-emerald-400/30",
    bg: "bg-emerald-400/[0.06]",
    text: "text-emerald-300",
    glow: "shadow-[0_0_80px_-40px_rgba(78,242,184,0.9)]",
  },
  AUTHENTIC_ALTERED: {
    tone: "amber",
    icon: AlertTriangle,
    label: "Authentic source, altered",
    ring: "border-amber-400/30",
    bg: "bg-amber-400/[0.06]",
    text: "text-amber-300",
    glow: "shadow-[0_0_80px_-40px_rgba(251,191,36,0.9)]",
  },
  FAKE_FORGERY: {
    tone: "rose",
    icon: XCircle,
    label: "Forgery detected",
    ring: "border-rose-400/30",
    bg: "bg-rose-400/[0.06]",
    text: "text-rose-300",
    glow: "shadow-[0_0_80px_-40px_rgba(244,63,94,0.9)]",
  },
  UNKNOWN: {
    tone: "slate",
    icon: HelpCircle,
    label: "No credentials found",
    ring: "border-white/[0.12]",
    bg: "bg-white/[0.03]",
    text: "text-slate-300",
    glow: "",
  },
};

const VERDICT_STEPS = [
  { code: "VERIFIED_AUTHENTIC", label: "Authentic" },
  { code: "AUTHENTIC_ALTERED", label: "Altered" },
  { code: "FAKE_FORGERY", label: "Forged" },
  { code: "UNKNOWN", label: "Unknown" },
];

function Meter({ value, tone = "emerald" }) {
  const tones = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    rose: "bg-rose-400",
    ice: "bg-cyan-400",
    iris: "bg-violet-400",
  };
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className={`h-full rounded-full ${tones[tone]} transition-all duration-700`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Artifact({ label, caption, src, onOpen }) {
  if (!src) return null;
  return (
    <figure className="group card-soft overflow-hidden">
      <button type="button" onClick={() => onOpen(src)} className="relative block w-full">
        <img
          src={src}
          alt={label}
          className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-transparent to-transparent" />
        <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-black/40 text-white/80 opacity-0 backdrop-blur transition group-hover:opacity-100">
          <Eye className="h-3.5 w-3.5" />
        </span>
      </button>
      <figcaption className="p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{caption}</p>
      </figcaption>
    </figure>
  );
}

function Lineage({ nodes }) {
  if (!nodes?.length) return null;
  return (
    <div className="space-y-0">
      {nodes.map((node, i) => (
        <div key={`${node.short_media_id}-${i}`} className="relative flex gap-4 pb-5 last:pb-0">
          {i < nodes.length - 1 && (
            <span className="absolute left-[11px] top-6 h-full w-px bg-gradient-to-b from-emerald-400/40 to-white/5" />
          )}
          <span
            className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
              i === nodes.length - 1
                ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                : "border-white/15 bg-ink-700 text-slate-400"
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-200">{node.short_media_id}</span>
              <span className="chip py-0.5 text-[10px]">{node.origin}</span>
              {node.zkp_protected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-400/25">
                  <Lock className="h-2.5 w-2.5" /> ZKP
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              hop {node.hop} · {node.timestamp_bucket} · {node.exif_scrubbed ? "EXIF scrubbed" : "EXIF intact"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VerifyPanel({ notify, onRegistryChange }) {
  const [file, setFile] = useState(null);
  const [claimedOrigin, setClaimedOrigin] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      notify("Select an image to inspect first.", "error");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("claimed_origin", String(claimedOrigin));
      const data = await api.verify(form);
      setResult(data);
      notify("Forensic analysis complete.", "success");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const verdict = result ? VERDICT_MAP[result.verdict_code] || VERDICT_MAP.UNKNOWN : null;
  const metrics = result?.metrics || {};
  const pathA = metrics.path_a_blind_watermark || {};
  const pathB = metrics.path_b_geometric_lookup || {};
  const xray = metrics.spatial_xray || {};
  const crypto = metrics.cryptography || {};
  const artifacts = result?.visual_artifacts || {};
  const lineage = result?.provenance_dag_lineage || [];
  const matchedId =
    pathA.decoded_short_media_id || lineage[lineage.length - 1]?.short_media_id || null;

  const checks = result
    ? [
        { ok: isOk(pathA.watermark_detected), label: "Watermark" },
        { ok: isOk(pathB.matched), label: "Geometric lock" },
        { ok: isOk(crypto.ed25519_signature_valid), label: "Ed25519" },
        { ok: isOk(crypto.zkp_whistleblower_verified), label: "Schnorr ZKP" },
      ]
    : [];
  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="anim-up">
        <div className="chip mb-5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Dual-path forensic provenance · veritaSnap v2.0
        </div>

        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl">
          Proof that survives
          <br className="hidden sm:block" /> <span className="text-grad">the screenshot.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-[15px]">
          VeritaSnap recovers an invisible 64-bit watermark from raw pixels, rectifies the image
          geometrically, and maps a 16×16 tamper X-ray — then validates an Ed25519 manifest and a
          zero-knowledge authorship proof. No metadata required. No cloud dependency.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {["EBCH(64,48)", "Tiled STDM", "16×16 X-ray", "Ed25519", "Schnorr NIZK", "SQLite WAL"].map(
            (tag) => (
              <span key={tag} className="chip font-mono text-[10px] text-slate-400">
                {tag}
              </span>
            )
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="anim-up p-5 lg:col-span-2" style={{ animationDelay: "60ms" }}>
          <PanelHeader
            icon={Search}
            title="Inspect a suspect image"
            subtitle="Drop the media you want to authenticate, then run the dual-path pipeline."
          />

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Dropzone
              file={file}
              onFile={setFile}
              disabled={loading}
              title="Drop the suspect image"
              hint="PNG, JPG or WEBP · analysed entirely on your machine"
            />

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field
                label="Claimed origin"
                hint="Used to detect AI-generated media falsely presented as a camera capture."
              >
                <Select
                  value={claimedOrigin}
                  onChange={(e) => setClaimedOrigin(Number(e.target.value))}
                  disabled={loading}
                >
                  <option value={1}>1 — Accredited hardware camera</option>
                  <option value={2}>2 — AI generator output</option>
                  <option value={3}>3 — Authorized human edit</option>
                  <option value={4}>4 — Whistleblower capture</option>
                </Select>
              </Field>

              <Button type="submit" loading={loading} className="h-[42px] sm:w-52">
                {loading ? "Scanning pixels…" : "Run forensic X-ray"}
                {!loading && <ScanLine className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="anim-up p-5" style={{ animationDelay: "120ms" }}>
          <PanelHeader icon={Layers} title="How the verdict is built" subtitle="Three independent evidence layers." />
          <ol className="mt-4 space-y-4">
            {[
              {
                icon: Fingerprint,
                title: "Path A · blind watermark",
                text: "Extracts the EBCH-corrected payload straight from luminance DCT coefficients.",
              },
              {
                icon: ScanLine,
                title: "Path B · spatial X-ray",
                text: "SIFT homography rectifies the frame, then a 16×16 grid flags localised edits.",
              },
              {
                icon: KeyRound,
                title: "Crypto · signature + ZKP",
                text: "Verifies the signed C2PA manifest and proves authorship without the secret.",
              },
            ].map((step) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-cyan-300">
                  <step.icon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-200">{step.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-emerald-300" />
            <p className="text-[11px] text-emerald-200/80">Typical analysis completes in under two seconds.</p>
          </div>
        </Card>
      </div>

      {result && verdict && (
        <div className="anim-pop space-y-4">
          {/* Verdict */}
          <Card className={`overflow-hidden border ${verdict.ring} ${verdict.bg} ${verdict.glow}`}>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${verdict.ring} bg-black/30 ${verdict.text}`}
                  >
                    <verdict.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Verdict · {result.verdict_code}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
                      {result.verdict_badge}
                    </h2>
                    <p className="mt-1 text-sm text-slate-300/90">{result.headline}</p>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <span className={`chip ${verdict.text}`}>
                    <Activity className="h-3 w-3" /> {formatMs(result.execution_time_ms)}
                  </span>
                  {matchedId && (
                    <div className="flex items-center gap-2">
                      <span className="stat-label">Matched</span>
                      <CopyValue value={matchedId} />
                    </div>
                  )}
                </div>
              </div>

              <p className="mt-4 max-w-3xl text-[13px] leading-relaxed text-slate-400">
                {result.non_expert_summary}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-1.5">
                {VERDICT_STEPS.map((step) => {
                  const active = step.code === result.verdict_code;
                  return (
                    <span
                      key={step.code}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? `${verdict.ring} ${verdict.bg} ${verdict.text}`
                          : "border-white/[0.06] bg-white/[0.015] text-slate-600"
                      }`}
                    >
                      {step.label}
                    </span>
                  );
                })}
                <span className="ml-auto font-mono text-[10px] text-slate-500">
                  {passed}/4 evidence layers verified
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-4">
              {[
                { label: "Watermark ID", value: pathA.decoded_short_media_id || "—", tone: "mint" },
                { label: "Sync z-score", value: pathA.sync_z_score != null ? Number(pathA.sync_z_score).toFixed(2) : "—", tone: "ice" },
                { label: "Tampered cells", value: `${xray.num_tampered_cells ?? 0} / 256`, tone: (xray.num_tampered_cells ?? 0) > 0 ? "amber" : "mint" },
                { label: "Homography inliers", value: pathB.homography_inliers ?? 0, tone: "iris" },
              ].map((item) => (
                <div key={item.label} className="bg-ink-700/60 px-4 py-3">
                  <Stat label={item.label} value={item.value} tone={item.tone} />
                </div>
              ))}
            </div>
          </Card>

          {/* Metrics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <PanelHeader icon={Fingerprint} title="Path A · watermark" />
              <div className="mt-2 divide-y divide-white/[0.04]">
                <DataRow label="Detected">
                  <BoolPill value={pathA.watermark_detected} yes="locked" no="not found" />
                </DataRow>
                <DataRow label="ECC recovered">
                  <BoolPill value={pathA.ecc_recovered} yes="recovered" no="failed" />
                </DataRow>
                <DataRow label="Surviving tiles">{pathA.surviving_tiles ?? "—"}</DataRow>
                <DataRow label="Raw BER">{pathA.raw_ber_pct?.toFixed?.(1) ?? "—"}%</DataRow>
                <DataRow label="Post-ECC BER">{pathA.post_ecc_ber_pct?.toFixed?.(1) ?? "—"}%</DataRow>
                <DataRow label="Bits corrected">{pathA.bits_corrected_by_ecc ?? "—"}</DataRow>
                <DataRow label="Origin flag">{pathA.origin_flag ?? "—"}</DataRow>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Carrier confidence</span>
                  <span className="font-mono">{Math.max(0, 100 - (pathA.post_ecc_ber_pct ?? 50)).toFixed(0)}%</span>
                </div>
                <Meter value={100 - (pathA.post_ecc_ber_pct ?? 50)} tone="emerald" />
              </div>
            </Card>

            <Card className="p-4">
              <PanelHeader icon={ScanLine} title="Path B · spatial X-ray" />
              <div className="mt-2 divide-y divide-white/[0.04]">
                <DataRow label="Geometry matched">
                  <BoolPill value={pathB.matched} yes="matched" no="no lock" />
                </DataRow>
                <DataRow label="Inliers">{pathB.homography_inliers ?? "—"}</DataRow>
                <DataRow label="Inlier ratio">
                  {((pathB.inlier_ratio ?? 0) * 100).toFixed(1)}%
                </DataRow>
                <DataRow label="Visible coverage">{pathB.visible_coverage_pct?.toFixed?.(1) ?? "—"}%</DataRow>
                <DataRow label="Cropped away">{pathB.cropped_area_pct?.toFixed?.(1) ?? "—"}%</DataRow>
                <DataRow label="Median anomaly">{xray.median_anomaly_score?.toFixed?.(4) ?? "—"}</DataRow>
                <DataRow label="Max Z-MAD">{xray.max_z_mad?.toFixed?.(2) ?? "—"}</DataRow>
                <DataRow label="Transplant forgery">
                  <BoolPill value={xray.transplant_forgery_detected} yes="detected" no="clean" />
                </DataRow>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Pixel coverage</span>
                  <span className="font-mono">{pathB.visible_coverage_pct?.toFixed?.(0) ?? 0}%</span>
                </div>
                <Meter value={pathB.visible_coverage_pct ?? 0} tone="ice" />
              </div>
            </Card>

            <Card className="p-4">
              <PanelHeader icon={KeyRound} title="Crypto & ZKP" />
              <div className="mt-2 divide-y divide-white/[0.04]">
                <DataRow label="Ed25519 signature">
                  <BoolPill value={crypto.ed25519_signature_valid} yes="verified" no="invalid" />
                </DataRow>
                <DataRow label="Schnorr ZKP">
                  <BoolPill value={crypto.zkp_whistleblower_verified} yes="proven" no="unproven" />
                </DataRow>
                <DataRow label="DAG depth">
                  {lineage.length ? `${lineage.length} hop${lineage.length > 1 ? "s" : ""}` : "—"}
                </DataRow>
                <DataRow label="Signer key">
                  <span title={crypto.signer_pubkey_hex}>
                    {truncateMiddle(crypto.signer_pubkey_hex, 8, 6)}
                  </span>
                </DataRow>
              </div>
              {crypto.zkp_commitment && (
                <div className="mt-3">
                  <p className="stat-label mb-1">Pedersen commitment</p>
                  <CopyValue
                    value={crypto.zkp_commitment}
                    display={truncateMiddle(crypto.zkp_commitment, 18, 8)}
                    className="w-full"
                  />
                </div>
              )}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-violet-400/15 bg-violet-400/[0.05] px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] text-violet-200/80">
                  <Lock className="h-3 w-3" /> Zero-knowledge
                </span>
                <span className="font-mono text-[10px] text-violet-300/70">secret never leaves device</span>
              </div>
            </Card>
          </div>

          {/* Visual artifacts */}
          <Card className="p-4 sm:p-5">
            <PanelHeader
              icon={Eye}
              title="Forensic visual output"
              subtitle="Reference capture, ghost un-crop reconstruction and the tamper X-ray overlay."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Artifact
                label="Reference capture"
                caption="Canonical frame stored at registration."
                src={imgSrc(artifacts.reference_canonical_b64)}
                onOpen={setLightbox}
              />
              <Artifact
                label="Ghost un-crop"
                caption="Cropped-out context reconstructed as a blueprint."
                src={imgSrc(artifacts.ghost_uncrop_b64)}
                onOpen={setLightbox}
              />
              <Artifact
                label="Tamper X-ray · 16×16"
                caption="Green = intact, red = locally modified region."
                src={imgSrc(artifacts.tamper_xray_b64)}
                onOpen={setLightbox}
              />
            </div>
          </Card>

          {/* Lineage */}
          {lineage.length > 0 && (
            <Card className="p-4 sm:p-5">
              <PanelHeader
                icon={GitBranch}
                title="Provenance DAG"
                subtitle="Every capture and authorized edit, chained and signed."
                right={
                  <span className="chip">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    chain valid
                  </span>
                }
              />
              <div className="mt-5">
                <Lineage nodes={lineage} />
              </div>
            </Card>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <button
            type="button"
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={lightbox}
            alt="Forensic artifact preview"
            className="max-h-[86vh] max-w-[92vw] rounded-xl border border-white/10 object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
