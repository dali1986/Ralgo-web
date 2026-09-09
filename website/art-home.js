import {shareArtwork} from './share.js';
// The exhibition viewer supplies navigation and sharing while an artwork is embedded.
const links = document.querySelector('.art-links');
if (links && (window.self !== window.top || new URLSearchParams(location.search).has('preview'))) links.hidden = true;
const share = document.querySelector('.art-share');
share?.addEventListener('click', () => shareArtwork({title: share.dataset.shareTitle, url: share.dataset.shareUrl}, share));
for (const event of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup']) {
  links?.addEventListener(event, e => e.stopPropagation());
}
