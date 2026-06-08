"""
Basic tests for the ML service health and prediction endpoints.
"""
import pytest
from fastapi.testclient import TestClient

# Import after setting up path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "civicshield-ml"


def test_classify_severity_earthquake():
    resp = client.post("/classify/severity", json={
        "event_type": "Earthquake",
        "magnitude": 7.5
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["severity"] in ["High", "Critical"]
    assert 0.0 <= data["confidence"] <= 1.0


def test_classify_severity_wildfire():
    resp = client.post("/classify/severity", json={
        "event_type": "Wildfire",
        "frp": 120.0
    })
    assert resp.status_code == 200
    assert resp.json()["severity"] == "Critical"


def test_detect_misinformation_clean():
    resp = client.post("/classify/misinformation", json={
        "text": "NDMA has issued an advisory for coastal areas. Please follow official guidelines.",
        "source": "ndma.gov.in"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert not data["is_misinformation"]
    assert data["label"] == "reliable"


def test_detect_misinformation_suspicious():
    resp = client.post("/classify/misinformation", json={
        "text": "FAKE ALERT: Government is hiding the real death toll! Share before deleted!",
        "source": "random-site.com"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_misinformation"]


def test_optimize_routes():
    resp = client.post("/optimize/routes", json={
        "depot": {"id": "depot", "lat": 19.076, "lon": 72.877, "name": "Mumbai HQ"},
        "destinations": [
            {"id": "loc1", "lat": 18.520, "lon": 73.856, "name": "Pune Relief Camp"},
            {"id": "loc2", "lat": 17.381, "lon": 78.476, "name": "Hyderabad Shelter"},
        ],
        "num_vehicles": 2
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "routes" in data


def test_forecast_requires_history():
    resp = client.post("/predict/risk", json={
        "event_type": "Earthquake",
        "location_id": "india-north",
        "history": [{"ds": "2024-01-01", "y": 3}],  # Too few points
        "periods": 7
    })
    assert resp.status_code == 422
