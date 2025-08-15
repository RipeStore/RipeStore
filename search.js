// search.js - Fuse.js wrapper
const fuseOpts = {
  includeScore: true,
  threshold: 0.28,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'developerName', weight: 0.15 },
    { name: 'bundleIdentifier', weight: 0.1 },
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
  allApps.push(...apps);
  if(!fuse) fuse = new Fuse(allApps, fuseOpts);
  apps.forEach(a => fuse.add(a));
}
export function searchApps(q, limit=50){
  q = (q||'').trim();
  if(!q) return allApps.slice(0, limit);
  const raw = fuse.search(q, { limit: limit * 2 });
  return raw.map(r => {
    let rel = 1 - (r.score ?? 1);
    if(r.item.name?.toLowerCase() === q.toLowerCase()) rel += 0.6;
    else if(r.item.name?.toLowerCase().startsWith(q.toLowerCase())) rel += 0.35;
    else if(r.item.name?.toLowerCase().includes(q.toLowerCase())) rel += 0.15;
    return { ...r, rel };
  }).sort((a,b)=>b.rel - a.rel).slice(0, limit).map(r=>r.item);
}
