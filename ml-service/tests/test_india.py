import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_earthquake_risk():
    response = client.post(
        "/india/earthquake-risk",
        json={
            "district": "Delhi",
            "seismic_zone": "IV",
            "recent_magnitudes": [3.5, 4.2]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["district"] == "Delhi"
    assert data["seismic_zone"] == "IV"
    assert "risk_score_100" in data
    assert data["risk_level"] in ["Low", "Medium", "High", "Critical"]

def test_heatwave_risk_high():
    response = client.post(
        "/india/heatwave-risk",
        json={
            "district": "Nagpur",
            "temperature_anomalies": [4.5, 5.0, 6.5]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["risk_level"] in ["High", "Critical"]

def test_heatwave_risk_low():
    response = client.post(
        "/india/heatwave-risk",
        json={
            "district": "Shimla",
            "temperature_anomalies": [0.5, 1.0, 0.2]
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["risk_level"] == "Low"

def test_flood_risk_invalid_history():
    response = client.post(
        "/india/flood-risk",
        json={
            "basin_id": "basin-1",
            "history": [{"ds": "2023-01-01", "y": 20.0}], # Needs at least 10 points
            "danger_level": 25.0
        }
    )
    assert response.status_code == 422
