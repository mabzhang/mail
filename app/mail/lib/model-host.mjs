/** Host-owned inference only. No provider credentials, private bus, or retry billing. */
import crypto from 'node:crypto';
let sdk;
export function bindModels(value){sdk=value;}
export function modelsAvailable(){return typeof sdk?.models?.list==='function';}
export function isSendable(m){return [m?.provider,m?.id??m?.model].every(s=>typeof s==='string'&&s.trim()&&s.length<=128&&!/[\x00-\x1f\x7f]/.test(s));}
export function normalizedModels(input){
 const seen=new Set(),models=[];
 for(const m of Array.isArray(input)?input:[]){const provider=m?.provider??m?.providerId,id=m?.id??m?.model;const key=JSON.stringify([provider,id]);if(!isSendable({provider,id})||seen.has(key))continue;seen.add(key);models.push({id,provider,name:String(m.name??id),reasoning:!!m.reasoning,contextWindow:m.contextWindow??null,maxTokens:m.maxTokens??null,hostIdOk:true});}
 return {models,suspect:0,suspectIds:[]};
}
export async function listHostModels(){try{if(!modelsAvailable())throw new Error('请重新载入应用');const r=await sdk.models.list();return {ok:true,...normalizedModels(Array.isArray(r)?r:r?.models),fromBus:0};}catch{return {ok:false,error:'无法读取宿主模型目录，请检查模型权限与宿主模型配置。'};}}
export async function inferText({provider,model,messages,systemPrompt,maxTokens,temperature,timeoutMs=90000}={}){
 const requestId=crypto.randomUUID();if(!sdk?.models?.streamEvents)return {ok:false,error:'宿主模型 SDK 尚未就绪',requestId};
 if(!isSendable({provider,id:model}))return {ok:false,error:'所选模型标识无效，请重新选择',requestId};
 const abort=new AbortController();let timer,timedOut=false;
 try{
  const pump=async()=>{const catalog=await listHostModels();if(abort.signal.aborted)throw new Error('模型响应超时');if(!catalog.ok||!catalog.models.some(m=>m.provider===provider&&m.id===model))throw new Error('所选模型不在宿主目录中');let text='',done=null;for await(const event of sdk.models.streamEvents({requestId,provider,model,messages,systemPrompt,maxTokens,temperature},{signal:abort.signal})){
   if(event.type==='text-delta')text+=event.delta||'';
   else if(event.type==='tool-call')throw new Error('邮件分析不允许工具调用');
   else if(event.type==='error')throw new Error('宿主模型调用失败');
   else if(event.type==='done')done=event;
  }
  if(!done||done.stopReason!=='stop')throw new Error('模型结果不完整，请减少范围或调整模型输出上限');
  if(!text.trim())throw new Error('模型没有返回正文');
  return {ok:true,text:text.trim(),usage:done.usage??null,requestId};};
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;abort.abort();reject(new Error('模型响应超时'));},Math.max(100,Math.min(600000,timeoutMs)));});
  return await Promise.race([pump(),timeout]);
 }catch(error){abort.abort();try{void Promise.resolve(sdk.models.cancel(requestId)).catch(()=>{});}catch{}return {ok:false,error:timedOut?'模型响应超时':/^模型结果不完整|^所选模型|^邮件分析|^模型没有/.test(error.message)?error.message:'宿主模型调用失败，请检查授权、模型配置与网络。',timedOut,requestId};}
 finally{clearTimeout(timer);}
}
