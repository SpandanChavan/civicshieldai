"""
vision_service.py — AI Incident Photo Classifier (feature E1).

Runs image classification on a citizen's incident photo to pre-annotate the
coordinator's review queue with a suggested damage type + severity.

Approach: HuggingFace Inference API (no local model download — demo-friendly,
no heavy torch/transformers dependency). Requires a free HF token in
HF_API_TOKEN. If the token is absent or the call fails, the function degrades
gracefully (returns available=False) so it can NEVER break incident submission.
"""
import os
import httpx

HF_API_TOKEN = os.getenv("HF_API_TOKEN")
# A general image classifier; override with HF_VISION_MODEL if desired.
HF_MODEL = os.getenv("HF_VISION_MODEL", "microsoft/resnet-50")
HF_URL = f"https://api-inference.huggingface.co/models/{HF_MODEL}"

# Map keywords found in the model's top label → disaster damage type + severity.
# Ordered: first match wins.
KEYWORD_RULES = [
    (("flood", "water", "lakeshore", "seashore", "lakeside"), "flood", "High"),
    (("fire", "flame", "smoke", "volcano", "wildfire"),       "fire", "Critical"),
    (("collapse", "rubble", "ruin", "wreck", "debris"),       "structural_damage", "Critical"),
    (("landslide", "cliff", "mudslide", "avalanche"),          "landslide", "High"),
    (("crack", "damage", "broken", "pothole"),                 "damage", "Medium"),
]


def _label_to_severity(label: str):
    label = (label or "").lower()
    for keywords, damage_type, severity in KEYWORD_RULES:
        if any(k in label for k in keywords):
            return damage_type, severity
    return "unknown", "Medium"


async def classify_image_url(image_url: str) -> dict:
    """
    Classify the image at `image_url`. Always returns a dict; never raises.
    """
    if not HF_API_TOKEN:
        return {"available": False, "reason": "HF_API_TOKEN not configured"}
    if not image_url or not isinstance(image_url, str):
        return {"available": False, "reason": "no image_url"}

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            # 1. Download the image bytes
            img_resp = await client.get(image_url)
            img_resp.raise_for_status()

            # 2. Send to HF inference API
            infer = await client.post(
                HF_URL,
                headers={"Authorization": f"Bearer {HF_API_TOKEN}"},
                content=img_resp.content,
            )
            if infer.status_code == 503:
                return {"available": False, "reason": "model loading, retry shortly"}
            infer.raise_for_status()
            results = infer.json()

        if not isinstance(results, list) or not results:
            return {"available": False, "reason": "no prediction returned"}

        top = results[0]
        label = str(top.get("label", "")).lower()
        confidence = round(float(top.get("score", 0.0)), 3)
        damage_type, suggested_severity = _label_to_severity(label)

        return {
            "available": True,
            "predicted_label": label,
            "confidence": confidence,
            "damage_type": damage_type,
            "suggested_severity": suggested_severity,
            "model": HF_MODEL,
        }
    except Exception as e:  # network, timeout, decode, etc. — never fatal
        return {"available": False, "reason": str(e)}
