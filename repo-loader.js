// repo-loader.js - minimal, no long comments
/* Requires localforage (cdn or npm) */
localforage.config({ name: 'RipeStore', storeName: 'repos' });
const CACHE_TTL = 15 * 60 * 1000;
export function repoCandidates(input){
  input = (input||'').trim();
  if(!input) return [];
  if(/^[a-zA-Z]+:\/\//.test(input)) return [input];
  if(/^(raw\.githubusercontent\.com|github\.com)\//i.test(input))
    return ['https://' + input.replace(/^github\.com\//i, 'raw.githubusercontent.com/').replace(/\/blob\//, '/')];
  if(/\./.test(input)) return ['https://' + input, 'http://' + input];
  return ['https://raw.githubusercontent.com/RipeStore/repos/refs/heads/main/' + encodeURIComponent(input) + '.json'];
}
async function fetchWithTimeout(url, ms=10000){
  const ctl = new AbortController();
  const id = setTimeout(()=>ctl.abort(), ms);
  try{
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(id);
    return r;
  }catch(e){ clearTimeout(id); throw e; }
}
async function tryFetch(cands, retries=1){
  for(const c of cands){
    for(let i=0;i<=retries;i++){
      try{
        const res = await fetchWithTimeout(c, 10000);
        if(!res.ok) throw new Error(res.status);
        return { url: c, data: await res.json() };
      }catch(e){}
    }
  }
  throw new Error('All candidates failed');
}
export async function fetchRepo(input){
  const cands = repoCandidates(input);
  for(const c of cands){
    const cached = await localforage.getItem(c).catch(()=>null);
    if(cached && Date.now() - cached.ts < CACHE_TTL) return { url: c, data: cached.data, fromCache: true };
  }
  const res = await tryFetch(cands, 1);
  await localforage.setItem(res.url, { ts: Date.now(), data: res.data }).catch(()=>null);
  return { ...res, fromCache: false };
}
