const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://postpang-ai-th.onrender.com";

function reply(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && origin !== SITE_ORIGIN) {
    return reply(res, 403, { error: "Origin not allowed" });
  }
  if (origin === SITE_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", SITE_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin",
    });
    return res.end();
  }
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/api/health") {
    return reply(res, 200, {
      ok: true,
      mode: "browser-local-inference",
      provider: "onnx-community/Qwen2.5-0.5B-Instruct",
      keyRequired: false,
      serverInference: false,
    });
  }
  return reply(res, 410, {
    error: "Inference runs locally in the browser. No server API key or paid API is used.",
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("PostPang health endpoint listening on port", PORT, "- browser-local AI; no remote inference");
});
