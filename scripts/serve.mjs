// Local preview of the built apps: node scripts/serve.mjs (npm run preview). Keep this terminal open while you use
// the apps; the PWAs that were already opened keep working from their offline cache, the others need the server.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist"), port = Number(process.env.PORT || 4173), host = "127.0.0.1";
const SPORTS = [["fitness", "Fitness Coach"], ["boxing", "Boxing Coach"], ["rg", "Rhythm Coach"]];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".wasm": "application/wasm", ".task": "application/octet-stream", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
const exists = async file => { try { return await fs.stat(file); } catch { return null; } };
const index = async () => {
 const rows = await Promise.all(SPORTS.map(async ([id, name]) => (await exists(path.join(root, id, "pwa", "index.html")))
  ? `<li><a href="/${id}/pwa/">${name}</a> <code>/${id}/pwa/</code></li>` : `<li>${name}: <em>not built, run npm run build</em></li>`));
 return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sport Coach preview</title>
<style>body{font:16px system-ui,sans-serif;background:#121619;color:#e9eeeb;margin:40px}a{color:#c6ef73;font-size:20px}li{margin:14px 0}code{color:#93a09e;margin-left:8px}</style>
<h1>Sport Coach · local preview</h1><ul>${rows.join("")}</ul>`;
};
export const server = http.createServer(async (req, res) => {
 try {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (pathname === "/") { res.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-cache" }).end(await index()); return; }
  let file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const stat = await exists(file);
  // /rg/pwa without the slash would load ./assets from /rg/ and show a blank page.
  if (stat?.isDirectory() && !pathname.endsWith("/")) { res.writeHead(301, { Location: pathname + "/" }).end(); return; }
  if (stat?.isDirectory()) file = path.join(file, "index.html");
  const data = await fs.readFile(file);
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }).end(data);
 } catch { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found. Open http://" + host + ":" + port + "/ for the list of apps."); }
});
server.on("error", error => {
 if (error.code === "EADDRINUSE") console.error(`Port ${port} is already in use: another preview is probably running (open http://${host}:${port}/), or start this one with PORT=4174 npm run preview.`);
 else console.error(error);
 process.exit(1);
});
server.listen(port, host, async () => {
 if (!(await exists(root))) console.warn("dist/ is missing: run npm run build first.");
 console.log(`Local preview (keep this terminal open, Ctrl+C to stop): http://${host}:${port}/`);
 for (const [id, name] of SPORTS) console.log(`  ${name.padEnd(14)} http://${host}:${port}/${id}/pwa/`);
});
