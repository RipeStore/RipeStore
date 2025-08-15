
import { $, $$, normalizeRepo, ellipsize, semverCompare } from './utils.js';
import { fetchRepo, clearRepoCache } from './repo-loader.js';
import { initSearch, addApps, searchApps } from './search.js';

const KEY = 'ripe_sources';
const STATUS_KEY = 'ripe_sources_status';
const DEFAULTS = ['https://repository.apptesters.org'];
const BATCH = 20;

const state = { allMerged: [], list: [], rendered: 0, q: '', sort: '' };

function getSources(){
  try{ return JSON.parse(localStorage.getItem(KEY)) || DEFAULTS; }catch(e){ return DEFAULTS; }
}
function setSources(arr){ localStorage.setItem(KEY, JSON.stringify(arr)); }

function showSkeleton(count=6){
  const c = $('#grid'); c.innerHTML='';
  for(let i=0;i<count;i++){
    const sk = document.createElement('div'); sk.className='app-skeleton'; c.appendChild(sk);
  }
}

function createAppCard(app){
  const a = document.createElement('a'); a.className='card'; a.setAttribute('role','listitem');
  a.dataset.bundle = app.bundle || '';
  const img = document.createElement('img'); img.className='icon'; img.alt = app.name || '';
  // lazy load via data-src
  img.dataset.src = app.iconURL || '';
  img.src = ''; // placeholder blank
  const meta = document.createElement('div'); meta.className='meta';
  const title = document.createElement('div'); title.className='title'; title.textContent = app.name || 'Unknown';
  const dev = document.createElement('div'); dev.className='dev'; dev.textContent = app.developerName || '';
  meta.appendChild(title); meta.appendChild(dev);
  a.appendChild(img); a.appendChild(meta);
  return a;
}

function lazyLoadImages(){
  const imgs = document.querySelectorAll('img.icon[data-src]');
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver((entries, obs)=>{
      entries.forEach(ent=>{
        if(ent.isIntersecting){
          const img = ent.target;
          if(img.dataset.src){
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          obs.unobserve(img);
        }
      });
    }, { rootMargin:'200px' });
    imgs.forEach(i=>io.observe(i));
  } else {
    imgs.forEach(i=>{ if(i.dataset.src) i.src = i.dataset.src; i.removeAttribute('data-src'); });
  }
}

function renderAppsIncrementally(apps){
  const grid = $('#grid');
  for(const app of apps){
    const card = createAppCard(app);
    grid.appendChild(card);
  }
  lazyLoadImages();
}

function setSourceStatus(src, obj){
  try{
    const all = JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');
    all[src] = obj;
    localStorage.setItem(STATUS_KEY, JSON.stringify(all));
  }catch(e){}
}

async function loadAll(){
  const sources = getSources();
  state.allMerged = [];
  $('#grid').innerHTML = '';
  showSkeleton(6);
  // start fetches
  const promises = sources.map(src => (async ()=>{
    try{
      const res = await fetchRepo(src);
      const apps = normalizeRepo(res.data, res.url);
      // add source info
      apps.forEach(a=>a._source = res.url);
      // push to global merged
      state.allMerged.push(...apps);
      addApps(apps);
      renderAppsIncrementally(apps);
      setSourceStatus(res.url, { ok:true, lastLoaded: Date.now(), fromCache: !!res.fromCache });
      return { src: res.url, ok:true };
    }catch(err){
      console.warn('Failed source', src, err);
      setSourceStatus(src, { ok:false, lastError: String(err), lastLoaded: Date.now() });
      return { src, ok:false, err: String(err) };
    }
  })());
  await Promise.allSettled(promises);
  // final merge dedupe
  const merged = mergeByBundle(state.allMerged);
  state.allMerged = merged;
  initSearch(state.allMerged);
  filterAndPrepare();
}

function mergeByBundle(apps){
  const map = new Map();
  for(const a of apps){
    const key = (a.bundleIdentifier || a.bundle || a.id || a.bundleIdentifier) || Symbol();
    if(!map.has(key)) map.set(key, Object.assign({}, a, { versions: (a.versions||[]) }));
    else {
      const existing = map.get(key);
      existing.versions = existing.versions.concat(a.versions || []);
      if(!existing.iconURL && a.iconURL) existing.iconURL = a.iconURL;
      if(!existing.name && a.name) existing.name = a.name;
    }
  }
  // dedupe versions
  for(const v of map.values()){
    if(Array.isArray(v.versions)){
      const seen = new Map();
      v.versions = v.versions.filter(ver=>{
        const k = (ver.version || '') + '|' + (ver.downloadURL||'');
        if(seen.has(k)) return false;
        seen.set(k,true); return true;
      });
      v.versions.sort((x,y)=>{
        const dx = x.versionDate ? Date.parse(x.versionDate) : (x.date ? Date.parse(x.date) : 0);
        const dy = y.versionDate ? Date.parse(y.versionDate) : (y.date ? Date.parse(y.date) : 0);
        if(dx && dy) return dy - dx;
        return semverCompare(y.version, x.version);
      });
    }
  }
  return Array.from(map.values());
}

function filterAndPrepare(){
  const q = (state.q||'').trim();
  if(q){
    state.list = searchApps(q, 1000);
  } else {
    state.list = state.allMerged.slice();
  }
  // update total count
  const tc = document.getElementById('totalCount');
  if(tc) tc.textContent = String(state.allMerged.length);
  state.rendered = 0;
  $('#grid').innerHTML = '';
  appendBatch();
}

function appendBatch(){
  const start = state.rendered;
  const end = Math.min(state.rendered + BATCH, state.list.length);
  const slice = state.list.slice(start, end);
  renderAppsIncrementally(slice);
  state.rendered = end;
}

function removeSourceAndCache(url){
  const list = getSources();
  const newList = list.filter(x=>x!==url);
  setSources(newList);
  // remove cached data and status
  try{
    clearRepoCache(url);
  }catch(e){}
  try{
    const st = JSON.parse(localStorage.getItem(STATUS_KEY)||'{}');
    delete st[url];
    localStorage.setItem(STATUS_KEY, JSON.stringify(st));
  }catch(e){}
  // re-render home maybe
  loadAll();
}

document.addEventListener('DOMContentLoaded', ()=>{
  // search binding and sort hide
  const qEl = document.getElementById('q');
  if(qEl){
    const onInput = debounce(()=>{
      state.q = qEl.value;
      const sc = document.querySelector('.sort-controls');
      if(sc) sc.classList.toggle('hidden', !!state.q.trim());
      filterAndPrepare();
    }, 200);
    qEl.addEventListener('input', onInput);
  }
  // wire up remove via custom event from sources page (if that page calls window.removeSource)
  window.removeSource = removeSourceAndCache;
  // initial load
  loadAll();
  // infinite scroll
  let ticking = false;
  window.addEventListener('scroll', ()=>{
    if(ticking) return; ticking = true;
    requestAnimationFrame(()=>{ const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 400); if(nearBottom) appendBatch(); ticking=false; });
  });
});

function debounce(fn, ms=200){ let id; return (...a)=>{ clearTimeout(id); id = setTimeout(()=>fn(...a), ms); }; }
