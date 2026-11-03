import fs from 'node:fs';
import path from 'node:path';
import {startupCode} from '../lib/startup-diagnostics.mjs';
const [dir,portText,startupId]=process.argv.slice(2),port=Number(portText);
let service,stage='load-dependencies',exiting=false;
function record(state,code=''){
 const data={startupId,state,stage,code,updatedAt:new Date().toISOString()};
 try{fs.writeFileSync(path.join(dir,'.service-startup.json'),JSON.stringify(data),{mode:0o600});}catch{}
 if(state==='failed')process.stderr.write('MAIL_STARTUP '+JSON.stringify(data)+'\n');
}
function fail(error){if(exiting)return;exiting=true;record('failed',startupCode(error));try{service?.close();}catch{}process.exit(1);}
try{
 if(!dir||!/^[a-f0-9]{32}$/.test(startupId||'')||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid startup arguments');
 record('starting');
 const {createService}=await import('./service.mjs');
 stage='open-local-data';record('starting');
 const token=fs.readFileSync(path.join(dir,'.service-key'),'utf8');
 service=createService({dir,token});
 stage='listen';record('starting');service.server.once('error',fail);
 service.server.listen(port,'127.0.0.1',()=>{stage='ready';record('ready');process.stdout.write('MAIL_READY\n');});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{exiting=true;service.close();setTimeout(()=>process.exit(0),300).unref();});
}catch(error){fail(error);}
