# PostPang AI — real local inference in the browser

The public website uses the open Qwen2.5-0.5B-Instruct ONNX model through Transformers.js. The actual model runs inside the user's browser; prompts are not sent to an external inference API, and no OpenAI/Groq/Pollinations API key is required.

## Browser model

- Model: `onnx-community/Qwen2.5-0.5B-Instruct`
- Library: Transformers.js via jsDelivr CDN
- Runtime: WebGPU with Q4F16 quantization where supported; otherwise WebAssembly/CPU with Q4 quantization
- Initial download: roughly 483 MB on WebGPU or 786 MB on CPU, plus tokenizer/runtime files. The browser caches model files where supported.
- This is a small model. Quality and speed are lower than a large hosted model, especially on CPU-only devices.
- Text generation runs on the device after the model is downloaded. Product details are not sent to a paid model API.
- Internet access is needed to download the JavaScript library and model files for first use. After model caching, repeat use may use cached files depending on browser storage.

## Render deployment

The Node service only offers a basic health endpoint. Actual generation happens in `ai-worker.js` inside the browser.
- Build command: `npm install`
- Start command: `npm start`
- No API keys are required.

## Limitations

Older/low-memory phones may be unable to run the model or may close the tab. If the local model fails to load, the site reports the failure and provides a separately labeled template fallback; it must not claim that the fallback was written by an AI model. Do not enter confidential information when browsing any website; even though model inference is local, the site still downloads code/model artifacts from public CDNs.
