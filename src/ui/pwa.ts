import { t } from "../i18n/index.ts";
import { $, toast } from "./dom.ts";
type InstallPrompt = Event & { prompt(): Promise<void> };
let offlineReady = false;
export const isOfflineReady = () => offlineReady;
function status(key: string, ready = false) { const el = $("offline-status"); el.innerHTML = "<i class=\"" + (ready ? "ok" : "") + "\"></i>" + t(key); el.dataset.key = key; }
export function refreshPwaTexts() { const el = $("offline-status"); if (el.dataset.key) status(el.dataset.key, offlineReady); const b = $("update-banner"); if (!b.hidden) showUpdate(); }
let waiting: ServiceWorker | null = null, applyWhenIdle = false, updateRequested = false, busyCheck: () => boolean = () => false;
function showUpdate() {
 const b = $("update-banner"); b.hidden = false;
 b.innerHTML = "<span>" + t("pwa.update") + "</span><button class=\"small-button\" id=\"update-apply\">" + t("pwa.updateApply") + "</button><button class=\"text-button\" id=\"update-later\">" + t("pwa.updateLater") + "</button>";
 $("update-apply").onclick = () => {
  if (busyCheck()) { applyWhenIdle = true; toast(t("pwa.updateAfter")); b.hidden = true; return; }
  updateRequested = true; waiting?.postMessage({ type: "skip-waiting" });
 };
 $("update-later").onclick = () => { b.hidden = true; };
}
/** Call when an analysis finishes so a deferred update can be applied. */
export function idle() { if (applyWhenIdle && waiting) { updateRequested = true; waiting.postMessage({ type: "skip-waiting" }); } }
export function setupPwa(extension: boolean, busy: () => boolean) {
 busyCheck = busy;
 let installPrompt: InstallPrompt | null = null;
 window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event as InstallPrompt; $("install").hidden = false; });
 $("install").onclick = async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $("install").hidden = true; } };
 if (extension) { offlineReady = true; status("pwa.extension", true); return; }
 if (!("serviceWorker" in navigator)) { status("pwa.noCache"); return; }
 status("pwa.preparing");
 // First install claims the page too (controllerchange); reload only after the user accepted an update.
 let reloading = false;
 navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading || !updateRequested) return; reloading = true; location.reload(); });
 navigator.serviceWorker.addEventListener("message", event => { if (event.data?.type === "offline-ready") { offlineReady = true; status("pwa.ready", true); } });
 navigator.serviceWorker.register("./sw.js").then(async registration => {
  const watch = (w: ServiceWorker | null) => { if (!w) return; w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) { waiting = w; showUpdate(); } }); };
  if (registration.waiting && navigator.serviceWorker.controller) { waiting = registration.waiting; showUpdate(); }
  registration.addEventListener("updatefound", () => watch(registration.installing));
  await navigator.serviceWorker.ready;
  (registration.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "offline-status" });
  setInterval(() => registration.update().catch(() => undefined), 60 * 60 * 1000);
 }).catch(() => status("pwa.noCache"));
 window.addEventListener("offline", () => { if (!offlineReady) toast(t("pwa.notReadyOffline")); });
}
