# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Anonixx** is a cross-platform anonymous mental health support app. It has two separate codebases:
- `Frontend/` — React Native + Expo app (iOS, Android, Web)
- `Backend/` — Python FastAPI backend

---

## Commands

### Frontend (React Native / Expo)
```bash
cd Frontend
npm install
npx expo start          # Start dev server (scan QR with Expo Go)
npx expo run:android    # Run on Android emulator/device
npx expo run:ios        # Run on iOS simulator/device
npx expo start --web    # Run in browser
```

### Backend (FastAPI)
```bash
cd Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # Dev server at http://localhost:8000
```

Run a single backend test:
```bash
cd Backend
pytest tests/test_auth.py -v
pytest tests/ -k "test_login" -v
```

### Environment Setup
- Copy `Backend/.env.example` → `Backend/.env` and fill in values
- Frontend API URL is configured in `Frontend/.env`: set `API_URL` to your backend address (e.g. `http://192.168.x.x:8000/api/v1`)

---

## Architecture

### Frontend

**State management:** Redux Toolkit for global state (auth, posts, dating, chat, coins). `AuthContext.jsx` also holds auth state — this is a dual pattern; Redux `authSlice` and `AuthContext` both exist and interact.

**Navigation:** React Navigation with three root navigators:
- `AuthNavigator` — unauthenticated flow (Login, Signup, Onboarding)
- `TabNavigator` — main app tabs
- `AppNavigator` — wraps both, switches based on auth state

**API layer:** Axios client in `src/api/` with JWT interceptors. Token stored in AsyncStorage. Base URL from `Frontend/.env`.

**Real-time:** Socket.IO client via `SocketContext.jsx` for chat and live events.

**Styling:** NativeWind (Tailwind CSS for React Native). Use Tailwind class names via `className` prop.

**Key screen groups:**
- `screens/feed/` — main content feed with anonymous + authenticated posts
- `screens/drops/` — confession marketplace with vibe scoring
- `screens/circles/` — audio rooms (Agora-powered live sessions)
- `screens/connect/` — anonymous profile connections
- `screens/dating/` — swipe-based matching

### Backend

**All routes** are in `app/api/v1/` as individual router files, registered in `app/main.py`.

**Database:** MongoDB via Motor (async). Connection in `app/db/database.py`. Production DB name: `anonispill`, dev: `anonixx`.

**Auth:** JWT HS256 tokens. Access tokens: 30 min. Refresh tokens: 7 days. Auth dependency injected into protected routes.

**Media uploads:** Cloudinary (images, audio, video) via `app/api/v1/upload.py`.

**Payments:** Stripe, M-Pesa (Safaricom Daraja), PayPal — all in `app/api/v1/payments.py` with webhooks in `app/api/v1/webhooks.py`.

**Real-time tokens:** Agora token generation in `app/api/v1/circles.py` for audio rooms.

**Virtual currency:** Coins system tracked in `app/models/coin_transaction.py`, endpoints in `app/api/v1/coins.py`.

### Key Cross-Cutting Concerns

- Anonymous vs. authenticated posts are handled at the data model level — posts have an `is_anonymous` flag
- The "Drops" feature is a confession marketplace: users post anonymous confessions, others can pay coins to reveal the author's identity (vibe score system)
- Circles are Agora-powered audio rooms with scheduled sessions, live participants, and a backend roster
- Deep links: `anonixx://drop/:dropId` and `anonixx://confession`
