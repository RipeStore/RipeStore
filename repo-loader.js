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
  return ['https://' + s];
}

function fetchWithTimeout(url, ms=DEFAULT_TIMEOUT){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(()=> clearTimeout(id));
}

async function tryFetchCandidates(candidates, retries=1, timeout=DEFAULT_TIMEOUT){
  for(const candidate of candidates){
    let attempt = 0;
    while(attempt<=retries){
      try{
        const res = await fetchWithTimeout(candidate, timeout);
        if(!res.ok) throw new Error('HTTP '+res.status);
        const text = await res.text();
        try{ const data = JSON.parse(text); return { url:candidate, data }; }catch(e){
          // attempt to extract JSON block
          const m = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if(m) return { url:candidate, data: JSON.parse(m[0]) };
          throw new Error('Invalid JSON');
        }
      }catch(e){
        attempt++;
        if(attempt<=retries){
          // small backoff
          await new Promise(r=>setTimeout(r, 300 * attempt));
          continue;
        }else{
          break;
        }
      }
    }
    // try https->http fallback for domain-like urls
    if(candidate.startsWith('https://') && isDomainLike(candidate.replace(/^https:\/\//,''))){
      const httpCandidate = candidate.replace(/^https:/, 'http:');
      try{
        const res2 = await fetchWithTimeout(httpCandidate, timeout);
        if(res2.ok){
          const data = await res2.json();
          return { url: httpCandidate, data };
        }
      }catch(e){}
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
  return new Promise((resolve,reject)=>{
    queue.push(async ()=>{ try{ const v = await fn(); resolve(v); }catch(e){ reject(e); } });
    runNext();
  });
}

export async function fetchRepo(input){
  const candidates = repoCandidates(input);
  if(!candidates.length) throw new Error('Invalid repo input');
  // check cache for any candidate
  for(const c of candidates){
    try{
      const cached = await localforage.getItem(c);
      if(cached && (Date.now() - cached.ts) < CACHE_TTL){
        return { url: c, data: cached.data, fromCache: true };
      }
    }catch(e){}
  }
  // fetch via queue
  return enqueueFetch(async ()=>{
    const res = await tryFetchCandidates(candidates, 1);
    try{ await localforage.setItem(res.url, { ts: Date.now(), data: res.data }); }catch(e){}
    return { ...res, fromCache: false };
  });
}
