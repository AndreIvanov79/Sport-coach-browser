// Assembles the public website in dist/site: landing page, the three PWAs, privacy policy, terms of use,
// robots/sitemap and, once the Android apps are signed, /.well-known/assetlinks.json for Google Play.
// Usage: npm run build && npm run site            (refuses while store/config.json still has YOUR_ values)
//        npm run site -- --preview                 (local look with the placeholders left in)
import fs from "node:fs/promises";
import { SPORTS, LANGS, APP, loadConfig, loadListings, configProblems, listingProblems, assetLinks, fill, escapeHtml, siteBase, walk } from "./store-lib.mjs";

const preview = process.argv.includes("--preview"), out = "dist/site";
const config = await loadConfig(), listings = await loadListings();
const problems = [...listingProblems(listings), ...configProblems(config)];
if (problems.length && !preview) {
 console.error("The public site needs these fixes first:\n - " + problems.join("\n - ") + "\nSee store/README.md, or run npm run site -- --preview for a local look.");
 process.exit(1);
}
for (const sport of SPORTS) {
 try { await fs.access("dist/" + sport + "/pwa/sw.js"); } catch { console.error("dist/" + sport + "/pwa is missing: run npm run build first."); process.exit(1); }
}

const TEXT = {
 en: { title: "Sport Coach", lead: "Three free training apps that analyse your video right on your device. Nothing is uploaded: no server, no account, no ads.", open: "Open the web app", install: "Install", facts: [["On your device", "Pose detection (MediaPipe) runs in the browser. Videos never leave the device."], ["Works offline", "Install it as an app: after the first visit it works without internet."], ["File or camera", "Analyse a recorded video or train live with on-screen and voice prompts."]], privacy: "Privacy policy", terms: "Terms of use", notFound: "Page not found.", back: "Go to the home page" },
 ru: { title: "Sport Coach", lead: "Три бесплатных приложения для тренировок, которые разбирают видео прямо на вашем устройстве. Ничего не загружается: ни сервера, ни аккаунта, ни рекламы.", open: "Открыть веб-приложение", install: "Установить", facts: [["На вашем устройстве", "Распознавание позы (MediaPipe) работает в браузере. Видео не покидает устройство."], ["Без интернета", "Установите как приложение: после первого открытия работает офлайн."], ["Файл или камера", "Разбор записанного видео или live-тренировка с подсказками на экране и голосом."]], privacy: "Политика конфиденциальности", terms: "Условия использования", notFound: "Страница не найдена.", back: "На главную" },
 ro: { title: "Sport Coach", lead: "Trei aplicații gratuite de antrenament care analizează videoclipul direct pe dispozitivul tău. Nimic nu se încarcă: fără server, fără cont, fără reclame.", open: "Deschide aplicația web", install: "Instalează", facts: [["Pe dispozitivul tău", "Detectarea posturii (MediaPipe) rulează în browser. Videoclipurile nu părăsesc dispozitivul."], ["Funcționează offline", "Instaleaz-o ca aplicație: după prima vizită merge fără internet."], ["Fișier sau cameră", "Analizează un videoclip înregistrat sau antrenează-te live cu indicații pe ecran și vocale."]], privacy: "Politica de confidențialitate", terms: "Termeni de utilizare", notFound: "Pagina nu a fost găsită.", back: "Pagina principală" }
};
const STORES = { chrome: "Chrome Web Store", edge: "Microsoft Edge Add-ons", firefox: "Firefox Add-ons", play: "Google Play" };
const LANG_LABEL = { en: "English", ru: "Русский", ro: "Română" };

// The landing page shares the app's language setting (same origin, same key), so a choice here carries into the apps.
const langScript = `<script>(()=>{const K="sport-coach-lang",L=${JSON.stringify(LANGS)};let l;try{l=localStorage.getItem(K)}catch{}if(!L.includes(l))l=(navigator.languages||[navigator.language]).map(x=>String(x).slice(0,2)).find(x=>L.includes(x))||"en";const set=n=>{document.documentElement.lang=n;for(const s of document.querySelectorAll("[data-lang]"))s.hidden=s.dataset.lang!==n;for(const b of document.querySelectorAll("[data-set-lang]"))b.setAttribute("aria-pressed",String(b.dataset.setLang===n));};document.addEventListener("click",e=>{const b=e.target.closest("[data-set-lang]");if(!b)return;try{localStorage.setItem(K,b.dataset.setLang)}catch{}set(b.dataset.setLang);});set(l);})();</script>`;

function landing() {
 const blocks = LANGS.map(lang => {
  const t = TEXT[lang];
  const cards = SPORTS.map(sport => {
   const l = listings[sport][lang], links = config.storeLinks?.[sport] ?? {};
   const stores = Object.entries(STORES).filter(([k]) => /^https:\/\//.test(links[k] ?? "")).map(([k, name]) => `<li><a href="${escapeHtml(links[k])}" rel="noopener">${name}</a></li>`).join("");
   return `<article class="app" style="--c:${APP[sport].color}"><header><img src="${sport}/icons/icon-192.png" alt="" width="56" height="56"><h2>${escapeHtml(APP[sport].short)}</h2></header><p>${escapeHtml(l.summary)}</p><a class="open" href="${sport}/">${t.open} →</a>${stores ? `<div><small class="meta">${t.install}:</small><ul class="stores">${stores}</ul></div>` : ""}</article>`;
  }).join("");
  const facts = t.facts.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
  return `<div data-lang="${lang}" lang="${lang}"${lang === "en" ? "" : " hidden"}><section class="intro"><h1>${t.title}</h1><p>${t.lead}</p></section><section class="apps">${cards}</section><section class="facts">${facts}</section></div>`;
 }).join("");
 const footer = LANGS.map(lang => `<span data-lang="${lang}"${lang === "en" ? "" : " hidden"}><a href="privacy/#${lang}">${TEXT[lang].privacy}</a> · <a href="terms/#${lang}">${TEXT[lang].terms}</a></span>`).join("");
 return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sport Coach: on-device training video analysis</title>
<meta name="description" content="${escapeHtml(TEXT.en.lead)}">
<meta name="theme-color" content="#121619">
${preview ? "" : `<link rel="canonical" href="${escapeHtml(siteBase(config))}">`}
<link rel="icon" href="fitness/icons/icon-32.png">
<link rel="stylesheet" href="site.css">
</head>
<body>
<header class="top"><a class="home" href="./">Sport Coach</a><nav class="langs">${LANGS.map(l => `<button type="button" data-set-lang="${l}" lang="${l}">${LANG_LABEL[l]}</button>`).join("")}</nav></header>
<main>${blocks}</main>
<footer class="foot">${footer} · <a href="mailto:${escapeHtml(config.contactEmail)}">${escapeHtml(config.contactEmail)}</a></footer>
${langScript}
</body>
</html>
`;
}

function notFound() {
 const base = preview ? "/" : siteBase(config);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found · Sport Coach</title><link rel="stylesheet" href="${base}site.css"></head><body><header class="top"><a class="home" href="${base}">Sport Coach</a></header><main>${LANGS.map(l => `<p lang="${l}">${TEXT[l].notFound} <a href="${base}">${TEXT[l].back}</a></p>`).join("")}</main></body></html>\n`;
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out + "/privacy", { recursive: true }); await fs.mkdir(out + "/terms", { recursive: true });
for (const sport of SPORTS) await fs.cp("dist/" + sport + "/pwa", out + "/" + sport, { recursive: true });
await fs.copyFile("site/site.css", out + "/site.css");
for (const page of ["privacy", "terms"]) await fs.writeFile(out + "/" + page + "/index.html", fill(await fs.readFile("site/" + page + ".html", "utf8"), config));
await fs.writeFile(out + "/index.html", landing());
await fs.writeFile(out + "/404.html", notFound());
await fs.writeFile(out + "/.nojekyll", "");
if (!preview) {
 const base = siteBase(config), pages = ["", "privacy/", "terms/", ...SPORTS.map(s => s + "/")];
 await fs.writeFile(out + "/robots.txt", "User-agent: *\nAllow: /\nSitemap: " + base + "sitemap.xml\n");
 await fs.writeFile(out + "/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => ` <url><loc>${escapeHtml(base + p)}</loc></url>`).join("\n")}\n</urlset>\n`);
}
const links = assetLinks(config);
if (links.length) {
 if (configProblems(config, { needAndroid: true }).length && !preview) { console.error("assetlinks.json: " + configProblems(config, { needAndroid: true }).join("; ")); process.exit(1); }
 await fs.mkdir(out + "/.well-known", { recursive: true });
 await fs.writeFile(out + "/.well-known/assetlinks.json", JSON.stringify(links, null, 2) + "\n");
}

const files = await walk(out);
let total = 0, largest = { file: "", bytes: 0 };
for (const f of files) { const { size } = await fs.stat(out + "/" + f); total += size; if (size > largest.bytes) largest = { file: f, bytes: size }; }
const mb = n => (n / 1048576).toFixed(1) + " MB";
console.log(`Site ready in ${out}: ${files.length} files, ${mb(total)}${links.length ? ", assetlinks.json for " + links.map(l => l.target.package_name).join(", ") : ", no assetlinks.json yet (fill playSigningSha256 after creating the Play apps)"}.`);
console.log(`Largest file ${largest.file} (${mb(largest.bytes)}): hosts with a 25 MiB file limit (Cloudflare Pages) cannot serve it; GitHub Pages and Netlify can.`);
if (preview) console.log("Preview build (placeholders kept): npm run preview -- --site");
