# 🚀 CivicShield AI — Production Deployment Guide

**GitHub Repo:** https://github.com/SpandanChavan/civicshieldai  
**Stack:** Frontend (Vercel) · Backend (Render) · ML Service (Render) · Database (Supabase Cloud)

---

## Step 0 — Push Latest Code to GitHub

```bash
cd c:\Users\Spandan\OneDrive\Desktop\Codes\civicshield-ai
git add .
git commit -m "feat: Stabilization - Misinfo UI, Auth/RBAC, Reliability, Deployment config"
git push origin main
```

---

## Step 1 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import `SpandanChavan/civicshieldai` from GitHub
3. Set **Root Directory** to `frontend`
4. Vercel will auto-detect Vite — keep all build settings as-is
5. Add these **Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `VITE_BACKEND_URL` | `https://civicshield-backend.onrender.com` (set after Step 2) |
| `VITE_ML_SERVICE_URL` | `https://civicshield-ml.onrender.com` (set after Step 2) |

6. Click **Deploy** → You will get a URL like `https://civicshieldai.vercel.app`

---

## Step 2 — Deploy Backend to Render

### Option A — Using render.yaml (Recommended)
1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click **New** → **Blueprint**
3. Connect your GitHub repo `SpandanChavan/civicshieldai`
4. Render will detect `render.yaml` and create both services automatically

### Option B — Manual
1. Go to render.com → **New Web Service**
2. Connect `SpandanChavan/civicshieldai`
3. Set **Root Directory**: `backend`
4. **Build Command**: `npm install`
5. **Start Command**: `npm run start`
6. Add these **Environment Variables**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service key |
| `FRONTEND_URL` | `https://civicshieldai.vercel.app` |
| `ML_SERVICE_URL` | `https://civicshield-ml.onrender.com` |
| `FIRMS_API_KEY` | Your NASA FIRMS key |
| `RESEND_API_KEY` | Your Resend key |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TWILIO_ACCOUNT_SID` | Your Twilio SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | `whatsapp:+14155238886` |
| `VAPID_PUBLIC_KEY` | Your VAPID public key |
| `VAPID_PRIVATE_KEY` | Your VAPID private key |

---

## Step 3 — Deploy ML Service to Render

1. **New Web Service** → same repo
2. **Root Directory**: `ml-service`
3. **Runtime**: Python 3
4. **Build Command**: `pip install -r requirements.txt`
5. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port 8000`

> The backend has a **keep-alive ping every 14 minutes** to prevent the ML service from cold-starting on Render free tier.

---

## Step 4 — Update Supabase Auth Settings

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
2. Set **Site URL** to `https://civicshieldai.vercel.app`
3. Add `https://civicshieldai.vercel.app` to **Redirect URLs**

---

## Step 5 — Update Vercel Environment Variables

After Render services are deployed:
1. Go back to Vercel → **Project Settings** → **Environment Variables**
2. Update `VITE_BACKEND_URL` to actual Render backend URL
3. Update `VITE_ML_SERVICE_URL` to actual Render ML service URL
4. Trigger a **Redeploy** from the Vercel dashboard

---

## Final Checklist

- [ ] `git push origin main` done
- [ ] Vercel deployment live
- [ ] Backend Render service live — `GET /health` returns 200
- [ ] ML Service Render service live — `GET /health` returns 200
- [ ] Supabase Auth redirect URLs updated
- [ ] Vercel env vars pointing to Render URLs
- [ ] Test login flow on production URL
- [ ] Test misinformation panel on production URL

---

## Local Dev Environment Variables

### frontend/.env.local
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_BACKEND_URL=http://localhost:4000
VITE_ML_SERVICE_URL=http://localhost:8000
```

### backend/.env
```env
NODE_ENV=development
PORT=4000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=your_service_key
FRONTEND_URL=http://localhost:3000
ML_SERVICE_URL=http://127.0.0.1:8000
FIRMS_API_KEY=your_nasa_firms_key
RESEND_API_KEY=re_your_key
TELEGRAM_BOT_TOKEN=your_bot_token
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
VAPID_PUBLIC_KEY=your_vapid_public
VAPID_PRIVATE_KEY=your_vapid_private
```

---

*CivicShield AI — Intelligent Disaster Management for India*
