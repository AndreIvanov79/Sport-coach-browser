import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let detector: PoseLandmarker | null = null;
const scope = self as unknown as DedicatedWorkerGlobalScope;
// Bundled as a classic worker: MediaPipe's WASM loader uses importScripts.
scope.onmessage = async (event: MessageEvent) => {
 const { id, type } = event.data;
 try {
  if(type==='init'){
   const vision=await FilesetResolver.forVisionTasks(event.data.base+'vendor');
   const options={baseOptions:{modelAssetPath:event.data.base+'models/pose_landmarker_lite.task',delegate:'GPU' as const},runningMode:'VIDEO' as const,numPoses:2,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5};
   let delegate='GPU';
   try { detector=await PoseLandmarker.createFromOptions(vision,options); }
   catch { delegate='CPU'; detector=await PoseLandmarker.createFromOptions(vision,{...options,baseOptions:{...options.baseOptions,delegate:'CPU'}}); }
   scope.postMessage({id,type:'ready',delegate});
  }else if(type==='frame'){
   const bitmap=event.data.bitmap as ImageBitmap;
   try {
    if(!detector)throw new Error('Модель ещё не готова');
    const result=detector.detectForVideo(bitmap,event.data.timestamp);
    scope.postMessage({id,type:'pose',landmarks:result.landmarks.length===1?result.landmarks[0]:[],reason:result.landmarks.length>1?'multiple-people':result.landmarks.length===0?'no-pose':undefined});
   }finally{bitmap.close();}
  }
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  scope.postMessage({id,type:'error',message:/GLctx|WebGL|GL context|activeTexture/i.test(message)
   ?'MediaPipe не получил графический контекст WebGL. Проверьте аппаратное ускорение в настройках браузера и откройте приложение в обычном окне браузера.'
   :message});
 }
};
