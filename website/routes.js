// Public URLs work as ordinary links; the exhibition progressively enhances them.
export function routeHref(route, base = '') {
  const parts = route.replace(/^#/, '').split('/');
  if (parts[0] === 'collection') return `${base}/collections/${parts[1]}/`;
  if (parts[0] === 'art') return `${base}/collections/${parts[1]}/${parts[2]}/`;
  if (parts[0] === 'live') return `${base}/works/${parts[1]}/`;
  return base + '/' + (route === '#home' ? '' : route);
}
export function pathRoute(path, base = '') {
  if (base && !path.startsWith(base + '/')) return '#home';
  const parts = path.slice(base.length).split('/').filter(Boolean);
  if (parts[0] === 'collections' && parts[1]) {
    return parts[2] ? `#art/${parts[1]}/${parts[2]}` : `#collection/${parts[1]}`;
  }
  if (parts[0] === 'works' && parts[1]) return `#live/${parts[1]}`;
  return '#home';
}
