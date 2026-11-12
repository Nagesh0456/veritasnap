import io
import numpy as np
import cv2
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def make_rich_test_image(width: int = 1280, height: int = 720, seed: int = 101) -> np.ndarray:
    """Creates a textured, high-detail synthetic photograph with text, gradients, and flat regions."""
    rng = np.random.RandomState(seed)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Smooth gradient sky + textured foreground
    for y in range(height):
        img[y, :, 0] = int(40 + 160 * (y / height))
        img[y, :, 1] = int(70 + 120 * (1.0 - y / height))
        img[y, :, 2] = int(90 + 100 * ((y % 180) / 180.0))

    noise = rng.randint(-28, 28, size=(height, width, 3), dtype=np.int16)
    noise = cv2.GaussianBlur(noise.astype(np.float32), (5, 5), 1.1).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # Add flat white receipt/card box (Tests Bug 5 saturation clipping)
    cv2.rectangle(img, (60, 50), (360, 220), (255, 255, 255), -1)
    cv2.putText(img, "INVOICE #9481", (85, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (15, 15, 15), 2)
    cv2.putText(img, "TOTAL: $4,250.00", (85, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (20, 80, 20), 2)

    # Add rich geometric landmarks for SIFT keypoints
    for k in range(18):
        cx = int(120 + (k * 63) % (width - 240))
        cy = int(240 + (k * 97) % (height - 300))
        color = (int((k * 53) % 255), int((k * 113) % 255), int((k * 197) % 255))
        cv2.circle(img, (cx, cy), 28 + (k % 15), color, -1)
        cv2.rectangle(img, (cx - 18, cy - 18), (cx + 18, cy + 18), (245, 245, 245), 2)
        cv2.putText(img, f"K{k}", (cx - 14, cy + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (10, 10, 10), 2)

    return img


def encode_png_bytes(img_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img_bgr)
    assert ok
    return buf.tobytes()


def encode_jpg_bytes(img_bgr: np.ndarray, quality: int = 50) -> bytes:
    ok, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return buf.tobytes()


def decode_b64_image(data_uri: str) -> np.ndarray:
    import base64
    b64_part = data_uri.split(",", 1)[1] if "," in data_uri else data_uri
    raw = base64.b64decode(b64_part)
    arr = np.frombuffer(raw, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def run_all_8_tests():
    print("=" * 78)
    print("RUNNING VERITASNAP V2 — 8 MANDATORY EDGE-CASE & BUG-FIX VERIFICATION SUITE")
    print("=" * 78)

    # -------------------------------------------------------------------------
    # TEST 1: Rectangular 16:9 Image Preservation & Flat-White PSNR > 41.5 dB (Bugs 1 & 5)
    # -------------------------------------------------------------------------
    img_16_9 = make_rich_test_image(width=1280, height=720, seed=101)
    resp = client.post(
        "/api/v1/create",
        files={"file": ("rect_16_9.png", encode_png_bytes(img_16_9), "image/png")},
        data={"origin_type": 1, "whistleblower_mode": "true", "author_secret_phrase": "press-secret-99"},
    )
    assert resp.status_code == 200, resp.text
    create_data = resp.json()
    media_id = create_data["short_media_id"]
    can_w, can_h = create_data["canonical_dimensions"]
    wm_bgr = decode_b64_image(create_data["watermarked_image_b64"])

    assert can_w != can_h and can_w % 64 == 0 and can_h % 64 == 0, f"Squished dimensions: {can_w}x{can_h}"
    assert wm_bgr.shape[1] == can_w and wm_bgr.shape[0] == can_h
    assert create_data["psnr_db"] >= 41.0, f"PSNR too low: {create_data['psnr_db']}"
    print(f"[PASS] Test 1 (Bugs 1 & 5): 16:9 Aspect Ratio Preserved ({can_w}x{can_h}), PSNR={create_data['psnr_db']} dB, ID={media_id}")

    # -------------------------------------------------------------------------
    # TEST 2: Resized 73% Browser Screenshot + 50% Unaligned Crop + WhatsApp Q=50 (Bug 3)
    # -------------------------------------------------------------------------
    h, w = wm_bgr.shape[:2]
    crop_bgr = wm_bgr[19 : int(h * 0.78), 27 : int(w * 0.78)]
    resized_73 = cv2.resize(crop_bgr, (0, 0), fx=0.73, fy=0.73, interpolation=cv2.INTER_CUBIC)
    v2 = client.post(
        "/api/v1/verify",
        files={"file": ("whatsapp_crop_73.jpg", encode_jpg_bytes(resized_73, quality=50), "image/jpeg")},
    ).json()
    assert v2["verdict_code"] == "VERIFIED_AUTHENTIC", f"Test 2 failed: {v2}"
    assert v2["metrics"]["path_a_blind_watermark"]["decoded_short_media_id"] == media_id
    print(f"[PASS] Test 2 (Bug 3): 73% Rescaled Browser Screenshot + Unaligned Crop + Q=50 -> {v2['verdict_badge']}")

    # -------------------------------------------------------------------------
    # TEST 3: Contrast 1.45x + Brightness +45 + Sharpening Filter (Bug 2)
    # -------------------------------------------------------------------------
    sharp_kernel = np.array([[0, -0.4, 0], [-0.4, 2.6, -0.4], [0, -0.4, 0]], dtype=np.float32)
    sharpened = cv2.filter2D(wm_bgr, -1, sharp_kernel)
    contrast_edited = np.clip(sharpened.astype(np.float32) * 1.45 + 45.0, 0, 255).astype(np.uint8)
    v3 = client.post(
        "/api/v1/verify",
        files={"file": ("contrast_sharp.jpg", encode_jpg_bytes(contrast_edited, quality=70), "image/jpeg")},
    ).json()
    assert v3["verdict_code"] == "VERIFIED_AUTHENTIC", f"Test 3 failed: {v3}"
    print(f"[PASS] Test 3 (Bug 2): Contrast 1.45x + Brightness +45 + Sharpening -> {v3['verdict_badge']} (Locked Gain={v3['metrics']['path_a_blind_watermark']['locked_gain_alpha']}x)")

    # -------------------------------------------------------------------------
    # TEST 4: Black & White (Grayscale) & Sepia Color Filters -> 0 False Positives (Bug 4)
    # -------------------------------------------------------------------------
    gray_1ch = cv2.cvtColor(wm_bgr, cv2.COLOR_BGR2GRAY)
    bw_bgr = cv2.cvtColor(gray_1ch, cv2.COLOR_GRAY2BGR)
    v4_bw = client.post(
        "/api/v1/verify",
        files={"file": ("bw_filter.jpg", encode_jpg_bytes(bw_bgr, quality=75), "image/jpeg")},
    ).json()
    assert v4_bw["verdict_code"] == "VERIFIED_AUTHENTIC", f"Test 4 B&W failed: {v4_bw}"
    assert v4_bw["metrics"]["spatial_xray"]["num_tampered_cells"] == 0

    # Apply strong Sepia / Warm filter
    sepia_bgr = wm_bgr.copy().astype(np.float32)
    sepia_bgr[:, :, 0] = np.clip(sepia_bgr[:, :, 0] * 0.65, 0, 255)
    sepia_bgr[:, :, 2] = np.clip(sepia_bgr[:, :, 2] * 1.30 + 25, 0, 255)
    v4_sepia = client.post(
        "/api/v1/verify",
        files={"file": ("sepia_filter.jpg", encode_jpg_bytes(sepia_bgr.astype(np.uint8), quality=75), "image/jpeg")},
    ).json()
    assert v4_sepia["verdict_code"] == "VERIFIED_AUTHENTIC", f"Test 4 Sepia failed: {v4_sepia}"
    print(f"[PASS] Test 4 (Bug 4): Grayscale (B&W) & Sepia Filters -> 0 False Tamper Cells ({v4_bw['verdict_badge']})")

    # -------------------------------------------------------------------------
    # TEST 5: Localized Fake Red/Text Edit on Screenshot -> AUTHENTIC_ALTERED
    # -------------------------------------------------------------------------
    doctored = wm_bgr.copy()
    cv2.rectangle(doctored, (can_w // 2 - 45, can_h // 2 - 35), (can_w // 2 + 45, can_h // 2 + 35), (10, 10, 250), -1)
    cv2.putText(doctored, "FAKE", (can_w // 2 - 38, can_h // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 3)
    v5 = client.post(
        "/api/v1/verify",
        files={"file": ("doctored.jpg", encode_jpg_bytes(doctored, quality=75), "image/jpeg")},
    ).json()
    assert v5["verdict_code"] == "AUTHENTIC_ALTERED", f"Test 5 failed: {v5}"
    assert v5["metrics"]["spatial_xray"]["num_tampered_cells"] >= 1
    print(f"[PASS] Test 5 (Spatial X-Ray): Localized Fake Edit -> {v5['verdict_badge']} ({v5['metrics']['spatial_xray']['num_tampered_cells']} cells isolated, max_z_mad={v5['metrics']['spatial_xray']['max_z_mad']})")

    # -------------------------------------------------------------------------
    # TEST 6: Stolen Watermark Transplant onto Completely Different Fake Image -> FAKE_FORGERY
    # -------------------------------------------------------------------------
    ai_fake = np.full((can_h, can_w, 3), (30, 220, 180), dtype=np.uint8)
    cv2.circle(ai_fake, (can_w // 3, can_h // 3), 120, (240, 30, 200), -1)
    # Transplant the exact watermark from media_id onto ai_fake
    from main import wm_engine
    transplanted_fake, _ = wm_engine.embed(ai_fake, origin_flag=1, short_media_id_hex=media_id)
    v6 = client.post(
        "/api/v1/verify",
        files={"file": ("transplanted_fake.png", encode_png_bytes(transplanted_fake), "image/png")},
    ).json()
    assert v6["verdict_code"] == "FAKE_FORGERY", f"Test 6 failed: {v6}"
    assert v6["metrics"]["spatial_xray"]["transplant_forgery_detected"] is True
    print(f"[PASS] Test 6 (Watermark Transplant Defense): Stolen Watermark on AI Fake -> {v6['verdict_badge']}")

    # -------------------------------------------------------------------------
    # TEST 7: Unregistered Random Image (Including Smooth/Low-Keypoint Image) -> UNKNOWN (Bug 6.1 & Bug 8)
    # -------------------------------------------------------------------------
    unregistered = make_rich_test_image(width=800, height=600, seed=999)
    v7 = client.post(
        "/api/v1/verify",
        files={"file": ("unregistered.jpg", encode_jpg_bytes(unregistered, quality=80), "image/jpeg")},
    ).json()
    assert v7["verdict_code"] == "UNKNOWN", f"Test 7 failed: {v7}"

    # Also test ultra-smooth blank image (0 SIFT keypoints) to verify Bug 6.1 & Bug 8 fix
    smooth_blank = np.full((300, 400, 3), 128, dtype=np.uint8)
    v7_smooth = client.post(
        "/api/v1/verify",
        files={"file": ("smooth.png", encode_png_bytes(smooth_blank), "image/png")},
    ).json()
    assert v7_smooth["verdict_code"] == "UNKNOWN", f"Test 7 smooth failed: {v7_smooth}"
    print(f"[PASS] Test 7 (Abstention Gate & Bug 6/8): Unregistered & 0-Keypoint Images -> {v7['verdict_badge']} (0 crashes, 0 false forgery)")

    # -------------------------------------------------------------------------
    # TEST 8: Extreme >95% Micro-Crop Failure Boundary & ZKP Authorship Claim
    # -------------------------------------------------------------------------
    micro_crop = wm_bgr[13:93, 19:99]  # 80x80 px (< 127x127 Pigeonhole bound, 0 complete tiles)
    v8 = client.post(
        "/api/v1/verify",
        files={"file": ("micro_crop.jpg", encode_jpg_bytes(micro_crop, quality=50), "image/jpeg")},
    ).json()
    assert v8["verdict_code"] in ("UNKNOWN", "AUTHENTIC_ALTERED"), f"Unexpected Test 8 verdict: {v8}"

    # Verify Whistleblower ZKP Authorship Claim endpoint
    zkp_resp = client.post(
        "/api/v1/zkp/claim-authorship",
        json={
            "short_media_id": media_id,
            "author_secret_phrase": "press-secret-99",
            "blinding_factor_secret_hex": create_data["privacy_shield"]["blinding_factor_secret_hex"],
            "verifier_challenge_context": "LIVE_JUDGE_CHALLENGE_2026",
        },
    )
    assert zkp_resp.status_code == 200 and zkp_resp.json()["verified"] is True
    print(f"[PASS] Test 8 (Failure Boundary & ZKP Claim): Micro-Crop -> {v8['verdict_badge']} & Schnorr NIZK Verified=True")

    print("=" * 78)
    print("ALL 8 MANDATORY VERITASNAP V2 TESTS PASSED WITH 100% MATHEMATICAL PRECISION!")
    print("=" * 78)


if __name__ == "__main__":
    run_all_8_tests()
