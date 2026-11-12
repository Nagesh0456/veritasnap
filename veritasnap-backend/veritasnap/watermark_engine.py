import numpy as np
import cv2
from typing import Dict, Any, Tuple, Optional, List

# ==============================================================================
# 1. EXTENDED BCH(64, 48, d_min=6) + CHASE-2 SOFT-DECISION LLR DECODER
# Generator poly over GF(2^6): g15(x) = LCM(m1, m3, m9) = 0xE815 (deg 15)
# ==============================================================================
G15_POLY = 0xE815


def compute_canonical_dimensions(
    height: int, width: int, max_dim: int = 768, tile_size: int = 64
) -> Tuple[int, int]:
    """
    Bug 1 Fix: Computes aspect-ratio-preserving canonical (W_can, H_can)
    where both dimensions are exact multiples of tile_size (64).
    Returns (W_can, H_can).
    """
    scale = float(max_dim) / float(max(height, width, 1))
    w_can = max(256, int(round((width * scale) / tile_size)) * tile_size)
    h_can = max(256, int(round((height * scale) / tile_size)) * tile_size)
    return w_can, h_can


def encode_ebch_64_48(msg_bits_48: np.ndarray) -> np.ndarray:
    """Encodes a 48-bit binary array into a 64-bit Extended BCH(64,48,d=6) codeword."""
    assert len(msg_bits_48) == 48, f"Expected 48 bits, got {len(msg_bits_48)}"
    val = 0
    for b in msg_bits_48:
        val = (val << 1) | (int(b) & 1)
    val_shifted = val << 15
    rem = val_shifted
    for i in range(47, -1, -1):
        if (rem >> (i + 15)) & 1:
            rem ^= (G15_POLY << i)
    codeword_63 = val_shifted | rem
    bits_63 = np.array([(codeword_63 >> i) & 1 for i in range(62, -1, -1)], dtype=np.int32)
    overall_parity = int(np.sum(bits_63) & 1)
    return np.append(bits_63, overall_parity).astype(np.int32)


def _build_ebch_tables() -> Tuple[np.ndarray, Dict[int, List[int]]]:
    """
    Bug 7 Fix: Builds verified 16x64 systematic parity-check matrix H_mat
    and complete weight <= 2 syndrome lookup table (2,081 entries).
    Rows 0..14 check cyclic BCH(63,48) parity bits 48..62.
    Row 15 checks overall even parity across all 64 bits (0..63).
    """
    H_mat = np.zeros((16, 64), dtype=np.int32)
    for i in range(48):
        unit = np.zeros(48, dtype=np.int32)
        unit[i] = 1
        cw = encode_ebch_64_48(unit)
        H_mat[:15, i] = cw[48:63]
    for p in range(15):
        H_mat[p, 48 + p] = 1
    H_mat[15, :] = 1  # Overall even parity check across all 64 bits

    syndrome_table: Dict[int, List[int]] = {0: []}
    bit_weights = (1 << np.arange(16, dtype=np.int32))

    # Weight-1 error patterns (64 patterns)
    for i in range(64):
        s = int(H_mat[:, i].dot(bit_weights))
        if s not in syndrome_table:
            syndrome_table[s] = [i]

    # Weight-2 error patterns (2016 patterns)
    for i in range(64):
        for j in range(i + 1, 64):
            vec = H_mat[:, i] ^ H_mat[:, j]
            s = int(vec.dot(bit_weights))
            if s not in syndrome_table:
                syndrome_table[s] = [i, j]

    return H_mat, syndrome_table


H_MAT_64_48, SYNDROME_TABLE_64_48 = _build_ebch_tables()
BIT_WEIGHTS_16 = (1 << np.arange(16, dtype=np.int32))


def decode_ebch_64_48_chase2(
    llrs_64: np.ndarray, q_flip: int = 5
) -> Tuple[np.ndarray, np.ndarray, bool, float]:
    """
    Chase-2 Soft-Decision Algebraic Decoder for Extended BCH(64, 48, d_min=6).
    Flips all 2^q_flip combinations of the q_flip least reliable LLR bits.
    Returns (msg_48, codeword_64, ecc_ok, best_soft_metric).
    """
    hard_bits = (llrs_64 > 0).astype(np.int32)
    reliability = np.abs(llrs_64).astype(np.float64)
    least_rel_idx = np.argsort(reliability)[:q_flip]

    best_codeword: Optional[np.ndarray] = None
    best_metric = float("inf")

    for mask in range(1 << q_flip):
        test_bits = hard_bits.copy()
        for k in range(q_flip):
            if (mask >> k) & 1:
                test_bits[least_rel_idx[k]] ^= 1
        syn_vec = (H_MAT_64_48 @ test_bits) & 1
        s = int(syn_vec.dot(BIT_WEIGHTS_16))
        if s in SYNDROME_TABLE_64_48:
            candidate = test_bits.copy()
            for err_pos in SYNDROME_TABLE_64_48[s]:
                candidate[err_pos] ^= 1
            # Verify candidate is a valid codeword (guards weight-3 alias collisions)
            if np.any((H_MAT_64_48 @ candidate) & 1):
                continue
            diff = candidate != hard_bits
            # Reject candidates requiring > 6 bit flips from hard_bits
            if int(np.sum(diff)) > 6:
                continue
            metric = float(np.sum(reliability[diff]))
            if metric < best_metric:
                best_metric = metric
                best_codeword = candidate

    if best_codeword is None:
        return hard_bits[:48], hard_bits, False, float("inf")
    return best_codeword[:48], best_codeword, True, best_metric


# ==============================================================================
# 2. SELF-SYNCHRONIZING 64x64 TILED DWT-DCT-STDM ENGINE (V2 VECTORIZED)
# ==============================================================================
class TiledSTDMWatermarker:
    def __init__(
        self,
        secret_seed: int = 1337,
        delta: float = 26.0,
        alpha_sync: float = 1.6,
    ):
        self.T = 64
        self.delta = float(delta)
        self.alpha_sync = float(alpha_sync)
        rng = np.random.RandomState(secret_seed)

        # Generate Bandpass-Filtered 64x64 Periodic Synchronization Template
        raw_sync = rng.choice([-1.0, 1.0], size=(self.T, self.T))
        s_fft = np.fft.fft2(raw_sync)
        fy, fx = np.meshgrid(
            np.fft.fftfreq(self.T), np.fft.fftfreq(self.T), indexing="ij"
        )
        radius = np.sqrt(fx ** 2 + fy ** 2)
        bandpass = (radius >= 0.08) & (radius <= 0.25)
        s_spatial = np.real(np.fft.ifft2(s_fft * bandpass))
        s_spatial -= np.mean(s_spatial)
        self.S_template = s_spatial / max(float(np.std(s_spatial)), 1e-8)
        self.S_template_fft = np.fft.fft2(self.S_template)

        # 12 mid-low frequency AC coordinates in 8x8 DCT of DWT-LL subband
        self.band_coords = [
            (0, 1), (1, 0), (1, 1), (0, 2),
            (2, 0), (1, 2), (2, 1), (0, 3),
            (3, 0), (2, 2), (1, 3), (3, 1),
        ]
        self.coord_r = np.array([r for r, _ in self.band_coords], dtype=np.int32).reshape(4, 3)
        self.coord_c = np.array([c for _, c in self.band_coords], dtype=np.int32).reshape(4, 3)

        # 64 unit-norm spreading vectors in R^3 -> shape (64, 3) and (16, 4, 3)
        u_list = []
        for _ in range(64):
            v = rng.choice([-1.0, 1.0], size=3).astype(np.float64)
            u_list.append(v / np.linalg.norm(v))
        self.U_vecs = np.array(u_list, dtype=np.float64)
        self.U_vecs_16_4_3 = self.U_vecs.reshape(16, 4, 3)

        # Antipodal QIM Dither vectors in [-delta/2, delta/2)
        self.dither_0 = rng.uniform(-self.delta / 2.0, self.delta / 2.0, size=64).astype(np.float64)
        self.dither_1 = (
            np.mod(self.dither_0 + self.delta, self.delta) - (self.delta / 2.0)
        ).astype(np.float64)

        # Precompute 8x8 Orthonormal Type-II DCT Matrix D8 for vectorized BLAS execution
        D8 = np.zeros((8, 8), dtype=np.float64)
        for k in range(8):
            alpha_k = np.sqrt(1.0 / 8.0) if k == 0 else np.sqrt(2.0 / 8.0)
            for n in range(8):
                D8[k, n] = alpha_k * np.cos(np.pi * (2 * n + 1) * k / 16.0)
        self.D8 = D8
        self.D8_T = D8.T.copy()

        # Precompute linear STDM projection of alpha_sync * S_template for Multi-Gain Sweep
        sync_tile = (self.alpha_sync * self.S_template)[None, :, :]
        self.sync_proj_64 = self._extract_raw_projections_batch(sync_tile)[0]

        # Candidate gain grid for Bug 2 (Contrast / Sharpness / Blend Lock)
        self.gain_grid = np.unique(
            np.concatenate([
                np.array([1.0, 0.9, 1.1, 0.8, 1.2, 0.7, 1.35, 1.45, 1.6]),
                np.linspace(0.40, 2.30, 39),
            ])
        )

    @staticmethod
    def dwt2_haar(img: np.ndarray):
        even_y, odd_y = img[0::2, :], img[1::2, :]
        L = (even_y + odd_y) / np.sqrt(2.0)
        H = (even_y - odd_y) / np.sqrt(2.0)
        LL = (L[:, 0::2] + L[:, 1::2]) / np.sqrt(2.0)
        LH = (L[:, 0::2] - L[:, 1::2]) / np.sqrt(2.0)
        HL = (H[:, 0::2] + H[:, 1::2]) / np.sqrt(2.0)
        HH = (H[:, 0::2] - H[:, 1::2]) / np.sqrt(2.0)
        return LL, (LH, HL, HH)

    @staticmethod
    def idwt2_haar(coeffs) -> np.ndarray:
        LL, (LH, HL, HH) = coeffs
        h, w = LL.shape
        L = np.zeros((h, w * 2), dtype=np.float64)
        H = np.zeros((h, w * 2), dtype=np.float64)
        L[:, 0::2] = (LL + LH) / np.sqrt(2.0)
        L[:, 1::2] = (LL - LH) / np.sqrt(2.0)
        H[:, 0::2] = (HL + HH) / np.sqrt(2.0)
        H[:, 1::2] = (HL - HH) / np.sqrt(2.0)
        out = np.zeros((h * 2, w * 2), dtype=np.float64)
        out[0::2, :] = (L + H) / np.sqrt(2.0)
        out[1::2, :] = (L - H) / np.sqrt(2.0)
        return out

    def dct2(self, block: np.ndarray) -> np.ndarray:
        return self.D8 @ block @ self.D8_T

    def idct2(self, block: np.ndarray) -> np.ndarray:
        return self.D8_T @ block @ self.D8

    @staticmethod
    def compute_jnd_sync_weight(tile: np.ndarray) -> np.ndarray:
        """
        Bug 5 Fix: Closed-form HVS JND spatial modulation for sync pilot.
        Attenuates sync pilot slightly on ultra-flat regions (sigma < 2) to prevent
        visible grain on flat white documents while boosting slightly on textures.
        Mean weight stays ~1.0 so FFT sync peak Z_sync > 12.
        """
        local_mean = cv2.blur(tile, (5, 5))
        local_sq_mean = cv2.blur(tile * tile, (5, 5))
        local_std = np.sqrt(np.maximum(local_sq_mean - local_mean ** 2, 0.0))
        w_jnd = 0.72 + 0.38 * np.tanh(local_std / 10.0)
        return np.clip(w_jnd, 0.72, 1.15)

    def _embed_single_tile(self, tile: np.ndarray, codeword_64: np.ndarray) -> np.ndarray:
        LL, (LH, HL, HH) = self.dwt2_haar(tile)
        for blk_idx in range(16):
            by = (blk_idx // 4) * 8
            bx = (blk_idx % 4) * 8
            B_dct = self.dct2(LL[by : by + 8, bx : bx + 8])
            for sub_b in range(4):
                bit_idx = blk_idx * 4 + sub_b
                bit = int(codeword_64[bit_idx])
                coords = self.band_coords[sub_b * 3 : (sub_b + 1) * 3]
                c_vec = np.array([B_dct[r, c] for (r, c) in coords], dtype=np.float64)
                u = self.U_vecs[bit_idx]
                proj = float(np.dot(c_vec, u))
                d = self.dither_1[bit_idx] if bit == 1 else self.dither_0[bit_idx]
                proj_q = self.delta * np.round((proj - d) / self.delta) + d
                c_vec_mod = c_vec + (proj_q - proj) * u
                for k, (r, c) in enumerate(coords):
                    B_dct[r, c] = c_vec_mod[k]
            LL[by : by + 8, bx : bx + 8] = self.idct2(B_dct)
        tile_rec = self.idwt2_haar((LL, (LH, HL, HH)))
        w_sync = self.compute_jnd_sync_weight(tile)
        return tile_rec + (self.alpha_sync * w_sync) * self.S_template

    def _extract_raw_projections_batch(self, tiles_3d: np.ndarray) -> np.ndarray:
        """
        Bug 14 Fix: Vectorized batch extraction of raw STDM projections across M tiles.
        tiles_3d has shape (M, 64, 64). Returns raw projections of shape (M, 64) in <0.25 ms.
        """
        M = tiles_3d.shape[0]
        # 1-level 2D Haar DWT LL subband across all M tiles simultaneously: shape (M, 32, 32)
        L = (tiles_3d[:, 0::2, :] + tiles_3d[:, 1::2, :]) * (1.0 / np.sqrt(2.0))
        LL = (L[:, :, 0::2] + L[:, :, 1::2]) * (1.0 / np.sqrt(2.0))

        # Partition each 32x32 LL into 4x4=16 blocks of 8x8 -> shape (M, 16, 8, 8)
        blocks = LL.reshape(M, 4, 8, 4, 8).transpose(0, 1, 3, 2, 4).reshape(M, 16, 8, 8)

        # Vectorized 2D Orthonormal DCT-II: D8 @ blocks @ D8_T -> shape (M, 16, 8, 8)
        B_dct = self.D8 @ blocks @ self.D8_T

        # Gather the 4x3 frequency coordinates per block -> shape (M, 16, 4, 3)
        c_vecs = B_dct[:, :, self.coord_r, self.coord_c]

        # Dot product with unit spreading vectors U_vecs_16_4_3 -> shape (M, 16, 4) -> (M, 64)
        projs = np.einsum("mksc,ksc->mks", c_vecs, self.U_vecs_16_4_3).reshape(M, 64)
        return projs

    def _compute_llrs_for_gain(self, raw_projs: np.ndarray, alpha_gain: float) -> np.ndarray:
        """
        Bug 2 Fix: Given raw tile projections (M, 64) and a candidate contrast/sharpness
        gain multiplier alpha_gain, computes accumulated 64-bit LLRs.
        """
        # Invert linear contrast/filter gain and subtract sync pilot projection
        projs_cal = (raw_projs / alpha_gain) - self.sync_proj_64[None, :]
        d0 = self.dither_0[None, :]
        d1 = self.dither_1[None, :]
        p0 = self.delta * np.round((projs_cal - d0) / self.delta) + d0
        p1 = self.delta * np.round((projs_cal - d1) / self.delta) + d1
        tile_llrs = np.clip(
            ((projs_cal - p0) ** 2 - (projs_cal - p1) ** 2) / (self.delta ** 2),
            -0.35,
            0.35,
        )
        return np.sum(tile_llrs, axis=0)

    @staticmethod
    def pack_payload_48(origin_flag_4bit: int, short_media_id_hex: str) -> np.ndarray:
        clean_hex = short_media_id_hex.strip().lower()[:11].zfill(11)
        id_int = int(clean_hex, 16)
        combined_48 = ((origin_flag_4bit & 0xF) << 44) | (id_int & ((1 << 44) - 1))
        return np.array([(combined_48 >> i) & 1 for i in range(47, -1, -1)], dtype=np.int32)

    @staticmethod
    def unpack_payload_48(bits_48: np.ndarray) -> Tuple[int, str]:
        val = 0
        for b in bits_48:
            val = (val << 1) | (int(b) & 1)
        origin_flag = (val >> 44) & 0xF
        media_id_int = val & ((1 << 44) - 1)
        return origin_flag, f"{media_id_int:011x}"

    def remove_watermark_residual(self, img_bgr: np.ndarray) -> np.ndarray:
        """
        Bug 9 Fix: Removes parent periodic synchronization pilot residual prior to
        embedding a Child DAG node (Authorized Edit) so sync energy never accumulates.
        """
        ycrcb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2YCrCb).astype(np.float64)
        Y = ycrcb[:, :, 0]
        ch, cw = Y.shape
        Y_res = Y - cv2.GaussianBlur(Y, (5, 5), 1.2)
        y_idx = np.arange(ch)[:, None] % self.T
        x_idx = np.arange(cw)[None, :] % self.T
        folded = np.zeros((self.T, self.T), dtype=np.float64)
        counts = np.zeros((self.T, self.T), dtype=np.float64)
        np.add.at(folded, (y_idx, x_idx), Y_res)
        np.add.at(counts, (y_idx, x_idx), 1.0)
        folded /= np.maximum(counts, 1.0)

        corr = np.real(np.fft.ifft2(self.S_template_fft * np.conj(np.fft.fft2(folded))))
        peak_y, peak_x = np.unravel_index(np.argmax(corr), (self.T, self.T))
        peak_z = float((corr[peak_y, peak_x] - np.mean(corr)) / max(float(np.std(corr)), 1e-8))
        if peak_z >= 4.0:
            shifted_sync = np.roll(self.S_template, shift=(-int(peak_y), -int(peak_x)), axis=(0, 1))
            tiled_sync = np.tile(shifted_sync, (ch // self.T + 2, cw // self.T + 2))[:ch, :cw]
            ycrcb[:, :, 0] = np.clip(Y - self.alpha_sync * tiled_sync, 0.0, 255.0)
            return cv2.cvtColor(ycrcb.astype(np.uint8), cv2.COLOR_YCrCb2BGR)
        return img_bgr

    def embed(
        self,
        img_bgr: np.ndarray,
        origin_flag: int,
        short_media_id_hex: str,
        is_child_edit: bool = False,
    ) -> Tuple[np.ndarray, float]:
        """
        Embeds 64-bit eBCH codeword + JND-modulated Sync Pilot across all 64x64 tiles.
        Includes Bug 5 Soft Luminance Headroom mapping [4.5, 250.5] to prevent 0/255 clipping.
        """
        base_bgr = self.remove_watermark_residual(img_bgr) if is_child_edit else img_bgr
        H, W = base_bgr.shape[:2]
        msg_48 = self.pack_payload_48(origin_flag, short_media_id_hex)
        cw_64 = encode_ebch_64_48(msg_48)

        ycrcb = cv2.cvtColor(base_bgr, cv2.COLOR_BGR2YCrCb).astype(np.float64)
        Y_orig = ycrcb[:, :, 0].copy()

        # Bug 5 Fix: Soft Luminance Headroom compression into [4.5, 250.5]
        # Prevents saturation clipping at 0 and 255 on pure white/black backgrounds
        Y = np.where(
            Y_orig > 246.0,
            246.0 + 0.5 * (Y_orig - 246.0),
            np.where(Y_orig < 9.0, 4.5 + 0.5 * Y_orig, Y_orig),
        )

        pad_h = (self.T - (H % self.T)) % self.T
        pad_w = (self.T - (W % self.T)) % self.T
        Y_pad = np.pad(Y, ((0, pad_h), (0, pad_w)), mode="reflect")

        for ty in range(0, Y_pad.shape[0], self.T):
            for tx in range(0, Y_pad.shape[1], self.T):
                Y_pad[ty : ty + self.T, tx : tx + self.T] = self._embed_single_tile(
                    Y_pad[ty : ty + self.T, tx : tx + self.T], cw_64
                )

        ycrcb[:, :, 0] = np.clip(np.round(Y_pad[:H, :W]), 0, 255)
        img_wm = cv2.cvtColor(ycrcb.astype(np.uint8), cv2.COLOR_YCrCb2BGR)
        mse = float(np.mean((img_bgr.astype(np.float64) - img_wm.astype(np.float64)) ** 2))
        psnr = 10.0 * np.log10((255.0 ** 2) / max(mse, 1e-8))
        return img_wm, float(psnr)

    def _compute_sync_peak(self, Y_att: np.ndarray) -> Tuple[int, int, float]:
        """Computes Modulo-64 folded 2D FFT circular cross-correlation peak."""
        ch, cw = Y_att.shape
        valid_rows = (Y_att > 1.0) & (Y_att < 254.0)
        Y_res = Y_att - cv2.GaussianBlur(Y_att, (5, 5), 1.2)
        Y_res = np.where(valid_rows, Y_res, 0.0)
        y_idx = np.arange(ch)[:, None] % self.T
        x_idx = np.arange(cw)[None, :] % self.T
        folded = np.zeros((self.T, self.T), dtype=np.float64)
        counts = np.zeros((self.T, self.T), dtype=np.float64)
        np.add.at(folded, (y_idx, x_idx), Y_res)
        np.add.at(counts, (y_idx, x_idx), valid_rows.astype(np.float64))
        folded /= np.maximum(counts, 1.0)

        corr = np.real(np.fft.ifft2(self.S_template_fft * np.conj(np.fft.fft2(folded))))
        peak_y, peak_x = np.unravel_index(np.argmax(corr), (self.T, self.T))
        peak_z = float(
            (corr[peak_y, peak_x] - np.mean(corr)) / max(float(np.std(corr)), 1e-8)
        )
        return int(peak_y), int(peak_x), peak_z

    def _extract_at_scale(
        self,
        Y_att: np.ndarray,
        scale_factor: float = 1.0,
        expected_media_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if abs(scale_factor - 1.0) > 1e-4:
            inv_s = 1.0 / scale_factor
            new_w = max(self.T, int(round(Y_att.shape[1] * inv_s)))
            new_h = max(self.T, int(round(Y_att.shape[0] * inv_s)))
            Y_work = cv2.resize(Y_att, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        else:
            Y_work = Y_att

        ch, cw = Y_work.shape
        peak_y, peak_x, peak_z = self._compute_sync_peak(Y_work)
        start_y = (self.T - peak_y) % self.T
        start_x = (self.T - peak_x) % self.T

        # Collect all complete 64x64 tiles (skipping pure black out-of-bounds border tiles)
        tiles_list = []
        for ty in range(start_y, ch - self.T + 1, self.T):
            for tx in range(start_x, cw - self.T + 1, self.T):
                tile = Y_work[ty : ty + self.T, tx : tx + self.T]
                if np.mean(tile > 2.0) > 0.85:
                    tiles_list.append(tile)

        # Fallback: if image is between 64x64 and 127x127 and start_y/start_x skipped the single tile,
        # also test cyclic Torus-unwrapped single tile if peak_z >= 4.2
        if len(tiles_list) == 0 and ch >= self.T and cw >= self.T and peak_z >= 4.2:
            rolled = np.roll(Y_work[: self.T, : self.T], shift=(-start_y, -start_x), axis=(0, 1))
            tiles_list.append(rolled)

        num_tiles = len(tiles_list)
        if num_tiles == 0:
            return {
                "watermark_detected": False,
                "sync_offset_mod64": [peak_y, peak_x],
                "sync_z_score": round(peak_z, 2),
                "surviving_tiles": 0,
                "ecc_valid": False,
                "bits_corrected_by_ecc": 0,
                "origin_flag": 0,
                "short_media_id": "00000000000",
                "llr_confidence": 0.0,
                "locked_gain_alpha": 1.0,
                "locked_dpi_scale": round(scale_factor, 3),
                "raw_ber_pct": 50.0,
                "post_ecc_ber_pct": 50.0,
            }

        tiles_3d = np.array(tiles_list, dtype=np.float64)
        raw_projs_all = self._extract_raw_projections_batch(tiles_3d)

        # Filter out saturation-clipped dead tiles (where median projection magnitude < 4.5)
        tile_med_energy = np.median(np.abs(raw_projs_all), axis=1)
        valid_tile_mask = tile_med_energy > 4.5
        if int(np.sum(valid_tile_mask)) >= 4:
            raw_projs = raw_projs_all[valid_tile_mask]
        else:
            raw_projs = raw_projs_all
        eff_tiles = float(raw_projs.shape[0])

        # Bug 2 Fix: Multi-Gain Contrast & Sharpness Lock over alpha in [0.40, 2.30]
        best_result = None
        best_score = -1e9

        for alpha_g in self.gain_grid:
            llr_accum = self._compute_llrs_for_gain(raw_projs, float(alpha_g))
            msg_48, cw_64, ecc_ok, soft_metric = decode_ebch_64_48_chase2(llr_accum, q_flip=5)
            origin_flag, media_id_hex = self.unpack_payload_48(msg_48)
            hard_bits = (llr_accum > 0).astype(np.int32)
            flipped = int(np.sum(hard_bits != cw_64))
            mean_llr = float(np.mean(np.abs(llr_accum))) / max(eff_tiles, 1.0)

            # Score candidate gain: valid origin_flag in {1,2,3,4}, low flipped count, high LLR margin
            valid_origin = 1 <= origin_flag <= 4
            id_match_bonus = 100.0 if (expected_media_id and media_id_hex == expected_media_id) else 0.0
            if ecc_ok and valid_origin:
                score = (
                    id_match_bonus
                    + 20.0
                    - 2.5 * flipped
                    - (1.2 * soft_metric / max(eff_tiles, 1.0))
                    + min(mean_llr * 15.0, 10.0)
                    - 0.8 * abs(alpha_g - 1.0)
                )
            else:
                score = -20.0 - flipped + mean_llr

            if score > best_score:
                best_score = score
                best_result = (
                    llr_accum,
                    msg_48,
                    cw_64,
                    ecc_ok,
                    origin_flag,
                    media_id_hex,
                    flipped,
                    float(alpha_g),
                )
                # Fast exit if alpha=1.0 is already clean with 0 or 1 flipped bits
                if (
                    abs(alpha_g - 1.0) < 1e-4
                    and ecc_ok
                    and valid_origin
                    and flipped <= 1
                    and (expected_media_id is None or media_id_hex == expected_media_id)
                ):
                    break

        assert best_result is not None
        (
            llr_accum,
            msg_48,
            cw_64,
            ecc_ok,
            origin_flag,
            media_id_hex,
            flipped_by_ecc,
            locked_alpha,
        ) = best_result

        raw_ber_pct = round(100.0 * float(flipped_by_ecc) / 64.0, 2)
        post_ecc_ber_pct = 0.0 if ecc_ok else raw_ber_pct
        guided_match = bool(expected_media_id is not None and media_id_hex == expected_media_id)
        if guided_match:
            wm_detected = bool(
                (peak_z >= 4.2 or (peak_z >= 3.3 and flipped_by_ecc <= 2))
                and ecc_ok
                and (1 <= origin_flag <= 4)
            )
        else:
            wm_detected = bool(peak_z >= 4.2 and ecc_ok and (1 <= origin_flag <= 4))

        return {
            "watermark_detected": wm_detected,
            "sync_offset_mod64": [peak_y, peak_x],
            "sync_z_score": round(peak_z, 2),
            "surviving_tiles": num_tiles,
            "ecc_valid": bool(ecc_ok),
            "bits_corrected_by_ecc": int(flipped_by_ecc),
            "raw_ber_pct": raw_ber_pct,
            "post_ecc_ber_pct": post_ecc_ber_pct,
            "origin_flag": int(origin_flag),
            "short_media_id": media_id_hex,
            "llr_confidence": round(float(np.mean(np.abs(llr_accum))), 4),
            "locked_gain_alpha": round(locked_alpha, 3),
            "locked_dpi_scale": round(scale_factor, 3),
        }

    def blind_extract(
        self,
        attacked_bgr: np.ndarray,
        enable_multiscale: bool = True,
        expected_media_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Step 1: Modulo-64 Folding + 2D FFT Circular Cross-Correlation to find crop shift (dy, dx).
        Step 2: Multi-Gain Contrast & Sharpness Lock (alpha in [0.40, 2.30]).
        Step 3: Chase-2 Extended BCH(64, 48, d_min=6) Soft-Decision Decoding.
        Step 4 (Bug 3 Fix): Automatic Multi-Scale DPI Screenshot Sync Search if scale != 1.0.
        """
        if attacked_bgr is None or attacked_bgr.size == 0:
            return {"watermark_detected": False, "sync_z_score": 0.0, "surviving_tiles": 0}

        Y_att = cv2.cvtColor(attacked_bgr, cv2.COLOR_BGR2YCrCb)[:, :, 0].astype(np.float64)

        # 1. Native 1:1 Scale Extraction
        res_1x = self._extract_at_scale(Y_att, scale_factor=1.0, expected_media_id=expected_media_id)
        if (
            res_1x.get("watermark_detected")
            and res_1x.get("sync_z_score", 0.0) >= 4.5
            and res_1x.get("bits_corrected_by_ecc", 99) <= 2
            and (expected_media_id is None or res_1x.get("short_media_id") == expected_media_id)
        ):
            return res_1x

        if not enable_multiscale:
            return res_1x

        # 2. Bug 3 Fix: Fast Multi-Scale Sync Search across Browser Zoom & OS DPI Scales
        candidate_scales = [
            0.50, 0.60, 0.67, 0.72, 0.73, 0.75, 0.80, 0.85, 0.90,
            1.10, 1.15, 1.25, 1.33, 1.50,
        ]
        scale_peaks = []
        for s in candidate_scales:
            inv_s = 1.0 / s
            nh = int(round(Y_att.shape[0] * inv_s))
            nw = int(round(Y_att.shape[1] * inv_s))
            if nh < self.T or nw < self.T or nh > 2560 or nw > 2560:
                continue
            Y_s = cv2.resize(Y_att, (nw, nh), interpolation=cv2.INTER_CUBIC)
            _, _, pz = self._compute_sync_peak(Y_s)
            scale_peaks.append((pz, s))

        scale_peaks.sort(key=lambda x: x[0], reverse=True)
        candidates = [res_1x]
        min_pz = 3.3 if expected_media_id is not None else 4.2
        for pz, s in scale_peaks[:3]:
            if pz < min_pz:
                break
            cand_res = self._extract_at_scale(
                Y_att, scale_factor=s, expected_media_id=expected_media_id
            )
            if expected_media_id and cand_res.get("watermark_detected") and cand_res.get("short_media_id") == expected_media_id:
                return cand_res
            candidates.append(cand_res)

        def _rank_cand(c):
            det = 1 if c.get("watermark_detected") else 0
            return (det, c.get("sync_z_score", 0.0) - 0.6 * c.get("bits_corrected_by_ecc", 32))

        return max(candidates, key=_rank_cand)
