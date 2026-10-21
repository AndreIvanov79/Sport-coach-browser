import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import assert from 'node:assert/strict';
const root=process.cwd();
const appVersion=JSON.parse(await fs.readFile('package.json','utf8')).version;
const variants={boxing:{name:'Boxing Coach',color:'#ffb49b'},fitness:{name:'Fitness Coach',color:'#c6ef73'},rg:{name:'Rhythm Coach',color:'#c3b1ff'}};
await fs.mkdir('public/models',{recursive:true});await fs.mkdir('public/vendor',{recursive:true});await fs.mkdir('public/icons',{recursive:true});
const model='public/models/pose_landmarker_lite.task',url='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
try{await fs.access(model);}catch{console.log('Downloading pinned MediaPipe Lite model...');const response=await fetch(url);if(!response.ok)throw new Error('Model download failed: '+response.status);await fs.writeFile(model,Buffer.from(await response.arrayBuffer()));}
const modelData=await fs.readFile(model);if(modelData.length<1000000)throw new Error('Invalid model file');
const hash=createHash('sha256').update(modelData).digest('hex');
let lock;try{lock=JSON.parse(await fs.readFile('assets-lock.json','utf8'));}catch{}
if(lock?.sha256&&lock.sha256!==hash)throw new Error('Model checksum changed');
await fs.writeFile('assets-lock.json',JSON.stringify({model:'MediaPipe Pose Landmarker Lite float16 v1',url,bytes:modelData.length,sha256:hash,packageVersion:'0.10.32'},null,2)+'\n');
await fs.cp('node_modules/@mediapipe/tasks-vision/wasm','public/vendor',{recursive:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{stdio:'inherit'});
execFileSync(process.execPath,['--experimental-strip-types','--test','tests/metrics.test.ts'],{stdio:'inherit'});
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([length,t,data,crc]);}
function png(size,color){const rgb=color.match(/[a-f0-9]{2}/g).map(x=>parseInt(x,16)),raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*(size*4+1)+1+x*4;const u=x/size,v=y/size;const mark=(Math.abs(v-(.23+Math.abs(u-.5)*.6))<.035&&u>.2&&u<.8)||(Math.abs(v-(.41+Math.abs(u-.5)*.6))<.035&&u>.2&&u<.8)||(Math.abs(v-(.59+Math.abs(u-.5)*.6))<.035&&u>.2&&u<.8);const c=mark?rgb:[23,31,26];raw[i]=c[0];raw[i+1]=c[1];raw[i+2]=c[2];raw[i+3]=255;}const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
await build({configFile:false,publicDir:false,build:{target:'es2022',lib:{entry:path.join(root,'src/pose-worker.ts'),name:'PoseWorker',formats:['iife'],fileName:()=> 'pose-worker.js'},outDir:'work/worker',emptyOutDir:true,minify:true}});
await fs.mkdir('artifacts',{recursive:true});
const checks=[];
async function walk(directory,prefix=''){let out=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const rel=prefix+entry.name;if(entry.isDirectory())out.push(...await walk(path.join(directory,entry.name),rel+'/'));else out.push(rel);}return out;}
for(const [sport,config] of Object.entries(variants)){
 for(const size of [16,48,128,192,512])await fs.writeFile('public/icons/icon-'+size+'.png',png(size,config.color));
 await fs.writeFile('public/icon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#171f1a"/><path d="m14 21 18-10 18 10-18 10Zm0 12 18 10 18-10M14 45l18 10 18-10" fill="none" stroke="'+config.color+'" stroke-width="3"/></svg>');
 const output='dist/'+sport+'/pwa';
 await build({configFile:false,base:'./',define:{__SPORT__:JSON.stringify(sport),__APP_VERSION__:JSON.stringify(appVersion)},build:{outDir:output,emptyOutDir:true,target:'es2022',chunkSizeWarningLimit:900}});
 await fs.copyFile('work/worker/pose-worker.js',output+'/pose-worker.js');
 let html=await fs.readFile(output+'/index.html','utf8');html=html.replace('<title>Sport Coach</title>','<title>'+config.name+' · Локальный видеоанализ</title>');await fs.writeFile(output+'/index.html',html);
 const manifest={id:'./',name:config.name,short_name:config.name,start_url:'./',scope:'./',display:'standalone',lang:'ru',background_color:'#121619',theme_color:'#121619',description:'Локальный видеоанализ на MediaPipe',icons:[{src:'icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
 await fs.writeFile(output+'/manifest.webmanifest',JSON.stringify(manifest,null,2));
 await fs.copyFile('THIRD_PARTY_NOTICES.md',output+'/THIRD_PARTY_NOTICES.md');
 await fs.cp('licenses',output+'/licenses',{recursive:true});
 const assets=(await walk(output)).sort(),fingerprint=createHash('sha256');
 for(const asset of assets)fingerprint.update(asset).update(await fs.readFile(output+'/'+asset));
 const version=fingerprint.digest('hex').slice(0,12);
 const cache='sport-coach-'+sport+'-'+version;
 const sw="const CACHE="+JSON.stringify(cache)+",FILES="+JSON.stringify(assets.map(s=>'./'+s))+";\n"+
 "self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));\n"+
 "self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('sport-coach-"+sport+"-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));\n"+
 "self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(event.request);if(hit)return hit;if(event.request.mode==='navigate'){const page=await cache.match('./index.html');if(page)return page;}return fetch(event.request);})());});\n"+
 "self.addEventListener('message',event=>{if(event.data?.type==='offline-status')event.waitUntil((async()=>{const cache=await caches.open(CACHE);if((await cache.keys()).length>=FILES.length)event.source?.postMessage({type:'offline-ready'});})());});\n";
 await fs.writeFile(output+'/sw.js',sw);
 for(const browser of ['chromium','firefox']){
  const target='dist/'+sport+'/'+browser;await fs.rm(target,{recursive:true,force:true});await fs.cp(output,target,{recursive:true});
  await fs.rm(target+'/sw.js');
  const background="const api=globalThis.browser||chrome;api.action.onClicked.addListener(()=>{api.tabs.create({url:api.runtime.getURL('index.html')});});";
  await fs.writeFile(target+'/background.js',background);
  const ext={manifest_version:3,name:config.name,version:appVersion,description:'Локальный анализ видео: файл или камера. MediaPipe, метрики, отчёт без передачи данных.',icons:{16:'icons/icon-16.png',48:'icons/icon-48.png',128:'icons/icon-128.png'},action:{default_title:'Открыть '+config.name,default_icon:{16:'icons/icon-16.png',48:'icons/icon-48.png'}},background:browser==='chromium'?{service_worker:'background.js'}:{scripts:['background.js']},content_security_policy:{extension_pages:"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none';"},...(browser==='chromium'?{minimum_chrome_version:'116'}:{browser_specific_settings:{gecko:{id:sport+'@sport-coach.local',strict_min_version:'128.0',data_collection_permissions:{required:['none']}}}})};
  await fs.writeFile(target+'/manifest.json',JSON.stringify(ext,null,2));
  assert.equal(ext.manifest_version,3); assert.equal(ext.permissions,undefined); assert.equal(ext.host_permissions,undefined);
  assert.ok(ext.content_security_policy.extension_pages.includes("connect-src 'self'"));
  for(const asset of ['index.html','pose-worker.js','background.js','models/pose_landmarker_lite.task',...Object.values(ext.icons)])await fs.access(target+'/'+asset);
  const page=await fs.readFile(target+'/index.html','utf8'); assert.ok(!/<script[^>]+src=["']https?:/i.test(page));
  assert.equal(createHash('sha256').update(await fs.readFile(target+'/models/pose_landmarker_lite.task')).digest('hex'),hash);
  checks.push({sport,target:browser,files:(await walk(target)).length,permissions:[],remoteCode:false,manifestAndLocalAssetsChecked:true});
 }
 checks.push({sport,target:'pwa',precacheFiles:assets.length,cache});
}
await fs.writeFile('artifacts/build-report.json',JSON.stringify({builtAt:new Date().toISOString(),modelSha256:hash,checks},null,2));
console.log('Built 3 PWAs, 3 Chromium extensions, 3 Firefox extensions. No remote runtime assets.');
if(process.argv.includes('--package'))await import('./package.mjs');
if(process.argv.includes('--qa'))await import('./qa.mjs');
if(process.argv.includes('--serve'))await import('./serve.mjs');
