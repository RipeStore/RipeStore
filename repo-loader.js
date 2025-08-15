
// repo-loader.js - ES module using global localforage
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
  let s = String(input).trim();
  if(!s) return [];
  if(isProtocol(s)) return [s];
  if(s.startsWith('//')) s = 'https:' + s;
  if(isGithubRaw(s)) return ['https://' + s.replace(/^github\.com\//i, 'raw.githubusercontent.com/').replace(/\/blob\//,'/')];
  if(isDomainLike(s)) return ['https://' + s, 'http://' + s];
  if(isShortName(s)) return ['https://raw.githubusercontent.com/RipeStore/repos/refs/heads/main/' + encodeURIComponent(s) + '.json'];
  return ['https://' + s];
}

function fetchWithTimeout(url, ms=DEFAULT_TIMEOUT){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(()=>clearTimeout(id));
}

async function tryFetchCandidates(candidates, retries=1){
  for(const candidate of candidates){
    try {
      const res = await fetchWithTimeout(candidate, DEFAULT_TIMEOUT);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      // try json
      const text = await res.text();
      try{
        const data = JSON.parse(text);
        return { url: candidate, data };
      }catch(e){
        // try to extract JSON block
        const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if(m) return { url: candidate, data: JSON.parse(m[0]) };
        throw new Error('Invalid JSON');
      }
    } catch (err) {
      // try http fallback if https failed and candidate started with https:// and is domain-like
      if(retries>0 && candidate.startsWith('https://') && isDomainLike(candidate.replace(/^https:\/\//,''))){
        try {
          const httpc = candidate.replace(/^https:/,'http:');
          const res2 = await fetchWithTimeout(httpc, DEFAULT_TIMEOUT);
          if(res2.ok){
            const txt = await res2.text();
            try{ return { url: httpc, data: JSON.parse(txt) }; }catch(e){}
            const m = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if(m) return { url: httpc, data: JSON.parse(m[0]) };
          }
        } catch(e){}
      }
      // otherwise continue to next candidate
    }
  }
  throw new Error('No candidate succeeded');
}

// concurrency queue
const queue = [];
let running = 0;
function runNext(){
  if(running>=MAX_CONCURRENT) return;
  const job = queue.shift();
  if(!job) return;
  running++;
  job().finally(()=>{ running--; runNext(); });
}

export function enqueueFetch(fn){
  return new Promise((resolve, reject)=>{
    queue.push(async ()=> {
      try{ const r = await fn(); resolve(r); }catch(e){ reject(e); }
    });
    runNext();
  });
}

export async function fetchRepo(input){
  const candidates = repoCandidates(input);
  for(const c of candidates){
    try{
      const cached = await localforage.getItem(c);
      if(cached && (Date.now() - cached.ts) < CACHE_TTL){
        return { url: c, data: cached.data, fromCache: true };
      }
    }catch(e){}
  }
  return enqueueFetch(async ()=> {
    const res = await tryFetchCandidates(candidates, 1);
    try{ await localforage.setItem(res.url, { ts: Date.now(), data: res.data }); }catch(e){}
    return { url: res.url, data: res.data, fromCache: false };
  });
}

export async function clearRepoCache(input){
  const candidates = repoCandidates(input);
  for(const c of candidates){
    try{ await localforage.removeItem(c); }catch(e){}
  }
  // also remove any cached item matching input exactly
  try{ await localforage.removeItem(input); }catch(e){}
}
