const chars=s=>Array.from(String(s||''));
export function senderName(value,contacts=[]){
 const raw=String(typeof value==='object'?(value?.name||value?.email||''):value||'');
 const email=(String(typeof value==='object'?value?.email||raw:raw).match(/[^\s<>"'(),:;]+@[^\s<>"'(),;]+/)||[])[0];
 const known=contacts.find(x=>email&&String(x.email||'').toLowerCase()===email.toLowerCase()&&x.name);
 if(known&&!String(known.name).includes('@'))return chars(known.name).slice(0,24).join('');
 const display=raw.replace(/<[^>]*>/g,'').replace(/["']/g,'').trim();
 if(display&&!display.includes('@'))return chars(display).slice(0,24).join('');
 if(email){const local=email.split('@')[0].replace(/[._-]+/g,' ').trim();if(/^(?:no ?reply|noreply|system|notification|service)$/i.test(local))return '系统通知';return chars(local.replace(/\b[a-z]/g,c=>c.toUpperCase())).slice(0,24).join('')||'发件人';}
 return chars(raw.includes('@')?'发件人':raw||'发件人').slice(0,24).join('');
}
export function compactText(value,max=30){return chars(String(value||'').replace(/https?:\/\/\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'').replace(/\s+/g,' ').trim()).slice(0,max).join('');}
export function focusDescription(title,summary){
 const lead=compactText(title,50),detail=compactText(summary,100);
 const text=detail.startsWith(lead)?detail:lead+(detail&&!lead.includes(detail)?' · '+detail:'');
 return compactText(text,30);
}
export function focusItems(board={},reminders={},messages=[],day){
 const byMessage=new Map(messages.map(m=>[m.id,m]));
 const active=x=>!x.done&&!x.cancelled&&!['cancelled','done'].includes(String(x.status||'').toLowerCase());
 const events=[...new Map([...(reminders.events||[]),...(reminders.overdue||[])].filter(active).map(x=>[x.id,x])).values()];
 const source=x=>x.source?{...x.source,from:x.source.from||byMessage.get(x.source.id)?.from||''}:undefined;
 const eventRows=events.map(x=>({id:'event:'+x.id,eventId:x.id,actionId:x.actionId,type:x.type==='meeting'?'meeting':x.actionKind||'todo',priority:x.priority,source:source(x),organizer:x.organizer,project:x.project||byMessage.get(x.source?.id)?.analysis?.project||byMessage.get(x.source?.id)?.analysis?.category||'日程',title:x.title,description:focusDescription(x.title,x.summary),start:x.start,end:x.end,day:x.day,allDay:x.allDay,overdue:x.type!=='meeting'&&x.day<day}));
 // A calendar entry represents one action, not every action in its source mail.
 const representedActions=new Set(eventRows.map(x=>x.actionId).filter(Boolean));
 const actions=(board.items||[]).filter(x=>active(x)&&x.day===day&&x.kind!=='notice'&&!representedActions.has(x.id)).map(x=>({id:'action:'+x.id,type:x.kind,priority:x.priority,source:source(x),project:x.project||byMessage.get(x.source?.id)?.analysis?.project||x.category||'项目',title:x.title,description:focusDescription(x.title,x.summary),day:x.day,actionId:x.id}));
 const rank=x=>x.type==='meeting'?0:x.overdue?1:['重要且急','急'].includes(x.priority)?2:['重要'].includes(x.priority)?3:x.type==='confirm'?4:5;
 const priorityRank={'重要且急':0,'急':1,'重要':2,'轻':3,'缓':4};
 return [...eventRows,...actions].sort((a,b)=>rank(a)-rank(b)||(a.type==='meeting'&&b.type==='meeting'?String(a.start||'').localeCompare(String(b.start||'')):(priorityRank[a.priority]??4)-(priorityRank[b.priority]??4))||String(a.day||'').localeCompare(String(b.day||''))||String(a.id).localeCompare(String(b.id))).slice(0,80);
}
