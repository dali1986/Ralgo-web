import {esc} from '../website/briefing-format.js';

// One header for every page outside the exhibition shell: the blog, the collection
// directory and the not-found page. The six links match templates/home.html, which
// keeps its own copy because it also carries the work index button.
const links = [
  ['/#living', 'Latest works'],
  ['/#collections', 'Collections', 'collections'],
  ['/experiments/', 'Experiments', 'experiments'],
  ['/compositions/', 'Compositions', 'compositions'],
  ['/blog/', 'Blog', 'blog'],
  ['/#about', 'About']
];

export function siteHeader({current = '', tagline = ''} = {}) {
  const items = links.map(([href, label, id]) =>
    `<a href="${href}"${id && id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<header class="site-header"><a class="wordmark" href="/" aria-label="Ralgo home"><img src="/assets/brand/ralgo-tines-reversed.svg" alt="Ralgo" width="126" height="65"></a>${tagline ? `<span class="header-description">${esc(tagline)}</span>` : ''}<nav aria-label="Main navigation"><div class="nav-links">${items}</div></nav></header>`;
}
