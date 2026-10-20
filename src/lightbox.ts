// Full-size screenshot viewer.

import { $ } from './dom';

let returnFocus: Element | null = null;

export function openLightbox(src: string): void {
  returnFocus = document.activeElement;
  $<HTMLImageElement>('lbImg').src = src;
  $('lightbox').hidden = false;
  $('lbClose').focus();
}

export function closeLightbox(): void {
  $('lightbox').hidden = true;
  $<HTMLImageElement>('lbImg').removeAttribute('src');
  if (returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus();
  returnFocus = null;
}

export const lightboxOpen = (): boolean => !$('lightbox').hidden;

export function initLightbox(): void {
  $('lbClose').addEventListener('click', closeLightbox);
  $('lightbox').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'lightbox') closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxOpen()) {
      e.preventDefault(); // so the drawer underneath stays open
      closeLightbox();
    }
  });
}
