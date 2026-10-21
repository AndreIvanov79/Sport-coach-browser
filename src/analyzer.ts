import type { Sample } from './types.ts';
export type Progress={phase:string;fraction:number;sample?:Sample};
export function waitFor(target:EventTarget,type:string,signal:AbortSignal,timeout=20000):Promise<void>{
 return new Promise((resolve,reject)=>{
  const finish=(error?:unknown)=>{clearTimeout(timer);target.removeEventListener(type,ok);target.removeEventListener('error',fail);signal.removeEventListener('abort',abort);error?reject(error):resolve();};
  const ok=()=>finish(),fail=()=>finish(new Error('Не удалось декодировать видео. Попробуйте MP4 (H.264) или WebM.')),abort=()=>finish(new DOMException('Отменено','AbortError'));
  const timer=setTimeout(()=>finish(new Error('Видео не ответило вовремя. Попробуйте другой формат или более короткий ролик.')),timeout);
  target.addEventListener(type,ok,{once:true});target.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
 });
}
export async function analyzeVideo(file:File,options:{fps:number;signal:AbortSignal;durationOverride?:number;progress:(p:Progress)=>void}):Promise<{samples:Sample[];duration:number;elapsedMs:number}>{
 if(!('Worker' in window)||!('createImageBitmap' in window)||!('OffscreenCanvas' in window))throw new Error('Браузеру нужны Web Workers, ImageBitmap и OffscreenCanvas. Обновите браузер.');
 const started=performance.now(),video=document.createElement('video'),url=URL.createObjectURL(file);
 video.preload='auto';video.muted=true;video.playsInline=true;
 const worker=new Worker(new URL('./pose-worker.js',document.baseURI));
 let id=0,terminalError:Error|null=null;const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>}>();
 const rejectAll=(error:unknown)=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();};
 worker.onerror=event=>{terminalError=new Error(event.message||'Ошибка запуска обработчика MediaPipe');rejectAll(terminalError);};
 worker.onmessage=event=>{const item=pending.get(event.data.id);if(!item)return;clearTimeout(item.timer);pending.delete(event.data.id);event.data.type==='error'?item.reject(new Error(event.data.message)):item.resolve(event.data);};
 function request(data:object,transfer:Transferable[]=[],timeout=90000):Promise<any>{
  if(terminalError)return Promise.reject(terminalError);
  if(options.signal.aborted)return Promise.reject(new DOMException('Отменено','AbortError'));
  return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(new Error('Обработка не ответила вовремя. Попробуйте перезапустить приложение.'));},timeout);pending.set(key,{resolve,reject,timer});try{worker.postMessage({id:key,...data},transfer);}catch(error){clearTimeout(timer);pending.delete(key);reject(error);}});
 }
 const abort=()=>{worker.terminate();rejectAll(new DOMException('Отменено','AbortError'));};
 options.signal.addEventListener('abort',abort,{once:true});
 try{
  if(options.signal.aborted)throw new DOMException('Отменено','AbortError');
  options.progress({phase:'Открываем видео',fraction:0});
  const loaded=waitFor(video,'loadeddata',options.signal);video.src=url;await loaded;
  const duration=Number.isFinite(video.duration)?video.duration:options.durationOverride;
  if(!duration||duration<=0)throw new Error('Не удалось определить длительность видео.');
  if(duration>600)throw new Error('Для этой версии выберите ролик до 10 минут.');
  options.progress({phase:'Запускаем локальную модель',fraction:0});
  await request({type:'init',base:new URL('./',document.baseURI).href});
  const width=video.videoWidth,height=video.videoHeight;
  if(!width||!height)throw new Error('В файле не найден видеопоток.');
  const ratio=Math.min(1,960/Math.max(width,height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas недоступен.');
  const count=Math.ceil(duration*options.fps),samples:Sample[]=[];
  for(let index=0;index<count;index++){
   if(options.signal.aborted)throw new DOMException('Отменено','AbortError');
   const time=Math.min(index/options.fps,Math.max(0,duration-.01));
   if(Math.abs(video.currentTime-time)>.0001){const sought=waitFor(video,'seeked',options.signal);video.currentTime=time;await sought;}
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const bitmap=await createImageBitmap(canvas);
   if(options.signal.aborted){bitmap.close();throw new DOMException('Отменено','AbortError');}
   const result=await request({type:'frame',bitmap,timestamp:index*1000/options.fps+1},[bitmap]);
   const sample:Sample={time,landmarks:result.landmarks,width,height,reason:result.reason};
   samples.push(sample);options.progress({phase:'Анализируем кадры на устройстве',fraction:(index+1)/count,sample});
  }
  return {samples,duration,elapsedMs:performance.now()-started};
 }finally{
  options.signal.removeEventListener('abort',abort);worker.terminate();rejectAll(new Error('Обработка завершена'));
  video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
 }
}
