from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.sklearn_service import classify_severity, detect_misinformation

router = APIRouter()


class SeverityRequest(BaseModel):
    magnitude: Optional[float] = None       # For earthquakes
    frp: Optional[float] = None             # Fire Radiative Power (MW)
    wind_speed: Optional[float] = None      # km/h
    precipitation: Optional[float] = None   # mm/h
    area_affected_km2: Optional[float] = None
    population_density: Optional[float] = None  # per km²
    event_type: str = "Unknown"


class MisinfoRequest(BaseModel):
    text: str
    source: Optional[str] = None


class SeverityResponse(BaseModel):
    severity: str           # "Low" | "Medium" | "High" | "Critical"
    confidence: float       # 0.0–1.0
    features_used: list


class MisinfoResponse(BaseModel):
    is_misinformation: bool
    confidence: float
    label: str              # "reliable" | "suspicious" | "misinformation"
    explanation: str


@router.post("/severity", response_model=SeverityResponse)
def classify_event_severity(req: SeverityRequest):
    """
    Classify disaster severity using a rule-based + ML model.
    """
    try:
        return classify_severity(req.dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/misinformation", response_model=MisinfoResponse)
def classify_misinformation(req: MisinfoRequest):
    """
    Detect misinformation in disaster-related text using NLP.
    Uses keyword patterns + HuggingFace API (if configured).
    """
    try:
        return detect_misinformation(req.text, req.source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
