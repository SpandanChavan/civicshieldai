from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.prophet_service import forecast_risk
import numpy as np

router = APIRouter()

# ── Models ────────────────────────────────────────────────────────────

class HistoricalDataPoint(BaseModel):
    ds: str
    y: float

class FloodRiskRequest(BaseModel):
    basin_id: str
    history: List[HistoricalDataPoint]
    danger_level: float

class EarthquakeRiskRequest(BaseModel):
    district: str
    seismic_zone: str  # "II", "III", "IV", "V"
    recent_magnitudes: List[float]

class HeatwaveRiskRequest(BaseModel):
    district: str
    temperature_anomalies: List[float] # recent max temperature anomalies from normal


# ── Flood Prediction ──────────────────────────────────────────────────

@router.post("/flood-risk")
def predict_flood_risk(req: FloodRiskRequest):
    """
    Predict river basin flood risk using Prophet.
    Forecasts water level and compares to the CWC danger level.
    """
    if len(req.history) < 10:
        raise HTTPException(
            status_code=422,
            detail="At least 10 historical data points required for Prophet forecasting."
        )

    try:
        # Forecast 7 days into the future
        result = forecast_risk(
            event_type="Flood",
            location_id=req.basin_id,
            history=[{"ds": p.ds, "y": p.y} for p in req.history],
            periods=7,
            freq="D"
        )
        
        # Analyze the forecast to determine risk compared to danger_level
        max_predicted_level = max([f.get("yhat_upper", 0) for f in result["forecast"]])
        
        # Custom risk logic based on danger level
        if max_predicted_level >= req.danger_level + 1.0:
            risk = "Critical"
        elif max_predicted_level >= req.danger_level:
            risk = "High"
        elif max_predicted_level >= req.danger_level - 1.0:
            risk = "Medium"
        else:
            risk = "Low"
            
        result["india_risk_level"] = risk
        result["danger_level_threshold"] = req.danger_level
        result["max_predicted_water_level"] = round(max_predicted_level, 2)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Flood forecast failed: {str(e)}")


# ── Earthquake Risk Scoring ──────────────────────────────────────────

@router.post("/earthquake-risk")
def score_earthquake_risk(req: EarthquakeRiskRequest):
    """
    Compute a district-level earthquake risk score (0-100) based on NDMA 
    seismic zone classification and recent NCS magnitude history.
    """
    # Base risk from NDMA Seismic Zones
    zone_base_scores = {
        "V": 80.0,
        "IV": 60.0,
        "III": 40.0,
        "II": 20.0
    }
    
    base_score = zone_base_scores.get(req.seismic_zone.upper(), 30.0)
    
    # Add dynamic risk from recent activity (Gutenberg-Richter inspired weighting)
    # Higher magnitude recent quakes add exponentially more risk.
    dynamic_penalty = sum([np.exp(m) for m in req.recent_magnitudes if m >= 3.0]) * 0.1
    
    final_score = min(100.0, base_score + dynamic_penalty)
    
    if final_score >= 85:
        risk = "Critical"
    elif final_score >= 65:
        risk = "High"
    elif final_score >= 45:
        risk = "Medium"
    else:
        risk = "Low"

    return {
        "district": req.district,
        "seismic_zone": req.seismic_zone.upper(),
        "risk_score_100": round(final_score, 2),
        "risk_level": risk,
        "base_zone_score": base_score,
        "recent_activity_penalty": round(dynamic_penalty, 2)
    }


# ── Heatwave Prediction ──────────────────────────────────────────────

@router.post("/heatwave-risk")
def predict_heatwave_risk(req: HeatwaveRiskRequest):
    """
    Predict heatwave risk based on IMD temperature anomaly guidelines.
    A heatwave is typically declared when max temp departure is >= 4.5°C to 6.4°C.
    Severe heatwave is >= 6.4°C.
    """
    anomalies = req.temperature_anomalies
    if not anomalies:
        raise HTTPException(status_code=422, detail="No anomaly data provided")

    # Simple moving average to smooth short-term noise
    recent_trend = np.mean(anomalies[-3:]) if len(anomalies) >= 3 else np.mean(anomalies)
    max_anomaly = np.max(anomalies)
    
    # Calculate probability using a sigmoid-like function centered around the 4.5 threshold
    def sigmoid(x, L=100, k=1.5, x0=4.5):
        return L / (1 + np.exp(-k * (x - x0)))
        
    probability = sigmoid(recent_trend)
    
    if recent_trend >= 6.4 or max_anomaly >= 6.4:
        risk = "Critical"  # Severe Heatwave condition
    elif recent_trend >= 4.5 or max_anomaly >= 4.5:
        risk = "High"      # Heatwave condition
    elif recent_trend >= 2.0:
        risk = "Medium"
    else:
        risk = "Low"

    return {
        "district": req.district,
        "recent_anomaly_trend": round(recent_trend, 2),
        "max_anomaly_recorded": round(max_anomaly, 2),
        "heatwave_probability_percent": round(probability, 2),
        "risk_level": risk
    }
