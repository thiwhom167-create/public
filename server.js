const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://postpang-studio.onrender.com";
const MODEL = process.env.POSTPANG_OPENAI_MODEL || "gpt-4.1-mini";
const MAX_BODY_BYTES = 12000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;
const requests = new Map();

function reply(res, status, data, originAllowed = false) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  };
  if (originAllowed) {
    headers["Access-Control-Allow-Origin"] = SITE_ORIGIN;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function rateLimit(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : req.socket.remoteAddress) || "unknown";
  const now = Date.now();
  const current = requests.get(ip);
  if (!current || now >= current.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function clean(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function collectOutput(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (typeof part?.text === "string") return part.text;
    }
  }
  return "";
}

async function generateCaptions(input) {
  const apiKey = process.env.POSTPANG_OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: 503,
      body: {
        ok: false,
        code: "AI_KEY_NOT_CONFIGURED",
        error: "ระบบ AI ยังไม่ได้เชื่อมคีย์ API ที่ปลอดภัย จึงใช้ตัวสร้างข้อความพื้นฐานบนหน้าเว็บแทน",
      },
    };
  }

  const category = clean(input.category, 40);
  const product = clean(input.product, 120);
  const benefit = clean(input.benefit, 160);
  const promo = clean(input.promo, 160);
  const tone = clean(input.tone, 40);
  const allowedCategories = new Set(["cafe", "food", "beauty", "fashion", "service"]);
  const allowedTones = new Set(["friendly", "playful", "premium", "direct"]);
  if (!allowedCategories.has(category) || !allowedTones.has(tone) || !product) {
    return { status: 400, body: { ok: false, code: "INVALID_INPUT", error: "กรุณากรอกสินค้าและเลือกประเภทธุรกิจกับโทนภาษาให้ถูกต้อง" } };
  }

  const prompt = [
    "ช่วยเขียนแคปชั่นภาษาไทยสำหรับร้านค้าขนาดเล็กให้เป็นธรรมชาติและนำไปแก้ไขใช้งานได้",
    "สร้าง 3 แบบที่แตกต่างกัน: เล่าเรื่องสินค้า, ชวนลูกค้าคุย, แจ้งข้อเสนอ",
    "ห้ามแต่งข้อมูล ข้อเท็จจริง รีวิว ส่วนลด ราคา สรรพคุณ หรือผลลัพธ์ที่ผู้ใช้ไม่ได้ให้มา",
    "ถ้าไม่มีโปรโมชัน ให้เขียนแคปชั่นแนวเชิญชวนโดยไม่อ้างว่ามีส่วนลด",
    "ตอบเป็น JSON object เท่านั้น ในรูปแบบ {\"captions\":[{\"label\":\"...\",\"text\":\"...\"},{\"label\":\"...\",\"text\":\"...\"},{\"label\":\"...\",\"text\":\"...\"}]}",
    "ประเภทธุรกิจ: " + category,
    "สินค้า/บริการ: " + product,
    "จุดเด่นที่ผู้ใช้ระบุ: " + (benefit || "ไม่ได้ระบุ"),
    "โปรโมชันที่ผู้ใช้ระบุ: " + (promo || "ไม่ได้ระบุ"),
    "โทนภาษา: " + tone,
  ].join("\n");

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        max_output_tokens: 700,
        text: { format: { type: "json_object" } },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return { status: 502, body: { ok: false, code: "AI_UPSTREAM_UNAVAILABLE", error: "ระบบ AI ตอบสนองไม่ทัน ลองใหม่ได้อีกครั้ง" } };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: 502, body: { ok: false, code: "AI_BAD_RESPONSE", error: "ระบบ AI ส่งคำตอบที่อ่านไม่ได้" } };
  }
  if (!response.ok) {
    const errorType = payload?.error?.type || "";
    const message = response.status === 429
      ? "โควตาหรือวงเงิน API ไม่พอในขณะนี้"
      : response.status === 401
        ? "คีย์ AI ใช้งานไม่ได้ กรุณาตรวจสอบการตั้งค่าในเซิร์ฟเวอร์"
        : "สร้างแคปชั่นด้วย AI ไม่สำเร็จในขณะนี้";
    console.error("AI request failed", { status: response.status, type: errorType });
    return { status: response.status === 429 ? 429 : 502, body: { ok: false, code: "AI_REQUEST_FAILED", error: message } };
  }

  let parsed;
  try {
    parsed = JSON.parse(collectOutput(payload));
  } catch {
    return { status: 502, body: { ok: false, code: "AI_BAD_JSON", error: "คำตอบจาก AI ไม่อยู่ในรูปแบบที่คาดไว้ ลองใหม่อีกครั้ง" } };
  }
  if (!Array.isArray(parsed?.captions) || parsed.captions.length !== 3) {
    return { status: 502, body: { ok: false, code: "AI_BAD_SHAPE", error: "คำตอบจาก AI ไม่ครบ 3 แบบ ลองใหม่อีกครั้ง" } };
  }

  const labels = ["เล่าเรื่องสินค้า", "ชวนคุยกับลูกค้า", "แจ้งข้อเสนอ"];
  const captions = parsed.captions.map((item, index) => ({
    label: labels[index],
    text: clean(item?.text, 1600),
  }));
  if (captions.some((item) => !item.text)) {
    return { status: 502, body: { ok: false, code: "AI_EMPTY_TEXT", error: "AI สร้างข้อความไม่ครบ ลองใหม่อีกครั้ง" } };
  }
  return { status: 200, body: { ok: true, provider: "openai", model: MODEL, captions } };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const originAllowed = origin === SITE_ORIGIN;
  if (origin && !originAllowed) return reply(res, 403, { ok: false, error: "Origin not allowed" });
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      service: "postpang-ai-api",
      aiConfigured: Boolean(process.env.POSTPANG_OPENAI_API_KEY),
      provider: process.env.POSTPANG_OPENAI_API_KEY ? "openai" : "template-fallback",
      model: process.env.POSTPANG_OPENAI_API_KEY ? MODEL : null,
      orderStorage: "not-connected",
      automaticPaymentVerification: false,
    }, originAllowed);
  }

  if (req.method === "POST" && url.pathname === "/api/generate") {
    if (!rateLimit(req)) return reply(res, 429, { ok: false, code: "RATE_LIMITED", error: "ใช้งานถี่เกินไป กรุณารอสักครู่ก่อนลองใหม่" }, originAllowed);
    let input;
    try {
      input = await readJson(req);
    } catch (error) {
      return reply(res, error.statusCode || 400, { ok: false, error: error.statusCode === 413 ? "ข้อมูลยาวเกินไป" : "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, originAllowed);
    }
    const result = await generateCaptions(input);
    return reply(res, result.status, result.body, originAllowed);
  }

  return reply(res, 404, { ok: false, error: "Endpoint not found" }, originAllowed);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("PostPang API listening on port", PORT, "model configured:", Boolean(process.env.POSTPANG_OPENAI_API_KEY));
});
