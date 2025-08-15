// search.js - Fuse.js wrapper
const fuseOpts = {
  includeScore: true,
  threshold: 0.26,
  ignoreLocation: true,
  minMatchCharLength: 2,
  useExtendedSearch: true,
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
  fuse = new Fuse(allApps, fuseOpts);
  return fuse;
}

export function addApps(apps){
  if(!apps || !apps.length) return;
  allApps.push(...apps);
  if(!fuse) fuse = new Fuse(allApps, fuseOpts);
  apps.forEach(a => fuse.add(a));
}

export function searchApps(q, limit=50){
  q = (q||'').trim();
  if(!q) return allApps.slice(0, limit);
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
