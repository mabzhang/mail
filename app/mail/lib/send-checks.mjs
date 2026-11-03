export function sendChecks(message,{text='',internalDomains=[],accountDomains=[]}={}){
 const internal=new Set([...internalDomains,...accountDomains].map(x=>String(x).toLowerCase()));
 return {external:[...message.to,...message.cc,...message.bcc].filter(email=>!internal.has(email.split('@')[1].toLowerCase())),missing:/(?:见附件|详见附件|查看附件|查收附件|参考附件|下载附件|附件(?:为|是|中|见|内容)|随附|附上|attached|attachment enclosed)/i.test(text)&&!message.attachments.length};
}
