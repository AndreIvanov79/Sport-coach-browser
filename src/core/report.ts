import { profiles } from '../profiles.ts';
import type { Finding, Report, Sample, Sport } from '../types.ts';
import { detectCycles, metricsFor, percentile } from './metrics.ts';
export function makeReport(input:{sport:Sport;exercise:string;fileName:string;samples:Sample[];fps:number;threshold:number;elapsedMs:number;duration:number;interrupted?:boolean}):Report {
 const profile=profiles[input.sport],metrics=metricsFor(input.samples,profile.metrics,input.threshold);
 const exercise=profile.exercises.find(x=>x.id===input.exercise)??profile.exercises.find(x=>x.id==='free')!;
 const eligible=metrics.filter(m=>m.value!==null&&(!exercise.driver||m.id.toLowerCase().includes(exercise.driver)));
 const driver=exercise.driver?eligible.sort((a,b)=>(b.max!-b.min!)-(a.max!-a.min!))[0]:undefined;
 const cycles=driver?detectCycles(driver.series,input.samples.map(s=>s.time),exercise.inverted??false):[];
 const coverage=input.samples.length?input.samples.filter((_,i)=>metrics.some(m=>m.series[i]!==null)).length/input.samples.length:0;
 const findings:Finding[]=[];
 if(coverage<.6)findings.push({tone:'attention',title:'Недостаточно видимых точек',detail:'Большую часть ролика нельзя уверенно измерить. Повторите запись с полным телом в кадре и хорошим освещением.'});
 else findings.push({tone:'good',title:'Есть материал для разбора',detail:'Хотя бы одна метрика доступна на '+Math.round(coverage*100)+'% выбранных кадров. Покрытие каждого угла указано отдельно.'});
 const ambiguous=input.samples.filter(s=>s.reason==='multiple-people').length;
 if(ambiguous)findings.push({tone:'attention',title:'В кадре несколько человек',detail:ambiguous+' кадров исключены: приложение не смешивает точки разных спортсменов. Запишите одного человека.'});
 if(driver&&cycles.length){
  const median=percentile(cycles.map(c=>c.end-c.start),.5);
  findings.push({tone:'info',title:cycles.length+' полных циклов движения',detail:driver.label+': медианная длительность '+median.toFixed(2)+' с. Это циклы выбранного сустава в наблюдаемых кадрах; незавершённые и пропущенные движения не включены.',time:cycles[0].peak});
  if(cycles.length>=3){
   const durations=cycles.map(c=>c.end-c.start);
   if(percentile(durations,.9)/Math.max(.1,percentile(durations,.1))>1.5)findings.push({tone:'attention',title:'Темп меняется',detail:'Длительности наблюдаемых циклов заметно различаются. Просмотрите отмеченные фазы и сравните, было ли изменение темпа намеренным.',time:cycles[cycles.length-1].peak});
  }
 }else if(exercise.driver)findings.push({tone:'info',title:'Полный цикл не подтверждён',detail:'Для счёта нужен видимый переход из исходной позиции в противоположную фазу и обратно. Отсутствие подтверждённых циклов не означает отсутствие движения.'});
 if(input.sport==='boxing'){
  const guard=metrics.find(m=>m.id==='guard');
  if(guard&&guard.value!==null){
   const index=guard.series.findIndex(v=>v!==null&&v>.5);
   if(index>=0)findings.push({tone:'attention',title:'Проверьте положение кисти',detail:'В отмеченном кадре хотя бы одна кисть находится ниже своего плеча более чем на половину длины корпуса в проекции. Это повод пересмотреть фазу движения, а не автоматический вывод об ошибке защиты.',time:input.samples[index].time});
  }
 }
 if(input.sport==='rg'){
  const split=metrics.find(m=>m.id==='split');
  if(split&&split.max!==null){
   let index=0; for(let i=1;i<split.series.length;i++)if((split.series[i]??-1)>(split.series[index]??-1))index=i;
   findings.push({tone:'info',title:'Посмотрите максимальное раскрытие',detail:'Устойчивый верхний уровень раскрытия — '+split.max.toFixed(0)+'° в плоскости кадра. Ракурс влияет на значение; оно не подтверждает шпагат или трудность элемента.',time:input.samples[index].time});
  }
 }
 const worst=metrics.filter(m=>m.coverage<.6);
 if(worst.length&&coverage>=.6)findings.push({tone:'attention',title:'Часть измерений недоступна',detail:worst.map(m=>m.label).join(', ')+': недостаточно надёжных кадров. Значения не восстанавливаются из соседних точек.'});
 return {...input,interrupted:!!input.interrupted,version:1,id:crypto.randomUUID(),createdAt:new Date().toISOString(),model:'MediaPipe Pose Landmarker Lite / float16 / v1',metrics,findings,cycles,coverage,driver:driver?.id??null};
}

// Reuse saved landmarks; only an explicit Save changes stored reports.
export function refreshReport(report:Report):Report {
 return {...makeReport(report),id:report.id,createdAt:report.createdAt,model:report.model};
}
