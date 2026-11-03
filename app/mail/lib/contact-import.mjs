import {addresses} from './outgoing.mjs';
export function parseContactsCsv(text){
 if(String(text).length>2*1024*1024)throw new Error('通讯录文件不能超过 2 MB');
 const cells=[];let cell='',row=[],quoted=false;const source=String(text).replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){const ch=source[i];if(ch==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;continue;}if(!quoted&&(ch===','||ch==='\t')){row.push(cell.trim());cell='';}else if(!quoted&&ch==='\n'){row.push(cell.trim());cells.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}
 if(quoted)throw new Error('CSV 引号未闭合');if(cell||row.length){row.push(cell.trim());cells.push(row);}const header=cells.shift()||[],idx=(cn,en)=>header.findIndex(h=>h===cn||h.toLowerCase()===en),ei=idx('邮箱','email');if(ei<0)throw new Error('第一行须包含邮箱，可同时包含姓名、组织、部门');
 const rows=[],invalid=[];for(let i=0;i<cells.length;i++){const r=cells[i];if(!r.some(Boolean))continue;const email=String(r[ei]||'').trim().toLowerCase();try{if(addresses(email).length!==1)throw 0;}catch{invalid.push({line:i+2,email,reason:'邮箱格式无效'});continue;}rows.push({email,name:r[idx('姓名','name')]||'',organization:r[idx('组织','organization')]||'',department:r[idx('部门','department')]||'',line:i+2});}
 if(rows.length+invalid.length>10000)throw new Error('最多导入一万行联系人');return {rows,invalid};
}
