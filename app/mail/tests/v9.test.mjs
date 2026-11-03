import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRuntimeHost} from '../lib/managed-runtime.mjs';
test('安装期间不打开无限期 runtime.watch RPC；有界查询仍发现后台退出并可重新连接',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'Mail-bootstrap-'));let queries=0,watches=0,alive=true,starts=0;
 const ctx={runtime:{async start(){starts++;return {runtimeId:'r'+starts,state:'ready'};},async get(){queries++;return {state:alive?'ready':'failed',exitCode:alive?null:1};},async watch(){watches++;throw Error('AppHost bootstrap must not drain a persistent body.read');},async stop(){}}};
 const host=createRuntimeHost({monitorIntervalMs:5});t.after(async()=>{await host.stop();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(await host.start(ctx,{dataDir:dir}),true);await new Promise(r=>setTimeout(r,20));assert.equal(watches,0);assert(queries>=2);assert.equal(host.state(),'ready');
 alive=false;await new Promise(r=>setTimeout(r,20));assert.equal(host.state(),'unavailable');assert.equal(host.diagnostics().code,'CHILD_EXIT');alive=true;assert.equal((await host.retry()).state,'ready');assert.equal(starts,2);assert.equal(watches,0);
});

test('宿主静态 UI 的共享草稿模块随包发布，与后台契约一致',()=>{
 const ui=new URL('../ui/draft-content.mjs',import.meta.url),backend=new URL('../lib/draft-content.mjs',import.meta.url);assert.equal(fs.readFileSync(ui,'utf8'),fs.readFileSync(backend,'utf8'));
});
