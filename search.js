
// search.js - ES module wrapper around Fuse.js (expects global Fuse)
const fuseOpts = {
  includeScore: true,
  threshold: 0.32,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: 'name', weight: 0.75 },
    { name: 'developerName', weight: 0.12 },
    { name: 'bundleIdentifier', weight: 0.08 },
    { name: 'subtitle', weight: 0.05 }
  ]
};

let fuse = null;
let allApps = [];

export function initSearch(apps){
  allApps = (apps||[]).slice();
  if (typeof Fuse === 'undefined') {
    console.warn('Fuse not found; search will be basic');
    fuse = null;
    return null;
  }
  fuse = new Fuse(allApps, fuseOpts);
  return fuse;
}

export function addApps(apps){
  if(!apps || !apps.length) return;
  allApps.push(...apps);
  if(!fuse){
    if(typeof Fuse !== 'undefined') fuse = new Fuse(allApps, fuseOpts);
  } else {
    apps.forEach(a => fuse.add(a));
  }
}

export function searchApps(q, limit=100){
  q = (q||'').trim();
  if(!q){
    return allApps.slice(0, limit);
  }
  if(!fuse){
    // fallback simple substring search
    const ql = q.toLowerCase();
    return allApps.filter(a => {
      const text = ((a.name||'') + ' ' + (a.developerName||'') + ' ' + (a.bundleIdentifier||'')).toLowerCase();
      return text.includes(ql);
    }).slice(0, limit);
  }
  const raw = fuse.search(q, { limit: limit * 2 });
  const qLower = q.toLowerCase();
  const scored = raw.map(r=>{
    const item = r.item;
    let rel = 1 - (r.score ?? 1);
    if(item.name && item.name.toLowerCase() === qLower) rel += 0.7;
    else if(item.name && item.name.toLowerCase().startsWith(qLower)) rel += 0.4;
    else if(item.name && item.name.toLowerCase().includes(qLower)) rel += 0.18;
    return { item, rel };
  }).sort((a,b)=>b.rel - a.rel).slice(0, limit).map(r=>r.item);
  return scored;
}
