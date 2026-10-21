import type { Cycle, Landmark, Metric, Sample } from '../types.ts';
// MediaPipe 33-point schema; these are NOT COCO-WholeBody indices.
const definitions: Record<string, { label: string; points: number[]; unit?: string; description?: string }> = {
 leftKnee: { label: 'Левое колено', points: [23,25,27] }, rightKnee: { label: 'Правое колено', points: [24,26,28] },
 leftElbow: { label: 'Левый локоть', points: [11,13,15] }, rightElbow: { label: 'Правый локоть', points: [12,14,16] },
 leftHip: { label: 'Левое бедро', points: [11,23,25] }, rightHip: { label: 'Правое бедро', points: [12,24,26] },
 leftShoulder: { label: 'Левое плечо', points: [13,11,23] }, rightShoulder: { label: 'Правое плечо', points: [14,12,24] },
 trunk: { label: 'Наклон корпуса', points: [11,12,23,24] },
 headTilt: { label: 'Голова: наклон линии глаз', points: [2,5], description: 'Угол линии между центрами глаз к горизонтали кадра. Плюс — линия опускается слева направо на экране. При малом расстоянии между глазами измерение исключается.' },
 headShift: { label: 'Голова: смещение от плеч', points: [0,11,12,23,24], unit: '× торс', description: 'Горизонтальное смещение носа от середины плеч, делённое на длину корпуса. Плюс — вправо на экране, минус — влево.' },
 headHeight: { label: 'Голова: высота над плечами', points: [0,11,12,23,24], unit: '× торс', description: 'Высота носа над серединой плеч, делённая на длину корпуса. Положительное значение — нос выше плеч. Это положение в кадре, а не угол наклона шеи.' },
 split: { label: 'Раскрытие ног', points: [23,24,27,28] },
 guard: { label: 'Кисти ниже плеч', points: [11,12,15,16,23,24] }
};
export type Point = { x: number; y: number };
export const midpoint = (a: Point,b: Point): Point => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function angle(a:Point,b:Point,c:Point):number|null {
 const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};
 const denom=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
 return denom<1e-8 ? null : Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/denom)))*180/Math.PI;
}
export function observed(p:Landmark|undefined,threshold:number):p is Landmark {
 return !!p && [p.x,p.y,p.visibility,p.presence??1].every(Number.isFinite)
 && p.visibility>=threshold && (p.presence??1)>=threshold && p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
}
export function frameMetric(sample:Sample,id:string,threshold:number):number|null {
 const def=definitions[id];
 if(!def||sample.reason||sample.width<=0||sample.height<=0||!def.points.every(i=>observed(sample.landmarks[i],threshold))) return null;
 // Angles require image aspect correction before calculation.
 const pt=(i:number):Point=>({x:sample.landmarks[i].x*sample.width,y:sample.landmarks[i].y*sample.height});
 if(def.points.length===3) return angle(pt(def.points[0]),pt(def.points[1]),pt(def.points[2]));
 if(id==='headTilt'){
  const a=pt(2),b=pt(5);let dx=b.x-a.x,dy=b.y-a.y;
  if(Math.hypot(dx,dy)<Math.max(3,sample.width*.01))return null;
  if(dx<0){dx=-dx;dy=-dy;}
  return Math.atan2(dy,dx)*180/Math.PI;
 }
 const hip=midpoint(pt(23),pt(24));
 if(id==='split') return angle(pt(27),hip,pt(28));
 const shoulder=midpoint(pt(11),pt(12));
 if(id==='trunk') return angle(shoulder,hip,{x:hip.x,y:hip.y-100});
 const torso=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
 if(torso<5) return null;
 if(id==='headShift')return (pt(0).x-shoulder.x)/torso;
 if(id==='headHeight')return (shoulder.y-pt(0).y)/torso;
 return Math.max(pt(15).y-pt(11).y,pt(16).y-pt(12).y)/torso;
}
export function percentile(values:number[],p:number):number {
 const sorted=[...values].sort((a,b)=>a-b), index=(sorted.length-1)*p,lo=Math.floor(index),hi=Math.ceil(index);
 return sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo);
}
export function metricsFor(samples:Sample[],ids:string[],threshold:number):Metric[] {
 return ids.map(id=>{
  const series=samples.map(s=>frameMetric(s,id,threshold));
  const values=series.filter((v):v is number=>v!==null&&Number.isFinite(v));
  const coverage=samples.length?values.length/samples.length:0, assessable=coverage>=.6&&values.length>=4;
  return {id,label:definitions[id].label,unit:definitions[id].unit??(id==='guard'?'× торс':'°'),description:definitions[id].description,series,coverage,
  value:assessable?percentile(values,.5):null,min:assessable?percentile(values,.02):null,max:assessable?percentile(values,.98):null};
 });
}
// Only complete observed cycles. Missing frames and large time gaps reset phase state.
export function detectCycles(values:(number|null)[],times:number[],inverted=false):Cycle[] {
 if(values.length!==times.length) return [];
 const finite=values.filter((v):v is number=>v!==null&&Number.isFinite(v));
 if(finite.length<5) return [];
 const lo=percentile(finite,.02),hi=percentile(finite,.98),rom=hi-lo;
 if(rom<25) return [];
 const low=lo+.3*rom, high=hi-.3*rom, result:Cycle[]=[];
 let start=-1,peak=-1,crossed=false;
 for(let i=0;i<values.length;i++){
  const v=values[i];
  if(v===null||!Number.isFinite(v)||!Number.isFinite(times[i])||(i>0&&(times[i]<=times[i-1]||times[i]-times[i-1]>.25))){
   start=-1;peak=-1;crossed=false;continue;
  }
  const baseline=inverted?v<=low:v>=high, extreme=inverted?v>=high:v<=low;
  if(start<0){if(baseline){start=i;peak=i;}continue;}
  if(peak<0||(inverted?v>values[peak]!:v<values[peak]!))peak=i;
  if(extreme)crossed=true;
  if(baseline){
   if(crossed&&times[i]-times[start]>=.2)result.push({start:times[start],peak:times[peak],end:times[i]});
   start=i;peak=i;crossed=false;
  }
 }
 return result;
}
