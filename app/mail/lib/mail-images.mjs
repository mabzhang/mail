import {Parser} from '../vendor-html/node_modules/htmlparser2/dist/index.js';
export function imageKey(value){let v=String(value||'').trim();try{v=decodeURIComponent(v);}catch{}return v.replace(/^cid:/i,'').replace(/^<|>$/g,'').trim().toLowerCase();}
export function imageReferences(html){const refs=new Set();new Parser({onopentag(name,attrs){if(name==='img'&&attrs.src)refs.add(imageKey(attrs.src));}},{decodeEntities:true}).end(html);return refs;}
export function rasterType(b){
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.length>=6&&/^GIF8[79]a$/.test(b.subarray(0,6).toString('ascii')))return 'image/gif';
 if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
 return null;
}
