// repo-loader.js - production-ready repo fetcher
localforage.config({ name: 'RipeStore', storeName: 'repos' });
const CACHE_TTL = 15 * 60 * 1000;
const DEFAULT_TIMEOUT = 10000;
const MAX_CONCURRENT = 6;
function isProtocol(s){ return /^[a-zA-Z]+:\/\//.test(s); }
function isGithubRaw(s){ return /^raw\.githubusercontent\.com\//i.test(s) || /^github\.com\//i.test(s); }
function isDomainLike(s){ return /\.[a-z]{2,}/i.test(s); }
function isShortName(s){ return /^[\w-]+$/.test(s); }
export function repoCandidates(input){
  if(!input) return [];
  let s = input.trim();
  if(isProtocol(s)) return [s];
  if(s.startsWith('//')) s = 'https:' + s;
  if(isGithubRaw(s)) return ['https://' + s.replace(/^github\.com\//i, 'raw.githubusercontent.com/').replace(/\/blob\//,'/')];
  if(isDomainLike(s)) return ['https://' + s, 'http://' + s];
  if(isShortName(s)) return ['https://raw.githubusercontent.com/RipeStore/repos/refs/heads/main/' + encodeURIComponent(s) + '.json'];
  return ['https://' + s, 'http://' + s];
}
function fetchWithTimeout(url, ms = DEFAULT_TIMEOUT){
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(()=>clearTimeout(id));
}
async function tryFetchCandidates(cands, retries = 2){
  for(const c of cands){
    for(let attempt=0; attempt<=retries; attempt++){
      try{
        const res = await fetchWithTimeout(c, DEFAULT_TIMEOUT + attempt*2000);
        if(!res.ok) throw new Error('HTTP '+res.status);
        const text = await res.text();
        try{ return { url:c, data: JSON.parse(text) }; }catch(e){
          const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if(m) return { url:c, data: JSON.parse(m[0]) };
          throw new Error('Invalid JSON');
        }
      }catch(err){
        // fallback https->http
        if(c.startsWith('https://') && isDomainLike(c.replace(/^https?:\/\//,''))){
          const alt = c.replace(/^https:/,'http:');
          try{ const r2 = await fetchWithTimeout(alt, DEFAULT_TIMEOUT); if(r2.ok){ const t2 = await r2.text(); return { url:alt, data: JSON.parse(t2) }; } }catch(e){}
        }
        // small backoff
        await new Promise(r=>setTimeout(r, 200 * (attempt+1)));
      }
    }
  }
  throw new Error('No candidate succeeded');
}
// concurrency queue
const q = []; let running=0;
function runNext(){ if(running>=MAX_CONCURRENT) return; const job=q.shift(); if(!job) return; running++; job().finally(()=>{ running--; runNext(); }); }
export function enqueueFetch(fn){ return new Promise((resolve,reject)=>{ q.push(()=>fn().then(resolve).catch(reject)); runNext(); }); }
export async function fetchRepo(input){
  const cands = repoCandidates(input);
  for(const c of cands){
    try{ const cached = await localforage.getItem(c); if(cached && Date.now()-cached.ts < CACHE_TTL) return { url:c, data:cached.data, fromCache:true }; }catch(e){}
  }
  return enqueueFetch(async ()=>{
    const res = await tryFetchCandidates(cands,2);
    try{ await localforage.setItem(res.url, { ts: Date.now(), data: res.data }); }catch(e){}
    return { ...res, fromCache:false };
  });
}