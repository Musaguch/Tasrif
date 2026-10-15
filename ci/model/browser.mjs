import { chromium } from "playwright";
import fs from "fs";
const out=[]; const log=(...a)=>{const s=a.join(" "); console.log(s); out.push(s);};
const b = await chromium.launch(); const p = await b.newPage();
p.on("console", m=>{ if(m.type()==="error") log("console:", m.text().slice(0,200)); });
await p.goto("http://localhost:8000/Tasrif/beta/");
await p.waitForTimeout(4000);
log("isolated", await p.evaluate(()=>window.crossOriginIsolated), "threads", await p.evaluate(()=>navigator.hardwareConcurrency));
const wavs = fs.readdirSync("wav").sort().map(f=>({f, b64:fs.readFileSync("wav/"+f).toString("base64")}));
const t0=Date.now();
const r = await p.evaluate(async (wavs)=>{
  const res=[];
  try{ await Voice.load(); res.push("loaded"); }catch(e){ return ["LOAD FAIL "+(e.message||e)]; }
  for(const tr of [true]) { Voice.trunc=tr; res.push("trunc="+tr); for(const w of wavs.slice(0,3)) { const bin=Uint8Array.from(atob(w.b64),c=>c.charCodeAt(0)); const t=performance.now();
    try{ const C={"1.wav":["كَتَبَ","كُتِبَ","كَتَبْتُ","كَتَبُوا","كَتَبَا","كَتَبَتْ","يَكْتُبُ","اُكْتُبْ","كَاتِبٌ","مَكْتُوبٌ","كَتِبَ","كُتُبٌ"],"2.wav":["يَنْصُرُونَ","يُنْصَرُونَ","يَنْصُرَانِ","تَنْصُرُونَ","يَنْصُرُ","نَصَرُوا","يَنْصُرْنَ","يَنْصِرُونَ","يَنْصَرُونَ"],"3.wav":["اُكْتُبْ","اُكْتُبَا","اُكْتُبُوا","اُكْتُبِي","كَتَبَ","اِكْتِبْ","اَكْتُبْ","يَكْتُبُ","لَا تَكْتُبْ"]}; const c=C[w.f]; const sc=await Voice.score(new Blob([bin],{type:"audio/wav"}), c);
      res.push(w.f+" SCORE "+c.map((x,k)=>[x,sc[k].sum.toFixed(2)]).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x.join(":")).join(" ")+" "+Math.round(performance.now()-t)+"ms"); }
    catch(e){ res.push("SCORE FAIL "+(e.stack||e.message||e)); } } }
  for(const w of wavs.slice(0,1)){
    const bin=Uint8Array.from(atob(w.b64),c=>c.charCodeAt(0));
    const t=performance.now();
    try{ const h=await Voice.transcribe(new Blob([bin],{type:"audio/wav"}), false); res.push(w.f+" => "+h.join(" | ")+" "+Math.round(performance.now()-t)+"ms"); }
    catch(e){ res.push(w.f+" FAIL "+(e.message||e)); }
  }
  return res;
}, wavs);
log("browser total", (Date.now()-t0)+"ms"); r.forEach(x=>log(x));
fs.appendFileSync("model-out.txt", "\n=== BROWSER ===\n"+out.join("\n")+"\n");
await b.close();
