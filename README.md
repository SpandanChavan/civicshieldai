# CivicShield AI

**Intelligent Disaster Management Platform** — Full-stack monorepo with real-time multi-hazard monitoring, AI-powered risk analytics, multilingual alert delivery, and interactive geospatial mapping.

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Leaflet.js |
| Backend | Node.js 20 + Express + Socket.io |
| ML Service | Python 3.11 + FastAPI + Prophet + OR-Tools |
| Database | Supabase (PostgreSQL + PostGIS) |
| Translation | LibreTranslate (self-hosted) |
| Hosting | Vercel (frontend) + Render.com (backend/ML) |

## Quick Start

### Prerequisites
- Node.js v20 LTS
- Python 3.11
- Docker Desktop
- Supabase CLI (`npm install -g supabase`)

### Local Development

**1. Start infrastructure (Docker)**
```bash
# Terminal 1 - Supabase
supabase init && supabase start

# Terminal 2 - Redis
docker run -d --name civicshield-redis -p 6379:6379 redis:alpine

# Terminal 3 - LibreTranslate
docker run -d --name libretranslate -p 5000:5000 -e LT_LOAD_ONLY=en,hi,ta,te,bn,gu,mr libretranslate/libretranslate
```

**2. Setup environment variables**
```bash
cp .env.example backend/.env
cp .env.example frontend/.env.local
# Fill in your real API keys
```

**3. Run Supabase migrations**
```bash
# Copy SQL from supabase/migrations/001_initial_schema.sql
# Run in Supabase SQL Editor
```

**4. Start services**
```bash
# Terminal A - Backend
cd backend && npm install && npm run dev

# Terminal B - ML Service
cd ml-service && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

# Terminal C - Frontend
cd frontend && npm install && npm run dev
```

## Deployment
- **Frontend** → Vercel (auto-deploy on push to `main`)
- **Backend** → Render.com Web Service (`backend/`)
- **ML Service** → Render.com Web Service (`ml-service/`)
- **LibreTranslate** → Render.com Web Service (`libretranslate/`)

## Architecture
```
civicshield-ai/
├── frontend/          # React + Vite → Vercel
├── backend/           # Node.js + Express → Render
├── ml-service/        # Python + FastAPI → Render
├── libretranslate/    # Docker → Render
├── supabase/          # DB migrations + config
└── .github/workflows/ # CI/CD pipeline
```

## API Keys Required
See `.env.example` for the full list. All keys are free-tier or zero-key APIs.

## License
MIT — CivicShield AI Dev Team
