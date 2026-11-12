# VeritaSnap V2

Proof that survives the screenshot.

Deterministic white-box media provenance, aspect-preserving spatial tamper X-ray, and a zero-knowledge lineage engine.

## Structure

```
veritasnap/
├── veritasnap-backend/          # FastAPI service
│   ├── main.py                  # API app, SQLite persistence, Ed25519 signing
│   ├── requirements.txt
│   ├── test_all_edge_cases.py   # edge-case tests
│   ├── db/schema.sql            # database schema
│   └── veritasnap/
│       ├── watermark_engine.py  # EBCH(64,48) coding + tiled STDM watermarking
│       ├── spatial_xray.py      # spatial tamper X-ray scanner
│       └── crypto_dag_zkp.py    # zero-knowledge lineage / 4-state verdict
└── veritasnap-frontend/         # React + Vite + Tailwind UI
    └── src/
        ├── App.jsx              # shell, navigation, API status, toasts
        ├── components/
        │   ├── BootScreen.jsx   # animated logo intro sequence
        │   ├── Logo.jsx         # SVG provenance mark
        │   ├── VerifyPanel.jsx  # forensic verdict dashboard
        │   ├── CapturePanel.jsx # enrollment / signing flow
        │   ├── RegistryPanel.jsx# DAG ledger browser
        │   └── ui.jsx           # shared primitives
        └── lib/api.js           # API client
```

## Backend

```bash
cd veritasnap-backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

Interactive API docs are served at `http://127.0.0.1:8000/docs`.

## Frontend

Requires Node.js 18+.

```bash
cd veritasnap-frontend
npm install
npm run dev
```

The UI boots with an animated VeritaSnap mark, then opens on the verify dashboard.
It expects the API at `http://localhost:8000`; override with `VITE_API_BASE` if needed:

```bash
VITE_API_BASE=http://192.168.1.20:8000 npm run dev
```

Build for production with `npm run build`.

## Tests

```bash
cd veritasnap-backend
pytest test_all_edge_cases.py
```
