import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
async function files(dir,prefix=''){let out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isDirectory())out.push(...await files(path.join(dir,e.name),prefix+e.name+'/'));else out.push(prefix+e.name);}return out;}
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
export async function zipFiles(output,entries){
 const local=[],central=[];let offset=0;
 for(const entry of entries){const name=Buffer.from(entry.name),raw=await fs.readFile(entry.path),data=deflateRawSync(raw),crc=crc32(raw);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
  h.writeUInt16LE(0x21,12); // Reproducible valid ZIP date: 1980-01-01.
  local.push(h,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 await fs.writeFile(output,Buffer.concat([...local,directory,end]));
}
await fs.mkdir('artifacts/packages',{recursive:true});
for(const sport of ['boxing','fitness','rg'])for(const target of ['pwa','chromium','firefox']){
 const dir='dist/'+sport+'/'+target;const entries=(await files(dir)).map(name=>({name,path:path.join(dir,name)}));
 await zipFiles('artifacts/packages/'+sport+'-'+target+'.zip',entries);
}
const sourceNames=['package.json','package-lock.json','tsconfig.json','index.html','.gitignore','assets-lock.json','README.md','THIRD_PARTY_NOTICES.md',...(await files('src')).map(n=>'src/'+n),...(await files('scripts')).map(n=>'scripts/'+n),...(await files('tests')).map(n=>'tests/'+n),...(await files('docs')).map(n=>'docs/'+n),...(await files('licenses')).map(n=>'licenses/'+n),...(await files('assets')).map(n=>'assets/'+n),...(await files('store/listings')).map(n=>'store/listings/'+n),'.github/workflows/ci.yml'];
await zipFiles('artifacts/packages/sport-coach-source.zip',sourceNames.map(name=>({name,path:name})));
console.log('Packaged 9 apps and source archive under artifacts/packages/');
