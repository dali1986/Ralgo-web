// Native phone sharing, with clipboard and selectable-link fallbacks.
export async function shareArtwork({title, url}, button) {
  if (button?.disabled) return;
  const link = new URL(url, location.origin).href;
  if (button) button.disabled = true;
  try {
    if (navigator.share) {
      try { await navigator.share({title, url: link}); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(link);
      const status = document.getElementById('share-status') || Object.assign(document.createElement('p'), {id: 'share-status', className: 'share-status'});
      (button?.closest('dialog[open]') || document.body).append(status);
      status.setAttribute('role', 'status');
      status.textContent = 'Link copied';
      clearTimeout(status.timer);
      status.timer = setTimeout(() => { status.textContent = ''; }, 3000);
    } catch {
      const dialog = document.createElement('dialog');
      dialog.className = 'share-dialog';
      dialog.setAttribute('aria-label', 'Share artwork');
      const heading = document.createElement('h2'); heading.textContent = 'Share ' + title;
      const label = document.createElement('label'); label.textContent = 'Copy this link';
      const input = document.createElement('input'); input.type = 'url'; input.readOnly = true; input.value = link;
      label.append(input);
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { dialog.remove(); button?.focus({preventScroll: true}); });
      dialog.addEventListener('keydown', event => event.stopPropagation());
      dialog.append(heading, label, close); document.body.append(dialog); dialog.showModal(); input.select();
    }
  } finally { if (button) button.disabled = false; }
}
