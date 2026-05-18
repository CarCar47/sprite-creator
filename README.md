# Sprite Creator

AI-powered web app that turns natural-language character descriptions into Unity-ready 2D
sprite sheets with character consistency across actions. Built on Next.js, deployed to
Vercel, powered by Google's Gemini image-generation API.

> **Status:** Phase 0 — repository and tooling scaffolded. Image generation arrives in
> Phase 1. See `docs/` for the full engineering plan and amendments.

## Documentation

- [`docs/Sprite-Creator-Engineering-Plan.docx`](docs/Sprite-Creator-Engineering-Plan.docx) — full architectural plan (v1.0)
- [`docs/Phase-0-Amendments.md`](docs/Phase-0-Amendments.md) — corrections based on May 2026 verification
- [`docs/Execution-Plan.md`](docs/Execution-Plan.md) — stage-by-stage Phase 0 execution

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # fill in GEMINI_API_KEY
pnpm dev
```

The app runs at http://localhost:3000. Health check at `/api/health`.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS 4
- Google Gen AI SDK (`@google/genai`) targeting `gemini-3.1-flash-image-preview`
- `sharp` for chroma-key transparency, grid slicing, and uniform-frame repacking
- `zod` for request validation at the trust boundary
- `@upstash/ratelimit` + Upstash Redis for distributed per-IP rate limiting
- `jszip` for client-side ZIP packaging of downloads
- Vitest + Testing Library for unit/integration tests

## Deployment

Pushes to `main` auto-deploy to Vercel production. Every pull request gets a unique
Preview URL.

## License

MIT. See [LICENSE](LICENSE).
