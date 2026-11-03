// Browser and backend share the authored-only draft payload contract.
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function sourceReference(value){
 if(!value)return null;
 const r={accountId:String(value.accountId||''),folder:String(value.folder||'INBOX'),uid:String(value.uid||''),uidValidity:String(value.uidValidity||''),mode:String(value.mode||'reply')};
 if(!UUID.test(r.accountId)||!r.folder||r.folder.length>300||/[\x00-\x1f]/.test(r.folder)||!/^\d{1,20}$/.test(r.uid)||!/^\d{1,20}$/.test(r.uidValidity)||!['reply','reply-all','forward'].includes(r.mode))throw new Error('原邮件关联信息无效，请从原邮件重新打开回复');
 return r;
}
export function draftPayload(value){
 const fields=['id','revision','accountId','to','cc','bcc','subject','text','html','inReplyTo','references','signatureId','useSignature','attachments','attachmentMeta','sourceRef'];
 return Object.fromEntries(fields.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
}
export function quoteFromMail(mail,mode='reply'){
 const text=String(mail.text||''),quoted=text.slice(0,40000);
 const received=mail.date?new Date(mail.date).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'';
 return {sourceRef:sourceReference({...mail,mode}),quoteText:'----- 原邮件 -----\n发件人：'+String(mail.from||'')+'\n收到：'+received+'\n主题：'+String(mail.subject||'')+'\n\n'+quoted+(text.length>40000?'\n（原邮件较长，以上引用为节选）':''),quoteHtml:mail.html?'<blockquote>'+mail.html+'</blockquote>':'',replyContext:mode==='forward'?null:{subject:mail.subject||'',from:mail.from||'',text:quoted}};
}
export function draftSaveError(message){
 if(/其他窗口|版本冲突/.test(message))return '未保存：此草稿已在其他窗口更新。请先复制当前正文，再重新打开草稿。';
 return '未保存：'+message+'。当前编辑内容仍保留，请处理后再次保存。';
}
