import { icon } from "./dom.ts";
// The browser's own video fullscreen (control button, double click, picture-in-picture) shows the bare <video>:
// the skeleton canvas is a sibling and stays behind. Fullscreen is therefore applied to the wrapper that holds
// both, and the video's own fullscreen is redirected there when a browser still offers it (Firefox control).
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> | void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const doc = document as FsDoc;
export const fullscreenElement = (): Element | null => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
const enabled = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
async function enter(el: FsElement) { if (el.requestFullscreen) await el.requestFullscreen(); else await el.webkitRequestFullscreen?.(); }
async function exit() { if (doc.exitFullscreen) await doc.exitFullscreen(); else await doc.webkitExitFullscreen?.(); }
export function bindFullscreen(wrap: HTMLElement, video: HTMLVideoElement, button: HTMLButtonElement): { toggle: () => void } {
 video.setAttribute("controlslist", "nofullscreen"); video.setAttribute("disablepictureinpicture", "");
 (video as HTMLVideoElement & { disablePictureInPicture?: boolean }).disablePictureInPicture = true;
 if (!enabled()) { button.hidden = true; return { toggle: () => undefined }; }
 const toggle = () => { (fullscreenElement() === wrap ? exit() : enter(wrap)).catch(() => undefined); };
 const sync = () => {
  const el = fullscreenElement();
  if (el === video) { enter(wrap).catch(() => undefined); return; }
  const on = el === wrap;
  wrap.classList.toggle("is-fullscreen", on); button.setAttribute("aria-pressed", String(on)); button.innerHTML = icon(on ? "shrink" : "expand", 18);
 };
 button.onclick = toggle;
 document.addEventListener("fullscreenchange", sync); document.addEventListener("webkitfullscreenchange", sync);
 sync();
 return { toggle };
}
