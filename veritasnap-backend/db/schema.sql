PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- 1. Accredited Creators & Hardware Keys (Public Registry)
CREATE TABLE IF NOT EXISTS creators (
    creator_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    ed25519_pubkey_hex TEXT NOT NULL UNIQUE,
    accreditation_tier TEXT NOT NULL DEFAULT 'PUBLIC',
    created_at_utc TEXT NOT NULL
);

-- 2. Provenance DAG Nodes (Git for Images - Root Captures & Child Edits)
CREATE TABLE IF NOT EXISTS media_dag_nodes (
    short_media_id TEXT PRIMARY KEY,
    parent_media_id TEXT REFERENCES media_dag_nodes(short_media_id) ON DELETE SET NULL,
    hop_depth INTEGER NOT NULL DEFAULT 0,
    origin_type_code INTEGER NOT NULL,
    origin_label TEXT NOT NULL,

    -- Aspect-Ratio Canonical Dimensions (Bug 1 Fix: Multiples of 64)
    canonical_w INTEGER NOT NULL DEFAULT 768,
    canonical_h INTEGER NOT NULL DEFAULT 512,

    -- Cryptographic Binding & C2PA 2.0 Soft-Binding Manifest
    canonical_sha256 TEXT NOT NULL,
    c2pa_manifest_json TEXT NOT NULL,
    ed25519_sig_hex TEXT NOT NULL,
    signer_pubkey_hex TEXT NOT NULL,

    -- Zero-Knowledge Whistleblower Privacy Shield
    zkp_pedersen_comm TEXT,
    zkp_proof_json TEXT,
    exif_scrubbed INTEGER NOT NULL DEFAULT 1,
    timestamp_bucket TEXT NOT NULL,

    -- Visual Recovery & Spatial Tamper X-Ray Payloads (Path B + Module 4)
    phash_64_int INTEGER NOT NULL,
    sift_kp_blob BLOB NOT NULL,
    sift_des_blob BLOB NOT NULL,
    spatial_grid_blob BLOB NOT NULL,
    canonical_thumb_jpg BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_parent ON media_dag_nodes(parent_media_id);
CREATE INDEX IF NOT EXISTS idx_media_phash ON media_dag_nodes(phash_64_int);

-- 3. Mock Social Media Auto-Interceptor Feed Posts
CREATE TABLE IF NOT EXISTS social_feed_posts (
    post_id TEXT PRIMARY KEY,
    author_handle TEXT NOT NULL,
    caption TEXT NOT NULL,
    created_at_utc TEXT NOT NULL,
    post_image_b64 TEXT NOT NULL,
    verification_json TEXT NOT NULL
);
