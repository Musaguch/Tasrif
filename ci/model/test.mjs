import { pipeline } from "@huggingface/transformers";
import fs from "fs";
import wavefile from "wavefile";
const [MODEL, enc, dec] = process.argv.slice(2);
const out = [];
const log = (...a)=>{ const s=a.join(" "); console.log(s); out.push(s); };
function load(f){ const w=new wavefile.WaveFile(fs.readFileSync(f)); w.toBitDepth("32f"); w.toSampleRate(16000); let s=w.getSamples(); if(Array.isArray(s)) s=s[0]; return new Float32Array(s); }
const dtype = {encoder_model:enc, decoder_model_merged:dec};
try{
  const t0=Date.now();
  const pipe = await pipeline("automatic-speech-recognition", MODEL, { dtype });
  log("LOADED", MODEL, JSON.stringify(dtype), (Date.now()-t0)+"ms");
  for (const f of fs.readdirSync("wav").sort()) {
    const a = load("wav/"+f); const t=Date.now();
    let r; try{ r = await pipe(a, {language:"arabic", task:"transcribe"}); } catch(e){ log("lang-arg failed:", e.message.slice(0,200)); r = await pipe(a); }
    log(f, "=>", r.text, (Date.now()-t)+"ms");
  }
}catch(e){ log("FAIL", MODEL, JSON.stringify(dtype), (e.message||"").slice(0,300)); }
fs.appendFileSync("model-out.txt", out.join("\n")+"\n");
