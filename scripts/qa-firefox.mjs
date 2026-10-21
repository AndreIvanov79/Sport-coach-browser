// Optional integration check. Requires Firefox, geckodriver, and a graphical DISPLAY
// (or XVFB_PATH). Uses only temporary profiles under work/, never a user's profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd(),port=4449,origin=`http://127.0.0.1:${port}`;
await fs.mkdir('work/firefox-profiles',{recursive:true});
await fs.mkdir('artifacts',{recursive:true});
const log=await fs.open('work/firefox-qa.log','w');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const env={...process.env,GSETTINGS_BACKEND:'memory'};
let display,driver,session;
const evidence={testedAt:new Date().toISOString(),result:'failed'};
async function command(route,body,method='POST',timeout=60000){
 const response=await fetch(origin+route,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeout)});
 const json=await response.json();
 if(!response.ok||json.value?.error)throw new Error(JSON.stringify(json.value));
 return json.value;
}
const run=(route,body,method,timeout)=>command('/session/'+session+route,body,method,timeout);
const script=code=>run('/execute/sync',{script:code,args:[]});
try{
 if(process.env.XVFB_PATH){
  env.DISPLAY=':98';
  display=spawn(process.env.XVFB_PATH,[':98','-screen','0','1280x960x24','-nolisten','tcp'],{stdio:['ignore',log.fd,log.fd]});
  display.on('error',error=>console.error(error));
  await wait(700);
 }
 driver=spawn(process.env.GECKODRIVER_PATH||'geckodriver',['--port',String(port),'--profile-root',path.join(root,'work/firefox-profiles')],{env,stdio:['ignore',log.fd,log.fd]});
 driver.on('error',error=>console.error(error));
 for(let i=0;i<30;i++){try{await command('/status',undefined,'GET',1000);break;}catch{if(i===29)throw new Error('geckodriver did not start');await wait(200);}}
 const opened=await command('/session',{capabilities:{alwaysMatch:{browserName:'firefox','moz:firefoxOptions':{
  binary:process.env.FIREFOX_PATH||'/snap/firefox/current/usr/lib/firefox/firefox',
  args:env.DISPLAY?[]:['-headless'],
  prefs:{'media.navigator.streams.fake':true,'media.navigator.permission.disabled':true,'webgl.force-enabled':true,'gfx.webrender.software':true}
 }}}});
 session=opened.sessionId;evidence.browser=opened.capabilities.browserVersion;
 evidence.graphicalDisplay=!!env.DISPLAY;
 evidence.extensionId=await run('/moz/addon/install',{path:path.join(root,'dist/fitness/firefox'),temporary:true});
 const prefs=await fs.readFile(opened.capabilities['moz:profile']+'/prefs.js','utf8');
 const line=prefs.split('\n').find(l=>l.startsWith('user_pref("extensions.webextensions.uuids",'));
 const ids=JSON.parse(JSON.parse(line.slice(line.indexOf(',')+1,-2)));
 await run('/url',{url:'moz-extension://'+ids['fitness@sport-coach.local']+'/index.html'});
 evidence.title=await script('return document.title');
 evidence.webgl2=await script("return !!new OffscreenCanvas(1,1).getContext('webgl2')");
 console.log('Firefox loaded:',JSON.stringify(evidence));
 const element=await run('/element',{using:'css selector',value:'#file-input'});
 await run('/element/'+element['element-6066-11e4-a52e-4f735466cecf']+'/value',{text:path.join(root,'work/qa/athlete.mp4')});
 await script("document.getElementById('fps').value='10';document.getElementById('analyze').click();return true");
 let state;
 for(let i=0;i<160;i++){
  await wait(500);
  state=await script("return {done:!document.getElementById('report-section').hidden,error:document.getElementById('error').hidden?'':document.getElementById('error').textContent,progress:document.getElementById('progress-percent').textContent}");
  if(state.done||state.error)break;
 }
 evidence.analysis=state;
 assert.equal(state.error,'');assert.ok(state.done,'Firefox inference must finish');
 evidence.detected=await script("return !document.querySelector('.summary-card strong').textContent.startsWith('0')");
 assert.ok(evidence.detected,'Actual pose measurements should be present');
 const screenshot=await run('/screenshot',undefined,'GET');
 await fs.writeFile('artifacts/firefox-extension.png',Buffer.from(screenshot,'base64'));
 evidence.result='passed';
 console.log('Firefox extension inference passed');
}catch(error){evidence.error=error.message;console.error(error);process.exitCode=1;}
finally{
 await fs.writeFile('artifacts/firefox-qa.json',JSON.stringify(evidence,null,2));
 if(session)await run('',undefined,'DELETE',10000).catch(()=>{});
 driver?.kill();display?.kill();await log.close();
}
