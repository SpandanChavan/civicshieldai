import pytest
from fastapi.testclient import TestClient
from app.main import app
from unittest.mock import patch

client = TestClient(app)

def test_classify_severity_high():
    response = client.post(
        "/classify/severity",
        json={"magnitude": 7.0, "event_type": "Earthquake"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "severity" in data
    assert data["severity"] in ["High", "Critical"]
    assert "confidence" in data

def test_classify_severity_low():
    response = client.post(
        "/classify/severity",
        json={"wind_speed": 30.0, "event_type": "Storm"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["severity"] in ["Low", "Medium"]

@patch('app.services.sklearn_service.detect_misinformation')
def test_classify_misinformation(mock_detect):
    mock_detect.return_value = {
        "is_misinformation": False,
        "confidence": 0.85,
        "label": "reliable",
        "explanation": "Seems legit"
    }
    
    response = client.post(
        "/classify/misinformation",
        json={"text": "This is a real news report."}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_misinformation"] == False
    assert data["label"] == "reliable"
