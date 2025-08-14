import { $, $$, fetchJSON, normalizeRepo, ellipsize, semverCompare } from './utils.js';

const KEY='ripe_sources';
const DEFAULTS=['https://repository.apptesters.org'];
const BATCH=20; // dynamic incremental loading

function getSources(){
  try{ return JSON.parse(localStorage.getItem(KEY))||DEFAULTS }catch(_){ return DEFAULTS }
}

function mergeByBundle(apps){
  const map = new Map();
  for(const a of apps){
    const b = (a.bundle||'').trim();
    if(!b){ // keep separate when no bundle
      const key = Symbol('nobundle'); // ensure uniqueness
      map.set(key, a);
      continue;
    }
    if(!map.has(b)){
      map.set(b, { ...a, versions: [...(a.versions||[])] });
    }else{
      const acc = map.get(b);

      acc.name = acc.name || a.name;
      acc.icon = acc.icon || a.icon;
      acc.dev  = acc.dev  || a.dev;
      acc.desc = acc.desc || a.desc;
      const seen = new Set(acc.versions.map(v=>`${v.version}|${v.url}`));
      for(const v of (a.versions||[])){
        const id = `${v.version}|${v.url}`;
        if(!seen.has(id)){ acc.versions.push(v); seen.add(id); }
      }
      map.set(b, acc);
    }
  }

  for(const v of map.values()){
    if(Array.isArray(v.versions)){
      v.versions.sort((x,y)=>semverCompare(y.version, x.version));
    }
  }
  return Array.from(map.values());
}

function sortApps(apps, mode){
  const byNameAsc = (a,b)=>a.name.localeCompare(b.name);
  const byNameDesc= (a,b)=>b.name.localeCompare(a.name);
  const newestVerDate = (a)=>{ const d = a.versions?.[0]?.date; return d ? Date.parse(d) : null; }; // versions already newest-first
  const byVerDesc = (a,b)=>{ const db = newestVerDate(b), da = newestVerDate(a); if(db && da) return db - da; if(db) return 1; if(da) return -1; return semverCompare((b.versions?.[0]?.version||''),(a.versions?.[0]?.version||'')); };
  const byVerAsc  = (a,b)=>{ const da = newestVerDate(a), db = newestVerDate(b); if(da && db) return da - db; if(da) return -1; if(db) return 1; return semverCompare((a.versions?.[0]?.version||''),(b.versions?.[0]?.version||'')); };
  switch(mode){
    case 'name-desc': return apps.sort(byNameDesc);
    case 'version-desc': return apps.sort(byVerDesc);
    case 'version-asc': return apps.sort(byVerAsc);
    default: return apps.sort(byNameAsc);
  }
}

function match(app, q){
  if(!q) return true;
  q = q.toLowerCase();
  const text = [
    app.name, app.bundle, app.dev, app.desc,
    ...(app.versions||[]).map(v=>v.version)
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes(q);
}

async function loadAll(){
  const sources = getSources();
  let all = [];
  for(const src of sources){
    try{
      const data = await fetchJSON(src);
      const apps = normalizeRepo(data, src);
      all = all.concat(apps);
    }catch(e){ console.warn('Failed source', src, e); }
  }
  const merged = mergeByBundle(all);
  state.allMerged = merged;
  filterAndPrepare();
}

const state = {
  allMerged: [],
  list: [],       // the list to render (either merged apps or expanded versions when searching)
  q: '',
  sort: 'name-asc',
  rendered: 0
};

function expandForSearch(apps){

  const rows = [];
  for(const a of apps){
    if(!Array.isArray(a.versions) || !a.versions.length){
      rows.push({...a, _verEntry:null});
    }else{
      for(const v of a.versions){
        rows.push({...a, _verEntry:v});
      }
    }
  }
  return rows;
}

function filterAndPrepare(){
  const q = state.q.trim();
  const filtered = state.allMerged.filter(a=>match(a, q));
  if(q){

    state.list = expandForSearch(filtered);
  }else{
    state.list = filtered;
  }

  if(q){
    state.list.sort((a,b)=>{
      const an=a.name.toLowerCase(), bn=b.name.toLowerCase();
      if(an!==bn) return an<bn?-1:1;
      const av=a._verEntry?.version||'', bv=b._verEntry?.version||'';
      return semverCompare(bv, av);
    });
  }else{
    sortApps(state.list, state.sort);
  }
  state.rendered = 0;
  $('#grid').innerHTML='';
  appendBatch();
}

function appendBatch(){
  const grid = $('#grid');
  const next = Math.min(state.rendered + BATCH, state.list.length);
  for(let i=state.rendered;i<next;i++){
    const a = state.list[i];
    grid.appendChild(buildCard(a));
  }
  state.rendered = next;
}

function buildCard(a){
  const card = document.createElement('a');
  card.className='card no-underline';
  const versionLabel = a._verEntry ? a._verEntry.version : (a.versions?.[0]?.version || '');
  const link = makeLink(a, versionLabel);
  card.href = link;
  card.setAttribute('role','listitem');

  const icon = document.createElement('div'); icon.className='icon-wrap';
  const img = document.createElement('img'); img.loading='lazy'; img.alt= (a.name||a.bundle) + ' icon'; img.src = a.icon || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  icon.appendChild(img);

  const meta = document.createElement('div'); meta.className='meta';
  const title= document.createElement('div'); title.className='title ellipsis'; title.textContent = a.name || a.bundle;
  const sub  = document.createElement('div'); sub.className='sub ellipsis'; sub.textContent = a.dev || a.bundle;
  const ver  = document.createElement('div'); ver.className='small ellipsis'; ver.textContent = versionLabel ? `Version ${ellipsize(versionLabel, 48)}` : '';
  const snippet = document.createElement('div'); snippet.className='desc-snippet ellipsis';

  const notes = a._verEntry?.notes || a.desc || '';
  snippet.textContent = ellipsize(notes, 120);

  meta.appendChild(title); meta.appendChild(sub); meta.appendChild(ver); meta.appendChild(snippet);

  const right = document.createElement('div'); right.className='right';
  const pill = document.createElement('div'); pill.className='pill'; pill.textContent='View';
  right.appendChild(pill);

  card.appendChild(icon); card.appendChild(meta); card.appendChild(right);
  return card;
}

function makeLink(a, version){
  const params = new URLSearchParams();
  params.set('bundle', a.bundle);
  if(version) params.set('version', version);
  params.set('repo', a.source);
  return `app.html?${params.toString()}`;
}

document.getElementById('search').addEventListener('input', e=>{ state.q = e.target.value; filterAndPrepare(); });
document.getElementById('sort').addEventListener('change', e=>{ state.sort = e.target.value; filterAndPrepare(); });

let ticking=false;
window.addEventListener('scroll', ()=>{
  if(ticking) return; ticking=true;
  requestAnimationFrame(()=>{
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 400);
    if(nearBottom) appendBatch();
    ticking=false;
  });
});

loadAll();
