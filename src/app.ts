import './style.css';
import { profiles } from './profiles.ts';
import { analyzeVideo } from './analyzer.ts';
import { makeReport, refreshReport } from './core/report.ts';
import { deleteReport, listReports, saveReport } from './storage.ts';
import { chartSvg, download, drawPose, escapeHtml as esc, formatTime, icon } from './ui.ts';
import type { Report } from './types.ts';
const profile=profiles[__SPORT__], app=document.querySelector<HTMLDivElement>('#app')!;
document.title=profile.name+' · Локальный видеоанализ';
document.documentElement.style.setProperty('--accent',profile.accent);
let file:File|null=null,objectUrl:string|null=null,report:Report|null=null,controller:AbortController|null=null;
let durationOverride:number|undefined,frameLoop=0,offlineReady=false,installPrompt:any=null;
let cameraStream:MediaStream|null=null,recorder:MediaRecorder|null=null,recordTimer:ReturnType<typeof setInterval>|null=null,discardRecording=false;
const extension=location.protocol.endsWith('-extension:');
app.innerHTML=`
<aside class="sidebar">
 <a class="brand" href="./" aria-label="На главную"><span class="brand-mark">${icon('layers',25)}</span><span>${profile.name}<small>ЛОКАЛЬНЫЙ ВИДЕОАНАЛИЗ</small></span></a>
 <div class="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
 <nav aria-label="Основная навигация"><button class="nav-item active" id="nav-analysis">${icon('chart')}<span>Анализ видео</span><span class="nav-dot"></span></button><button class="nav-item" id="nav-history">${icon('history')}<span>Моя история</span></button><button class="nav-item" id="nav-guide">${icon('help')}<span>Как снимать</span></button></nav>
 <div class="sidebar-bottom"><div class="privacy-symbol">${icon('shield',24)}</div><strong>Ваше видео.<br>Только у вас.</strong><p>Обработка на устройстве.<br>Без загрузки на сервер.</p><button class="text-button" id="privacy-info">О данных и хранении ${icon('arrow',15)}</button><div class="version">SPORT COACH <span>v${__APP_VERSION__} · LOCAL</span></div></div>
</aside>
<div class="workspace">
 <header class="topbar"><div class="breadcrumb">${profile.name} <span>/</span> <b id="page-label">Анализ видео</b></div><div class="top-actions"><button class="small-button" id="install" hidden>${icon('download',16)} Установить</button><span class="status-pill" id="offline-status"><i></i>${extension?'Локальное расширение':'Готовим офлайн-режим'}</span></div></header>
 <main>
  <div id="analysis-view">
   <section class="hero"><div><div class="eyebrow"><span></span>${profile.tag}</div><h1>${profile.title.split('\n').map(esc).join('<br>')}</h1><p>${profile.subtitle}</p></div><div class="hero-stamp"><span>ON DEVICE</span>${icon('shield',38)}<span>BY DESIGN</span></div></section>
   <div class="studio-grid">
    <section class="panel source-panel">
     <div class="section-heading"><div class="number-label"><span>01</span><h2>Ваше видео</h2></div><span class="muted mini" id="source-meta">До 10 минут</span></div>
     <div class="source-tabs" role="group" aria-label="Источник видео"><button id="source-file" class="selected">${icon('upload',17)} Загрузить файл</button><button id="source-camera">${icon('camera',17)} Записать с камеры</button></div>
     <input type="file" id="file-input" accept="video/*" hidden>
     <button class="dropzone" id="dropzone" aria-label="Выбрать видеофайл">
      <div class="motion-art" aria-hidden="true"><svg viewBox="0 0 240 140" fill="none"><ellipse cx="120" cy="117" rx="76" ry="9" stroke="currentColor" opacity=".15"/><path d="M51 43v-15h15m108 0h15v15M51 86v15h15m108 0h15V86" stroke="currentColor" opacity=".4"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="128" cy="29" r="9"/><path d="m125 43-14 29 28 20 17 25m-45-45-27 25-22 14m56-57 26 10 21-21m-40 0-27 8-16-15"/></g><g fill="currentColor"><circle cx="111" cy="72" r="4"/><circle cx="139" cy="92" r="4"/><circle cx="84" cy="97" r="4"/><circle cx="144" cy="64" r="4"/><circle cx="98" cy="51" r="4"/></g><path d="M169 90c20-14 22-32 15-43M66 85c-9-10-10-22-6-32" stroke="currentColor" opacity=".3" stroke-dasharray="3 5"/></svg></div>
      <strong>Перетащите видео сюда</strong><span>или нажмите, чтобы выбрать файл</span><small>MP4, WebM, MOV · в зависимости от кодеков браузера</small>
     </button>
     <div id="player-section" hidden><div class="video-wrap"><video id="player" controls playsinline preload="metadata"></video><canvas id="pose-overlay" aria-hidden="true"></canvas><span class="video-label" id="video-label">ИСХОДНОЕ ВИДЕО</span></div><div class="player-footer"><span id="file-label"></span><label class="toggle"><input type="checkbox" id="show-skeleton" checked> Скелет</label><button class="text-button" id="replace-file">Заменить</button></div><p class="mini muted" id="playback-note">После анализа здесь появится скелет. Видео остаётся на устройстве.</p></div>
     <div class="source-footnote">${icon('shield',16)} Файл открывается локально — его содержимое не отправляется в сеть.</div>
    </section>
    <aside class="panel settings-panel">
     <div class="section-heading"><div class="number-label"><span>02</span><h2>Настройки анализа</h2></div>${icon('settings',19)}</div>
     <label class="field-label" for="exercise">Группа движений</label><select id="exercise">${profile.exercises.map(e=>'<option value="'+e.id+'">'+e.label+'</option>').join('')}</select><p class="field-help" id="exercise-help"></p>
     <label class="field-label" for="fps">Частота анализа</label><select id="fps"><option value="10">10 кадров/с · экономнее</option><option value="15">15 кадров/с · сбалансированно</option><option value="30">30 кадров/с · больше деталей</option></select>
     <div class="range-heading"><label class="field-label" for="threshold">Порог видимости точек</label><output id="threshold-value">65%</output></div><input id="threshold" type="range" min="50" max="90" step="5" value="65"><p class="field-help">Неуверенные точки исключаются из измерений. Высокий порог оставляет меньше данных.</p>
     <div class="local-engine"><span class="engine-mark"></span><div><strong>MediaPipe Pose · Lite</strong><small>33 точки тела и головы · локальная модель</small></div></div>
     <button id="analyze" class="primary" disabled>Анализировать видео ${icon('arrow',19)}</button><p class="run-note">Скорость зависит от устройства.<br> Оставьте эту вкладку открытой.</p>
    </aside>
   </div>
   <section class="panel progress-panel" id="progress-section" hidden aria-live="polite"><div><strong id="progress-title">Подготовка</strong><span id="progress-percent">0%</span></div><progress id="progress" max="1" value="0"></progress><div class="progress-bottom"><span id="progress-detail">Все вычисления выполняются на устройстве</span><button class="text-button" id="cancel">Отменить</button></div></section>
   <div class="notice error" id="error" role="alert" hidden></div>
   <section id="report-section" hidden></section>
   <section class="principles" id="principles"><article><span>01 /</span><h3>Увидеть</h3><p>Скелет и суставные углы поверх вашего видео.</p></article><article><span>02 /</span><h3>Разобрать</h3><p>Наблюдаемые метрики и конкретные моменты на временной шкале.</p></article><article><span>03 /</span><h3>Сохранить</h3><p>Локальная история и экспорт отчёта, когда это нужно вам.</p></article></section>
  </div>
  <section id="history-view" hidden><div class="eyebrow">НА ЭТОМ УСТРОЙСТВЕ</div><h1>Моя история</h1><p class="section-intro">Только сохранённые вами отчёты. Исходные видео не сохраняются.</p><div id="history-list"></div></section>
  <footer><span>${profile.name} <b>·</b> Движение становится понятнее</span><span>Без аккаунта. Без облака.</span></footer>
 </main>
</div>
<dialog id="info-dialog"><button class="dialog-close" id="close-info" aria-label="Закрыть">${icon('close')}</button><div id="info-content"></div></dialog>
<dialog id="camera-dialog"><button class="dialog-close" id="close-camera" aria-label="Закрыть камеру">${icon('close')}</button><div class="eyebrow">ЗАПИСЬ НА УСТРОЙСТВЕ</div><h2>Запишите движение</h2><p class="muted">Звук не записывается. После остановки можно запустить анализ.</p><video id="camera-preview" autoplay playsinline muted></video><div class="camera-controls"><span id="record-time">0:00 / 5:00</span><button class="primary" id="record-button">Начать запись</button></div><p class="mini muted" id="camera-message">Запрашиваем доступ к камере…</p></dialog>
<div id="toast" class="toast" role="status" hidden></div>
`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const player=$<HTMLVideoElement>('player'), overlay=$<HTMLCanvasElement>('pose-overlay');
$<HTMLSelectElement>('fps').value=String(profile.defaultFps);
function movementHint(){
 const selected=profile.exercises.find(e=>e.id===$<HTMLSelectElement>('exercise').value)!;
 const joints:Record<string,string>={elbow:'локтя',knee:'колена',hip:'бедра',shoulder:'плеча'};
 $('exercise-help').textContent=selected.driver
  ?'Циклы считаются по движению '+joints[selected.driver]+'. Все углы тела и положение головы доступны независимо от группы.'
  :'Все углы тела и положение головы доступны. Для этой группы автоматический счёт циклов не включён.';
}
$('exercise').onchange=movementHint;movementHint();
function toast(message:string){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4500);}
function fail(error:unknown){$('error').textContent=error instanceof Error?error.message:String(error);$('error').hidden=false;}
function updateControls(){const busy=!!controller;for(const id of ['exercise','fps','threshold','source-file','source-camera','replace-file','dropzone'])($<HTMLButtonElement>(id)).disabled=busy;$<HTMLButtonElement>('analyze').disabled=busy||!file;}
function setFile(next:File,recordedDuration?:number){
 if(controller)return;
 if(!next.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v)$/i.test(next.name)){fail(new Error('Выберите видеофайл MP4, WebM или MOV.'));return;}
 if(next.size>1024*1024*1024){fail(new Error('Выберите видео меньше 1 ГБ и короче 10 минут.'));return;}
 stopOverlay();if(objectUrl)URL.revokeObjectURL(objectUrl);
 file=next;durationOverride=recordedDuration;report=null;objectUrl=URL.createObjectURL(next);
 player.src=objectUrl;player.load();$('dropzone').hidden=true;$('player-section').hidden=false;$('report-section').hidden=true;$('principles').hidden=false;$('error').hidden=true;
 $('file-label').textContent=next.name;$('video-label').textContent='ИСХОДНОЕ ВИДЕО';$('source-meta').textContent=(next.size/1024/1024).toFixed(1)+' МБ';
 $('playback-note').textContent='После анализа здесь появится скелет. Видео остаётся на устройстве.';updateControls();
}
player.addEventListener('error',()=>fail(new Error('Браузер не смог открыть видео. Попробуйте MP4 с H.264 или WebM.')));
const choose=()=>{if(!controller)$<HTMLInputElement>('file-input').click();};
$('source-file').onclick=choose;$('dropzone').onclick=choose;$('replace-file').onclick=choose;
$<HTMLInputElement>('file-input').onchange=event=>{const input=event.target as HTMLInputElement;if(input.files?.[0])setFile(input.files[0]);input.value='';};
$('dropzone').ondragover=event=>{event.preventDefault();$('dropzone').classList.add('dragover');};
$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragover');
$('dropzone').ondrop=event=>{event.preventDefault();$('dropzone').classList.remove('dragover');if(event.dataTransfer?.files[0])setFile(event.dataTransfer.files[0]);};
$('threshold').oninput=()=>$('threshold-value').textContent=$<HTMLInputElement>('threshold').value+'%';
function stopOverlay(){cancelAnimationFrame(frameLoop);drawPose(overlay,player,undefined,.65,profile.accent);}
function startOverlay(){
 stopOverlay();
 const tick=()=>{
  if(!report)return;
  const t=player.currentTime,idx=Math.max(0,Math.min(report.samples.length-1,Math.round(t*report.fps))),sample=report.samples[idx];
  drawPose(overlay,player,$<HTMLInputElement>('show-skeleton').checked&&sample&&Math.abs(sample.time-t)<1.5/report.fps?sample:undefined,report.threshold,profile.accent);
  frameLoop=requestAnimationFrame(tick);
 };tick();
}
$('analyze').onclick=async()=>{
 if(!file||controller)return;player.pause();stopOverlay();report=null;$('report-section').hidden=true;$('error').hidden=true;
 const source=file;controller=new AbortController();updateControls();$('progress-section').hidden=false;
 $('progress-section').scrollIntoView({behavior:'smooth',block:'nearest'});
 const fps=Number($<HTMLSelectElement>('fps').value),threshold=Number($<HTMLInputElement>('threshold').value)/100,exercise=$<HTMLSelectElement>('exercise').value;
 try{
  const data=await analyzeVideo(source,{fps,signal:controller.signal,durationOverride,progress:p=>{
   $('progress-title').textContent=p.phase;$<HTMLProgressElement>('progress').value=p.fraction;$('progress-percent').textContent=Math.round(p.fraction*100)+'%';
   if(p.sample)$('progress-detail').textContent='Кадр '+formatTime(p.sample.time)+' · точки остаются на устройстве';
  }});
  report=makeReport({...data,sport:profile.id,exercise,fileName:source.name,fps,threshold});renderReport();
 }catch(error){if(error instanceof DOMException&&error.name==='AbortError')toast('Анализ отменён. Можно запустить заново.');else fail(error);}
 finally{controller=null;$('progress-section').hidden=true;updateControls();}
};
$('cancel').onclick=()=>controller?.abort();
function renderReport(){
 if(!report)return;const r=report;
 const movement=profile.exercises.find(e=>e.id===r.exercise);if(movement){$<HTMLSelectElement>('exercise').value=movement.id;movementHint();}
 $('report-section').hidden=false;$('principles').hidden=true;
 $('report-section').innerHTML=`
 <div class="report-heading"><div><div class="eyebrow">РАЗБОР ЗАВЕРШЁН</div><h2>Движение в деталях</h2><p class="muted">${esc(r.fileName)} · ${esc(movement?.label??'Свободное движение')} · ${formatTime(r.duration)} · ${r.samples.length} кадров</p></div><div class="report-actions"><button class="small-button" id="save-report">${icon('history',16)} Сохранить</button><button class="small-button" id="export-json">JSON</button><button class="small-button" id="export-csv">CSV</button><button class="small-button" id="print-report">PDF / печать</button></div></div>
 <div class="summary-grid"><div class="summary-card"><span>Доступность измерений</span><strong>${Math.round(r.coverage*100)}<small>%</small></strong><p>хотя бы одна метрика в кадре</p></div><div class="summary-card"><span>Полные наблюдаемые циклы</span><strong>${r.driver?r.cycles.length:'—'}<small>${r.driver?'циклов':''}</small></strong><p>${r.driver?'это не общее число повторений':'счёт не выбран для этого режима'}</p></div><div class="summary-card"><span>Обработка на устройстве</span><strong>${(r.elapsedMs/1000).toFixed(1)}<small>с</small></strong><p>${r.fps} выбранных кадров/с · Lite</p></div></div>
 <div class="notice">${icon('help',19)}<p>${esc(profile.scope)} Все углы ниже — двумерные проекции. Порог точек: ${Math.round(r.threshold*100)}%.</p></div>
 <div class="report-grid"><section class="panel"><div class="section-heading"><h3>Метрики движения</h3><span class="mini muted">Медиана / диапазон P2–P98</span></div><div class="metrics-table"><div class="metric-row table-head"><span>Метрика</span><span>Значение</span><span>Покрытие</span></div>${r.metrics.map(m=>'<div class="metric-row"><span>'+esc(m.label)+'</span><span><strong>'+(m.value===null?'—':m.value.toFixed(m.unit==='°'?0:2)+' '+m.unit)+'</strong><small>'+(m.min===null?'Недостаточно данных':m.min.toFixed(m.unit==='°'?0:2)+' – '+m.max!.toFixed(m.unit==='°'?0:2))+'</small></span><span class="'+(m.coverage<.6?'low':'')+'">'+Math.round(m.coverage*100)+'%</span></div>').join('')}</div></section>
 <section class="panel findings"><div class="section-heading"><h3>На что посмотреть</h3><span class="mini muted">По наблюдаемым данным</span></div>${r.findings.map(f=>'<article class="finding '+f.tone+'"><span class="finding-dot"></span><div><h4>'+esc(f.title)+'</h4><p>'+esc(f.detail)+'</p>'+(f.time!==undefined?'<button class="time-link" data-time="'+f.time+'" '+(!file?'disabled':'')+'>'+icon('play',13)+' '+formatTime(f.time)+' · к кадру</button>':'')+'</div></article>').join('')}</section></div>
 <section class="panel graph-panel"><div class="section-heading"><h3>Движение во времени</h3><select id="chart-metric" aria-label="Метрика для графика">${r.metrics.map(m=>'<option value="'+m.id+'">'+esc(m.label)+'</option>').join('')}</select></div><p class="mini muted" id="chart-description"></p><div id="chart"></div><p class="mini muted">Разрывы линии — пропущенные измерения. График не заполняет их предположениями.</p></section>
 <details class="panel details"><summary>Что включено в этот отчёт</summary><p>MediaPipe Pose Landmarker Lite, 33 точки тела и головы, включая нос, глаза, уши и рот. Для головы измеряются наклон линии глаз и положение носа относительно плеч в плоскости кадра; это не трёхмерные углы поворота головы. Пакет и модель поставляются вместе с приложением. Числовые метрики требуют не менее 60% пригодных кадров и минимум 4 измерения. Координаты не интерполируются.</p><p>Циклы учитываются только при полном наблюдаемом переходе туда и обратно и диапазоне не менее 25°. Эти пороги — эвристики детектора, а не норматив техники.</p><p>Сохранение добавляет отчёт и точки в IndexedDB этого приложения, без исходного видео. Кнопки JSON и CSV создают файлы на вашем устройстве. PDF создаётся через диалог печати браузера.</p></details>`;
 const graph=()=>{const metric=r.metrics.find(m=>m.id===$<HTMLSelectElement>('chart-metric').value)!;$('chart').innerHTML=chartSvg(metric,r.samples.map(s=>s.time),profile.accent);$('chart-description').textContent=metric.description??(metric.unit==='°'?'Угол в плоскости кадра, в градусах.':'Положение кистей относительно плеч, в долях длины корпуса.');};
 $('chart-metric').onchange=graph;graph();
 $('save-report').onclick=async()=>{try{await saveReport(r);toast('Отчёт сохранён на этом устройстве. Видео не копировалось.');$<HTMLButtonElement>('save-report').disabled=true;$('save-report').textContent='Сохранено';}catch(error){fail(new Error('Не удалось сохранить отчёт: возможно, хранилище заполнено. Экспортируйте JSON.'));}};
 $('export-json').onclick=()=>download(new Blob([JSON.stringify(r)],{type:'application/json'}),profile.id+'-report-'+r.id.slice(0,8)+'.json');
 $('export-csv').onclick=()=>{
  const rows=['time_s,'+r.metrics.map(m=>m.id).join(',')];
  r.samples.forEach((s,i)=>rows.push(s.time.toFixed(4)+','+r.metrics.map(m=>m.series[i]?.toFixed(4)??'').join(',')));
  download(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}),profile.id+'-metrics-'+r.id.slice(0,8)+'.csv');
 };
 $('print-report').onclick=()=>window.print();
 $('report-section').querySelectorAll<HTMLButtonElement>('[data-time]').forEach(button=>button.onclick=()=>{if(!file)return;player.pause();player.currentTime=Number(button.dataset.time);$('player-section').scrollIntoView({behavior:'smooth',block:'center'});});
 if(file){$('video-label').textContent='СКЕЛЕТ · MEDIAPIPE';$('playback-note').textContent='Белые точки — видимые ориентиры тела и головы. Неуверенные точки исключаются. Скелет отображается по ближайшему проанализированному кадру.';startOverlay();}
 $('report-section').scrollIntoView({behavior:'smooth',block:'start'});
}
function view(which:'analysis'|'history'){
 $('analysis-view').hidden=which!=='analysis';$('history-view').hidden=which!=='history';
 $('nav-analysis').classList.toggle('active',which==='analysis');$('nav-history').classList.toggle('active',which==='history');
 $('page-label').textContent=which==='analysis'?'Анализ видео':'Моя история';
 if(which==='history'){player.pause();stopOverlay();}else if(report&&file)startOverlay();
}
$('nav-analysis').onclick=()=>view('analysis');
async function showHistory(){
 view('history');$('history-list').textContent='Открываем локальную историю…';
 try{const reports=await listReports(profile.id);
 $('history-list').innerHTML=reports.length?reports.map(r=>'<article class="history-card"><div class="history-icon">'+icon('chart',24)+'</div><div><h3>'+esc(r.fileName)+'</h3><p>'+new Date(r.createdAt).toLocaleString('ru-RU')+' · '+formatTime(r.duration)+' · '+Math.round(r.coverage*100)+'% покрытия</p></div><button class="small-button" data-open="'+r.id+'">Открыть</button><button class="icon-button" data-delete="'+r.id+'" aria-label="Удалить отчёт">'+icon('trash',18)+'</button></article>').join(''):'<div class="empty-state">'+icon('history',40)+'<h2>История начинается с движения</h2><p>После анализа нажмите «Сохранить». Отчёт появится здесь.</p></div>';
 $('history-list').querySelectorAll<HTMLButtonElement>('[data-open]').forEach(button=>button.onclick=()=>{
  if(controller){toast('Дождитесь окончания анализа или отмените его.');return;}
  stopOverlay();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;file=null;durationOverride=undefined;player.removeAttribute('src');player.load();
  report=refreshReport(reports.find(r=>r.id===button.dataset.open)!);view('analysis');$('dropzone').hidden=false;$('player-section').hidden=true;$('error').hidden=true;updateControls();renderReport();toast('Измерения обновлены по сохранённым точкам. Исходное видео не хранится.');
 });
 $('history-list').querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(button=>button.onclick=async()=>{try{await deleteReport(profile.id,button.dataset.delete!);await showHistory();}catch(error){fail(error);}});
 }catch{ $('history-list').textContent='Локальное хранилище недоступно в этом режиме браузера. Можно экспортировать результаты в JSON и CSV.';}
}
$('nav-history').onclick=()=>{void showHistory();};
const info=$<HTMLDialogElement>('info-dialog');
function openInfo(html:string){$('info-content').innerHTML=html;info.showModal();}
$('close-info').onclick=()=>info.close();
$('nav-guide').onclick=()=>openInfo('<div class="eyebrow">ЛУЧШЕ ВИДНО — ТОЧНЕЕ ИЗМЕРЕНО</div><h2>Подготовьте кадр</h2><ol class="guide-list">'+profile.guide.map(g=>'<li>'+esc(g)+'</li>').join('')+'</ol><div class="notice"><p>'+esc(profile.scope)+'</p></div>');
$('privacy-info').onclick=async()=>{
 let storage='Оценка объёма хранилища недоступна.';
 try{const estimate=await navigator.storage?.estimate();if(estimate)storage='Занято приложениями этого origin: '+((estimate.usage??0)/1024/1024).toFixed(1)+' МБ. Квота: '+((estimate.quota??0)/1024/1024/1024).toFixed(1)+' ГБ.';}catch{}
 openInfo('<div class="eyebrow">ДАННЫЕ ПОД ВАШИМ КОНТРОЛЕМ</div><h2>Всё остаётся здесь</h2><p>Видео читается с вашего устройства. Кадры, точки и результаты не отправляются на сервер. Камера открывается только по вашей команде; микрофон не запрашивается.</p><p>История сохраняется только по кнопке «Сохранить». Удалить отчёт можно в истории. Исходные видео не сохраняются. Экспортированные файлы управляются отдельно.</p><p>В PWA приложение и модель загружаются с адреса установки и кешируются. Сервер раздачи может вести обычные журналы запросов. В расширениях всё входит в установочный пакет. Встроенной аналитики и сторонних CDN нет.</p><p>'+esc(storage)+'</p><p>Браузер может очистить локальное хранилище. Для важных результатов используйте экспорт.</p>');
};
window.addEventListener('beforeinstallprompt',(event:Event)=>{event.preventDefault();installPrompt=event;$('install').hidden=false;});
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}};
if(extension){offlineReady=true;}
else if('serviceWorker' in navigator){
 navigator.serviceWorker.register('./sw.js').then(async registration=>{
  await navigator.serviceWorker.ready;
  // READY is reported only after the worker successfully precached all model assets.
  const active=registration.active??navigator.serviceWorker.controller;
  active?.postMessage({type:'offline-status'});
 }).catch(()=>{$('offline-status').textContent='Офлайн-кеш недоступен';});
 navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='offline-ready'){offlineReady=true;$('offline-status').innerHTML='<i></i>Готово без интернета';}});
}else{$('offline-status').textContent='Офлайн-кеш не поддерживается';}
window.addEventListener('offline',()=>{if(!offlineReady)toast('Приложение ещё не подтвердило готовность офлайн. Модель может быть недоступна.');});
async function openCamera(){
 if(controller)return;discardRecording=false;
 if(!navigator.mediaDevices?.getUserMedia||!('MediaRecorder'in window)){fail(new Error('Запись камеры недоступна. Откройте приложение через HTTPS / localhost или загрузите готовое видео.'));return;}
 const dialog=$<HTMLDialogElement>('camera-dialog');dialog.showModal();$('camera-message').textContent='Запрашиваем доступ к камере…';$<HTMLButtonElement>('record-button').disabled=true;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
  if(!dialog.open){stream.getTracks().forEach(t=>t.stop());return;}
  cameraStream=stream;$<HTMLVideoElement>('camera-preview').srcObject=stream;
  $('camera-message').textContent='Запишите до 5 минут. Аудио отключено.';$('record-button').textContent='Начать запись';$<HTMLButtonElement>('record-button').disabled=false;$('record-time').textContent='0:00 / 5:00';
 }catch(error){dialog.close();fail(new Error('Не удалось открыть камеру. Проверьте разрешение браузера и убедитесь, что камера свободна.'));}
}
function stopCamera(){discardRecording=true;if(recorder?.state==='recording')recorder.stop();cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;$<HTMLVideoElement>('camera-preview').srcObject=null;if(recordTimer)clearInterval(recordTimer);recordTimer=null;}
$('source-camera').onclick=()=>{void openCamera();};
$('close-camera').onclick=()=>{stopCamera();$<HTMLDialogElement>('camera-dialog').close();};
$('camera-dialog').addEventListener('cancel',stopCamera);
$('record-button').onclick=()=>{
 if(recorder?.state==='recording'){recorder.stop();$<HTMLButtonElement>('record-button').disabled=true;return;}
 if(!cameraStream)return;
 const mime=['video/webm;codecs=vp8','video/webm','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
 try{
  recorder=new MediaRecorder(cameraStream,mime?{mimeType:mime}:{});
  const chunks:BlobPart[]=[],started=performance.now();let size=0;
  recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);size+=event.data.size;if(size>512*1024*1024&&recorder?.state==='recording')recorder.stop();}};
  recorder.onerror=()=>{stopCamera();$<HTMLDialogElement>('camera-dialog').close();fail(new Error('Ошибка записи камеры. Попробуйте выбрать готовое видео.'));};
  recorder.onstop=()=>{
   const seconds=(performance.now()-started)/1000,type=recorder?.mimeType||mime||'video/webm';
   if(recordTimer)clearInterval(recordTimer);recordTimer=null;
   cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;$<HTMLVideoElement>('camera-preview').srcObject=null;$<HTMLDialogElement>('camera-dialog').close();
   if(!discardRecording&&chunks.length&&seconds>.3){const blob=new Blob(chunks,{type});setFile(new File([blob],'camera-'+new Date().toISOString().replace(/[:.]/g,'-')+(type.includes('mp4')?'.mp4':'.webm'),{type}),seconds);}
   recorder=null;
  };
  recorder.start(1000);$('record-button').textContent='Остановить запись';$('camera-message').textContent='● Идёт запись на устройстве';
  recordTimer=setInterval(()=>{const seconds=(performance.now()-started)/1000;$('record-time').textContent=formatTime(seconds)+' / 5:00';if(seconds>=300&&recorder?.state==='recording')recorder.stop();},250);
 }catch(error){stopCamera();$<HTMLDialogElement>('camera-dialog').close();fail(error);}
};
window.addEventListener('pagehide',()=>{controller?.abort();stopCamera();if(objectUrl)URL.revokeObjectURL(objectUrl);});
