import type { Sample, Metric } from './types.ts';
import { observed } from './core/metrics.ts';
export const escapeHtml=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function formatTime(seconds:number):string{if(!Number.isFinite(seconds))return '—';return Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');}
export const icon=(name:string,size=20)=>'<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
 upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
 camera:'<rect x="3" y="6" width="13" height="13" rx="3"/><path d="m16 10 5-3v12l-5-3"/>',
 play:'<path d="m9 5 11 7-11 7Z"/>',
 history:'<path d="M3 12a9 9 0 1 0 3-7M3 3v5h5m4-1v6l4 2"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
 chart:'<path d="M4 4v16h17M7 15l4-5 4 3 5-8"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
 trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
 }[name]??'')+'</svg>';
const links=[[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[15,17],[15,19],[15,21],[17,19],[16,18],[16,20],[16,22],[18,20],[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32],[27,31],[28,32]];
export function drawPose(canvas:HTMLCanvasElement,video:HTMLVideoElement,sample:Sample|undefined,threshold:number,accent:string):void{
 const width=canvas.clientWidth,height=canvas.clientHeight,dpr=devicePixelRatio||1;
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 if(!sample||sample.reason||!video.videoWidth||!video.videoHeight)return;
 const scale=Math.min(width/video.videoWidth,height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale,ox=(width-w)/2,oy=(height-h)/2;
 const p=(i:number)=>({x:ox+sample.landmarks[i].x*w,y:oy+sample.landmarks[i].y*h});
 ctx.lineWidth=2.5;ctx.strokeStyle=accent;
 for(const [a,b] of links)if(observed(sample.landmarks[a],threshold)&&observed(sample.landmarks[b],threshold)){ctx.beginPath();ctx.moveTo(p(a).x,p(a).y);ctx.lineTo(p(b).x,p(b).y);ctx.stroke();}
 for(let i=0;i<Math.min(33,sample.landmarks.length);i++)if(observed(sample.landmarks[i],threshold)){ctx.beginPath();ctx.arc(p(i).x,p(i).y,i<11?2.5:3.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=accent;ctx.stroke();}
}
export function chartSvg(metric:Metric,times:number[],accent:string):string{
 const finite=metric.series.filter((v):v is number=>v!==null);if(!finite.length)return '<div class="empty-chart">Недостаточно видимых точек для графика</div>';
 let minimum=Math.min(...finite),maximum=Math.max(...finite);
 if(maximum-minimum<1e-8){const pad=metric.unit==='°'?5:.05;minimum-=pad;maximum+=pad;}
 const rough=(maximum-minimum)/3,magnitude=10**Math.floor(Math.log10(rough)),factor=rough/magnitude;
 const tick=magnitude*(factor<=2?2:factor<=5?5:10);
 const low=Math.floor(minimum/tick)*tick,high=Math.max(low+tick,Math.ceil(maximum/tick)*tick),duration=times.at(-1)||1;
 const decimals=Math.max(0,Math.min(4,-Math.floor(Math.log10(tick))));
 const axis=(value:number)=>String(Number(value.toFixed(decimals)));
 let path='',pen=false;const step=Math.max(1,Math.ceil(metric.series.length/800));
 // Never connect a line across missing measurements, including skipped samples.
 for(let i=0;i<metric.series.length;i++){
  const v=metric.series[i];if(v===null){pen=false;continue;}
  if(i%step!==0&&i!==metric.series.length-1)continue;
  const x=42+times[i]/duration*690,y=164-(v-low)/(high-low)*140;
  path+=(pen?'L':'M')+x.toFixed(1)+','+y.toFixed(1);pen=true;
 }
 return '<svg viewBox="0 0 760 200" role="img" aria-label="'+escapeHtml(metric.label)+' по времени"><path d="M42 24H732M42 94H732M42 164H732" stroke="#2c3439" stroke-dasharray="3 6"/><g fill="#93a0a8" font-size="11" font-family="monospace"><text x="0" y="28">'+axis(high)+'</text><text x="0" y="168">'+axis(low)+'</text><text x="42" y="190">0:00</text><text x="700" y="190">'+formatTime(duration)+'</text></g><path d="'+path+'" fill="none" stroke="'+accent+'" stroke-width="2.5" stroke-linejoin="round"/></svg>';
}
export function download(blob:Blob,name:string):void{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
