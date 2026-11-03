import {sourceReference,quoteFromMail} from './draft-content.mjs';
export function createDraftSources({cache,mail}){
 return {async resolve(draft){
  let ref=sourceReference(draft.sourceRef);
  if(!ref&&draft.inReplyTo){const found=await mail('context',draft.accountId,{folder:'INBOX',messageId:draft.inReplyTo});if(!found)throw new Error('未找到被回复的原邮件，请从原邮件重新打开回复；已写正文仍可保存');ref=sourceReference({...found,mode:'reply'});}
  if(!ref)return null;
  const mailData=await cache.get('read',ref.accountId,{folder:ref.folder,uid:ref.uid,uidValidity:ref.uidValidity});
  return quoteFromMail({...mailData,accountId:ref.accountId,folder:ref.folder,uid:ref.uid,uidValidity:ref.uidValidity},ref.mode);
 }};
}
