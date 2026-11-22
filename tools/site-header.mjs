// One header for every page outside the exhibition shell: the blog, the collection
// directory and the not-found page. The four links match templates/home.html, which
// keeps its own copy because its links are routes inside the exhibition.
const links = [
  ['/#living', 'Works'],
  ['/#collections', 'Collections', 'collections'],
  ['/blog/', 'Writing', 'blog'],
  ['/#about', 'About']
];

export function siteHeader({current = ''} = {}) {
  const items = links.map(([href, label, id]) =>
    `<a href="${href}"${id && id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<header class="site-header"><a class="wordmark" href="/" aria-label="Ralgo home"><img src="/assets/brand/ralgo-tines-reversed.svg" alt="Ralgo" width="126" height="65"></a><nav aria-label="Main navigation"><div class="nav-links">${items}</div></nav></header>`;
}
