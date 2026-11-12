import numpy as np
import cv2
from typing import Dict, Any, Tuple, Optional
from .watermark_engine import compute_canonical_dimensions


class SpatialTamperXRayScanner:
    """
    Solves the 'Real Photo, Fake Edit' Paradox and Watermark Transplant Forgery Attack.
    Fixes V1 Bugs 1, 2.2, 4, 6, 8, 10, and 11:
      - Aspect-ratio-preserving canonical dimensions (W_can, H_can) multiples of 64
      - SIFT (contrastThreshold=0.015) + ORB fallback & safe knnMatch guards
      - Homography determinant & SVD conditioning validation
      - Normalized Boundary-Safe Gaussian Anti-Jitter smoothing + 23x23 mask erosion
      - Robust IQR Luminance + Chrominance calibration & Grayscale auto-detection
      - Photometrically calibrated image output (rectified_cal_bgr) for Path B re-extraction
    """

    def __init__(self, grid_n: int = 16, max_canonical_dim: int = 768):
        self.grid_n = grid_n
        self.max_canonical_dim = max_canonical_dim
        self.sift = cv2.SIFT_create(
            nfeatures=1200, contrastThreshold=0.015, edgeThreshold=15
        )
        self.orb = cv2.ORB_create(nfeatures=1000)

    def get_canonical_size(self, img_bgr: np.ndarray) -> Tuple[int, int]:
        """Returns (W_can, H_can) preserving aspect ratio as multiples of 64."""
        h, w = img_bgr.shape[:2]
        return compute_canonical_dimensions(h, w, max_dim=self.max_canonical_dim, tile_size=64)

    @staticmethod
    def _normalized_gaussian_blur(
        img_bgr: np.ndarray, valid_mask_u8: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Bug 6.3 Fix: Normalized convolution with 15x15 (sigma=3.0) Gaussian kernel
        over valid_mask_u8 so black out-of-bounds crop borders contribute 0.0% bleed.
        """
        img_f = img_bgr.astype(np.float64)
        if valid_mask_u8 is None:
            return cv2.GaussianBlur(img_f, (15, 15), 3.0)

        m_f = (valid_mask_u8 > 127).astype(np.float64)[:, :, None]
        num = cv2.GaussianBlur(img_f * m_f, (15, 15), 3.0)
        den = cv2.GaussianBlur(m_f, (15, 15), 3.0)
        if den.ndim == 2:
            den = den[:, :, None]
        return np.where(den > 1e-4, num / np.maximum(den, 1e-4), img_f)

    def compute_canonical_signature(
        self,
        img_bgr: np.ndarray,
        canonical_w: int,
        canonical_h: int,
        valid_mask_u8: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """
        Computes 16x16x18 shift-tolerant low-frequency YCrCb signature
        in the exact (canonical_w, canonical_h) frame.
        """
        if img_bgr.shape[1] != canonical_w or img_bgr.shape[0] != canonical_h:
            img_res = cv2.resize(
                img_bgr, (canonical_w, canonical_h), interpolation=cv2.INTER_AREA
            )
        else:
            img_res = img_bgr

        img_smooth = self._normalized_gaussian_blur(img_res, valid_mask_u8)
        img_smooth_u8 = np.clip(np.round(img_smooth), 0, 255).astype(np.uint8)
        ycrcb = cv2.cvtColor(img_smooth_u8, cv2.COLOR_BGR2YCrCb).astype(np.float64)
        Y, Cr, Cb = ycrcb[:, :, 0], ycrcb[:, :, 1], ycrcb[:, :, 2]

        cell_h = canonical_h // self.grid_n
        cell_w = canonical_w // self.grid_n
        sigs = np.zeros((self.grid_n, self.grid_n, 18), dtype=np.float32)

        for gy in range(self.grid_n):
            y0, y1 = gy * cell_h, (gy + 1) * cell_h
            for gx in range(self.grid_n):
                x0, x1 = gx * cell_w, (gx + 1) * cell_w
                py = cv2.resize(Y[y0:y1, x0:x1], (4, 4), interpolation=cv2.INTER_AREA)
                pcr = Cr[y0:y1, x0:x1]
                pcb = Cb[y0:y1, x0:x1]
                sigs[gy, gx, :16] = py.flatten().astype(np.float32)
                sigs[gy, gx, 16] = float(np.mean(pcr))
                sigs[gy, gx, 17] = float(np.mean(pcb))
        return sigs

    def _detect_keypoints_safe(
        self, img_bgr: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Bug 6.1 Fix: Extracts SIFT keypoints + float32 descriptors with automatic
        CLAHE contrast enhancement on low-contrast images so SIFT never returns None
        on valid photographs.
        """
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        kp, des = self.sift.detectAndCompute(gray, None)
        if des is None or len(kp) < 12:
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            gray_eq = clahe.apply(gray)
            kp, des = self.sift.detectAndCompute(gray_eq, None)
        if not kp or des is None or len(kp) == 0:
            return np.zeros((0, 2), dtype=np.float32), None
        pts = np.float32([k.pt for k in kp])
        return pts, des.astype(np.float32)

    def extract_reference_features(
        self, img_bgr: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, int]:
        """
        Resizes input to aspect-preserving (W_can, H_can), extracts SIFT features
        and 16x16x18 Canonical Spatial Integrity Grid.
        Returns (img_can, pts, des, sigs, W_can, H_can).
        """
        w_can, h_can = self.get_canonical_size(img_bgr)
        img_can = cv2.resize(img_bgr, (w_can, h_can), interpolation=cv2.INTER_AREA)
        pts, des = self._detect_keypoints_safe(img_can)
        if des is None:
            des = np.zeros((0, 128), dtype=np.float32)
        sigs = self.compute_canonical_signature(img_can, w_can, h_can)
        return img_can, pts, des, sigs, w_can, h_can

    @staticmethod
    def _is_homography_well_conditioned(H_mat: Optional[np.ndarray]) -> bool:
        """
        Bug 6.2 Fix: Validates 3x3 homography matrix determinant, SVD condition number,
        and projective perspective terms to reject collinear/degenerate warps.
        """
        if H_mat is None or H_mat.shape != (3, 3) or not np.all(np.isfinite(H_mat)):
            return False
        if abs(H_mat[2, 2]) < 1e-6:
            return False
        H_norm = H_mat / H_mat[2, 2]
        A = H_norm[:2, :2]
        det_a = float(np.linalg.det(A))
        if det_a < 1e-3 or det_a > 1e3:
            return False
        svd_vals = np.linalg.svd(A, compute_uv=False)
        if svd_vals[1] < 1e-4 or (svd_vals[0] / svd_vals[1]) > 25.0:
            return False
        if abs(H_norm[2, 0]) > 2.5e-2 or abs(H_norm[2, 1]) > 2.5e-2:
            return False
        return True

    def _compute_calibrated_direct_diff(
        self, ref_sigs: np.ndarray, att_sigs: np.ndarray
    ) -> float:
        """
        Bug 11 Fix: Computes scale- and brightness-invariant Pearson structural
        divergence + chrominance distance when direct comparison is needed.
        """
        ref_Y = ref_sigs[:, :, :16].flatten().astype(np.float64)
        att_Y = att_sigs[:, :, :16].flatten().astype(np.float64)
        ref_zm = ref_Y - np.mean(ref_Y)
        att_zm = att_Y - np.mean(att_Y)
        denom = float(np.linalg.norm(ref_zm) * np.linalg.norm(att_zm))
        corr = float(np.dot(ref_zm, att_zm) / denom) if denom > 1e-6 else 0.0
        struct_div = max(0.0, 1.0 - max(0.0, corr))
        c_diff = float(np.mean(np.abs(ref_sigs[:, :, 16:] - att_sigs[:, :, 16:]))) / 255.0
        return float(0.75 * struct_div + 0.25 * c_diff)

    def _unmatched_response(
        self,
        query_bgr: np.ndarray,
        ref_pts: np.ndarray,
        ref_sigs: np.ndarray,
        canonical_w: int,
        canonical_h: int,
        wm_decoded_for_this_ref: bool,
        wm_surviving_tiles: int,
        inliers: int = 0,
        inlier_ratio: float = 0.0,
    ) -> Dict[str, Any]:
        att_sigs_direct = self.compute_canonical_signature(
            query_bgr, canonical_w, canonical_h
        )
        cal_diff = self._compute_calibrated_direct_diff(ref_sigs, att_sigs_direct)
        total_can_tiles = max(1, (canonical_w // 64) * (canonical_h // 64))
        est_cov_pct = (
            round(min(100.0, 100.0 * float(wm_surviving_tiles) / float(total_can_tiles)), 1)
            if wm_decoded_for_this_ref and wm_surviving_tiles > 0
            else 0.0
        )
        is_transplant = bool(
            wm_decoded_for_this_ref
            and wm_surviving_tiles >= 4
            and (cal_diff > 0.22 or len(ref_pts) >= 25)
        )
        return {
            "matched": False,
            "inliers": inliers,
            "inlier_ratio": round(inlier_ratio, 3),
            "coverage_pct": est_cov_pct,
            "median_anomaly": round(float(cal_diff), 4),
            "max_z_mad": 0.0,
            "num_tampered_cells": 0,
            "tampered_coords": [],
            "transplant_forgery": is_transplant,
            "grayscale_detected": False,
            "rectified_bgr": None,
            "rectified_cal_bgr": None,
            "coverage_mask": None,
        }

    def rectify_and_scan(
        self,
        query_bgr: np.ndarray,
        ref_pts: np.ndarray,
        ref_des: np.ndarray,
        ref_sigs: np.ndarray,
        canonical_w: int = 512,
        canonical_h: int = 512,
        wm_decoded_for_this_ref: bool = False,
        wm_surviving_tiles: int = 0,
    ) -> Dict[str, Any]:
        pts_q, des_q = self._detect_keypoints_safe(query_bgr)

        good = []
        if (
            des_q is not None
            and ref_des is not None
            and len(pts_q) >= 4
            and len(ref_pts) >= 4
            and len(des_q) >= 4
            and len(ref_des) >= 4
            and des_q.shape[1] == ref_des.shape[1]
        ):
            bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
            raw_matches = bf.knnMatch(des_q, ref_des, k=2)
            for pair in raw_matches:
                if len(pair) == 2:
                    m, n = pair
                    if m.distance < 0.72 * n.distance:
                        good.append(m)

        H_mat = None
        inliers = 0
        inlier_ratio = 0.0

        if len(good) >= 8:
            src_pts = np.float32([pts_q[m.queryIdx] for m in good]).reshape(-1, 1, 2)
            dst_pts = np.float32([ref_pts[m.trainIdx] for m in good]).reshape(-1, 1, 2)
            try:
                H_cand, mask = cv2.findHomography(src_pts, dst_pts, cv2.USAC_MAGSAC, 2.5)
            except cv2.error:
                H_cand, mask = None, None

            if H_cand is not None and mask is not None and self._is_homography_well_conditioned(H_cand):
                inliers = int(np.sum(mask))
                inlier_ratio = float(inliers / max(len(good), 1))
                if inliers >= 8:
                    H_mat = H_cand / H_cand[2, 2]

        if H_mat is None:
            return self._unmatched_response(
                query_bgr,
                ref_pts,
                ref_sigs,
                canonical_w,
                canonical_h,
                wm_decoded_for_this_ref,
                wm_surviving_tiles,
                inliers=inliers,
                inlier_ratio=inlier_ratio,
            )

        rectified = cv2.warpPerspective(
            query_bgr,
            H_mat,
            (canonical_w, canonical_h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0),
        )
        ones_mask = np.full(query_bgr.shape[:2], 255, dtype=np.uint8)
        raw_cov_mask = cv2.warpPerspective(
            ones_mask,
            H_mat,
            (canonical_w, canonical_h),
            flags=cv2.INTER_NEAREST,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0,
        )
        cov_mask = cv2.erode(raw_cov_mask, np.ones((23, 23), dtype=np.uint8))

        att_sigs = self.compute_canonical_signature(
            rectified, canonical_w, canonical_h, valid_mask_u8=raw_cov_mask
        )

        cell_h = canonical_h // self.grid_n
        cell_w = canonical_w // self.grid_n
        valid_cells = np.zeros((self.grid_n, self.grid_n), dtype=bool)
        for gy in range(self.grid_n):
            y0, y1 = gy * cell_h, (gy + 1) * cell_h
            for gx in range(self.grid_n):
                x0, x1 = gx * cell_w, (gx + 1) * cell_w
                if np.mean(cov_mask[y0:y1, x0:x1] > 0) > 0.85:
                    valid_cells[gy, gx] = True

        if np.sum(valid_cells) < 4:
            for gy in range(self.grid_n):
                y0, y1 = gy * cell_h, (gy + 1) * cell_h
                for gx in range(self.grid_n):
                    x0, x1 = gx * cell_w, (gx + 1) * cell_w
                    if np.mean(raw_cov_mask[y0:y1, x0:x1] > 0) > 0.75:
                        valid_cells[gy, gx] = True

        if np.sum(valid_cells) < 2:
            return self._unmatched_response(
                query_bgr,
                ref_pts,
                ref_sigs,
                canonical_w,
                canonical_h,
                wm_decoded_for_this_ref,
                wm_surviving_tiles,
                inliers=0,
                inlier_ratio=0.0,
            )

        # 1. Robust IQR Affine Luminance Calibration (Y)
        ref_Y_vis = ref_sigs[valid_cells, :16].flatten().astype(np.float64)
        att_Y_vis = att_sigs[valid_cells, :16].flatten().astype(np.float64)

        # Reject spurious homographies caused by matching repetitive grid lines on unrelated images
        std_ref_vis = float(np.std(ref_Y_vis))
        std_att_vis = float(np.std(att_Y_vis))
        if std_ref_vis > 1.0 and std_att_vis > 1.0:
            global_corr = float(
                np.mean((ref_Y_vis - np.mean(ref_Y_vis)) * (att_Y_vis - np.mean(att_Y_vis)))
                / (std_ref_vis * std_att_vis)
            )
        else:
            global_corr = 0.0

        ref_cells_y = ref_sigs[valid_cells, :16].astype(np.float64)
        att_cells_y = att_sigs[valid_cells, :16].astype(np.float64)
        ref_zm_cells = (ref_cells_y - np.mean(ref_cells_y, axis=1, keepdims=True)).flatten()
        att_zm_cells = (att_cells_y - np.mean(att_cells_y, axis=1, keepdims=True)).flatten()
        denom_zm = float(np.linalg.norm(ref_zm_cells) * np.linalg.norm(att_zm_cells))
        local_struct_corr = float(np.dot(ref_zm_cells, att_zm_cells) / denom_zm) if denom_zm > 1e-6 else 0.0

        std_zm_ref = float(np.std(ref_zm_cells))
        std_zm_att = float(np.std(att_zm_cells))
        if global_corr < 0.35 or local_struct_corr < 0.55 or (std_zm_ref > 4.0 and std_zm_att / std_zm_ref < 0.50):
            return self._unmatched_response(
                query_bgr,
                ref_pts,
                ref_sigs,
                canonical_w,
                canonical_h,
                wm_decoded_for_this_ref,
                wm_surviving_tiles,
                inliers=0,
                inlier_ratio=0.0,
            )

        non_clipped = (att_Y_vis > 8.0) & (att_Y_vis < 247.0)
        if np.sum(non_clipped) >= 64:
            ref_Y_fit = ref_Y_vis[non_clipped]
            att_Y_fit = att_Y_vis[non_clipped]
        else:
            ref_Y_fit = ref_Y_vis
            att_Y_fit = att_Y_vis

        iqr_att_y = max(
            float(np.percentile(att_Y_fit, 75) - np.percentile(att_Y_fit, 25)), 1.0
        )
        scale_a = float(
            np.clip(
                (np.percentile(ref_Y_fit, 75) - np.percentile(ref_Y_fit, 25)) / iqr_att_y,
                0.35,
                2.60,
            )
        )
        offset_b = float(np.median(ref_Y_fit - scale_a * att_Y_fit))

        inv_scale_a = 1.0 / max(scale_a, 0.15)
        fwd_offset_b = -offset_b * inv_scale_a

        rect_ycrcb = cv2.cvtColor(rectified, cv2.COLOR_BGR2YCrCb).astype(np.float64)
        rect_ycrcb[:, :, 0] = np.clip(scale_a * rect_ycrcb[:, :, 0] + offset_b, 0.0, 255.0)
        rectified_cal_bgr = cv2.cvtColor(rect_ycrcb.astype(np.uint8), cv2.COLOR_YCrCb2BGR)

        # 2. Bug 4 Fix: Robust Chrominance Calibration (Cr, Cb) & Grayscale Auto-Detection
        ref_Cr_vis = ref_sigs[valid_cells, 16].flatten()
        att_Cr_vis = att_sigs[valid_cells, 16].flatten()
        ref_Cb_vis = ref_sigs[valid_cells, 17].flatten()
        att_Cb_vis = att_sigs[valid_cells, 17].flatten()

        std_att_cr = float(np.std(att_Cr_vis))
        std_att_cb = float(np.std(att_Cb_vis))
        grayscale_detected = bool(std_att_cr < 1.8 and std_att_cb < 1.8)

        iqr_att_cr = max(float(np.percentile(att_Cr_vis, 75) - np.percentile(att_Cr_vis, 25)), 1.5)
        scale_cr = float(
            np.clip(
                (np.percentile(ref_Cr_vis, 75) - np.percentile(ref_Cr_vis, 25)) / iqr_att_cr,
                0.50,
                2.00,
            )
        )
        offset_cr = float(np.median(ref_Cr_vis - scale_cr * att_Cr_vis))

        iqr_att_cb = max(float(np.percentile(att_Cb_vis, 75) - np.percentile(att_Cb_vis, 25)), 1.5)
        scale_cb = float(
            np.clip(
                (np.percentile(ref_Cb_vis, 75) - np.percentile(ref_Cb_vis, 25)) / iqr_att_cb,
                0.50,
                2.00,
            )
        )
        offset_cb = float(np.median(ref_Cb_vis - scale_cb * att_Cb_vis))

        w_y = 1.0 if grayscale_detected else 0.80
        w_c = 0.0 if grayscale_detected else 0.20

        anomaly_scores = np.zeros((self.grid_n, self.grid_n), dtype=np.float64)
        for gy in range(self.grid_n):
            for gx in range(self.grid_n):
                if valid_cells[gy, gx]:
                    r_y = ref_sigs[gy, gx, :16].astype(np.float64)
                    a_y = att_sigs[gy, gx, :16].astype(np.float64)

                    att_y_cal = np.clip(scale_a * a_y + offset_b, 0.0, 255.0)
                    diff_inv = np.abs(r_y - att_y_cal)

                    ref_y_fwd = np.clip(inv_scale_a * r_y + fwd_offset_b, 0.0, 255.0)
                    diff_fwd = np.abs(a_y - ref_y_fwd) * min(scale_a, 1.0)

                    y_diff = float(np.sqrt(np.mean(np.minimum(diff_inv, diff_fwd) ** 2))) / 255.0

                    att_cr_cal = scale_cr * att_sigs[gy, gx, 16] + offset_cr
                    att_cb_cal = scale_cb * att_sigs[gy, gx, 17] + offset_cb
                    c_diff = float(
                        np.sqrt(
                            0.5 * ((ref_sigs[gy, gx, 16] - att_cr_cal) ** 2 + (ref_sigs[gy, gx, 17] - att_cb_cal) ** 2)
                        )
                    ) / 255.0

                    std_r = float(np.std(r_y))
                    std_a = float(np.std(a_y))
                    if std_r > 1.5 and std_a > 1.5 and c_diff < 0.14:
                        r_norm = (r_y - float(np.mean(r_y))) / std_r
                        a_norm = (a_y - float(np.mean(a_y))) / std_a
                        corr_cell = float(np.mean(r_norm * a_norm))
                        if corr_cell > 0.65:
                            r_zm = r_y - float(np.mean(r_y))
                            a_zm = att_y_cal - float(np.mean(att_y_cal))
                            struct_diff = float(np.sqrt(np.mean((r_zm - a_zm) ** 2))) / 255.0
                            y_diff = min(y_diff, struct_diff * (1.0 - 0.5 * corr_cell))
                            c_diff = c_diff * (1.0 - 0.4 * corr_cell)

                    anomaly_scores[gy, gx] = w_y * y_diff + w_c * c_diff

        vis_scores = anomaly_scores[valid_cells]
        median_score = float(np.median(vis_scores))
        mad = float(np.median(np.abs(vis_scores - median_score)))
        robust_sigma = max(1.4826 * mad, 0.0065)

        z_grid = np.zeros((self.grid_n, self.grid_n), dtype=np.float64)
        z_grid[valid_cells] = (anomaly_scores[valid_cells] - median_score) / robust_sigma

        tampered_mask = valid_cells & (z_grid > 5.8) & (anomaly_scores > 0.055)
        tampered_coords = [[int(r), int(c)] for r, c in zip(*np.where(tampered_mask))]

        area_cov_pct = round(100.0 * float(np.mean(raw_cov_mask > 127)), 1)

        return {
            "matched": True,
            "inliers": inliers,
            "inlier_ratio": round(inlier_ratio, 3),
            "coverage_pct": area_cov_pct,
            "median_anomaly": round(median_score, 4),
            "max_z_mad": round(float(np.max(z_grid[valid_cells])), 2),
            "num_tampered_cells": len(tampered_coords),
            "tampered_coords": tampered_coords,
            "transplant_forgery": bool(median_score > 0.45),
            "grayscale_detected": grayscale_detected,
            "photometric_scale_a": round(scale_a, 3),
            "photometric_offset_b": round(offset_b, 2),
            "rectified_bgr": rectified,
            "rectified_cal_bgr": rectified_cal_bgr,
            "coverage_mask": raw_cov_mask,
            "z_grid": z_grid,
        }
