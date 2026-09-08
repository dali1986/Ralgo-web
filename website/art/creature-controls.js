const controls = document.querySelector('.creature-actions');
const saveButton = document.getElementById('save-creature');
const newButton = document.getElementById('new-creature');
const status = document.getElementById('creature-save-status');

// Keep artwork gestures and shortcuts separate from the buttons.
for (const name of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'dblclick', 'keydown', 'keyup']) {
  controls.addEventListener(name, event => event.stopPropagation());
}

saveButton.addEventListener('click', event => {
  event.stopPropagation();
  const artwork = window.OVERGROWTH;
  if (!artwork?.savePNG) {
    status.textContent = 'The creature is still loading. Please try again in a moment.';
    return;
  }
  // Use the artwork's full-resolution export, including its background and bloom.
  // Reading the visible WebGL canvas directly can produce an empty image.
  status.textContent = '';
  artwork.savePNG(1);
});

newButton.addEventListener('click', event => {
  event.stopPropagation();
  const seed = 'oo' + Array.from(crypto.getRandomValues(new Uint8Array(20)),
    value => value.toString(16).padStart(2, '0')).join('');
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  newButton.disabled = true;
  saveButton.disabled = true;
  newButton.textContent = 'Growing…';
  location.replace(url.href);
});
