import {routeHref} from './routes.js';

// The build adds this module only after an owned GoatCounter site is configured.
// Preview frames and local copies must not inflate the public site's figures.
const endpoint = document.querySelector('script[data-ralgo-analytics]')?.dataset.ralgoAnalytics;
if (endpoint && ['ralgo.art', 'www.ralgo.art'].includes(location.hostname) && window.top === window.self) {
  const base = document.body.dataset.siteBase || '';
  const pending = [];
  let ready = false;
  let lastPath = '';

  function send(data) {
    if (!ready) {
      if (pending.length < 50) pending.push(data);
      return;
    }
    try { window.goatcounter.count(data); } catch { /* Analytics never interrupts the artwork. */ }
  }

  function pageview() {
    const hash = location.hash;
    const path = /^#(?:collection\/|art\/|live\/)/.test(hash)
      ? new URL(routeHref(hash, base), location.origin).pathname
      : location.pathname;
    // Ignore in-page anchors, query strings and repeated route notifications.
    if (lastPath === path) return;
    lastPath = path;
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch {}
    send({path, title: document.title, referrer});
  }

  window.addEventListener('ralgo-pageview', pageview);
  window.addEventListener('popstate', pageview);
  window.addEventListener('hashchange', pageview);
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-contact-location]');
    if (!link || !['about', 'footer'].includes(link.dataset.contactLocation)) return;
    send({path: 'contact-' + link.dataset.contactLocation, title: 'Contact email: ' + link.dataset.contactLocation, event: true, referrer: lastPath});
  });

  const script = document.createElement('script');
  script.src = 'https://gc.zgo.at/count.js';
  script.async = true;
  script.dataset.goatcounter = endpoint;
  script.dataset.goatcounterSettings = JSON.stringify({no_onload: true});
  script.onload = () => {
    ready = typeof window.goatcounter?.count === 'function';
    if (!ready) return;
    for (const data of pending.splice(0)) send(data);
    pageview();
  };
  script.onerror = () => { pending.length = 0; };
  pageview();
  document.head.append(script);
}
