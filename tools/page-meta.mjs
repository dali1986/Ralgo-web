import {esc} from '../website/briefing-format.js';
export const origin = (process.env.SITE_URL || 'https://ralgo.art').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) throw Error('SITE_URL must be an HTTPS origin.');
export const siteBase = (process.env.PAGES_BASE_PATH || '').replace(/\/$/, '');
export const absolute = path => origin + siteBase + path;
export const artist = {'@type':'Person','@id':absolute('/#ralgo'),name:'Ralgo',alternateName:'Robert Allen',url:absolute('/'),sameAs:['https://x.com/ArtRalgo','https://verse.works/ralgo']};
export const shareImage = '/assets/display/ralgo-share.jpg';
export function headExtras({title,description,path='/',image=shareImage,imageAlt='What the Water Kept by Ralgo',type='website',schema,dimensions}) {
  const imageURL = image.startsWith('https://') ? image : absolute(image);
  const size = dimensions || (image === shareImage || image.startsWith('/assets/share/') ? [1200,630] : null);
  return `<link rel="canonical" href="${esc(absolute(path))}">
<meta property="og:site_name" content="Ralgo"><meta property="og:locale" content="en_GB">
<meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(absolute(path))}"><meta property="og:image" content="${esc(imageURL)}"><meta property="og:image:alt" content="${esc(imageAlt)}">${size?`<meta property="og:image:width" content="${size[0]}"><meta property="og:image:height" content="${size[1]}">`:''}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@ArtRalgo"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(imageURL)}"><meta name="twitter:image:alt" content="${esc(imageAlt)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Ralgo: Art & technology" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
${schema?`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org',...schema}).replaceAll('<','\\u003c')}</script>`:''}`;
}
