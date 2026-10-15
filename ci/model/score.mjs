import * as T from "@huggingface/transformers";
import fs from "fs";
import wavefile from "wavefile";
const out=[]; const log=(...a)=>{const s=a.map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" "); console.log(s); out.push(s);};
const MODEL="eventhorizon0/tarteel-ai-onnx-whisper-base-ar-quran";
function load(f){ const w=new wavefile.WaveFile(fs.readFileSync(f)); w.toBitDepth("32f"); w.toSampleRate(16000); let s=w.getSamples(); if(Array.isArray(s)) s=s[0]; return new Float32Array(s); }
try{
const pipe = await T.pipeline("automatic-speech-recognition", MODEL, {dtype:{encoder_model:"q4", decoder_model_merged:"q4"}});
const {model, processor, tokenizer} = pipe;
log("sessions", Object.keys(model.sessions), "enc inputs", model.sessions.model.inputNames, "outputs", model.sessions.model.outputNames);
log("dec inputs", model.sessions.decoder_model_merged.inputNames.slice(0,6));
const gc = model.generation_config || {};
log("gen", {decoder_start_token_id:gc.decoder_start_token_id, forced:gc.forced_decoder_ids, lang:gc.lang_to_id?Object.keys(gc.lang_to_id).length:null, task:gc.task_to_id, notimestamps:gc.no_timestamps_token_id, eos:gc.eos_token_id});
const enc = s=>tokenizer.encode(s,{add_special_tokens:false});
const prefixTry = [];
const sot = gc.decoder_start_token_id ?? 50258;
const forced = (gc.forced_decoder_ids||[]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]).filter(x=>x!=null);
const PREFIX = [sot, ...forced];
log("PREFIX", PREFIX, tokenizer.decode(PREFIX));
const EOS = Array.isArray(gc.eos_token_id)?gc.eos_token_id[0]:(gc.eos_token_id ?? 50257);
async function encode(audio){
  const inp = await processor(audio);
  const r = await model.sessions.model.run({input_features: inp.input_features.ort_tensor});
  return new T.Tensor(r.last_hidden_state);
}
async function score(H, cands){
  const seqs = cands.map(c=>[...PREFIX, ...enc(c), EOS]);
  const L = Math.max(...seqs.map(s=>s.length));
  const res=[];
  const B=8;
  for(let s0=0;s0<seqs.length;s0+=B){
    const batch=seqs.slice(s0,s0+B), n=batch.length;
    const ids=new BigInt64Array(n*L); batch.forEach((s,i)=>{ for(let j=0;j<L;j++) ids[i*L+j]=BigInt(j<s.length?s[j]:EOS); });
    const [_,F,D]=H.dims; const hd=new Float32Array(n*F*D); for(let i=0;i<n;i++) hd.set(H.data, i*F*D);
    const o = await model.forward({encoder_outputs:new T.Tensor("float32",hd,[n,F,D]), decoder_input_ids:new T.Tensor("int64",ids,[n,L])});
    const lg=o.logits, V=lg.dims[2];
    batch.forEach((s,i)=>{
      let tot=0, cnt=0;
      for(let j=PREFIX.length;j<s.length;j++){
        const off=(i*L+(j-1))*V; let mx=-Infinity; for(let v=0;v<V;v++) if(lg.data[off+v]>mx) mx=lg.data[off+v];
        let se=0; for(let v=0;v<V;v++) se+=Math.exp(lg.data[off+v]-mx);
        tot += lg.data[off+s[j]]-mx-Math.log(se); cnt++;
      }
      res.push({c:cands[s0+i], sum:+tot.toFixed(2), avg:+(tot/cnt).toFixed(3)});
    });
  }
  return res;
}
const sets = {
 "1.wav":["كَتَبَ","كُتِبَ","كَتَبْتُ","كَتَبُوا","كَتَبَا","كَتَبَتْ","يَكْتُبُ","اُكْتُبْ","كَاتِبٌ","مَكْتُوبٌ","كِتَابٌ","كَتِبَ","كُتُبٌ"],
 "2.wav":["يَنْصُرُونَ","يُنْصَرُونَ","يَنْصُرَانِ","تَنْصُرُونَ","يَنْصُرُ","نَصَرُوا","يَنْصُرْنَ","يَنْصِرُونَ","يَنْصَرُونَ"],
 "3.wav":["اُكْتُبْ","اُكْتُبَا","اُكْتُبُوا","اُكْتُبِي","كَتَبَ","اِكْتِبْ","اَكْتُبْ","يَكْتُبُ","لَا تَكْتُبْ"],
 "4.wav":["مَكْتُوبٌ","مَكْتُوبَانِ","مَكْتُوبُونَ","كَاتِبٌ","مَكْتَبٌ","مُكْتَتَبٌ","مَكْتُوبَةٌ","يَكْتُبُونَ"],
 "5.wav":["اِسْتَغْفَرَ","اُسْتُغْفِرَ","يَسْتَغْفِرُ","اِسْتَغْفِرْ","اِسْتِغْفَارٌ","مُسْتَغْفِرٌ","اِسْتَغْفَرُوا","اِسْتَغْفَرْتُ"]
};
for(const f of Object.keys(sets)){
  const t=Date.now(); const H=await encode(load("wav/"+f)); const te=Date.now()-t;
  const r=await score(H, sets[f]); const ts=Date.now()-t-te;
  const bs=[...r].sort((a,b)=>b.sum-a.sum).slice(0,4).map(x=>x.c+":"+x.sum);
  const ba=[...r].sort((a,b)=>b.avg-a.avg).slice(0,4).map(x=>x.c+":"+x.avg);
  log(f, "expected", sets[f][0], "| enc", te+"ms score", ts+"ms", "| SUM", bs.join(" "), "| AVG", ba.join(" "));
}
}catch(e){ log("ERR", e.stack||e.message); }
fs.appendFileSync("model-out.txt","\n=== SCORE ===\n"+out.join("\n")+"\n");
