# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Service code (adapters, API routes, middleware, utils).
- `src/adapters/google-meet/`: Google Meet integration boundaries.
- `config/`: Runtime config, env templates, secrets examples.
- `tests/`: Unit and integration tests mirroring `src/` layout.
- `scripts/`: Local dev and CI helper scripts.
- `docs/`: Architecture notes and runbooks.

Example layout:
```
src/
  index.(ts|py)
  adapters/google-meet/
  middleware/
  utils/
config/
tests/
```

## Build, Test, and Development Commands
Tooling varies by stack; use the matching set below.
- Node.js/TS
  - `npm i`: Install dependencies.
  - `npm run dev`: Start local server with reload.
  - `npm test`: Run tests and report coverage.
  - `npm run build`: Produce production bundle.
- Python
  - `pip install -r requirements.txt`: Install deps.
  - `pytest -q`: Run tests.
  - `python -m app` or `uvicorn app:app --reload`: Run locally.
- Make (optional)
  - `make dev | test | build`: Standardized entry points if a `Makefile` exists.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; max line length 100.
- Names: `camelCase` functions/vars, `PascalCase` classes, `kebab-case` files and dirs.
- JS/TS: ESLint + Prettier; prefer TypeScript in `src/` with strict types.
- Python: Ruff + Black; type hints required (`mypy` clean for new code).
- Commits must pass lint/format hooks before merging.

## Testing Guidelines
- Frameworks: Jest (JS/TS) or Pytest (Python).
- Location: `tests/` mirrors `src/` paths.
- Naming: `*.test.ts` or `test_*.py`.
- Coverage: Aim ≥80% on changed files; include edge cases (auth, rate limits, API errors).
- Mocks: Stub external Google APIs; do not hit network in tests.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits style (e.g., `feat: add meeting webhook handler`).
- PRs: Clear description, linked issue, test evidence (logs or coverage), and any config changes (`.env.example` diffs). Add screenshots for UI/tooling changes.
- Small, focused PRs are favored; keep <300 LOC when possible.

## Security & Configuration Tips
- Secrets: Never commit real keys. Use `.env.example` and `config/` templates.
- Least-privilege: Scope Google tokens to required permissions only.
- Logs: Avoid logging PII; redact tokens and meeting IDs.
- Local dev: Add `GOOGLE_*` envs to `.env` and document any required callbacks.
