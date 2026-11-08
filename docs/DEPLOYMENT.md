# Deployment and operations

## Local development

Install Node.js 22+, run `npm ci`, copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Start with `npm run dev`. The React app and Express API are served on http://localhost:3000.

The server stores SQLite in `DATABASE_PATH` (default `./data/rl-chat.db`). The directory is created at startup. Existing installations are upgraded with a `conversation_id` column; old rows are labelled `legacy`.

## Docker

```bash
cp .env.example .env
# Set GEMINI_API_KEY in .env; never commit this file.
docker compose up --build -d
docker compose ps
curl -f http://localhost:3000/readyz
```

The image uses a multi-stage Node.js 22 build and runs as the non-root `node` user. SQLite data lives in a named volume. The root filesystem is read-only at runtime, with writable `/data` and temporary `/tmp`. The Compose port binds to loopback, rather than every network interface.

## Kubernetes (kind)

Requires Docker, kubectl and [kind](https://kind.sigs.k8s.io/).

```bash
kind create cluster --name rl-chat
docker build -t rl-chat:local .
kind load docker-image rl-chat:local --name rl-chat
# Create a secret from the untracked .env file.
kubectl create secret generic rl-chat-secrets --from-env-file=.env
kubectl apply -f k8s/app.yaml
kubectl rollout status deployment/rl-chat
kubectl port-forward service/rl-chat 3000:80
```

Open http://localhost:3000 in a separate browser. The manifest references `rl-chat:local`; **that image must be loaded into each cluster node** or replaced with an image hosted in a registry accessible to the cluster. No image is automatically published by CI.

For an actual cluster, provision a compatible default StorageClass or modify `k8s/app.yaml`. A 1 GiB PVC stores SQLite state. The deployment uses one replica with `Recreate` to avoid concurrent processes writing to the same SQLite database. It includes startup/readiness/liveness probes, resource limits, non-root execution, restricted Linux capabilities and a read-only root filesystem.

### Diagnostics

```bash
kubectl get pods,pvc,service
kubectl describe pod -l app=rl-chat
kubectl logs deployment/rl-chat
kubectl get events --sort-by=.lastTimestamp
```

If the PVC is Pending, check your cluster's StorageClass. If `ImagePullBackOff` appears in kind, rerun `kind load docker-image`. A missing `rl-chat-secrets` secret prevents the pod from starting. The `/readyz` endpoint validates SQLite access; it intentionally does not consume Gemini API tokens.

## API example

```bash
curl -s http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"550e8400-e29b-41d4-a716-446655440000","messages":[{"role":"user","content":"What is feedback-conditioned prompting?"}]}'
```

Successful replies contain a response `id` and `content`. Rate the response by POSTing `{"conversationId":"...","messageId":123,"rating":1}` to `/api/feedback`; only one rating is accepted per response. `/api/stats` requires the conversation UUID.

## Security, privacy and scaling

Gemini requests are made by Express, not browser code. Secrets are provided through environment variables or a Kubernetes Secret, never hardcoded in repository files. Nevertheless, **the app has no real user authentication**, so conversation IDs must not be treated as access-control credentials. Avoid exposing the demo to untrusted users or using sensitive data.

Feedback examples are limited to the requesting conversation, capped at five, and treated as untrusted sample content in the model instruction. The project does not actually optimise a reward model or update model weights.

For multiple replicas or production traffic, replace SQLite with a network database, implement authenticated user/session access controls, add API rate limiting and resource governance, use managed secret storage, add logging and metrics that do not expose prompts and establish retention/deletion policies. Do not scale replicas beyond one while using the supplied SQLite PVC.
