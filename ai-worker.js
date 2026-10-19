let pipelinePromise = null;
let loadedDevice = null;

const MODEL_ID_DEFAULT = "onnx-community/Qwen2.5-0.5B-Instruct";
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";

function progress(id, message, detail) {
  self.postMessage({ type: "progress", id, message, detail });
}

function cleanInput(value, max = 400) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function loadPipeline(id, modelId, device) {
  if (pipelinePromise && loadedDevice === device) return pipelinePromise;
  progress(
    id,
    "กำลังโหลดไลบรารี AI…",
    "โมเดลจะถูกดาวน์โหลดและแคชในเบราว์เซอร์ครั้งแรก: ประมาณ 483MB บน WebGPU หรือ 786MB บน CPU"
  );
  const transformers = await import(TRANSFORMERS_URL);
  const { pipeline, env } = transformers;
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useFSCache = false;

  const dtype = device === "webgpu" ? "q4f16" : "q4";
  loadedDevice = device;
  pipelinePromise = pipeline("text-generation", modelId || MODEL_ID_DEFAULT, {
    device,
    dtype,
    progress_callback: (info) => {
      if (!info || typeof info !== "object") return;
      if (info.status === "progress") {
        const pct = Number.isFinite(info.progress) ? Math.round(info.progress) : null;
        const file = typeof info.file === "string" ? info.file.split("/").pop() : "ไฟล์โมเดล";
        progress(
          id,
          pct === null ? "กำลังดาวน์โหลด " + file + "…" : "กำลังดาวน์โหลด " + file + " · " + pct + "%",
          "อย่าปิดแท็บระหว่างโหลดครั้งแรก เบราว์เซอร์อาจเก็บไฟล์ไว้ใช้ครั้งถัดไป"
        );
      } else if (info.status === "initiate") {
        const file = typeof info.file === "string" ? info.file.split("/").pop() : "ไฟล์โมเดล";
        progress(id, "กำลังเตรียม " + file + "…");
      } else if (info.status === "done") {
        progress(id, "เตรียมไฟล์โมเดลเสร็จแล้ว…");
      } else if (info.status === "ready") {
        progress(id, "โมเดลพร้อมใช้งาน…");
      }
    },
  });
  return pipelinePromise;
}

function createPrompt(data) {
  const product = cleanInput(data.product, 100);
  const price = cleanInput(data.price, 80) || "ไม่ระบุ";
  const features = cleanInput(data.features, 300) || "ไม่ระบุ";
  const audience = cleanInput(data.audience, 120) || "ลูกค้าทั่วไป";
  const tone = cleanInput(data.tone, 40) || "เป็นกันเอง";
  const goal = cleanInput(data.goal, 50) || "เพิ่มยอดขาย";
  const platform = cleanInput(data.platform, 30) || "Facebook";

  return [
    "สร้างแคปชันสำหรับร้านค้าออนไลน์ภาษาไทย 3 แบบที่แตกต่างกันจริง ให้พร้อมนำไปแก้ไขก่อนโพสต์",
    "ใช้ภาษาไทยเป็นธรรมชาติ อ่านง่าย เหมาะกับแพลตฟอร์มที่ระบุ ใช้ emoji อย่างพอดีและใส่แฮชแท็กที่ตรงสินค้า",
    "แต่ละแบบต้องมีเลข 1, 2, 3 พร้อมหัวข้อและเนื้อหา ไม่ใส่คำอธิบายกระบวนการ",
    "ห้ามแต่งราคา ส่วนลด จำนวนคงเหลือ ค่าส่ง รีวิว การรับรอง หรือผลลัพธ์ที่ผู้ใช้ไม่ได้ให้มา",
    "ห้ามรับประกันยอดขายและห้ามสร้างความเร่งด่วนปลอม ถ้าไม่มีจุดเด่นที่ระบุ ให้เขียนแบบทั่วไปโดยไม่กล่าวอ้างคุณสมบัติเฉพาะ",
    "",
    "สินค้า/บริการ: " + product,
    "ราคา: " + price,
    "จุดเด่นจริง: " + features,
    "กลุ่มลูกค้า: " + audience,
    "โทนภาษา: " + tone,
    "เป้าหมาย: " + goal,
    "แพลตฟอร์ม: " + platform,
    "",
    "ตอบเป็นโพสต์ทั้ง 3 แบบเท่านั้น"
  ].join("\n");
}

self.addEventListener("message", async (event) => {
  const payload = event.data || {};
  if (payload.type !== "generate") return;
  const id = payload.id;
  const data = payload.data || {};
  const modelId = payload.model || MODEL_ID_DEFAULT;
  const device = payload.device === "webgpu" ? "webgpu" : "wasm";

  try {
    progress(
      id,
      device === "webgpu" ? "กำลังเตรียม AI บน GPU…" : "กำลังเตรียม AI บน CPU…",
      "การใช้ CPU อาจช้าและใช้หน่วยความจำสูง โปรดปิดแอป/แท็บอื่นหากมือถือมี RAM น้อย"
    );
    const generator = await loadPipeline(id, modelId, device);
    progress(id, "โมเดลโหลดแล้ว · กำลังสร้างแคปชัน 3 แบบ…");

    const messages = [
      {
        role: "system",
        content: "คุณคือนักเขียนการตลาดไทยที่แม่นยำและซื่อสัตย์ ทำตามข้อมูลผู้ใช้เท่านั้น ห้ามแต่งข้อเท็จจริงเพื่อขายสินค้า",
      },
      {
        role: "user",
        content: createPrompt(data),
      },
    ];

    const result = await generator(messages, {
      max_new_tokens: 650,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.85,
      repetition_penalty: 1.1,
    });

    const generated = result && result[0] ? result[0].generated_text : null;
    let text = "";
    if (Array.isArray(generated)) {
      const lastMessage = generated[generated.length - 1];
      text = lastMessage && typeof lastMessage.content === "string"
        ? lastMessage.content.trim()
        : "";
    } else if (typeof generated === "string") {
      text = generated.trim();
    }
    if (!text || text.length < 20) {
      throw new Error("โมเดลไม่ส่งข้อความที่เพียงพอ ลองสร้างใหม่อีกครั้ง");
    }
    self.postMessage({
      type: "result",
      id,
      success: true,
      text,
      model: modelId,
      device,
    });
  } catch (error) {
    // Reset a failed loader so a user can retry after fixing the device/browser issue.
    pipelinePromise = null;
    loadedDevice = null;
    const message = error && typeof error.message === "string"
      ? error.message.slice(0, 500)
      : "โมเดล AI ในเครื่องทำงานไม่สำเร็จ";
    self.postMessage({ type: "result", id, success: false, error: message });
  }
});
