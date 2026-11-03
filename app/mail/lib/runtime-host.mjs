import {createRuntimeHost} from './managed-runtime.mjs';
const host=createRuntimeHost();
export const serviceState=host.state,serviceError=host.error,startService=host.start,serviceDiagnostics=host.diagnostics,retryService=host.retry,bindService=host.bind,connectService=host.connect;
const rawCall=host.rawCall;
async function waitJob(id){for(let i=0;i<600;i++){await new Promise(r=>setTimeout(r,300));const r=await rawCall('/job-status',{jobId:id});if(!r.ok)throw new Error(r.error);if(r.state==='done')return r.data;if(r.state==='failed')throw new Error(r.error);}throw new Error('请求超时，已有总结保留');}
export async function callService(route,payload={}){if(!['/smtp-test'].includes(route))return rawCall(route,payload);try{const r=await rawCall('/smtp-test-start',payload);if(!r.ok)return r;const data=await waitJob(r.jobId);return {ok:true,data};}catch(e){return {ok:false,error:e.message};}}
export async function mailCall(command,accountId,params={}){const r=await rawCall('/job',{...params,command,accountId});if(!r.ok)throw new Error(r.error);return waitJob(r.jobId);}
export const stopService=host.stop;
