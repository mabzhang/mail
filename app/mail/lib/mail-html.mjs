import sanitize from '../vendor-html/node_modules/sanitize-html/index.js';
import {cleanMailCss,mailStyles} from './mail-css.mjs';
import {imageKey} from './mail-images.mjs';
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const textHtml=v=>'<div style="white-space:pre-wrap">'+escapeHtml(v)+'</div>';
export function cleanHtml(input,{remote=false,imageSources=new Map()}={}){
 const css=[];const source=String(input||'').slice(0,12000000).replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi,(_,text)=>{const safe=cleanMailCss(text);if(safe)css.push(safe);return '';});
 const content=sanitize(source,{
  allowedTags:['div','p','br','span','b','strong','i','em','u','s','font','a','img','table','thead','tbody','tfoot','tr','td','th','colgroup','col','ul','ol','li','blockquote','h1','h2','h3','h4','h5','h6','hr','pre','code','center','mark'],
  allowedAttributes:{'*':['style','title','dir','align','class','id'],a:['href','target','rel'],img:['src','alt','width','height','style','data-remote-src','data-cid'],table:['width','height','border','cellpadding','cellspacing','bgcolor','style'],td:['colspan','rowspan','width','height','bgcolor','style'],th:['colspan','rowspan','width','height','bgcolor','style'],font:['color','size','face'],col:['width','span'],ol:['start']},
  allowedSchemes:['http','https','mailto','cid','data'],allowProtocolRelative:false,
  allowedStyles:{'*':mailStyles},
  transformTags:{body:(tag,a)=>({tagName:'div',attribs:{style:a.style,dir:a.dir}}),mark:(tag,a)=>({tagName:'mark',attribs:{style:'background-color:#fff2a8;color:#1c2434'}}),a:(tag,a)=>{const href=/^(?:https?:\/\/|mailto:)/i.test(a.href||'')?a.href:undefined;return {tagName:'a',attribs:{...a,...(href?{href}:{}),target:'_blank',rel:'noopener noreferrer'}};},img:(tag,a)=>{let src=String(a.src||'').trim();src=imageSources.get(imageKey(src))||src;if(/^data:/i.test(src)&&!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(src))src='';if(!/^(?:https?:\/\/|cid:|data:image\/)/i.test(src))src='';const attrs={alt:a.alt||'邮件图片',width:a.width,height:a.height,style:a.style,...(a.class?{class:a.class}:{}),...(a.id?{id:a.id}:{})};if(/^https?:/i.test(src)&&!remote){attrs['data-remote-src']=src;attrs.alt='外部图片 · '+attrs.alt;}else if(src)attrs.src=src;return {tagName:'img',attribs:attrs};}},
 });
 return (css.length?'<style data-mail-css="safe">'+css.join('\n')+'</style>':'')+content;
}
export function htmlText(input){return sanitize(String(input||'').replace(/<(?:br|\/p|\/div|\/tr)\b[^>]*>/gi,'\n'),{allowedTags:[],allowedAttributes:{}}).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(+n,0x10ffff))).trim();}
