# PostPang AI API (Thai)

API server for the PostPang AI static website.

## Deploy on Render

- Runtime: Node
- Branch: main
- Build command: `npm install`
- Start command: `npm start`
- Plan: Free for initial testing (cold starts can occur)
- Region: Singapore
- Environment variables:
  - `OPENAI_API_KEY`: add privately in the Render service Environment page; never commit this value to GitHub.
  - `OPENAI_MODEL`: optional; default `gpt-5.4-mini`.
  - `SITE_ORIGIN`: optional; default `https://postpang-ai-th.onrender.com`.

## Endpoints

- `GET /api/health`: reports whether a key is configured (never reveals it).
- `POST /api/generate`: accepts product, price, features, audience, tone, goal, platform and returns three generated Thai captions.

## Security included

- API key is read only from `process.env.OPENAI_API_KEY`.
- Exact website-origin CORS check and POST origin validation.
- Request-body size limit, field length limits, and a basic in-memory per-IP rate limit.
- Bounded model output and timeout, generic upstream errors without returning key or raw upstream body.
- `store: false` on the Responses API request.
- `.env` is excluded from Git via `.gitignore`.

Rate limiting is an initial safeguard, not complete bot protection. Before advertising the public site widely, add Turnstile or another anti-abuse check and set a low usage budget/alerts in the OpenAI Platform dashboard. API usage is billed separately from a ChatGPT subscription and can cost money.

## Local testing

Set `OPENAI_API_KEY` in your local environment (do not paste it in chat or commit it), then run:

```sh
npm start
```
