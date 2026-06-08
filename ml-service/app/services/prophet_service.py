"""
Prophet-based time series forecasting service for disaster risk prediction.
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Any

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    print("[ML] Prophet not installed — using linear fallback forecasting")


SEVERITY_THRESHOLDS = {
    "Earthquake": {"Low": 2, "Medium": 5, "High": 8, "Critical": 10},
    "Wildfire": {"Low": 1, "Medium": 4, "High": 7, "Critical": 12},
    "Flood": {"Low": 1, "Medium": 3, "High": 6, "Critical": 10},
    "default": {"Low": 2, "Medium": 5, "High": 8, "Critical": 12},
}


def _get_thresholds(event_type: str) -> Dict[str, float]:
    return SEVERITY_THRESHOLDS.get(event_type, SEVERITY_THRESHOLDS["default"])


def _yhat_to_risk_level(yhat: float, event_type: str) -> str:
    t = _get_thresholds(event_type)
    if yhat >= t["Critical"]:
        return "Critical"
    elif yhat >= t["High"]:
        return "High"
    elif yhat >= t["Medium"]:
        return "Medium"
    return "Low"


def _linear_fallback(history: List[Dict], periods: int) -> List[Dict]:
    """Simple linear extrapolation when Prophet is not available."""
    y_values = [h["y"] for h in history]
    n = len(y_values)
    x = np.arange(n)
    coeffs = np.polyfit(x, y_values, 1)
    slope, intercept = coeffs

    from datetime import datetime, timedelta
    last_ds = pd.to_datetime(history[-1]["ds"])
    result = []
    for i in range(1, periods + 1):
        ds = last_ds + timedelta(days=i)
        yhat = max(0, slope * (n + i) + intercept)
        result.append({
            "ds": ds.strftime("%Y-%m-%d"),
            "yhat": round(yhat, 2),
            "yhat_lower": round(max(0, yhat * 0.7), 2),
            "yhat_upper": round(yhat * 1.3, 2),
        })
    return result


def forecast_risk(
    event_type: str,
    location_id: str,
    history: List[Dict[str, Any]],
    periods: int = 7,
    freq: str = "D",
) -> Dict[str, Any]:
    """
    Generate a probabilistic risk forecast.

    Args:
        event_type:   Type of disaster event
        location_id:  Region identifier
        history:      List of {"ds": "YYYY-MM-DD", "y": float}
        periods:      Number of future periods to forecast
        freq:         Frequency: "D" (daily) or "H" (hourly)

    Returns:
        Dict with forecast list, risk_level, and confidence
    """
    df = pd.DataFrame(history)
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0)

    if PROPHET_AVAILABLE:
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=(freq == "H"),
            changepoint_prior_scale=0.1,
            interval_width=0.80,
        )
        model.fit(df)
        future = model.make_future_dataframe(periods=periods, freq=freq)
        forecast_df = model.predict(future)
        future_only = forecast_df.tail(periods)

        forecast_list = [
            {
                "ds": row["ds"].strftime("%Y-%m-%d"),
                "yhat": round(max(0, row["yhat"]), 2),
                "yhat_lower": round(max(0, row["yhat_lower"]), 2),
                "yhat_upper": round(max(0, row["yhat_upper"]), 2),
            }
            for _, row in future_only.iterrows()
        ]
    else:
        forecast_list = _linear_fallback(history, periods)

    # Peak forecast value → risk level
    peak_yhat = max(f["yhat"] for f in forecast_list)
    risk_level = _yhat_to_risk_level(peak_yhat, event_type)

    # Confidence: higher when historical variance is low
    variance = float(df["y"].std()) if len(df) > 1 else 1.0
    mean_val = float(df["y"].mean()) if float(df["y"].mean()) > 0 else 1.0
    cv = variance / mean_val  # Coefficient of variation
    confidence = round(max(0.4, min(0.95, 1 - cv * 0.3)), 2)

    return {
        "event_type": event_type,
        "location_id": location_id,
        "forecast": forecast_list,
        "risk_level": risk_level,
        "confidence": confidence,
    }
