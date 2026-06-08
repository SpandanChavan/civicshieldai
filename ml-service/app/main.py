from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from app.routers import predict, classify, optimize

app = FastAPI(
    title="CivicShield ML Service",
    description="AI-powered disaster risk prediction, classification, and resource optimization",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(predict.router,  prefix="/predict",  tags=["Prediction"])
app.include_router(classify.router, prefix="/classify", tags=["Classification"])
app.include_router(optimize.router, prefix="/optimize", tags=["Optimization"])


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
