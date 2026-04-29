<div align="center">

# Anonixx

**Anonymous emotion. Structured connection. Built-in monetization.**

*Say the things you can't say anywhere else.*

---

![Version](https://img.shields.io/badge/version-1.0.0-FF634A?style=flat-square)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-0b0f18?style=flat-square&color=9A9AA3)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square)
![Database](https://img.shields.io/badge/database-MongoDB-47A248?style=flat-square)
![Status](https://img.shields.io/badge/status-active%20development-FF634A?style=flat-square)

</div>

---

## What is Anonixx?

Anonixx is a cross-platform anonymous interaction app where people say what they've been holding in — and connect with others without revealing who they are.

It sits at the intersection of anonymous social networking, real-time messaging, emotional expression, and a premium interaction economy. Unlike traditional platforms built on identity, Anonixx is architected around **anonymity**, **controlled access**, and **psychological engagement loops** that drive both retention and monetization.

---

## The Problem

Most social platforms are built on identity — which creates friction. People filter what they say. Vulnerability gets suppressed. Real emotions rarely surface publicly.

At the same time:

- Users **crave connection** but fear exposure
- Users want to **express things** they cannot say publicly
- There is no scalable platform that combines targeted anonymous communication with structured monetization

---

## The Solution

Anonixx introduces a new interaction model: **anonymous, targeted, and progressively unlocked communication.**

Users can:

- Post anonymous confessions ("Drops") to the marketplace or specific individuals
- React and engage without revealing identity
- Build connection over time through earned or purchased access
- Optionally reveal identity through mutual consent

> Curiosity drives engagement. Emotional tension drives retention. Access drives monetization.

---

## Core Features

### 🔥 Drops — The Confession Marketplace
Anonymous confession cards posted to a live marketplace. Each Drop carries an emotional theme, mood tag, and intensity level. Others pay coins to connect with the author.

### 🔓 Progressive Unlock System
Interaction evolves through layers of access:
```
text  →  media  →  voice  →  video  →  identity
```
Each layer is earned through engagement or unlocked through the coin economy.

### 🪙 Coin Economy
The core monetization engine. Users purchase coins (via M-Pesa, Stripe, or PayPal) to:
- Unlock conversations and confessions
- Access deeper interaction layers
- Boost drop visibility

Scarcity is intentional — limited free earning, consistent demand.

### 🎙️ Circles — Live Audio Rooms
Agora-powered live audio sessions with scheduled sessions, live participant rosters, and anonymous hosting.

### 💬 Anonymous Messaging
Real-time chat between matched users — Socket.IO powered, with 1-on-1 audio and video calling (Agora RTC).

### ✦ AI Confession Refinement
Three emotional modes powered by Claude (Anthropic) help users find the right words without changing their meaning:

| Mode | What it does |
|------|-------------|
| `holding_back` | Removes the filter — surfaces what they're afraid to say |
| `distill` | Cuts to the single most powerful feeling |
| `find_words` | Reconstructs with more emotional precision |

Refined drops are marked with a `✦` disclosure badge in the marketplace.

---

## Business Model

| Revenue Stream | Description |
|----------------|-------------|
| **Coin Purchases** | Microtransactions for unlocking interactions — core revenue |
| **Premium Subscription** | Unlimited unlocks, advanced features, priority access |
| **Guaranteed Promotion** | Paid visibility for confessions |
| **Brand Sponsorships** | Sponsored confession series aligned with emotional/relationship brands |

---

## Growth Strategy

- **Viral Content** — Shareable confession cards distributed across Instagram, WhatsApp, and X with platform-agnostic design
- **SEO Layer** — Indexed confession pages targeting long-tail emotional search queries
- **Curiosity Loop** — Partial visibility + gated access + app-required completion drives installs

---

## Competitive Advantage

| What others do | What Anonixx does |
|----------------|-------------------|
| Broadcast anonymity (anyone sees it) | **Targeted anonymity** (sent to someone specific) |
| Identity unlocks via DMs | **Progressive interaction system** — layers earned or purchased |
| Ads-first monetization | **Built-in coin economy from day one** |
| Static content | **Emotion-driven engagement loops** |
| Platform requires sharing | **Content markets itself** |

---

## Tech Stack

### Backend
```
FastAPI 0.115     — async Python API framework
MongoDB + Motor   — async document database
JWT (HS256)       — stateless authentication
Cloudinary        — media storage (images, audio, video)
Socket.IO         — real-time presence, chat, call signaling
Agora             — audio/video room infrastructure
Stripe + M-Pesa   — payment processing
Anthropic Claude  — AI confession refinement
Expo Push         — mobile push notifications
```

### Frontend
```
React Native + Expo 54   — cross-platform (iOS, Android, Web)
Redux Toolkit            — global state management
React Navigation 7       — stack, tab, and modal navigation
NativeWind               — Tailwind CSS for React Native
Socket.IO client         — real-time events
Agora RTC SDK            — 1-on-1 audio/video calls
Axios                    — HTTP client with JWT interceptors
AsyncStorage             — local persistence (tokens, drafts)
```

---

## Project Structure

```
anonixx/
├── Backend/
│   ├── app/
│   │   ├── api/v1/         # Route handlers (drops, auth, coins, circles…)
│   │   ├── models/         # Pydantic models
│   │   ├── utils/          # Coin service, notifications, AI refine
│   │   ├── websockets/     # Socket.IO events + presence tracking
│   │   └── main.py         # App entry point
│   ├── tests/
│   └── requirements.txt
│
└── Frontend/
    ├── src/
    │   ├── screens/        # Feed, Drops, Circles, Connect, Dating…
    │   ├── components/     # Shared UI components
    │   ├── store/          # Redux slices
    │   ├── api/            # Axios client + interceptors
    │   └── utils/          # responsive.js, colorTokens, etc.
    └── package.json
```

---

## Getting Started

### Backend
```bash
cd Backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your keys
uvicorn app.main:app --reload   # http://localhost:8000
```

### Frontend
```bash
cd Frontend
npm install
npx expo start                  # scan QR with Expo Go
npx expo start --web            # run in browser
```

### Environment
| Variable | Description |
|----------|-------------|
| `MONGODB_URL` | MongoDB connection string |
| `SECRET_KEY` | JWT signing secret (min 32 chars) |
| `ANTHROPIC_API_KEY` | Claude API key for confession refinement |
| `CLOUDINARY_*` | Cloud name, API key, API secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `MPESA_*` | Safaricom Daraja credentials |
| `AGORA_APP_ID` | Agora app ID for audio/video rooms |

---

## Status

| Area | Status |
|------|--------|
| Core auth & user system | ✅ Complete |
| Drops marketplace | ✅ Complete |
| Coin economy | ✅ Complete |
| Real-time chat + calls | ✅ Complete |
| Circles (live audio) | ✅ Complete |
| AI confession refinement | ✅ Complete |
| M-Pesa payment integration | ✅ Complete |
| Stripe payment integration | ✅ Complete |
| Publisher (social distribution) | 🔄 In progress |
| Premium subscription tier | 🔄 In progress |

---

## Key Principles

- **Anonymity is protected** — identity is never exposed without consent
- **Identity is never monetized** — Anonixx sells access, not data
- **Emotional authenticity is preserved** — AI assists, never replaces
- **Moderation is strict and scalable** — content passes through safety gates

---

## Contact

For partnerships, investment, or inquiries: **support@anonixx-app.com**

---

<div align="center">

*Anonixx is not another social platform.*
*It is a new interaction layer — where anonymity, emotion, and monetization are structurally aligned.*

</div>
