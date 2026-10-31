const controls = document.querySelector('.creature-actions');
const saveButton = document.getElementById('save-creature');
const newButton = document.getElementById('new-creature');
const halloweenButton = document.createElement('button');
halloweenButton.type = 'button';
halloweenButton.id = 'new-halloween-creature';
halloweenButton.textContent = 'New Halloween creature';
newButton.after(halloweenButton);
const gifButton = document.createElement('button');
gifButton.type = 'button';
gifButton.id = 'save-creature-gif';
gifButton.textContent = 'Save GIF';
saveButton.after(gifButton);
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

function growCreature(event, halloween) {
  event.stopPropagation();
  const seed = 'oo' + Array.from(crypto.getRandomValues(new Uint8Array(20)),
    value => value.toString(16).padStart(2, '0')).join('');
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  if (halloween) url.searchParams.set('hallow', '1');
  else url.searchParams.delete('hallow');
  for (const button of controls.querySelectorAll('button')) button.disabled = true;
  (halloween ? halloweenButton : newButton).textContent = 'Growing…';
  location.replace(url.href);
}
newButton.addEventListener('click', event => growCreature(event, false));
halloweenButton.addEventListener('click', event => growCreature(event, true));

gifButton.addEventListener('click', async event => {
  event.stopPropagation();
  const artwork = window.OVERGROWTH;
  // Living mode resets settled, but data-settled persists after initial growth.
  const grown = artwork?.settled || document.body.hasAttribute('data-settled');
  if (!artwork?.recordGIF || !grown) {
    status.textContent = 'The creature is still growing. Please try again in a moment.';
    return;
  }
  if (artwork.recording) {
    status.textContent = 'A GIF is already recording.';
    return;
  }
  const buttons = Array.from(controls.querySelectorAll('button'));
  const disabled = buttons.map(button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  gifButton.textContent = 'Recording…';
  status.textContent = 'Recording a 6-second GIF…';
  const progress = setInterval(() => {
    const recording = artwork.recording;
    if (recording) {
      const percent = Math.round(recording.i / recording.n * 100);
      gifButton.textContent = 'Recording ' + percent + '%';
      status.textContent = 'Recording GIF… ' + percent + '%';
    }
  }, 250);
  try {
    const result = await artwork.recordGIF({ secs: 6, fps: 20, width: 540 });
    status.textContent = result
      ? 'GIF ready. Check your downloads or the image tab opened by your browser.'
      : 'GIF recording stopped. Please try again.';
  } catch (error) {
    status.textContent = 'Could not save the GIF. Please try again.';
    console.error('Creature GIF export failed:', error);
  } finally {
    clearInterval(progress);
    buttons.forEach((button, index) => { button.disabled = disabled[index]; });
    gifButton.textContent = 'Save GIF';
  }
});
