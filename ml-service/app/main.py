from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from app.routers import predict, classify, optimize, india

app = FastAPI(
    title="CivicShield ML Service",
    description="AI-powered disaster risk prediction, classification, and resource optimization",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# M3 FIX: restrict CORS to an explicit allow-list from ALLOWED_ORIGINS env var.
# Wildcard ("*") + allow_credentials=True is rejected by browsers — it's also
# a security hole. Default to localhost dev ports when the env var is not set.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(predict.router,  prefix="/predict",  tags=["Prediction"])
app.include_router(classify.router, prefix="/classify", tags=["Classification"])
app.include_router(optimize.router, prefix="/optimize", tags=["Optimization"])
app.include_router(india.router,    prefix="/india",    tags=["India AI"])


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "civicshield-ml",
        "version": "1.0.0",
    }


@app.get("/", tags=["Health"])
def root():
    return {"message": "CivicShield ML Service — see /docs for API reference"}
