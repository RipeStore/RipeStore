
import { $, $$, fetchJSON, normalizeRepo, ellipsize, semverCompare } from './utils.js';
import { fetchRepo } from './repo-loader.js';
import { initSearch, addApps, searchApps } from './search.js';

const KEY='ripe_sources';
const STATUS_KEY='ripe_sources_status';
const DEFAULTS=['https://repository.apptesters.org'];
const BATCH=20;

const state = { allMerged: [], list: [], rendered: 0, q: '', sort: '' };

function getSources(){
  try{ return JSON.parse(localStorage.getItem(KEY)) || DEFAULTS }catch(e){ return DEFAULTS; }
}

function setSourceStatus(src, obj){
  try{
    const raw = localStorage.getItem(STATUS_KEY);
    const s = raw ? JSON.parse(raw) : {};
    s[src] = Object.assign(s[src] || {}, obj);
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
  }catch(e){}
}

function getSourceStatuses(){
  try{ return JSON.parse(localStorage.getItem(STATUS_KEY)) || {}; }catch(e){ return {}; }
}

function showSkeleton(count = 6){
  const c = $('#grid');
  c.innerHTML = '';
  for(let i=0;i<count;i++){
    const sk = document.createElement('div');
    sk.className = 'card skeleton';
    sk.innerHTML = `<div class="icon-wrap skeleton-box"></div><div class="meta"><div class="title skeleton-box" style="width:60%"></div><div class="subtitle skeleton-box" style="width:40%"></div></div>`;
    c.appendChild(sk);
  }
}

function renderAppCard(a){
  const c = $('#grid');
  const card = document.createElement('a');
  card.className = 'card';
  card.href = makeLink(a, a._verEntry?.version || a.versions?.[0]?.version);
  const icon = `<div class="icon-wrap"><img src="${a.iconURL || ''}" alt=""></div>`;
  const meta = `<div class="meta"><div class="title">${ellipsize(a.name || a.bundle || 'Unknown')}</div><div class="subtitle">${ellipsize(a.developerName || a.dev || '')}</div></div>`;
  const right = `<div class="right"><div class="ver">${a._verEntry?.version || a.versions?.[0]?.version || ''}</div></div>`;
  card.innerHTML = icon + meta + right;
  c.appendChild(card);
}

function renderAppsIncrementally(apps){
  if(!apps || !apps.length) return;
  // append new apps
  apps.forEach(a => {
    // avoid duplicates by bundle+version+source
    const key = `${a.bundle || a.bundleIdentifier || a.id || a.name}::${a._verEntry?.version || (a.versions && a.versions[0] && a.versions[0].version) || ''}::${a.source || ''}`;
    if(document.querySelector(`a.card[data-key="${CSS.escape(key)}"]`)) return;
    const c = $('#grid');
    const card = document.createElement('a');
    card.className = 'card';
    card.setAttribute('data-key', key);
    card.href = makeLink(a, a._verEntry?.version || a.versions?.[0]?.version);
    card.innerHTML = `<div class="icon-wrap"><img src="${a.iconURL||''}" alt=""></div>
                      <div class="meta"><div class="title">${ellipsize(a.name||a.bundle||'Unknown')}</div>
                      <div class="subtitle">${ellipsize(a.developerName||a.dev||'')}</div></div>
                      <div class="right"><div class="ver">${a._verEntry?.version || (a.versions && a.versions[0] && a.versions[0].version) || ''}</div></div>`;
    c.appendChild(card);
  });
}

function mergeByBundle(apps){
  const map = new Map();
  for(const a of apps){
    const b = (a.bundle || a.bundleIdentifier || a.bundleID || a.id || '').trim();
    const key = b || Symbol();
    if(!map.has(key)){
      map.set(key, Object.assign({}, a, { versions: a.versions ? [...a.versions] : [] }));
    }else{
      const existing = map.get(key);
      // merge fields if missing
      existing.name = existing.name || a.name;
      existing.developerName = existing.developerName || a.developerName || a.dev;
      existing.iconURL = existing.iconURL || a.iconURL;
      // merge versions
      if(a.versions && a.versions.length){
        existing.versions = existing.versions.concat(a.versions);
      }
    }
  }
  // dedupe versions by version+downloadURL
  const out = [];
  for(const [k,v] of map.entries()){
    const seen = new Set();
    v.versions = (v.versions||[]).filter(ver=>{
      const id = `${ver.version || ver.buildVersion || ''}::${ver.downloadURL || ''}`;
      if(seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    // sort by versionDate if present, else semver
    v.versions.sort((x,y)=>{
      const xd = x.versionDate || x.date || '';
      const yd = y.versionDate || y.date || '';
      if(xd && yd) return new Date(yd) - new Date(xd);
      return semverCompare(y.version||'', x.version||'');
    });
    out.push(v);
  }
  return out;
}

function match(a, q){
  if(!q) return true;
  q = q.toLowerCase();
  let text = (a.name || '') + ' ' + (a.bundle || a.bundleIdentifier || '') + ' ' + (a.developerName||'') + ' ' + (a.localizedDescription||'');
  if(a.versions) text += ' ' + a.versions.map(v=>v.version).join(' ');
  return text.toLowerCase().includes(q);
}

function appendBatch(){
  const start = state.rendered;
  const slice = state.list.slice(start, start + BATCH);
  slice.forEach(a => renderAppCard(a));
  state.rendered += slice.length;
}

function filterAndPrepare(){
  const q = state.q = ($('#q') ? $('#q').value.trim() : '');
  // toggle sort controls
  const sc = document.querySelector('.sort-controls');
  if(sc) sc.classList.toggle('hidden', !!q);
  if(!q){
    state.list = state.allMerged.slice();
  }else{
    // use Fuse-based search
    try{
      state.list = searchApps(q, 100);
    }catch(e){
      state.list = state.allMerged.filter(a=>match(a,q));
    }
  }
  // apply sort
  if(state.sort){
    const s = state.sort;
    if(s==='name-asc') state.list.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    if(s==='name-desc') state.list.sort((a,b)=> (b.name||'').localeCompare(a.name||''));
    if(s==='version-desc') state.list.sort((a,b)=> semverCompare(b.versions?.[0]?.version||'', a.versions?.[0]?.version||''));
    if(s==='version-asc') state.list.sort((a,b)=> semverCompare(a.versions?.[0]?.version||'', b.versions?.[0]?.version||''));
  }
  // render
  state.rendered = 0;
  $('#grid').innerHTML = '';
  appendBatch();
}

function makeLink(a, version){
  const params = new URLSearchParams();
  if(a.bundle) params.set('bundle', a.bundle);
  else if(a.bundleIdentifier) params.set('bundle', a.bundleIdentifier);
  if(version) params.set('version', version);
  if(a.source) params.set('repo', a.source);
  return `app.html?${params.toString()}`;
}

async function loadAll(){
  const sources = getSources();
  state.allMerged = [];
  $('#grid').innerHTML = '';
  showSkeleton(8);
  // for each source, attempt to fetch and render cached data immediately
  const promises = sources.map(src => (async ()=>{
    try{
      const res = await fetchRepo(src);
      // normalize
      const apps = normalizeRepo(res.data, res.url);
      // attach source info and default _verEntry for list display
      apps.forEach(app => {
        app.source = res.url || src;
        if(app.versions && app.versions.length) app._verEntry = app.versions[0];
      });
      // add to state and index
      state.allMerged = state.allMerged.concat(apps);
      addApps(apps);
      renderAppsIncrementally(apps);
      setSourceStatus(src, { ok: true, lastLoaded: Date.now(), url: res.url, fromCache: !!res.fromCache });
      return { src, ok: true };
    }catch(err){
      console.warn('Failed source', src, err);
      setSourceStatus(src, { ok: false, lastError: String(err), lastAttempt: Date.now() });
      return { src, ok: false, err: String(err) };
    }
  })());
  await Promise.allSettled(promises);
  // finalize merged list and init search index
  const merged = mergeByBundle(state.allMerged);
  state.allMerged = merged;
  initSearch(state.allMerged);
  filterAndPrepare();
  // update total count in header
  const totalEl = document.getElementById('totalCount');
  if(totalEl) totalEl.textContent = String(state.allMerged.length);
}

// bind search and sort
document.getElementById('search')?.addEventListener('input', (e)=>{
  const v = e.target.value;
  state.q = v;
  filterAndPrepare();
});
document.getElementById('sort')?.addEventListener('change', (e)=>{
  state.sort = e.target.value;
  filterAndPrepare();
});

// expose for pages
window.loadAll = loadAll;

// init
document.addEventListener('DOMContentLoaded', ()=>{
  // hook up search input by id 'q' if exists
  const qEl = $('#q');
  if(qEl){
    let id;
    qEl.addEventListener('input', ()=>{ clearTimeout(id); id = setTimeout(()=>{ state.q = qEl.value; filterAndPrepare(); }, 180); });
  }
  // run loader
  loadAll();
});
