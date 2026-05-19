<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=180&color=0:111827,45:7C3AED,100:06B6D4&text=AI%20Companion&fontColor=FFFFFF&fontSize=52&fontAlignY=38&desc=Emotion-aware%20chat%20with%20VRM%20companions,%20voice,%20and%20community&descAlignY=62&descSize=16" alt="AI Companion animated header" width="100%" />

  <img src="app/static/images/logo.png" alt="AI Companion logo" width="112" />

  <br />
  <br />

  <a href="https://git.io/typing-svg">
    <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=700&size=28&duration=2300&pause=650&color=8B5CF6&center=true&vCenter=true&width=920&lines=Your+personal+AI+companion;FastAPI+chat+with+memory+and+auth;VRM+characters+with+local+voice;Anonymous+community+for+emotional+support" alt="Animated typing intro" />
  </a>

  <p>
    <strong>AI Companion</strong> is a full-stack FastAPI experience for personal AI chat,
    emotional reflection, anonymous community sharing, VRM companion characters, and
    local Piper-powered voice generation.
  </p>

  <p>
    <img alt="Python" src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" />
    <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-API-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
    <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
    <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-Compatible-111827?style=for-the-badge&logo=openai&logoColor=white" />
    <img alt="Jinja2" src="https://img.shields.io/badge/Jinja2-Templates-B41717?style=for-the-badge&logo=jinja&logoColor=white" />
  </p>

  <p>
    <a href="#quick-start">Quick Start</a>
    |
    <a href="#companion-characters">Characters</a>
    |
    <a href="#features">Features</a>
    |
    <a href="#api-map">API Map</a>
    |
    <a href="#voice-pipeline">Voice</a>
  </p>
</div>

---

## Showcase

<div align="center">
  <img src="app/static/images/companions/visual-novel-set1-preview.png" alt="AI Companion scene preview" width="880" />
  <br />
  <sub>This image is a scene preview. The real companion characters are loaded from VRM model files in the app.</sub>
</div>

## Companion Characters

GitHub cannot render `.vrm` models directly inside a README, so the character source files are listed clearly here.

| Character | VRM model | Scene assets | Role in the experience |
| --- | --- | --- | --- |
| Yuna | `app/static/images/companions/female-yuna.vrm` | `bg-yuna-cherry.jpg`, `emora-room-bg.jpg` | Warm companion for calm, reflective chats. |
| Haru | `app/static/images/companions/male-haru.vrm` | `bg-haru-forest.jpg` | Grounded companion for steady support. |
| Robert | `app/static/images/companions/robert.vrm` | `emora-room-bg.jpg` | Conversational companion for everyday guidance. |
| Rose | `app/static/images/companions/rose.vrm` | `bg-sakurada-garden.jpg` | Gentle companion for emotionally soft moments. |

## Features

| Area | What it does |
| --- | --- |
| AI chat | OpenAI-compatible chat replies with saved conversation history. |
| Dashboard | View, pin, delete, share, and continue conversations. |
| Authentication | Register, login, JWT verification, Google OAuth, and OTP password reset. |
| Community | Anonymous MongoDB-backed posts with likes. |
| Companions | VRM character models, companion profiles, scene backgrounds, and avatar assets. |
| Voice | Piper TTS integration with generated audio caching. |
| Frontend | FastAPI-served Jinja templates with custom CSS and vanilla JavaScript. |

## Architecture

```mermaid
flowchart LR
  Browser["Browser UI"] --> Pages["FastAPI Pages"]
  Browser --> API["FastAPI API Routes"]
  Pages --> Templates["Jinja Templates"]
  API --> Auth["Auth + JWT"]
  API --> Chat["OpenAI-Compatible Chat"]
  API --> Posts["Community Posts"]
  API --> Voices["Piper Voice Pipeline"]
  Auth --> Mongo["MongoDB"]
  Chat --> Mongo
  Posts --> Mongo
  Voices --> Cache["Audio Cache"]
```

## Tech Stack

```text
Backend       FastAPI, Uvicorn, Pydantic
Frontend      Jinja2, vanilla JavaScript, custom CSS
Database      MongoDB with PyMongo
AI chat       OpenAI Python SDK with compatible base URL support
Auth          JWT, bcrypt, Google OAuth, email OTP
Voice         Piper TTS, Hugging Face model downloads, WAV cache
Assets        PNG avatars, JPG scenes, VRM companion models
```

## Quick Start

Clone the repository:

```bash
git clone https://github.com/MaheshReddy-ML/AI-Companion-
cd AI-Companion-
```

Create the environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create your local environment file:

```bash
cp .env.example .env
```

Start the app:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open the local app:

```text
http://127.0.0.1:8000
```

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection string. |
| `JWT_SECRET` | Yes | Secret key used to sign access tokens. |
| `OPENAI_API_KEY` | Yes | Key for OpenAI-compatible chat completions. |
| `OPENAI_BASE_URL` | Optional | Compatible API endpoint, such as GitHub Models or Azure inference. |
| `OPENAI_MODEL` | Yes | Chat model name. |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth callback secret. |
| `EMAIL_USER` | Optional | SMTP sender email for OTP delivery. |
| `EMAIL_PASS` | Optional | SMTP app password for OTP delivery. |

## Google OAuth

For local development, configure your Google OAuth web client with:

```text
Authorized JavaScript origin: http://127.0.0.1:8000
Authorized redirect URI:       http://127.0.0.1:8000/auth/google/callback
```

If you run the app on `localhost`, add matching `localhost:8000` entries as well.

## Voice Pipeline

Install dependencies first, then optionally download recommended open-source Piper models:

```bash
python scripts/voice_downloader.py --download
```

Voice models are stored in `models/voices/`, and generated audio is cached in `cache/audio/`. Both are ignored by git because they are local/generated assets.

```text
GET  /api/voices/list
POST /api/voices/speak
```

Example voice request:

```json
{
  "text": "Hey, I am here with you.",
  "companion_id": "Yuna",
  "voice_id": null,
  "stream": false
}
```

## API Map

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/` | `GET` | Landing page. |
| `/login` | `GET` | Login page. |
| `/register` | `GET` | Registration page. |
| `/dashboard` | `GET` | Conversation dashboard. |
| `/community` | `GET` | Anonymous community page. |
| `/health` | `GET` | Server health check. |
| `/api/auth/*` | Mixed | Registration, login, OTP, Google auth, token verification. |
| `/api/chat/*` | Mixed | Chat and conversation actions. |
| `/posts` | `GET/POST` | List or create community posts. |
| `/posts/{post_id}/like` | `POST` | Like a community post. |
| `/api/voices/list` | `GET` | List available local voices. |
| `/api/voices/speak` | `POST` | Generate companion speech audio. |

## Project Structure

```text
AI-Companion-/
  app/
    main.py                 FastAPI app entrypoint
    config.py               Environment-backed settings
    database.py             MongoDB connection and indexes
    security.py             Password hashing, JWTs, auth helpers
    routers/                Pages, auth, chat, posts, voices
    services/               OpenAI, Google auth, community logic
    templates/              Jinja HTML pages
    static/
      css/                  App styling
      js/                   Page behavior
      images/
        avatars/            PNG avatar presets
        companions/         VRM models and scene backgrounds
  scripts/
    voice_downloader.py     Piper voice model downloader
  .env.example              Safe environment template
  requirements.txt          Python dependencies
```

## Useful Commands

```bash
# Run development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Verify Python files compile
python3 -m compileall app

# Download optional voice models
python scripts/voice_downloader.py --download
```

## Roadmap

- Real-time voice streaming with timing metadata
- Richer emotional insight summaries
- More companion presets and personality controls
- Docker deployment profile
- Route-level tests for auth, chat, posts, and voice
- Rendered preview images for each VRM character

---

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&height=120&section=footer&color=0:06B6D4,45:7C3AED,100:111827" alt="Footer wave" width="100%" />
  <strong>AI Companion</strong>
  <br />
  Built to make personal AI feel calmer, warmer, and more alive.
</div>
