import type { Report, Sport } from './types.ts';
function database(sport:Sport):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open('sport-coach-'+sport,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('reports',{keyPath:'id'});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
export async function saveReport(report:Report):Promise<void>{
 const db=await database(report.sport);
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('reports','readwrite');tx.objectStore('reports').put(report);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Сохранение отменено'));});}finally{db.close();}
}
export async function listReports(sport:Sport):Promise<Report[]>{
 const db=await database(sport);
 try{return await new Promise<Report[]>((resolve,reject)=>{const req=db.transaction('reports').objectStore('reports').getAll();req.onsuccess=()=>resolve((req.result as Report[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));req.onerror=()=>reject(req.error);});}finally{db.close();}
}
export async function deleteReport(sport:Sport,id:string):Promise<void>{
 const db=await database(sport);
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('reports','readwrite');tx.objectStore('reports').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
