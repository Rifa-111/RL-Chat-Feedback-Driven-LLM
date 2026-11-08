# RL-Chat — Feedback-Guided LLM

A React and TypeScript conversational AI application with an Express API, Gemini model integration and a SQLite-backed human-feedback loop. It demonstrates **feedback-conditioned prompting**: positively rated answers become bounded few-shot examples for future responses in the same conversation.

> **Research scope:** This project does not perform RLHF, reward-model training, policy-gradient optimisation or LLM fine-tuning. The feedback mechanism influences future prompts, not the model's weights.

## Capabilities

- Interactive chat UI with Markdown responses and thumbs-up/down ratings
- Server-side Gemini calls; the API key is **never embedded into the Vite browser bundle**
- Conversation-scoped SQLite messages, ratings and positive-example retrieval
- Validation for message payloads and feedback ownership
- Health and readiness endpoints, automated tests and GitHub Actions CI
- Multi-stage Docker image, local Docker Compose setup and single-replica Kubernetes manifests

## Architecture

```text
Browser (React / Vite)
      │  /api/chat, /api/feedback, /api/stats
      ▼
Express API (Node.js)
      ├── Gemini API (server-side API key)
      └── SQLite (messages, feedback, prior positive examples)
                   │
                   └── Selected examples → next model prompt
```

A random conversation identifier stored in the browser is used to scope demo data. It is **not authentication**; do not deploy this publicly for untrusted users without login, access controls, rate limiting and privacy safeguards.

## Run locally

Requires Node.js 22 or newer and access to the Gemini API.

```bash
npm ci
cp .env.example .env
# Edit .env and set GEMINI_API_KEY to your real key.
npm run dev
```

Open http://localhost:3000. The backend loads `.env` using dotenv.

## Docker Compose

```bash
cp .env.example .env
# Edit .env to set GEMINI_API_KEY.
docker compose up --build -d
curl http://localhost:3000/readyz
```

The Compose service binds only to `127.0.0.1:3000` and keeps its SQLite database in a named Docker volume. Stop it with `docker compose down`. Use `docker compose down -v` **only if you intend to delete all persisted feedback and chat data**.

## Kubernetes

See [the deployment guide](docs/DEPLOYMENT.md) for a local kind cluster, image loading, secret creation, persistent storage, probes, resource limits and troubleshooting. The manifest deliberately uses **one replica** and a `Recreate` strategy because SQLite on a single ReadWriteOnce volume is not a multi-replica database.

## Development and checks

```bash
npm run lint
npm test
npm run build
docker build -t rl-chat:local .
```

The CI workflow checks TypeScript, tests, frontend/server builds and Docker image construction.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /healthz` | Process liveness |
| `GET /readyz` | SQLite readiness |
| `POST /api/chat` | Generate and persist one assistant response |
| `POST /api/feedback` | Record a positive or negative rating once |
| `GET /api/stats?conversationId=<uuid>` | Feedback counts within a conversation |

`POST /api/chat` accepts a UUID `conversationId` and a `messages` array of `{role,content}` turns, ending with a user turn. Example requests and deployment considerations are in [the deployment guide](docs/DEPLOYMENT.md).

## Limitations and responsible use

- SQLite is single-node storage; the Kubernetes example is **not horizontally scalable** or highly available.
- Session IDs protect against accidental cross-conversation mixing but are not an authorisation mechanism.
- The demo persists prompts and responses locally; avoid sensitive personal, confidential or financial data.
- The project does not quantify a training-related improvement or claim reinforced model learning.
- A deployment exposed to the internet needs authentication, abuse prevention, monitoring, network security, secret management and a privacy/retention policy.

The project is an experimental engineering demonstrator, not a production service.
