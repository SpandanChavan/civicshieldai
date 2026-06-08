from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.services.prophet_service import forecast_risk

router = APIRouter()


class HistoricalDataPoint(BaseModel):
    ds: str          # Date string: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
    y: float         # Observation value (e.g., earthquake count, fire intensity)


class ForecastRequest(BaseModel):
    event_type: str                        # "Earthquake", "Wildfire", "Flood", etc.
    location_id: str                       # Grid cell or region identifier
    history: List[HistoricalDataPoint]     # Historical time series
    periods: int = 7                       # Days to forecast
    freq: str = "D"                        # "D" daily, "H" hourly


class RiskForecastResponse(BaseModel):
    event_type: str
    location_id: str
    forecast: List[dict]       # ds, yhat, yhat_lower, yhat_upper
    risk_level: str            # "Low" | "Medium" | "High" | "Critical"
    confidence: float          # 0.0–1.0


@router.post("/risk", response_model=RiskForecastResponse)
def predict_risk(req: ForecastRequest):
    """
    Generate a multi-day disaster risk forecast using Facebook Prophet.
    Accepts historical event counts and returns a probabilistic forecast.
    """
    if len(req.history) < 10:
        raise HTTPException(
            status_code=422,
            detail="At least 10 historical data points required for forecasting."
        )

    try:
        result = forecast_risk(
            event_type=req.event_type,
            location_id=req.location_id,
            history=[{"ds": p.ds, "y": p.y} for p in req.history],
            periods=req.periods,
            freq=req.freq,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


@router.get("/risk/demo")
def risk_demo():
    """Demo endpoint with synthetic data — no input required."""
    import pandas as pd
    import numpy as np
    from datetime import datetime, timedelta

    base = datetime.now() - timedelta(days=30)
    history = [
        {"ds": (base + timedelta(days=i)).strftime("%Y-%m-%d"),
         "y": max(0, np.random.poisson(3) + np.sin(i / 7 * 3.14) * 2)}
        for i in range(30)
    ]

    try:
        return forecast_risk("Earthquake", "demo_region", history, periods=7)
    except Exception as e:
        return {"error": str(e), "note": "Install prophet: pip install prophet"}
