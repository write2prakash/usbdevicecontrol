# USB Device Control & Monitoring System

A multi-tenant SaaS platform for Windows USB device control, approval workflows, and telemetry.

## Architecture

- Backend: Python FastAPI
- Frontend: React + Next.js App Router
- Database: MySQL 8+
- Auth: JWT access + refresh
- Real-time: WebSocket approval push
- Agent: Windows client (C# service)
- Infrastructure: Terraform + Helm + ArgoCD
- CI/CD: GitHub Actions
- Security: Gitleaks, OWASP Dependency-Check, SonarQube, Trivy
- Monitoring: Prometheus, Grafana, ELK

## Local setup

1. Clone repository.
2. Start services:
   ```powershell
   docker-compose up --build
   ```
3. Backend available at `http://localhost:8000`.
4. Frontend available at `http://localhost:3000`.

## Local demo script

A lightweight demo flow is available to exercise the backend and agent approval flow without the frontend:

```bash
python scripts/demo_flow.py --api-url http://localhost:8000
```

To also open an admin websocket listener and wait for the notification after approval:

```bash
python scripts/demo_flow.py --api-url http://localhost:8000 --use-ws
```

## Environment files

- `backend/.env` for backend config
- `frontend/.env.local` for frontend config

## Terraform

- Dev workspace: `infra/terraform/environments/dev`
- Prod workspace: `infra/terraform/environments/prod`

## GitHub Actions

- `ci.yml`: full security pipeline on push/PR
- `cd-prod.yml`: manual promotion to prod with approval gate

## Notes

- Update secrets in Vault / AWS Secrets Manager.
- Use ArgoCD manifests in `infra/helm/argocd-apps`.
- Deploy Helm charts for backend and frontend.
