import { drawPose, chartSvg } from '../src/ui.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { angle, frameMetric, detectCycles, metricsFor } from '../src/core/metrics.ts';
import { makeReport, refreshReport } from '../src/core/report.ts';
import type { Sample, Landmark } from '../src/types.ts';
const sample=():Sample=>({time:0,width:1920,height:1080,landmarks:Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.99,presence:.99}))});
test('angles handle degenerate joints',()=>{assert.equal(angle({x:0,y:0},{x:0,y:0},{x:1,y:1}),null);assert.equal(angle({x:0,y:1},{x:0,y:0},{x:1,y:0}),90);});
test('normalized landmark geometry preserves rectangular aspect ratio',()=>{const s=sample();s.landmarks[11]={x:0,y:0,z:0,visibility:1};s.landmarks[13]={x:.5,y:0,z:0,visibility:1};s.landmarks[15]={x:1,y:1,z:0,visibility:1};const expected=angle({x:0,y:0},{x:960,y:0},{x:1920,y:1080});assert.equal(frameMetric(s,'leftElbow',.65),expected);assert.notEqual(expected,135);});
test('missing, nonfinite and off-frame points cannot produce measurements',()=>{for(const p of [{visibility:.1},{x:NaN},{x:1.1},{presence:.2}]){const s=sample();Object.assign(s.landmarks[13],p);assert.equal(frameMetric(s,'leftElbow',.65),null);}});
test('multiple people never become one measured athlete',()=>{const s=sample();s.reason='multiple-people';assert.equal(frameMetric(s,'trunk',.65),null);});
test('full cycles counted, incomplete initial cycles excluded',()=>{const v=[90,120,170,170,130,90,120,170];const times=v.map((_,i)=>i*.1);assert.equal(detectCycles(v,times).length,1);});
test('a gap does not close a cycle',()=>{const v=[170,150,90,null,110,170,170];assert.equal(detectCycles(v,v.map((_,i)=>i*.1)).length,0);});
test('inverted elbow extension cycles require return',()=>{const v=[70,80,120,170,130,80,70,70];assert.equal(detectCycles(v,v.map((_,i)=>i*.1),true).length,1);});
test('large timestamp gaps reset cycle state',()=>{const v=[170,140,90,100,170];assert.equal(detectCycles(v,[0,.1,.2,1,1.1]).length,0);});
test('no metric gets a fabricated zero with no observations',()=>{const m=metricsFor([{...sample(),landmarks:[]}],['leftKnee'],.65)[0];assert.equal(m.value,null);assert.equal(m.coverage,0);});
test('reports abstain instead of inventing exercise counts',()=>{const r=makeReport({sport:'fitness',exercise:'squat',fileName:'empty.mp4',samples:[{...sample(),landmarks:[]}],fps:15,threshold:.65,elapsedMs:20,duration:1});assert.equal(r.coverage,0);assert.equal(r.driver,null);assert.equal(r.cycles.length,0);assert.ok(r.findings.some(f=>f.title==='Недостаточно видимых точек'));});

test('head measurements use image geometry and body scale',()=>{
 const s=sample();s.width=200;s.height=100;
 for(const [i,x,y] of [[0,.6,.1],[2,.4,.15],[5,.6,.35],[11,.4,.4],[12,.6,.4],[23,.4,.8],[24,.6,.8]])Object.assign(s.landmarks[i],{x,y});
 assert.ok(Math.abs(frameMetric(s,'headTilt',.65)!-Math.atan2(20,40)*180/Math.PI)<1e-8);
 assert.equal(frameMetric(s,'headShift',.65),.5);
 assert.equal(frameMetric(s,'headHeight',.65),.75);
 const scaled={...s,width:400,height:200};
 assert.equal(frameMetric(scaled,'headShift',.65),.5);
 assert.equal(frameMetric(scaled,'headHeight',.65),.75);
 [s.landmarks[2],s.landmarks[5]]=[s.landmarks[5],s.landmarks[2]];
 assert.ok(Math.abs(frameMetric(s,'headTilt',.65)!-Math.atan2(20,40)*180/Math.PI)<1e-8);
 s.landmarks[0].visibility=.1;assert.equal(frameMetric(s,'headShift',.65),null);assert.equal(frameMetric(s,'headHeight',.65),null);
 s.landmarks[2].visibility=.1;assert.equal(frameMetric(s,'headTilt',.65),null);
});
test('head measurements abstain for collapsed eye and torso geometry',()=>{
 const s=sample();
 assert.equal(frameMetric(s,'headTilt',.65),null);
 assert.equal(frameMetric(s,'headShift',.65),null);
 assert.equal(frameMetric(s,'headHeight',.65),null);
});
test('saved reports gain upper-body and head charts without video or identity changes',()=>{
 const original=makeReport({sport:'rg',exercise:'shape',fileName:'saved.mp4',samples:[sample()],fps:10,threshold:.65,elapsedMs:20,duration:.1});
 original.metrics=original.metrics.filter(m=>['leftKnee','rightKnee','leftHip','rightHip','trunk','split'].includes(m.id));
 const updated=refreshReport(original);
 assert.equal(updated.id,original.id);assert.equal(updated.createdAt,original.createdAt);assert.equal(updated.model,original.model);assert.equal(updated.samples,original.samples);
 assert.ok(updated.metrics.some(m=>m.id==='leftElbow'));assert.ok(updated.metrics.some(m=>m.id==='rightShoulder'));assert.ok(updated.metrics.some(m=>m.id==='headTilt'));assert.ok(updated.metrics.some(m=>m.id==='headShift'));
 assert.equal(original.metrics.some(m=>m.id==='headTilt'),false,'Opening a report must not mutate stored data');
 for(const sport of ['fitness','boxing','rg'] as const){
  const r=makeReport({...original,sport,exercise:'free'});
  assert.ok(r.metrics.some(m=>m.id==='leftKnee'));assert.ok(r.metrics.some(m=>m.id==='leftElbow'));assert.ok(r.metrics.some(m=>m.id==='headHeight'));
  assert.equal(r.driver,null);
 }
});
test('press cycles start and return in flexion; curls use the opposite baseline',()=>{
 const samples=[70,80,120,170,130,80,70,70].map((a,i)=>{
  const s=sample();s.width=s.height=100;s.time=i*.1;
  Object.assign(s.landmarks[11],{x:.5,y:.3});Object.assign(s.landmarks[13],{x:.5,y:.5});
  Object.assign(s.landmarks[15],{x:.5+.2*Math.sin(a*Math.PI/180),y:.5-.2*Math.cos(a*Math.PI/180)});return s;
 });
 const args={sport:'fitness' as const,exercise:'press',fileName:'press.mp4',samples,fps:10,threshold:.65,elapsedMs:1,duration:.8};
 assert.equal(makeReport(args).cycles.length,1);assert.equal(makeReport({...args,exercise:'curl'}).cycles.length,0);
});
test('overlay draws the face along with body and excludes uncertain landmarks',()=>{
 const s=sample();s.landmarks.forEach((p,i)=>{p.x=.1+i*.02;p.y=.1+i*.015;});
 const arcs:number[][]=[];
 const context={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(...args:number[]){arcs.push(args);}};
 const canvas={clientWidth:960,clientHeight:540,width:960,height:540,getContext:()=>context} as unknown as HTMLCanvasElement;
 const video={videoWidth:1920,videoHeight:1080} as HTMLVideoElement;
 const previous=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
 Object.defineProperty(globalThis,'devicePixelRatio',{value:1,configurable:true});
 try{
  drawPose(canvas,video,s,.65,'#fff');
  assert.equal(arcs.length,33);assert.deepEqual(arcs[0].slice(0,2),[96,54],'Nose is rendered');assert.equal(arcs[10][2],2.5,'Mouth is rendered');
  arcs.length=0;s.landmarks[0].visibility=.1;drawPose(canvas,video,s,.65,'#fff');assert.equal(arcs.length,32);assert.ok(!arcs.some(a=>a[0]===96&&a[1]===54));
 }finally{if(previous)Object.defineProperty(globalThis,'devicePixelRatio',previous);else Reflect.deleteProperty(globalThis,'devicePixelRatio');}
});
test('fractional head-position graphs use a readable vertical scale',()=>{
 const metric={id:'headShift',label:'Голова',unit:'× торс',value:.2,min:.1,max:.3,coverage:1,series:[.1,.2,.3]};
 const svg=chartSvg(metric,[0,.1,.2],'#fff');
 assert.ok(svg.includes('>0.1</text>'));assert.ok(!svg.includes('>10</text>'));
});
