const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://postpang-ai-th.onrender.com";
const LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LIMIT_REQUESTS = 6;
const MAX_BODY_BYTES = 8 * 1024;
const requestLog = new Map();

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

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== SITE_ORIGIN) {
    reply(res, 403, { error: "Origin not allowed" });
    return false;
  }
  if (origin === SITE_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", SITE_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": SITE_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin",
    });
    res.end();
    return false;
  }
  return true;
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress) || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const prior = requestLog.get(ip) || [];
  const recent = prior.filter((time) => now - time < LIMIT_WINDOW_MS);
  if (recent.length >= LIMIT_REQUESTS) {
    requestLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(ip, recent);
  if (requestLog.size > 5000) {
    for (const [key, times] of requestLog) {
      if (times.every((time) => now - time >= LIMIT_WINDOW_MS)) requestLog.delete(key);
    }
  }
  return false;
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(Object.assign(new Error("Request too large"), { statusCode: 413 }));
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }));
      }
    });
    req.on("error", (error) => {
      if (!tooLarge) reject(error);
    });
  });
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text.trim();
  const items = Array.isArray(data.output) ? data.output : [];
  return items.flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function generatePost(input) {
  const product = cleanString(input.product, 100);
  const price = cleanString(input.price, 80);
  const features = cleanString(input.features, 300);
  const audience = cleanString(input.audience, 120);
  const tone = cleanString(input.tone, 40) || "เป็นกันเอง";
  const goal = cleanString(input.goal, 50) || "เพิ่มยอดขาย";
  const platform = cleanString(input.platform, 30) || "Facebook";

  if (product.length < 1) {
    return { status: 400, body: { error: "กรุณาระบุชื่อสินค้า" } };
  }
  if (!OPENAI_API_KEY) {
    return { status: 503, body: { error: "AI API is not configured yet" } };
  }

  const instructions = [
    "คุณคือนักเขียนคอนเทนต์โซเชียลภาษาไทยสำหรับร้านค้าออนไลน์ในประเทศไทย",
    "สร้างแคปชัน 3 แบบที่แตกต่างกันอย่างชัดเจนสำหรับแพลตฟอร์มที่ผู้ใช้เลือก",
    "ใช้ข้อมูลจากผู้ใช้เท่านั้น ห้ามแต่งข้อมูลราคา ส่วนลด จำนวนคงเหลือ การจัดส่ง การรับรอง ผลลัพธ์ รีวิวลูกค้า หรือคุณสมบัติที่ไม่ได้ให้มา",
    "ห้ามรับประกันยอดขายหรือผลลัพธ์ ห้ามใช้การเร่งให้ซื้อแบบหลอกลวง",
    "แต่ละแบบประกอบด้วยหัวข้อสั้น ข้อความโพสต์ คำกระตุ้นให้ทำสิ่งต่อไปที่สุภาพ และแฮชแท็กที่เกี่ยวข้อง",
    "เขียนเป็นภาษาไทยที่เป็นธรรมชาติ ใช้ emoji เท่าที่เหมาะสม และเว้นวรรคให้อ่านง่าย",
    "ระบุชัดเจนเป็น โพสต์ที่ 1, โพสต์ที่ 2 และ โพสต์ที่ 3 ห้ามใส่คำอธิบายกระบวนการหรือข้อความว่า AI สร้าง",
    "ถ้าข้อมูลจุดเด่นไม่มี ให้เขียนแบบทั่วไปโดยไม่กล่าวอ้างคุณสมบัติเฉพาะ"
  ].join("\n");

  const inputText = [
    "ช่วยสร้างแคปชันขายสินค้า 3 แบบ โดยใช้ข้อมูลต่อไปนี้:",
    "สินค้า/บริการ: " + product,
    "ราคา (ถ้ามี): " + (price || "ไม่ได้ระบุ"),
    "จุดเด่นตามข้อมูลจริง: " + (features || "ไม่ได้ระบุ"),
    "กลุ่มลูกค้า: " + (audience || "ไม่ได้ระบุ"),
    "โทนเสียง: " + tone,
    "เป้าหมายโพสต์: " + goal,
    "แพลตฟอร์ม: " + platform,
    "",
    "ข้อความต้องพร้อมให้ผู้ขายคัดลอกไปแก้ไขก่อนโพสต์"
  ].join("\n");

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions,
        input: inputText,
        max_output_tokens: 1200,
        reasoning: { effort: "low" },
        store: false,
      }),
      signal: AbortSignal.timeout(40000),
    });
  } catch (error) {
    console.error("OpenAI network error:", error.name || "network_error");
    return { status: 502, body: { error: "เชื่อมต่อบริการ AI ไม่สำเร็จ กรุณาลองใหม่ภายหลัง" } };
  }

  if (!response.ok) {
    console.error("OpenAI API returned status:", response.status);
    if (response.status === 401 || response.status === 403) {
      return { status: 502, body: { error: "API key ใช้ไม่ได้หรือไม่มีสิทธิ์เรียกโมเดล กรุณาตรวจสอบคีย์ใน Render" } };
    }
    if (response.status === 429) {
      return { status: 429, body: { error: "คำขอถูกจำกัดหรือเครดิต API ไม่เพียงพอ กรุณาตรวจสอบ Usage/Billing" } };
    }
    return { status: 502, body: { error: "ผู้ให้บริการ AI ตอบกลับผิดพลาด กรุณาลองใหม่ภายหลัง" } };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { status: 502, body: { error: "ได้รับคำตอบจาก AI ในรูปแบบที่ไม่ถูกต้อง" } };
  }

  const text = extractOutputText(data);
  if (!text) {
    console.error("OpenAI response contained no output text");
    return { status: 502, body: { error: "AI ยังไม่ได้ส่งข้อความกลับมา กรุณาลองใหม่" } };
  }
  return { status: 200, body: { text, model: OPENAI_MODEL } };
}

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return;

  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/api/health") {
    return reply(res, 200, {
      ok: true,
      configured: Boolean(OPENAI_API_KEY),
      model: OPENAI_MODEL,
    });
  }
  if (req.method !== "POST" || url.pathname !== "/api/generate") {
    return reply(res, 404, { error: "Not found" });
  }

  if (req.headers.origin !== SITE_ORIGIN) {
    return reply(res, 403, { error: "Request origin not allowed" });
  }
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return reply(res, 429, { error: "ใช้คำขอครบโควตาชั่วคราวแล้ว กรุณาลองใหม่ภายหลัง" });
  }

  let input;
  try {
    input = await readJson(req);
  } catch (error) {
    if (!res.headersSent && !res.writableEnded) {
      return reply(res, error.statusCode || 400, { error: error.statusCode === 413 ? "ข้อมูลยาวเกินไป" : "ข้อมูลคำขอไม่ถูกต้อง" });
    }
    return;
  }

  const result = await generatePost(input || {});
  return reply(res, result.status, result.body);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("PostPang AI API listening on port", PORT);
});
