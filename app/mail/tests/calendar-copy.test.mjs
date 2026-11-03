import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCopy} from '../ui/calendar-data.mjs';
import {createWorkCalendar} from '../ui/work-calendar.js';

const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(t){
 const oldDocument=globalThis.document,oldStorage=globalThis.localStorage;
 globalThis.document={addEventListener(){}};
 const storage=new Map();
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
 t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;});
 const S={page:'schedule',state:{today:'2026-10-13'}},requests=[];
 const calendar=createWorkCalendar({S,$:()=>null,e:escapeHTML,api:async url=>{requests.push(url);return {events:[],undated:[],timeZone:'Asia/Shanghai'};},toast(){},openSource(){}});
 return {calendar,S,requests};
}
const noteSection=html=>html.match(/<section class="wc-daily-notes"[\s\S]*?<\/section>/)?.[0]||'';

test('daily copy changes at Shanghai midnight and accepts both approved style aliases',()=>{
 for(const [style,alias] of [['playful','调皮'],['comfort','工作安慰']]){
  const previous=dailyCopy('2026-10-12T15:59:59Z',style),current=dailyCopy('2026-10-12T16:00:00Z',style);
  assert.equal(previous.date,'2026-10-12');
  assert.equal(current.date,'2026-10-13');
  assert.deepEqual(current,dailyCopy('2026-10-13T23:59:59+08:00',alias));
  assert.equal(current.approved,true);
 }
});

test('both approved daily notes render outside the date grid without loading mail',t=>{
 const {calendar,requests}=fixture(t),html=calendar.render(),notes=noteSection(html);
 assert.ok(notes);
 assert.doesNotMatch(notes,/调皮一点|工作安慰|wc-daily-note-label/);
 assert.match(notes,/data-wc-copy-day="2026-10-13"/);
 for(const style of ['playful','comfort']){
  const copy=dailyCopy('2026-10-13',style);
  assert.ok(notes.includes(`data-wc-copy-id="${copy.id}"`));
  assert.ok(notes.includes(escapeHTML(copy.text)));
 }
 assert.ok(html.indexOf(notes)<html.indexOf('class="wc-layout"'));
 assert.doesNotMatch(html.slice(html.indexOf('class="wc-month-grid"')),/data-wc-copy=/);
 assert.deepEqual(requests,[]);
});

test('browsing dates, views and all four themes keeps the same daily note pair',async t=>{
 const {calendar,S}=fixture(t),notes=noteSection(calendar.render());
 await calendar.selectDay('2026-12-31');
 assert.equal(calendar.selectedDay(),'2026-12-31');
 for(const theme of ['mist','sand','iris','ink']){
  await calendar.click({dataset:{wcTheme:theme}});
  assert.match(calendar.render(),new RegExp(`data-wc-theme="${theme}"`));
  assert.equal(noteSection(calendar.render()),notes);
 }
 for(const view of ['week','day','agenda','month']){
  await calendar.click({dataset:{wcView:view}});
  assert.equal(noteSection(calendar.render()),notes);
 }
 S.state.today='2026-10-14';
 const nextNotes=noteSection(calendar.render());
 assert.match(nextNotes,/data-wc-copy-day="2026-10-14"/);
 for(const style of ['playful','comfort'])assert.ok(nextNotes.includes(escapeHTML(dailyCopy('2026-10-14',style).text)));
});
