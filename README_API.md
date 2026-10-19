# PostPang AI API (Thai) — free AI provider

This API calls the Pollinations Free API Classic text endpoint, which does not require an API key according to the provider's currently published privacy information. Availability is not guaranteed: the legacy/free endpoint may rate-limit or reject requests, and free providers can change behavior.

## Deploy on Render

- Runtime: Node
- Branch: main
- Build command: `npm install`
- Start command: `npm start`
- Plan: Free for initial testing (cold starts can occur)
- Region: Singapore
- Environment variables:
  - `SITE_ORIGIN`: optional; defaults to `https://postpang-ai-th.onrender.com`.
- No `OPENAI_API_KEY`, `GROQ_API_KEY`, or provider API key is required by this version.

## Endpoints

- `GET /api/health`: reports the provider self-test result from the last process start.
- `POST /api/generate`: sends the user's product information to the free model and returns generated Thai captions.

## Privacy and reliability

- The server sends product details to the third-party Pollinations Free API Classic endpoint; don't enter confidential or personal customer information.
- Requests ask the provider to mark outputs private (`private: true`), but this is not a guarantee of zero logging by the provider.
- A small fixed self-test runs at server startup and its result is logged. It does not use user data or an API key.
- If the free provider fails, the frontend clearly marks the fallback output as a template rather than claiming it was produced by a model.
- Exact website-origin CORS check, request-size and field-length limits, 6 requests per IP per 10 minutes, model request timeout, and generic upstream errors are enabled.
- The in-memory rate limit is an initial safeguard only. Since the site uses a no-key public provider, don't advertise it for high-volume production; providers may impose limits or become unavailable.

## Local testing

Run `npm start`. No provider key is needed.
