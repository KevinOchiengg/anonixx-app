# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

**NEVER use git worktrees or create isolated branches for this project.** Always work directly on the current branch (usually `main`). The developer needs to see changes in real time without merging steps. Do not use `isolation: "worktree"` when spawning agents. Make edits directly to the files in the working directory.

---

## Project Overview

**Anonixx** is an anonymous confession and connection app. Three codebases:
- `Frontend/` — React Native + Expo app (Android, iOS)
- `Web/` — Next.js website (feed, compose, Rooms, admin dashboard)
- `Backend/` — Python FastAPI API

---

## Commands

### Frontend (React Native / Expo)
```bash
cd Frontend
npm install
npx expo start          # Start dev server (scan QR with Expo Go)
npx expo run:android    # Run on Android emulator/device
npx expo run:ios        # Run on iOS simulator/device
```

### Web (Next.js)
```bash
cd Web
npm install
npm run dev             # http://localhost:3000
npx tsc --noEmit -p .   # Type-check
```

### Backend (FastAPI)
```bash
cd Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # Dev server at http://localhost:8000
```

### Environment Setup
- Copy `Backend/.env.example` → `Backend/.env` and fill in values
- Frontend API URL is configured in `Frontend/.env`: set `API_URL` to your backend address (e.g. `http://192.168.x.x:8000/api/v1`)

---

## Architecture

### Frontend (app)

- **State:** Redux Toolkit (`store/slices`: auth, coins, market) plus `AuthContext.jsx`. Both hold the current user; update both when it changes.
- **Navigation:** React Navigation. `AppNavigator` (root stack, no login gate) wraps `TabNavigator` (routes Feed, Messages, Create, Requests, Profile; labelled Desires, Rooms, +, Requests, You); auth screens live under `AuthNav`.
- **API:** mostly `fetch` with `API_BASE_URL` from `config/api.js`; the JWT is in AsyncStorage.
- **Real-time:** Socket.IO via `SocketContext.jsx` / `services/socket.js`.
- **Styling:** `StyleSheet` with tokens from `utils/theme.js` and sizes from `utils/responsive.js`.
- **Screens:** `feed/` (full-screen swipe feed, search), `drops/` (compose, chat, Rooms, knocks, calls), `connect/` (messages), `market/`, `profile/`, `settings/`, `admin/`, `support/`.

### Web

Next.js App Router in `Web/app`, components in `Web/components`, helpers in `Web/lib` (`api.ts`, `auth.tsx`). The admin dashboard is under `Web/app/admin`. Anonymous visit tracking: `Web/lib/track.ts`.

### Backend

- **Routes:** one router file per area in `app/api/v1/`, registered in `app/main.py`.
- **Database:** MongoDB via Motor, connection in `app/database.py`. Database name `anonixx` (the old `anonispill` database is kept on the cluster as a rollback snapshot).
- **Auth:** JWT HS256, 30-day access tokens, no refresh tokens. Auth dependencies in `app/dependencies.py`.
- **Media:** Cloudflare R2 (`app/utils/r2_storage.py`, `app/api/v1/upload.py`); video drops can use Cloudflare Stream (`app/utils/stream.py`).
- **Payments:** coins in `app/api/v1/coins.py`, premium in `app/api/v1/premium.py` (M-Pesa, Stripe, Google Play), prices by country in `geo_pricing.py`. All coin changes go through `app/utils/coin_service.py`.
- **Calls:** Agora tokens for Room video calls in `app/api/v1/drop_calls.py`.
- **Background tasks:** `app/tasks/` (social publisher, drop cleanup, scheduled drops, admin monitor).

### Key concepts

- **Drops:** anonymous posts (confessions, hookup posts, media). Official drops are posted by admins as "Anonixx".
- **Rooms and Knocks:** each poster has a Room. Others Knock (free); coins move only when the owner Lets them In, which opens a Link Up chat (`unlock_requests.py`).
- Deep links: `anonixx://drop/:dropId`
