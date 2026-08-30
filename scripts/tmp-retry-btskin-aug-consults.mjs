import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const endpoint = 'https://script.google.com/macros/s/AKfycbwUsy5dDEG-t4FszWRCj-f0-FLIOY4SPMatiNsm55xM7bFXzaAEFS6McQdvmXT85dT0/exec';
const statusPath = path.join(root, '.tmp-btskin-aug-retry-status.json');

const rows = [
  ['优可Yuki','2026-08-01','你好，我计划8月19日到院面诊，预约上午面诊时段。\n意向项目：双侧上臂Onda Coolwaves、下颌线Onda Coolwaves、丽珠兰黑盒Rejuran Healer 2cc。最终还是要面诊之后才能决定。\n有几点需要提前确认：\n手臂Onda使用身体专用探头，下颌线使用面部探头；\n丽珠兰黑盒要求全新未拆封，治疗前当面拆封扫码验真；\n报价请明确为双侧上臂，不是单侧手臂；\n本次上午先面诊、医生评估脂肪与皮肤状态，拿到完整套餐报价；确定合适后希望当天下午可以安排全套施术，请预留下午治疗空位。'],
  ['Peggy.L','2026-08-01','眼部注射，超声刀'],
  ['TOMOR','2026-08-02','1️⃣院长1v1面诊\n2️⃣黄金微针'],
  ['Grape','2026-08-03','1.黄金微针 超皮秒激光\n2.8.13日'],
  ['mmz','2026-08-03','你好，我想做超声刀，黄金微针（皮肤表面有很多痘坑，在国内已经做过多次微针和点阵），眉间填充除皱（川字纹有点深），丽珠兰水光，可能会再想做一个眼部的项目，可以分别在12号和15号分两次做'],
  ['wang yang','2026-08-03','抗衰\n塑造萃'],
  ['michelle','2026-08-05','您好，想预约8月15日09:30，做Onda：下颌缘+双下巴 + 腹部小腹局部。\n入住酒店：济州1号酒店 Hotel The One\n需求确认：\n1.确认是正版ONDA PRO仪器，面部用面部探头、腹部使用身体专用探头；\n2.请提供两个部位合计总价，确认无隐形附加费；\n3.需要中文面诊接待；\n4.确认总治疗时长，我晚间要赶22点航班，不能超时；'],
  ['8','2026-08-07','想预约8月13日早上9点两位的医美，一位（男士）做黄金微针类祛痘项目，一位（女士）做提拉紧致类项目。'],
  ['Nu:Yoah','2026-08-07','光子嫩肤'],
  ['杨m','2026-08-07','你好，我第一次来济州，想预约BTSKIN美丽皮肤科，预约：300发全脸超声炮+Liztox瘦脸针，下颌缘ONDA溶脂瘦脖子\n\n1. 初步预计到店日期：2026年9月4号\n\n.可以有机场到门店免费接送服务吗'],
  ['Ange岛屿','2026-08-08','怎么预约'],
  ['💡','2026-08-09','咨询'],
  ['Honey玮','2026-08-09','咨询'],
  ['i','2026-08-09','一支玻尿酸可以打鼻尖鼻小柱鼻基底吗'],
  ['°','2026-08-09','咨询\n预约'],
  ['你说ღ','2026-08-09','看价格表'],
  ['叶xx🍃','2026-08-10','你好，可以预约吗'],
  ['Zzzzzzzz 🎈 ee','2026-08-09','8月14-15开门不'],
  ['鸣鸣','2026-08-10','提前多久预约\n医生'],
  ['一海千寻','2026-08-10','预约'],
  ['小宁','2026-08-10','预约'],
  ['牙牙','2026-08-10','咨询'],
  ['彡','2026-08-10','怎么预约'],
].map(([nickname,date,content]) => ({nickname,date,content}));

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    if (['.git','node_modules','.report-context'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (/\.(?:html|mjs|js|md|gs|json)$/i.test(ent.name)) out.push(full);
  }
  return out;
}

const sources = walk(root).map(file => ({file, text:fs.readFileSync(file,'utf8')}));
const actionHits = new Map();
for (const {file,text} of sources) {
  const patterns = [
    /[?&]action=([A-Za-z0-9_-]*consult[A-Za-z0-9_-]*)/gi,
    /action\s*:\s*['"]([^'"]*consult[^'"]*)['"]/gi,
    /['"]action['"]\s*:\s*['"]([^'"]*consult[^'"]*)['"]/gi,
    /action\s*=\s*['"]([^'"]*consult[^'"]*)['"]/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const name = m[1];
      if (!actionHits.has(name)) actionHits.set(name, []);
      actionHits.get(name).push(path.relative(root,file));
    }
  }
}

const actions = [...actionHits.keys()];
const writeAction = actions.find(a => /^(?:add|save|create|insert|upsert).*consult/i.test(a))
  || actions.find(a => /consult.*(?:add|save|create|insert|upsert)/i.test(a));
const readAction = actions.find(a => /^(?:get|list|fetch|check).*consult/i.test(a))
  || actions.find(a => /consult.*(?:list|get|fetch|check)/i.test(a));

function normalize(v) { return String(v ?? '').normalize('NFKC').replace(/\s+/g,' ').trim(); }
function collectObjects(value, out=[]) {
  if (Array.isArray(value)) for (const v of value) collectObjects(v,out);
  else if (value && typeof value === 'object') {
    out.push(value);
    for (const v of Object.values(value)) collectObjects(v,out);
  }
  return out;
}
function asRecord(o) {
  const nickname = o.nickname ?? o.customerName ?? o.name ?? o.nickName ?? o.title;
  const date = o.date ?? o.consultationDate ?? o.consultedAt ?? o.createdAt ?? o.timestamp;
  const content = o.content ?? o.message ?? o.note ?? o.consultation ?? o.text ?? o.summary;
  const channel = o.channel ?? o.platform ?? o.source;
  const clientId = o.clientId ?? o.client ?? o.customerId;
  return {nickname, date:String(date ?? '').slice(0,10), content, channel, clientId};
}

async function getJson(action) {
  const url = new URL(endpoint);
  if (action) url.searchParams.set('action', action);
  url.searchParams.set('clientId','btskin');
  url.searchParams.set('month','2026-08');
  const res = await fetch(url, {redirect:'follow'});
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON GET response (${res.status}): ${text.slice(0,200)}`); }
  if (!res.ok) throw new Error(`GET failed ${res.status}`);
  return json;
}

function recordsFrom(json) {
  return collectObjects(json).map(asRecord).filter(r => r.nickname && r.content && (!r.clientId || r.clientId === 'btskin'));
}
function hasRow(records,row) {
  return records.some(r => normalize(r.nickname)===normalize(row.nickname)
    && r.date===row.date
    && normalize(r.content)===normalize(row.content)
    && (!r.channel || /wechat|위챗/i.test(String(r.channel))));
}

const status = {at:new Date().toISOString(), actions, actionHits:Object.fromEntries(actionHits), total:rows.length};
try {
  if (!writeAction) throw new Error(`Consultation write action not found. Candidates: ${actions.join(', ')}`);
  const beforeJson = await getJson(readAction || 'summary');
  const before = recordsFrom(beforeJson);
  const missing = rows.filter(row => !hasRow(before,row));
  status.writeAction = writeAction;
  status.readAction = readAction || 'summary';
  status.existingBefore = rows.length - missing.length;
  status.attempted = missing.length;
  status.results = [];
  for (const row of missing) {
    const params = new URLSearchParams({
      action:writeAction, clientId:'btskin', channel:'wechat', platform:'wechat', source:'wechat',
      nickname:row.nickname, customerName:row.nickname, name:row.nickname,
      date:row.date, consultationDate:row.date, consultedAt:row.date,
      content:row.content, message:row.content, note:row.content, consultation:row.content,
    });
    const res = await fetch(endpoint, {method:'POST', body:params, redirect:'follow'});
    const text = await res.text();
    let parsed; try { parsed=JSON.parse(text); } catch { parsed={raw:text.slice(0,300)}; }
    status.results.push({nickname:row.nickname, date:row.date, http:res.status, response:parsed});
    if (!res.ok || parsed?.success === false || parsed?.ok === false) throw new Error(`Save failed for ${row.nickname}: HTTP ${res.status} ${text.slice(0,200)}`);
  }
  const afterJson = await getJson(readAction || 'summary');
  const after = recordsFrom(afterJson);
  const unverified = rows.filter(row => !hasRow(after,row));
  status.verified = rows.length - unverified.length;
  status.unverified = unverified.map(({nickname,date})=>({nickname,date}));
  status.success = unverified.length === 0;
  if (!status.success) throw new Error(`Re-read verification failed for ${unverified.length} rows`);
} catch (error) {
  status.success = false;
  status.error = error.stack || String(error);
} finally {
  fs.writeFileSync(statusPath, JSON.stringify(status,null,2));
}
if (!status.success) process.exit(1);
