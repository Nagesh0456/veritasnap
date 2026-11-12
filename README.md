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
    └── src/App.jsx
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

```bash
cd veritasnap-frontend
npm install
npm run dev
```

## Tests

```bash
cd veritasnap-backend
pytest test_all_edge_cases.py
```
