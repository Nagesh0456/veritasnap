"""
VeritaSnap V2: Deterministic White-Box Media Provenance,
Aspect-Preserving Spatial Tamper X-Ray, and Zero-Knowledge Lineage Engine.
"""

from .watermark_engine import (
    encode_ebch_64_48,
    decode_ebch_64_48_chase2,
    TiledSTDMWatermarker,
    compute_canonical_dimensions,
)
from .spatial_xray import SpatialTamperXRayScanner
from .crypto_dag_zkp import (
    WhistleblowerZKPShield,
    evaluate_4state_verdict,
    compute_phash_64,
)

__all__ = [
    "encode_ebch_64_48",
    "decode_ebch_64_48_chase2",
    "TiledSTDMWatermarker",
    "compute_canonical_dimensions",
    "SpatialTamperXRayScanner",
    "WhistleblowerZKPShield",
    "evaluate_4state_verdict",
    "compute_phash_64",
]
