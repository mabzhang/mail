import crypto from 'node:crypto';
import {dayRange} from './store.mjs';
import {createFollowups} from './followups.mjs';

export const ACTION_KINDS = ['confirm', 'notice', 'reply', 'todo'];
const clean = v => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 400);
const unique = values => [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
const reply = title => /(?:回复|回信|回邮|答复|请反馈|reply|respond)/i.test(title);
const notice = title => /^(?:请)?(?:查收|知悉|知晓|了解|阅读)(?:[，,:：\s]|$)/.test(title);
const sourceKey = m => clean(m.accountId) + ':' + clean(m.id || (m.folder + ':' + m.uidValidity + ':' + m.uid));
const idFor = (m, kind, title) => crypto.createHash('sha256').update(sourceKey(m) + ':' + kind + ':' + clean(title)).digest('hex').slice(0, 32);
const sourceOf = m => ({id:m.id, accountId:m.accountId, folder:m.folder || 'INBOX', uid:String(m.uid || ''), uidValidity:String(m.uidValidity || ''), subject:m.subject || '', from:m.from || '', to:m.to || '', date:m.date || '', attachments:m.attachments || []});

// Old reports remain usable; an unknown completion state is never a confirmation request.
export function reportActions(report) {
  const result = [];
  for (const m of report?.messages || []) {
    const a = m.analysis || {};
    let actions;
    if (Array.isArray(a.actions) && a.actions.length) {
      actions = a.actions.filter(x => ACTION_KINDS.includes(x.kind) && clean(x.title));
    } else {
      actions = [
        ...unique(a.confirmations).map(title => ({kind:reply(title) ? 'reply' : 'confirm', title})),
        ...unique(a.todos).map(title => ({kind:reply(title) ? 'reply' : notice(title) ? 'notice' : 'todo', title})),
      ];
    }
    if (!actions.length) actions = [{kind:'notice', title:a.summary || m.subject || '阅读这封邮件'}];
    const seen = new Set();
    for (const action of actions) {
      const title = clean(action.title), id = idFor(m, action.kind, title);
      if (seen.has(title)) continue;
      seen.add(title);
      result.push({id, kind:action.kind, title, evidence:clean(action.evidence), day:report.day, priority:a.priority || '轻', category:clean(a.category || '其他'), project:clean(a.project || ''), deadline:clean(a.deadline === '未提及' ? '' : a.deadline), summary:clean(a.summary), source:sourceOf(m), done:false, origin:'report'});
    }
  }
  return result;
}

export function createActionCenter(store) {
  const followups = createFollowups(store);
  function list({day, scope='day'} = {}) {
    dayRange(day);
    if (!['day','open'].includes(scope)) throw new Error('事项范围无效');
    const overrides = store.read('action-overrides.json', {});
    const days = scope === 'open' ? [...new Set([day, ...store.archive().filter(x => x <= day)])] : [day];
    const rows = days.flatMap(date => reportActions(store.report(date))).map(item => {
      const saved = overrides[item.id] || {};
      return {...item, kind:ACTION_KINDS.includes(saved.kind) ? saved.kind : item.kind, done:saved.done === true, markedAt:saved.updatedAt || null};
    });
    // Keep completed snapshots visible when a later summary changes its wording.
    const currentIds=new Set(rows.map(x=>x.id));
    for(const [id,saved] of Object.entries(overrides)){
      const x=saved.snapshot;
      if(!x||currentIds.has(id)||!ACTION_KINDS.includes(x.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(x.day)||!(scope==='open'?x.day<=day:x.day===day))continue;
      rows.push({...x,id,kind:ACTION_KINDS.includes(saved.kind)?saved.kind:x.kind,done:saved.done===true,markedAt:saved.updatedAt||null,origin:'history'});
    }
    const manual = followups.list().filter(x => scope === 'open' || new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(x.createdAt) === day);
    for (const item of manual) {
      // Keep a manually tracked copy as the source of truth when it refers to the same task.
      const match = rows.findIndex(x => item.source?.id && x.source?.id === item.source.id && x.source?.accountId === item.source.accountId && clean(x.title) === clean(item.title));
      if (match >= 0) rows.splice(match, 1);
      rows.push({id:'manual-' + item.id, kind:'todo', title:item.title, evidence:'', day:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(item.createdAt), priority:'重要', category:'本地跟进', deadline:item.due, summary:item.notes, source:item.source, done:item.done, markedAt:item.done ? item.updatedAt : null, origin:'manual'});
    }
    const weights = {'重要且急':0, '急':1, '重要':2, '轻':3, '缓':4};
    rows.sort((a,b) => Number(a.done) - Number(b.done) || (weights[a.priority] ?? 4) - (weights[b.priority] ?? 4) || a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
    return {day, scope, items:rows, counts:Object.fromEntries(ACTION_KINDS.map(k => [k, rows.filter(x => x.kind === k && !x.done).length])), done:rows.filter(x => x.done).length,handled:rows.filter(x=>x.done&&x.kind!=='notice').length,reviewed:rows.filter(x=>x.done&&x.kind==='notice').length,total:rows.length};
  }
  function update(p) {
    dayRange(p.day);
    const item = list({day:p.day, scope:p.scope || 'day'}).items.find(x => x.id === p.id);
    if (!item) throw new Error('事项已变化，请刷新后重试');
    if (p.kind && !ACTION_KINDS.includes(p.kind)) throw new Error('事项分类无效');
    if (item.origin === 'manual') {
      if (p.kind && p.kind !== 'todo') throw new Error('手动跟进事项保留在待办中');
      followups.save({id:item.id.slice(7), done:p.done === undefined ? item.done : p.done === true});
    } else {
      const saved = store.read('action-overrides.json', {});
      saved[item.id] = {...saved[item.id], done:p.done === undefined ? item.done : p.done === true, kind:p.kind || item.kind, snapshot:{id:item.id,kind:p.kind||item.kind,title:item.title,evidence:item.evidence,day:item.day,priority:item.priority,category:item.category,deadline:item.deadline,summary:item.summary,source:item.source,origin:'report'}, updatedAt:Date.now()};
      store.write('action-overrides.json', saved);
    }
    return list({day:p.day, scope:p.scope || 'day'});
  }
  return {list, update};
}
