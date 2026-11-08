# Local deployment guide

## Docker Compose: no key required

```bash
docker compose up --build -d
docker compose logs -f ollama-init
curl -f http://localhost:3000/readyz
```

The `ollama` service serves the model on the internal Compose network; `ollama-init` waits for it and downloads `qwen2.5:1.5b` into a named volume. RL-Chat starts after that download finishes. Access the UI at http://localhost:3000. The model download requires internet access once and sufficient local disk space. Chat generation itself is local, with no API charges.

Use `docker compose logs -f ollama` to diagnose model issues. To stop: `docker compose down`. **Do not use `down -v` unless you intend to erase chat data and downloaded models.**

To use another model, set `OLLAMA_MODEL` in a local `.env` file and run `docker compose up -d` again. For a smaller model try `qwen2.5:0.5b`; for a stronger one try `qwen2.5:3b` if your computer has enough memory. Check model availability in the [Ollama library](https://ollama.com/library).

## Local Node.js development

Install Node.js 22+ and Ollama. Run `ollama pull qwen2.5:1.5b`, start the Ollama server if it is not already running, then run `npm ci && npm run dev`. By default the backend connects to `http://127.0.0.1:11434`.

## Kubernetes (kind)

Install Docker, kubectl and kind, then:

```bash
kind create cluster --name rl-chat
docker build -t rl-chat:local .
kind load docker-image rl-chat:local --name rl-chat
kubectl apply -f k8s/app.yaml
kubectl rollout status deployment/ollama --timeout=180s
kubectl exec deployment/ollama -- ollama pull qwen2.5:1.5b
kubectl rollout status deployment/rl-chat --timeout=180s
kubectl port-forward service/rl-chat 3000:80
```

Visit http://localhost:3000. The model must be pulled explicitly in Kubernetes; the `ollama` pod does not automatically download it. No Gemini secret is needed.

The manifest provisions a 5 GiB model PVC and a 1 GiB SQLite PVC. It requests 2 GiB RAM for Ollama and limits it to 4 GiB. Ensure your Kubernetes node has adequate available resources. Both services are single-replica; the SQLite deployment uses `Recreate` updates. A compatible StorageClass is required for the PVCs.

## Optional Gemini

Copy `.env.example` to `.env`, set `LLM_PROVIDER=gemini` and a new private `GEMINI_API_KEY`. The backend uses the key, not the browser. In Docker Compose, Gemini mode still starts the Ollama services; they are harmless but unnecessary for that mode.

## Health and diagnostics

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
docker compose ps
kubectl get pods,pvc,svc
kubectl logs deployment/rl-chat
kubectl logs deployment/ollama
```

`/readyz` checks the SQLite database, not model readiness. A missing Ollama model or an unavailable provider returns a chat error rather than marking the web server unhealthy.

## Safety and limitations

This is a development demo. It does not authenticate users; conversation IDs are not authorisation. Avoid sensitive prompts. Before hosting it publicly, add authentication, request limits, data retention/deletion, secure transport and a production database. Ollama runs locally and does not require a paid API, but it consumes your machine's RAM, CPU/GPU resources and electricity.
