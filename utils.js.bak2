
export const $ = (q, el=document) => el.querySelector(q);

export function parseDateString(s){
  if(!s) return null;
  const t = Date.parse(s);
  if(!isNaN(t)) return new Date(t);

  try{ return new Date(s); }catch(e){ return null; }
}
export function formatDate(s){
  const d = (s instanceof Date)? s : parseDateString(s);
  if(!d) return '';
  const opt = { year:'numeric', month:'short', day:'numeric' };
  try{ return d.toLocaleDateString(undefined, opt); }catch(e){ return d.toUTCString().split(' ').slice(1,4).join(' '); }
}

export const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

export function ellipsize(s, n=120){ if(!s) return ""; s=String(s); return s.length>n? s.slice(0,n-1)+"…": s; }
export function qs(k){ try{ return new URLSearchParams(location.search).get(k) }catch(e){ return null } }

export async function fetchJSON(url){
  const res = await fetch(url, {cache:'no-cache'});
  if(!res.ok) throw new Error(`Fetch failed ${res.status}`);
  const text = await res.text();
  try{ return JSON.parse(text); }catch(_){}
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if(!m) throw new Error("Invalid JSON payload");
  return JSON.parse(m[0]);
}

export function normalizeRepo(data, sourceUrl){
  const apps=[];
  const push = (o)=>{ if(o && (o.bundleIdentifier||o.bundleID||o.bundle||o.id)) apps.push(toUnified(o, sourceUrl)); };
  if(Array.isArray(data)){ data.forEach(push); }
  else if(data && Array.isArray(data.apps)){ data.apps.forEach(push); }     // AltStore-like
  else if(data && typeof data==='object'){                                  // Scarlet-like buckets
    Object.keys(data).forEach(k=>{
      if(/^(meta|info)$/i.test(k)) return;
      const v = data[k];
      if(Array.isArray(v)) v.forEach(o=>push({...o, category:o.category||k}));
    });
  }
  return apps;
}

function toUnified(o, sourceUrl){
  const bundle = o.bundleIdentifier || o.bundleID || o.bundle || o.id || "";
  const icon   = o.iconURL || o.icon || o.image || "";
  const name   = o.name || o.title || bundle || "Unknown";
  const dev    = o.developerName || o.dev || o.developer || "";
  const desc   = o.localizedDescription || o.description || o.subtitle || "";
  const category = o.category || "";
  let versions = [];
  if(Array.isArray(o.versions) && o.versions.length){
    versions = o.versions.map(v=>({
      version: v.version || v.build || v.tag || "",
      date: v.versionDate || v.date || v.published || "",
      notes: v.localizedDescription || v.changelog || v.notes || "",
      url: v.downloadURL || v.down || v.url || v.ipa || v.download || ""
    })).filter(v=>v.url);
  }
  if(!versions.length){
    const url = o.downloadURL || o.down || o.url || o.ipa || o.download || "";
    const version = o.version || o.latest || "";
    if(url) versions = [{version, date:"", notes:"", url}];
  }
  return { name, bundle, icon, dev, desc, category, versions, source: sourceUrl };
}

export function semverCompare(a,b){
  const seg = s => String(s||"").split(/[.+\-]/).map(x=>isNaN(+x)? x : +x);
  const A=seg(a), B=seg(b), n=Math.max(A.length,B.length);
  for(let i=0;i<n;i++){
    const x=A[i], y=B[i];
    if(x===undefined) return -1;
    if(y===undefined) return 1;
    if(typeof x===typeof y){
      if(x<y) return -1; if(x>y) return 1;
    }else{ return (typeof x==='number')?1:-1 }
  }
  return 0;
}

export function preferVersionDate(v){ return v?.versionDate || v?.date || null; }
