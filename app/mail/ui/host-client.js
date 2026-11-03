import {hana} from './assets/sdk.js';
/** UI authentication and URL resolution belong exclusively to the bundled Hana SDK. */
export function createHostClient({client=hana}={}){
 const request=(route,options={})=>{if(!route.startsWith('/')||route.startsWith('//'))throw new Error('应用请求路径无效');return client.api.fetch(route,{...options,cache:'no-store'});};
 const api=async(route,body)=>{const r=await request(route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let data;try{data=await r.json();}catch{throw new Error('接口未返回有效数据，请重新打开 Mail');}if(r.status===403)throw new Error('当前界面会话无效，请关闭并从 Mail 入口重新打开，再检查应用权限。');if(!r.ok||data.ok!==true)throw new Error(data.error||'请求失败');return data.data;};
 return {api,request};
}
