import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  GitBranch,
  Database,
  Layers,
  Lock,
  Search,
  RefreshCw,
} from "lucide-react";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState("verify");
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Capture & Register state
  const [captureFile, setCaptureFile] = useState(null);
  const [deviceModel, setDeviceModel] = useState("VeritaCam-Pro-X1");
  const [gpsLat, setGpsLat] = useState("37.7749");
  const [gpsLon, setGpsLon] = useState("-122.4194");
  const [parentMediaId, setParentMediaId] = useState("");
  const [editOperation, setEditOperation] = useState("Root Sensor Capture");
  const [registerResult, setRegisterResult] = useState(null);

  // Verify state
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);

  const fetchRegistry = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v2/registry`);
      if (res.ok) {
        const data = await res.json();
        setRegistry(data.items || []);
      }
    } catch (e) {
      // Ignore network error until backend starts
    }
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!captureFile) {
      setError("Please select an image to register.");
      return;
    }
    setLoading(true);
    setError("");
    setRegisterResult(null);
    try {
      const formData = new FormData();
      formData.append("file", captureFile);
      formData.append("device_model", deviceModel);
      formData.append("gps_lat", gpsLat);
      formData.append("gps_lon", gpsLon);
      if (parentMediaId.trim()) {
        formData.append("parent_media_id", parentMediaId.trim());
        formData.append("edit_operation", editOperation);
      }
      const res = await fetch(`${API_BASE}/api/v2/capture-and-sign`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");
      setRegisterResult(data);
      fetchRegistry();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!verifyFile) {
      setError("Please select a suspect image to verify.");
      return;
    }
    setLoading(true);
    setError("");
    setVerifyResult(null);
    try {
      const formData = new FormData();
      formData.append("file", verifyFile);
      const res = await fetch(`${API_BASE}/api/v2/verify-media`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Verification failed");
      setVerifyResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderVerdictBanner = (res) => {
    if (!res) return null;
    const styles = {
      GREEN: "bg-emerald-950/70 border-emerald-500 text-emerald-200",
      AMBER: "bg-amber-950/70 border-amber-500 text-amber-200",
      RED: "bg-rose-950/70 border-rose-500 text-rose-200",
      GRAY: "bg-slate-900 border-slate-600 text-slate-300",
    };
    const icons = {
      GREEN: <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />,
      AMBER: <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />,
      RED: <XCircle className="w-8 h-8 text-rose-400 shrink-0" />,
      GRAY: <ShieldQuestion className="w-8 h-8 text-slate-400 shrink-0" />,
    };
    const tier = res.verdict_tier || "GRAY";
    return (
      <div className={`p-5 rounded-xl border-2 flex items-start gap-4 ${styles[tier]}`}>
        {icons[tier]}
        <div className="flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-bold tracking-wide">
              {res.verdict_label} ({res.verdict_code})
            </h3>
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-black/30">
              Matched ID: {res.matched_short_media_id || "None"}
            </span>
          </div>
          <p className="mt-1 text-sm opacity-90">{res.explanation}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Simple Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            <div>
              <h1 className="font-bold text-base tracking-tight">VeritaSnap V2</h1>
              <p className="text-xs text-slate-400">
                Dual-Path Forensic Provenance & Spatial X-Ray
              </p>
            </div>
          </div>

          <nav className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => { setActiveTab("verify"); setError(""); }}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "verify"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              1. Verify Media
            </button>
            <button
              onClick={() => { setActiveTab("capture"); setError(""); }}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "capture"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              2. Sign & Register
            </button>
            <button
              onClick={() => { setActiveTab("registry"); setError(""); fetchRegistry(); }}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "registry"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              3. Registry ({registry.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto w-full px-4 py-6 flex-1 space-y-6">
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-950/80 border border-rose-700 text-rose-200 text-sm">
            {error}
          </div>
        )}

        {/* TAB 1: VERIFY MEDIA */}
        {activeTab === "verify" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Search className="w-4 h-4 text-indigo-400" />
                Inspect & Verify Suspect Image
              </h2>
              <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setVerifyFile(e.target.files?.[0] || null)}
                  className="flex-1 text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-800 file:text-indigo-300 hover:file:bg-slate-700 bg-slate-950 border border-slate-800 rounded-lg p-1.5"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {loading ? "Analyzing..." : "Run Forensic X-Ray"}
                </button>
              </form>
            </div>

            {verifyResult && (
              <div className="space-y-5">
                {renderVerdictBanner(verifyResult)}

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs text-slate-400 uppercase font-semibold mb-2">
                      Path A — Blind Watermark
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>Detected: <span className="font-mono font-semibold">{String(verifyResult.path_a_blind_watermark?.watermark_detected)}</span></p>
                      <p>Extracted ID: <span className="font-mono text-indigo-300">{verifyResult.path_a_blind_watermark?.decoded_short_media_id || "—"}</span></p>
                      <p>Sync Z-Score: <span className="font-mono">{verifyResult.path_a_blind_watermark?.sync_z_score}</span></p>
                      <p>Soft Confidence: <span className="font-mono">{verifyResult.path_a_blind_watermark?.payload_soft_confidence}</span></p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs text-slate-400 uppercase font-semibold mb-2">
                      Path B — Spatial X-Ray (14×14)
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>RANSAC Inliers: <span className="font-mono font-semibold">{verifyResult.spatial_xray?.inliers}</span></p>
                      <p>Tampered Cells: <span className="font-mono font-semibold text-amber-300">{verifyResult.spatial_xray?.num_tampered_cells} / 196</span></p>
                      <p>Max Z-MAD: <span className="font-mono">{verifyResult.spatial_xray?.max_z_mad}</span></p>
                      <p>Filter Diagnosis: <span className="font-mono text-xs">{verifyResult.spatial_xray?.photometric_diagnosis?.summary}</span></p>
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs text-slate-400 uppercase font-semibold mb-2">
                      Crypto & Schnorr ZKP
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>Ed25519 Signature: <span className="font-mono font-semibold">{String(verifyResult.crypto_and_zkp?.ed25519_signature_valid)}</span></p>
                      <p>Schnorr ZKP Valid: <span className="font-mono font-semibold">{String(verifyResult.crypto_and_zkp?.zkp_schnorr_valid)}</span></p>
                      <p>DAG Chain Valid: <span className="font-mono">{String(verifyResult.dag_lineage?.chain_valid)} ({verifyResult.dag_lineage?.depth} hop)</span></p>
                    </div>
                  </div>
                </div>

                {/* Visual X-Ray Heatmap & Rectified Comparison */}
                {(verifyResult.spatial_xray?.heatmap_b64 || verifyResult.spatial_xray?.rectified_b64) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {verifyResult.spatial_xray?.heatmap_b64 && (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">
                          14×14 Spatial Tamper X-Ray Heatmap
                        </h4>
                        <img
                          src={`data:image/jpeg;base64,${verifyResult.spatial_xray.heatmap_b64}`}
                          alt="Forensic Heatmap"
                          className="w-full rounded-lg border border-slate-800"
                        />
                      </div>
                    )}
                    {verifyResult.spatial_xray?.rectified_b64 && (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">
                          Homography-Rectified & Gain/Offset-Calibrated View
                        </h4>
                        <img
                          src={`data:image/jpeg;base64,${verifyResult.spatial_xray.rectified_b64}`}
                          alt="Rectified Image"
                          className="w-full rounded-lg border border-slate-800"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CAPTURE & SIGN */}
        {activeTab === "capture" && (
          <div className="space-y-6">
            <form onSubmit={handleRegister} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-400" />
                Embed QIM-DCT Watermark, Sign with Ed25519 & Generate Schnorr ZKP
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Source Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setCaptureFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Hardware Sensor / Device Model</label>
                  <input
                    type="text"
                    value={deviceModel}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    className="w-full text-sm bg-slate-950 border border-slate-800 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">GPS Latitude (Secured in ZKP Commitment)</label>
                  <input
                    type="number"
                    step="any"
                    value={gpsLat}
                    onChange={(e) => setGpsLat(e.target.value)}
                    className="w-full text-sm bg-slate-950 border border-slate-800 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">GPS Longitude (Secured in ZKP Commitment)</label>
                  <input
                    type="number"
                    step="any"
                    value={gpsLon}
                    onChange={(e) => setGpsLon(e.target.value)}
                    className="w-full text-sm bg-slate-950 border border-slate-800 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Optional Parent Media ID (for DAG Child Edit)</label>
                  <input
                    type="text"
                    placeholder="e.g. a1b2c3d4"
                    value={parentMediaId}
                    onChange={(e) => setParentMediaId(e.target.value)}
                    className="w-full text-sm bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">DAG Edit Operation Description</label>
                  <input
                    type="text"
                    value={editOperation}
                    onChange={(e) => setEditOperation(e.target.value)}
                    className="w-full text-sm bg-slate-950 border border-slate-800 rounded-lg p-2"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {loading ? "Signing & Watermarking..." : "Sign & Register Protected Image"}
              </button>
            </form>

            {registerResult && (
              <div className="bg-slate-900 border border-emerald-700/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-bold text-emerald-400">
                      Registered Media ID: {registerResult.short_media_id}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Embedding PSNR: {registerResult.watermark_report?.embedding_psnr_db} dB | ZKP Verified: {String(registerResult.zkp_receipt?.verified)}
                    </p>
                  </div>
                  <a
                    href={`data:image/jpeg;base64,${registerResult.watermarked_jpeg_b64}`}
                    download={`veritasnap_${registerResult.short_media_id}.jpg`}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                  >
                    Download Watermarked JPEG
                  </a>
                </div>
                <img
                  src={`data:image/jpeg;base64,${registerResult.watermarked_jpeg_b64}`}
                  alt="Watermarked output"
                  className="max-h-80 rounded-lg border border-slate-800"
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REGISTRY */}
        {activeTab === "registry" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              Registered Media Ledger ({registry.length})
            </h2>
            {registry.length === 0 ? (
              <p className="text-sm text-slate-400">No media registered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase">
                      <th className="py-2 px-3">Short ID</th>
                      <th className="py-2 px-3">Filename</th>
                      <th className="py-2 px-3">Resolution</th>
                      <th className="py-2 px-3">Parent ID</th>
                      <th className="py-2 px-3">Operation</th>
                      <th className="py-2 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {registry.map((item) => (
                      <tr key={item.short_media_id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-indigo-300 font-semibold">{item.short_media_id}</td>
                        <td className="py-2 px-3">{item.original_filename}</td>
                        <td className="py-2 px-3 font-mono">{item.width}×{item.height}</td>
                        <td className="py-2 px-3 font-mono text-xs">{item.parent_media_id || "ROOT"}</td>
                        <td className="py-2 px-3">{item.edit_operation}</td>
                        <td className="py-2 px-3 text-xs text-slate-400">{item.capture_timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
