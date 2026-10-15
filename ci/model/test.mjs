import { pipeline, env } from "@huggingface/transformers";
import fs from "fs";
import wavefile from "wavefile";
const MODEL = "eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran";
const out = [];
const log = (...a)=>{ const s=a.join(" "); console.log(s); out.push(s); };
function load(f){ const w=new wavefile.WaveFile(fs.readFileSync(f)); w.toBitDepth("32f"); w.toSampleRate(16000); let s=w.getSamples(); if(Array.isArray(s)) s=s[0]; return new Float32Array(s); }
for (const dtype of [{encoder_model:"q8", decoder_model_merged:"q4"}, {encoder_model:"fp32", decoder_model_merged:"fp32"}]) {
  try{
    const t0=Date.now();
    const pipe = await pipeline("automatic-speech-recognition", MODEL, { dtype });
    log("LOADED", JSON.stringify(dtype), (Date.now()-t0)+"ms");
    for (const f of fs.readdirSync("wav").sort()) {
      const a = load("wav/"+f); const t=Date.now();
      let r; try{ r = await pipe(a, {language:"arabic", task:"transcribe"}); } catch(e){ log("lang-arg failed:", e.message); r = await pipe(a); }
      log(f, "=>", r.text, (Date.now()-t)+"ms");
    }
  }catch(e){ log("FAIL", JSON.stringify(dtype), e.stack||e.message); }
}
fs.writeFileSync("model-out.txt", out.join("\n"));
