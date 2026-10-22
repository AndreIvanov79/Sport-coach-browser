// Some browser/decoder combinations (seen in Chrome with an MP4 after changing speed at the end of the clip) keep
// the playback clock running while the picture stays frozen: the skeleton then moves over a still frame. When the
// clock has clearly run ahead of the last presented frame, a seek to the current time restarts frame delivery.
type FrameMeta = { mediaTime: number };
type RvfcVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: (now: number, meta: FrameMeta) => void): number };
export function watchFrozenFrames(video: HTMLVideoElement): void {
 if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return;
 const v = video as RvfcVideo;
 let frameMedia = 0, frameAt = performance.now(), visible = true, lastFix = 0;
 const onFrame = (_now: number, meta: FrameMeta) => { frameMedia = meta.mediaTime; frameAt = performance.now(); v.requestVideoFrameCallback(onFrame); };
 v.requestVideoFrameCallback(onFrame);
 const restart = () => { frameAt = performance.now(); frameMedia = video.currentTime; };
 for (const type of ["play", "seeked", "ratechange", "loadeddata"]) video.addEventListener(type, restart);
 // Frames are only presented for a video on screen, so an off-screen player must not look frozen.
 if ("IntersectionObserver" in window) new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); restart(); }, { threshold: .3 }).observe(video);
 setInterval(() => {
  if (video.paused || video.ended || video.seeking || document.hidden || !visible || video.readyState < 3) return;
  const now = performance.now(), ahead = video.currentTime - frameMedia;
  // 1.2 s of media time without a new frame: far beyond any normal frame interval (even 1 fps at 1x).
  if (now - frameAt > 1500 && ahead > 1.2 && now - lastFix > 3000) {
   lastFix = now; console.warn("[sport-coach] video picture stalled at " + frameMedia.toFixed(2) + " s while the clock is at " + video.currentTime.toFixed(2) + " s (rate " + video.playbackRate + "); re-seeking");
   video.currentTime = video.currentTime;
  }
 }, 500);
}
