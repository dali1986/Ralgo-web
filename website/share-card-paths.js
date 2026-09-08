// Shared by the static page builder and the gallery router.
export const defaultShareImage = '/assets/display/ralgo-share.jpg';
export const collectionShareImage = id => `/assets/share/collections/${encodeURIComponent(id)}.jpg`;
export const workShareImage = (id, number) => `/assets/share/works/${encodeURIComponent(id)}/${number}.jpg`;
export const liveShareImage = id => `/assets/share/living/${encodeURIComponent(id)}.jpg`;
