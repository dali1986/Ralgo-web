import {readFile} from 'node:fs/promises';
import {esc} from '../website/briefing-format.js';

// These are public website settings, never account passwords or API keys.
export function validateSettings(settings) {
  const contactEmail = settings.contactEmail?.trim() || '';
  const goatcounterEndpoint = settings.goatcounterEndpoint?.trim() || '';
  if (contactEmail && !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(contactEmail)) {
    throw Error('contactEmail must be the artist’s approved public email address.');
  }
  if (goatcounterEndpoint && !/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.goatcounter\.com\/count$/.test(goatcounterEndpoint)) {
    throw Error('goatcounterEndpoint must be the exact https://SITECODE.goatcounter.com/count address from the owner’s GoatCounter account.');
  }
  return {contactEmail, goatcounterEndpoint};
}

export const siteSettings = validateSettings(JSON.parse(await readFile(new URL('../site-settings.json', import.meta.url), 'utf8')));

function contact(email, location) {
  if (!email) return '';
  const href = 'mailto:' + encodeURIComponent(email).replaceAll('%40', '@');
  return `<section class="contact-note contact-${location}" aria-label="Contact Ralgo"><p>Commissions, exhibitions and press enquiries.</p><a class="underlink" href="${esc(href)}" data-contact-location="${location}">${esc(email)} <span aria-hidden="true">↗</span></a></section>`;
}

export function applyEngagement(html, settings = siteSettings) {
  const {contactEmail, goatcounterEndpoint} = validateSettings(settings);
  html = html.replaceAll('<!-- CONTACT_ABOUT -->', contact(contactEmail, 'about'))
    .replaceAll('<!-- CONTACT_FOOTER -->', contact(contactEmail, 'footer'));
  if (goatcounterEndpoint && !html.includes('data-ralgo-analytics')) {
    html = html.replace('</head>', `<script type="module" src="/analytics.js" data-ralgo-analytics="${esc(goatcounterEndpoint)}"></script></head>`);
  }
  return html;
}
