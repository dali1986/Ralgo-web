// Standalone artworks keep a clear route back. The exhibition's modal already has one.
const home = document.querySelector('.art-home');
if (home && (window.self !== window.top || new URLSearchParams(location.search).has('preview'))) home.hidden = true;
