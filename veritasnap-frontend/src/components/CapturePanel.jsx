import React, { useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Download,
  Fingerprint,
  GitBranch,
  KeyRound,
  Lock,
  ShieldPlus,
  Sparkles,
} from "lucide-react";
import { api, formatMs, imgSrc, isOk, truncateMiddle } from "../lib/api";
import {
  Button,
  Card,
  CopyValue,
  DataRow,
  Dropzone,
  Field,
  JsonBlock,
  PanelHeader,
  Select,
  Stat,
  Toggle,
} from "./ui";

const SOURCE_OPTIONS = [
  { value: 1, label: "1 — Accredited hardware camera" },
  { value: 2, label: "2 — AI generator output" },
  { value: 4, label: "4 — Whistleblower capture (ZKP shielded)" },
];

export default function CapturePanel({ notify, onRegistryChange }) {
  const [file, setFile] = useState(null);
  const [originType, setOriginType] = useState(1);
  const [parentId, setParentId] = useState("");
  const [whistleblower, setWhistleblower] = useState(false);
  const [secretPhrase, setSecretPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showManifest, setShowManifest] = useState(false);

  React.useEffect(() => {
    if (originType === 4) setWhistleblower(true);
  }, [originType]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      notify("Choose an image to protect first.", "error");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("origin_type", String(originType));
      form.append("whistleblower_mode", String(whistleblower || originType === 4));
      if (parentId.trim()) form.append("parent_media_id", parentId.trim());
      if (secretPhrase.trim()) form.append("author_secret_phrase", secretPhrase.trim());
      const data = await api.create(form);
      setResult(data);
      setShowManifest(false);
      notify(`Registered ${data.short_media_id} — watermark embedded.`, "success");
      onRegistryChange?.();
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFile(null);
    setParentId("");
  };

  const lineage = result?.dag_lineage || [];

  return (
    <div className="space-y-6">
      <section className="anim-up">
        <div className="chip mb-4">
          <ShieldPlus className="h-3 w-3 text-emerald-300" /> Enrollment
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Sign & register a capture
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          VeritaSnap embeds a robust watermark into the canonical frame, signs a C2PA-style manifest
          with Ed25519, and writes a node into the provenance DAG. Chain a parent ID to record an
          authorized edit.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="anim-up p-5 lg:col-span-2" style={{ animationDelay: "60ms" }}>
          <PanelHeader
            icon={Lock}
            title="Protect a new image"
            subtitle="Everything happens locally — the signing key never leaves the enclave."
          />

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Dropzone
              file={file}
              onFile={setFile}
              disabled={loading}
              title="Drop the image to protect"
              hint="The output is re-encoded to canonical dimensions"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Capture source"
                hint="AI output is permanently labelled as AI output."
              >
                <Select
                  value={originType}
                  onChange={(e) => setOriginType(Number(e.target.value))}
                  disabled={loading}
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Parent media ID (optional)"
                hint="Set this to mint an authorized child edit in the DAG."
              >
                <input
                  className="input font-mono"
                  placeholder="e.g. a1b2c3d4e5f"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                />
              </Field>
            </div>

            <Toggle
              checked={whistleblower || originType === 4}
              onChange={(v) => {
                setWhistleblower(v);
                if (v) setOriginType(4);
                else if (originType === 4) setOriginType(1);
              }}
              label="Whistleblower privacy shield"
              description="Strips EXIF/GPS and binds authorship with a Pedersen commitment + Schnorr NIZK."
            />

            {(whistleblower || originType === 4) && (
              <Field
                label="Author secret phrase"
                hint="Hashed into the commitment. Never stored, never transmitted."
              >
                <input
                  className="input"
                  type="password"
                  placeholder="a phrase only you know"
                  value={secretPhrase}
                  onChange={(e) => setSecretPhrase(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </Field>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" loading={loading} className="sm:w-64">
                {loading ? "Embedding & signing…" : "Sign & register"}
                {!loading && <ShieldPlus className="h-4 w-4" />}
              </Button>
              <p className="font-mono text-[10px] text-slate-500">EBCH(64,48) · STDM · Ed25519</p>
            </div>
          </form>
        </Card>

        <Card className="anim-up p-5" style={{ animationDelay: "120ms" }}>
          <PanelHeader icon={Sparkles} title="What gets created" subtitle="A portable, self-verifying credential." />
          <ul className="mt-4 space-y-3 text-[11px] leading-relaxed text-slate-400">
            {[
              ["Invisible payload", "64-bit EBCH-coded ID survives screenshots and recompression."],
              ["Signed manifest", "C2PA 2.0 soft-binding claim signed with Ed25519."],
              ["Anomaly baseline", "Per-cell photometric statistics stored for the X-ray."],
              ["DAG edge", "Optional parent link records authorized edits."],
              ["Privacy proof", "Schnorr NIZK proves authorship without revealing the phrase."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                <span>
                  <span className="font-medium text-slate-200">{title}.</span> {body}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 rounded-xl border border-white/[0.07] bg-ink-900/60 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <Cpu className="h-3 w-3" /> Pipeline
            </div>
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-slate-400">
              scrub → canonicalise → embed → sign → prove → persist
            </p>
          </div>
        </Card>
      </div>

      {result && (
        <div className="anim-pop space-y-4">
          <Card className="border-emerald-400/25 bg-emerald-400/[0.04] p-5 shadow-[0_0_90px_-50px_rgba(78,242,184,0.8)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/70">
                    Registered & signed
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-lg font-semibold text-emerald-200">
                      {result.short_media_id}
                    </span>
                    <CopyValue value={result.short_media_id} display="copy" />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {result.origin_label} · hop {result.hop_depth} ·{" "}
                    {result.canonical_dimensions?.join(" × ")} px
                  </p>
                </div>
              </div>

              <a
                href={imgSrc(result.watermarked_image_b64, "image/png")}
                download={`veritasnap_${result.short_media_id}.png`}
                className="btn-ghost"
              >
                <Download className="h-4 w-4" /> Download protected image
              </a>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
              <Stat label="Embed PSNR" value={`${result.psnr_db ?? "—"} dB`} tone="mint" />
              <Stat label="Canonical size" value={result.canonical_dimensions?.join("×") ?? "—"} />
              <Stat
                label="ZKP receipt"
                value={result.privacy_shield?.zkp_commitment_hex ? "committed" : "none"}
                tone="iris"
              />
              <Stat label="Elapsed" value={formatMs(result.execution_time_ms)} tone="ice" />
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Watermarked output
                </p>
                <span className="chip py-0.5 text-[10px]">visually identical</span>
              </div>
              <img
                src={imgSrc(result.watermarked_image_b64, "image/png")}
                alt="Watermarked output"
                className="aspect-[4/3] w-full border-y border-white/[0.06] object-contain bg-black/40"
              />
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  UV blacklight preview
                </p>
                <span className="chip py-0.5 text-[10px]">20× amplified</span>
              </div>
              <img
                src={imgSrc(result.uv_blacklight_b64)}
                alt="UV blacklight watermark preview"
                className="aspect-[4/3] w-full border-y border-white/[0.06] object-contain bg-black/40"
              />
            </Card>
          </div>

          <Card className="p-5">
            <PanelHeader
              icon={KeyRound}
              title="Credential detail"
              subtitle="Manifest, signature and DAG lineage recorded for this capture."
              right={
                <Button variant="ghost" onClick={reset} className="px-3 py-1.5 text-xs">
                  New capture
                </Button>
              }
            />

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="divide-y divide-white/[0.04]">
                <DataRow label="Media ID">{result.short_media_id}</DataRow>
                <DataRow label="Origin">{result.origin_label}</DataRow>
                <DataRow label="Parent">{result.parent_media_id || "ROOT"}</DataRow>
                <DataRow label="Canonical hash">
                  <span title={result.c2pa_soft_binding_manifest?.canonical_sha256}>
                    {truncateMiddle(result.c2pa_soft_binding_manifest?.canonical_sha256, 12, 8)}
                  </span>
                </DataRow>
                <DataRow label="Signer key">
                  <span title={result.signer_pubkey_hex}>
                    {truncateMiddle(result.signer_pubkey_hex, 10, 6)}
                  </span>
                </DataRow>
                <DataRow label="EXIF scrubbed">
                  {isOk(result.privacy_shield?.exif_scrub_report?.exif_scrubbed) ? "yes" : "n/a"}
                </DataRow>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="stat-label">Ed25519 signature</p>
                  <CopyValue
                    value={result.ed25519_signature_hex}
                    display={truncateMiddle(result.ed25519_signature_hex, 16, 10)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowManifest((v) => !v)}
                  className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05]"
                >
                  <span className="flex items-center gap-2">
                    <Fingerprint className="h-3.5 w-3.5 text-cyan-300" /> C2PA soft-binding manifest
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {showManifest ? "hide" : "show"}
                  </span>
                </button>
                {showManifest && (
                  <div className="mt-2">
                    <JsonBlock value={result.c2pa_soft_binding_manifest} maxHeight="12rem" />
                  </div>
                )}
              </div>
            </div>

            {lineage.length > 0 && (
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <GitBranch className="h-3 w-3" /> DAG lineage ({lineage.length} node
                  {lineage.length > 1 ? "s" : ""})
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {lineage.map((node, i) => (
                    <React.Fragment key={`${node.short_media_id}-${i}`}>
                      {i > 0 && <span className="text-slate-600">→</span>}
                      <span
                        className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] ${
                          i === lineage.length - 1
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.03] text-slate-400"
                        }`}
                      >
                        {node.short_media_id}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
