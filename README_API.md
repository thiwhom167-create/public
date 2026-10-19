# PostPang AI API (Thai) — free-tier Groq setup

API server for the PostPang AI static website. Default provider is Groq's free plan (subject to account verification, supported models, and current rate limits).

## Deploy on Render

- Runtime: Node
- Branch: main
- Build command: `npm install`
- Start command: `npm start`
- Plan: Free for initial testing (cold starts can occur)
- Region: Singapore
- Environment variables:
  - `GROQ_API_KEY`: create a free GroqCloud API key and add it privately in the Render service Environment page. Never commit it to GitHub.
  - `GROQ_MODEL`: optional; default `openai/gpt-oss-20b`.
  - `SITE_ORIGIN`: optional; default `https://postpang-ai-th.onrender.com`.

## Endpoints

- `GET /api/health`: reports whether a Groq key is configured (never reveals it).
- `POST /api/generate`: accepts product, price, features, audience, tone, goal, and platform, returning generated Thai captions.

## Security included

- Groq key is read only from `process.env.GROQ_API_KEY`.
- Exact website-origin CORS check and POST origin validation.
- Request-body size limit, field length limits, and an initial in-memory per-IP rate limit.
- Bounded model output and request timeout, generic upstream errors without returning the key or raw upstream body.
- `.env` is excluded from Git via `.gitignore`.

Rate limiting is an initial safeguard, not a complete bot defense. Free Plan requests should be rejected with a rate-limit error rather than charged when the free quota is exhausted, according to Groq's current Free Plan information. Check current limits in the dashboard; don't upgrade to a paid tier for this project unless you explicitly choose to. Free providers can change model availability or quotas.

## Local testing

Set `GROQ_API_KEY` in the local process environment (do not paste it into chat or commit it), then run `npm start`.
