# RL-Chat — Feedback-Guided LLM

A React + TypeScript chat application with an Express API, SQLite feedback storage and a **free local LLM powered by Ollama**. Gemini remains an optional alternative. Docker Compose and Kubernetes configurations are included.

> **Scope:** Ratings condition future prompts by retrieving positively rated examples. This is not RLHF training, reward-model optimisation or LLM fine-tuning.

## Start free with Docker

Install Docker Desktop (or Docker Engine with Compose), then:

```bash
git clone https://github.com/Rifa-111/RL-Chat-Feedback-Driven-LLM.git
cd RL-Chat-Feedback-Driven-LLM
docker compose up --build -d
docker compose logs -f ollama-init
```

Once the model download finishes, open **http://localhost:3000**. The first download requires internet access and enough free disk space. Later chats run on your computer without per-request API charges. The default `qwen2.5:1.5b` model is a lightweight CPU-friendly starting point; performance depends on your hardware.

No `.env` file or API key is required for Docker Compose's default Ollama mode. The model is pulled automatically into a persistent volume by `ollama-init`.

## Development without Docker

Install Node.js 22+ and [Ollama](https://ollama.com/), then run:

```bash
ollama pull qwen2.5:1.5b
ollama serve
```

In another terminal:

```bash
npm ci
npm run dev
```

Ollama's desktop app may already be running its server; if so, you do not need to run `ollama serve` again.

## Optional Gemini mode

Gemini is **not required**. To use it, create a local `.env` file from `.env.example`, set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY`, then restart the application. Never commit API keys or expose them in client-side code.

## Architecture

```text
React browser → Express /api/chat
                     ├── Ollama (default, local, no API key)
                     ├── Gemini (optional, server-side API key)
                     └── SQLite → feedback and positively rated examples
```

The backend validates requests and retrieves up to five positively rated examples from the current conversation. The chat interface shows feedback statistics and supports positive/negative ratings. A browser-generated conversation ID is **not authentication**.

## Docker and Kubernetes

- [Dockerfile](Dockerfile): multi-stage Node.js build with non-root execution
- [compose.yaml](compose.yaml): RL-Chat + Ollama + one-time model download
- [k8s/app.yaml](k8s/app.yaml): single-replica RL-Chat and Ollama, services and persistent volumes
- [Deployment guide](docs/DEPLOYMENT.md): step-by-step local setup and troubleshooting
- [Security policy](SECURITY.md): deployment limitations

Kubernetes requires enough CPU/RAM and storage for the Ollama model. The supplied setup is a local demonstrator, not a highly available production deployment.

## Checks

```bash
npm ci
npm run lint
npm test
npm run build
docker build -t rl-chat:local .
```

GitHub Actions validates the code, builds the container and smoke-tests readiness.

## API

| Endpoint | Description |
| --- | --- |
| `GET /healthz` | Process liveness |
| `GET /readyz` | SQLite readiness |
| `POST /api/chat` | Generate a reply with the configured LLM |
| `POST /api/feedback` | Record a rating for a response |
| `GET /api/stats?conversationId=<uuid>` | Conversation feedback statistics |

## Limitations

- The application has no authentication or rate limiting. Do not expose it publicly to untrusted users.
- SQLite and the included Kubernetes deployment are single-replica and not horizontally scalable.
- The application stores prompts, model responses and ratings locally. Avoid sensitive data.
- The project demonstrates **feedback-conditioned prompting**, not weight updates or reinforcement learning training.
