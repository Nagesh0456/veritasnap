const API_BASE = (
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" && window.localStorage?.getItem("veritasnap.api")) ||
  "http://localhost:8000"
).replace(/\/+$/, "");

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(
      "Cannot reach the VeritaSnap engine. Start the backend on port 8000 (uvicorn main:app --reload)."
    );
  }

  const raw = await res.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
      : detail;
    throw new Error(message || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  base: API_BASE,
  health: () => request("/api/v1/health"),
  registry: (limit = 100) => request(`/api/v1/registry?limit=${limit}`),
  create: (formData) => request("/api/v1/create", { method: "POST", body: formData }),
  verify: (formData) => request("/api/v1/verify", { method: "POST", body: formData }),
  claim: (payload) =>
    request("/api/v1/zkp/claim-authorship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};

/** Backend already returns full data URIs; stay tolerant of raw base64 too. */
export function imgSrc(value, fallbackMime = "image/jpeg") {
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  return `data:${fallbackMime};base64,${value}`;
}

export function isOk(value) {
  return value === true || value === "true";
}

export function formatMs(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function truncateMiddle(value, head = 10, tail = 6) {
  if (!value) return "—";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatTimestamp(value) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const day = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(day.getTime())) {
      return day.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: "UTC",
      });
    }
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
