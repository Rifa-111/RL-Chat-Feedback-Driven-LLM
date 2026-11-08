# Security policy

This repository is a demonstration project, not a hardened public multi-tenant service. The API uses a random conversation identifier, **not** authentication.

Do not commit `.env`, API keys, private prompts, credentials or real user records. Set the Gemini key only in server-side environment variables or a Kubernetes Secret. The frontend should never receive it.

If deploying outside localhost, implement authentication and authorisation, abuse controls, TLS, data retention/deletion, prompt protection and a production database before accepting other users.

If you discover a vulnerability, contact the repository owner privately rather than posting secrets or reproduction data in a public issue.
