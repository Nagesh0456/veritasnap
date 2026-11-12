import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  Database,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldPlus,
} from "lucide-react";
import { formatTimestamp, imgSrc } from "../lib/api";
import { Button, Card, EmptyState, PanelHeader, Spinner } from "./ui";

function StatTile({ label, value, tone = "text-slate-100", icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
      </div>
      <div className={`mt-1.5 font-mono text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
    </Card>
  );
}

export default function RegistryPanel({ data, loading, onRefresh, onGoRegister, notify }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);

  const items = data?.items || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.short_media_id, item.origin_label, item.parent_media_id, item.timestamp_bucket]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

  return (
    <div className="space-y-6">
      <section className="anim-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="chip mb-4">
            <Database className="h-3 w-3 text-cyan-300" /> Ledger
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Provenance registry</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Every signed capture and authorized edit, stored in a local SQLite WAL ledger. Each row is
            a verifiable node in the provenance DAG.
          </p>
        </div>
        <Button variant="ghost" onClick={onRefresh} disabled={loading} className="text-xs">
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total nodes" value={data?.total ?? 0} icon={Layers} />
        <StatTile label="Root captures" value={data?.roots ?? 0} tone="text-emerald-300" icon={ImageIcon} />
        <StatTile label="Authorized edits" value={data?.edits ?? 0} tone="text-cyan-300" icon={GitBranch} />
        <StatTile
          label="ZKP shielded"
          value={data?.zkp_protected ?? 0}
          tone="text-violet-300"
          icon={Lock}
        />
      </div>

      <Card className="anim-up overflow-hidden" style={{ animationDelay: "60ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <PanelHeader icon={Database} title="Media ledger" subtitle="Newest registrations first." />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search ID, origin or parent…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>

        <div className="divider" />

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
            <Spinner /> Reading ledger…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={items.length === 0 ? "No media registered yet" : "No matches"}
            description={
              items.length === 0
                ? "Sign your first capture to create a provenance node in the ledger."
                : "Try a different search term."
            }
            action={
              items.length === 0 ? (
                <Button onClick={onGoRegister}>
                  <ShieldPlus className="h-4 w-4" /> Register a capture
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Media</th>
                  <th className="px-4 py-2.5 font-medium">Origin</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Hop</th>
                  <th className="px-4 py-2.5 font-medium">Parent</th>
                  <th className="px-4 py-2.5 font-medium">Timestamp</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((item) => {
                  const isOpen = expanded === item.short_media_id;
                  return (
                    <React.Fragment key={item.short_media_id}>
                      <tr
                        className="cursor-pointer transition hover:bg-white/[0.03]"
                        onClick={() => setExpanded(isOpen ? null : item.short_media_id)}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {item.thumbnail ? (
                              <img
                                src={imgSrc(item.thumbnail)}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-lg border border-white/10 object-cover"
                              />
                            ) : (
                              <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-500">
                                <ImageIcon className="h-4 w-4" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold text-emerald-300/90">
                                {item.short_media_id}
                              </p>
                              {item.zkp_protected && (
                                <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-violet-300/80">
                                  <Lock className="h-2.5 w-2.5" /> zero-knowledge
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-300">{item.origin_label}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                          {item.width}×{item.height}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="chip px-2 py-0.5 font-mono text-[10px]">
                            {item.hop_depth}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                          {item.parent_media_id || "ROOT"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-slate-500">
                          {formatTimestamp(item.timestamp_bucket)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <ChevronDown
                            className={`inline h-4 w-4 text-slate-500 transition ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-ink-900/50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="flex flex-wrap gap-5">
                              {item.thumbnail && (
                                <img
                                  src={imgSrc(item.thumbnail)}
                                  alt={`Canonical frame ${item.short_media_id}`}
                                  className="h-40 w-auto rounded-xl border border-white/10 object-contain bg-black/40"
                                />
                              )}
                              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-3">
                                {[
                                  ["Media ID", item.short_media_id],
                                  ["Origin code", item.origin_type_code],
                                  ["Canonical", `${item.width} × ${item.height}`],
                                  ["Parent", item.parent_media_id || "ROOT"],
                                  ["Hop depth", item.hop_depth],
                                  ["EXIF", item.exif_scrubbed ? "scrubbed" : "intact"],
                                  ["Timestamp", item.timestamp_bucket],
                                  ["ZKP shielded", item.zkp_protected ? "yes" : "no"],
                                ].map(([label, value]) => (
                                  <div key={label}>
                                    <dt className="text-slate-500">{label}</dt>
                                    <dd className="mt-0.5 font-mono text-slate-300">{value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
