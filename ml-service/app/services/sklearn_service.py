"""
Rule-based classification service for CivicShield AI.

Covers two classifiers:
  1. Disaster severity — threshold rules per event type (Earthquake/Wildfire/Flood)
     with a combined feature score for unknown types.
  2. Misinformation detection — regex pattern matching against known panic/disinfo
     phrases plus source domain credibility scoring.

No ML model is used or required. The HuggingFace integration was removed because
it was unreachable dead code (the function was defined but never called anywhere).
"""
import re
from typing import Dict, Any, Optional


# ── Severity Classification ───────────────────────────────────────

SEVERITY_RULES = {
    "Earthquake": [
        (7.0, "Critical"),
        (6.0, "High"),
        (5.0, "Medium"),
        (0.0, "Low"),
    ],
    "Wildfire": [
        (100.0, "Critical"),
        (50.0, "High"),
        (10.0, "Medium"),
        (0.0, "Low"),
    ],
    "Flood": [
        (50.0, "Critical"),
        (20.0, "High"),
        (5.0, "Medium"),
        (0.0, "Low"),
    ],
}


def classify_severity(features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Rule-based severity classifier with feature scoring.
    Falls back to a combined score when no event-specific rule applies.
    """
    event_type = features.get("event_type", "Unknown")
    features_used = []

    # Event-specific rules
    if event_type == "Earthquake" and features.get("magnitude") is not None:
        mag = float(features["magnitude"])
        features_used.append(f"magnitude={mag}")
        for threshold, severity in SEVERITY_RULES["Earthquake"]:
            if mag >= threshold:
                return {"severity": severity, "confidence": 0.92, "features_used": features_used}

    if event_type == "Wildfire" and features.get("frp") is not None:
        frp = float(features["frp"])
        features_used.append(f"frp={frp}")
        for threshold, severity in SEVERITY_RULES["Wildfire"]:
            if frp >= threshold:
                return {"severity": severity, "confidence": 0.88, "features_used": features_used}

    # Generic combined score
    score = 0.0
    if features.get("wind_speed"):
        score += min(float(features["wind_speed"]) / 100, 1.0) * 30
        features_used.append(f"wind_speed={features['wind_speed']}")
    if features.get("precipitation"):
        score += min(float(features["precipitation"]) / 50, 1.0) * 25
        features_used.append(f"precipitation={features['precipitation']}")
    if features.get("area_affected_km2"):
        score += min(float(features["area_affected_km2"]) / 10000, 1.0) * 25
        features_used.append(f"area={features['area_affected_km2']}km²")
    if features.get("population_density"):
        score += min(float(features["population_density"]) / 5000, 1.0) * 20
        features_used.append(f"pop_density={features['population_density']}")

    if score >= 75:
        severity, conf = "Critical", 0.75
    elif score >= 50:
        severity, conf = "High", 0.72
    elif score >= 25:
        severity, conf = "Medium", 0.68
    else:
        severity, conf = "Low", 0.65

    return {"severity": severity, "confidence": conf, "features_used": features_used or ["generic_score"]}


# ── Misinformation Detection ──────────────────────────────────────

# Patterns indicative of misinformation/panic content
MISINFO_PATTERNS = [
    r"FAKE\s+ALERT",
    r"government\s+(is\s+)?hiding",
    r"media\s+blackout",
    r"share\s+before\s+deleted",
    r"official\s+(is\s+)?lying",
    r"death\s+toll\s+is\s+actually\s+\d+\s*times",
    r"don'?t\s+trust\s+(the\s+)?government",
    r"this\s+is\s+a\s+hoax",
]

# Reliable source domain patterns
RELIABLE_SOURCES = [
    "ndma.gov.in", "imd.gov.in", "usgs.gov", "nasa.gov",
    "gdacs.org", "reliefweb.int", "who.int", "ndtv.com",
    "thehindu.com", "reuters.com", "apnews.com",
]


def detect_misinformation(text: str, source: Optional[str] = None) -> Dict[str, Any]:
    """
    Rule-based misinformation detector.

    Checks text against a set of known panic/disinfo regex patterns and
    gives a credibility bonus when the source URL belongs to a verified domain.

    Returns:
        is_misinformation, confidence, label, explanation
    """
    text_lower = text.lower()
    misinfo_hits = sum(1 for p in MISINFO_PATTERNS if re.search(p, text, re.IGNORECASE))

    # Source credibility bonus
    source_reliable = any(domain in (source or "").lower() for domain in RELIABLE_SOURCES)

    if misinfo_hits >= 2 and not source_reliable:
        return {
            "is_misinformation": True,
            "confidence": min(0.5 + misinfo_hits * 0.12, 0.95),
            "label": "misinformation",
            "explanation": f"Matched {misinfo_hits} misinformation pattern(s). Manual review recommended.",
        }
    elif misinfo_hits == 1 and not source_reliable:
        return {
            "is_misinformation": False,
            "confidence": 0.55,
            "label": "suspicious",
            "explanation": "Contains 1 suspicious pattern. Treat with caution.",
        }
    elif source_reliable:
        return {
            "is_misinformation": False,
            "confidence": 0.90,
            "label": "reliable",
            "explanation": "Content from verified reliable source.",
        }
    else:
        return {
            "is_misinformation": False,
            "confidence": 0.70,
            "label": "reliable",
            "explanation": "No misinformation patterns detected.",
        }
