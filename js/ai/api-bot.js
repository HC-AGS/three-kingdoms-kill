// API 驱动的 AI 座位 — 每次决策 fetch() 用户配置的 LLM 端点
import { buildSystemMessage } from './prompt.js';
import { UI } from '../core/ui-bridge.js';
import { AI } from '../core/ai-bridge.js';
import { areEnemies, areAllies } from '../core/state.js';
import * as engine from '../core/engine.js';

// 全局：所有 API 座位共享的配置与本地 AI 备份
export const ApiCfg = {
  config: null,              // 扫码/手填的 JSON
  boundSeats: new Set(),     // 哪些座位号走 API
  calls: 0,
  errors: 0,
  lastError: null,
  cache: new Map()           // 简单去抖：同一 prompt 5s 内不重复请求
};

export function setConfig(cfg) {
  ApiCfg.config = cfg;
  try { localStorage.setItem('sgs-api-cfg', JSON.stringify(cfg)); } catch(_) {}
}
export function loadConfig() {
  try {
    const s = localStorage.getItem('sgs-api-cfg');
    if (s) ApiCfg.config = JSON.parse(s);
  } catch(_) {}
  return ApiCfg.config;
}
export function clearConfig() {
  ApiCfg.config = null;
  ApiCfg.boundSeats.clear();
  try { localStorage.removeItem('sgs-api-cfg'); } catch(_) {}
}

// ================= 请求包装 =================
export async function callApi(state, prompt) {
  const cfg = ApiCfg.config;
  if (!cfg) throw new Error('未配置 API');
  const body = buildRequestBody(cfg, prompt);
  const headers = { 'Content-Type': 'application/json', ...(cfg.headers || {}) };
  if (cfg.apiKey) {
    if ((cfg.provider || 'openai-compat') === 'anthropic') {
      headers['x-api-key'] = cfg.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if ((cfg.provider || 'openai-compat') === 'dashscope') {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    } else {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }
  }
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 20000);
  ApiCfg.calls++;
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(tm);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
    }
    const json = await res.json();
    return extractResponseText(cfg, json);
  } catch (e) {
    clearTimeout(tm);
    ApiCfg.errors++;
    ApiCfg.lastError = e.message;
    throw e;
  }
}

function buildRequestBody(cfg, prompt) {
  const fmt = cfg.requestFormat || (cfg.provider === 'anthropic' ? 'anthropic' : 'openai');
  const messages = [
    { role: 'system', content: prompt.system },
    ...prompt.history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: prompt.user }
  ];
  if (fmt === 'anthropic') {
    return {
      model: cfg.model,
      max_tokens: cfg.maxTokens || 800,
      temperature: cfg.temperature ?? 0.6,
      top_p: cfg.topP,
      system: prompt.system,
      messages: messages.slice(1)
    };
  }
  // openai 兼容
  const b = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature ?? 0.6,
    max_tokens: cfg.maxTokens || 800,
    top_p: cfg.topP
  };
  if (cfg.responseFormat === 'json') {
    b.response_format = { type: 'json_object' };
  }
  return b;
}

function extractResponseText(cfg, json) {
  if (cfg.responsePath) return getByPath(json, cfg.responsePath);
  const fmt = cfg.requestFormat || (cfg.provider === 'anthropic' ? 'anthropic' : 'openai');
  if (fmt === 'anthropic') {
    return json.content?.[0]?.text || '';
  }
  return json.choices?.[0]?.message?.content
      || json.output?.text
      || json.message?.content
      || json.result
      || '';
}
function getByPath(obj, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((a,k) => (a == null ? a : a[k]), obj);
}

// 提取 JSON（去掉围栏 / 前后噪声）
export function parseJsonLoose(text) {
  if (!text) throw new Error('空响应');
  let s = String(text).trim();
  // 去 markdown 围栏
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // 抓第一个 { ... }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('响应中未找到 JSON: ' + s.slice(0, 120));
  return JSON.parse(m[0]);
}

// ================= 状态快照构造 =================
export function snapshotState(st, p, extra = {}) {
  const alive = st.alivePlayers();
  return {
    turn: st.turnCount,
    round: st.round,
    phase: st.phase,
    mode: st.mode,
    modeText: st.mode === 'identity' ? '身份局' : (st.mode === '2v2' ? '2v2 团队战' : '3v3 团队战'),
    you: serializePlayer(st, p, true),
    others: alive.filter(x => x !== p).map(o => serializePlayer(st, o, false)),
    dead: st.players.filter(x => !x.alive).map(o => ({ name:o.name, idx:o.idx, general:o.general.name, role: st.mode==='identity' ? o.role : o.team })),
    deckCount: st.deck.length,
    discardCount: st.discard.length,
    logTail: st.logs.slice(-20).map(l => l.msg.replace(/<[^>]+>/g, '')),
    ...extra
  };
}
function serializePlayer(st, p, isSelf) {
  const s = {
    idx: p.idx, name: p.name, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
    general: p.general.name, fac: p.fac, gender: p.gender, chained: !!p.chained,
    handCount: p.hand.length,
    equips: Object.entries(p.equip).filter(([,v])=>v).map(([k,v]) => ({ slot:k, name:v.name, defId:v.defId })),
    judges: p.judges.map(j => j.defId),
    skills: p.skills.map(sk => ({ id: sk.id, name: sk.name, desc: sk.desc })),
    distanceFromYou: isSelf ? 0 : null
  };
  if (isSelf) {
    s.hand = p.hand.map(c => ({ id: c.id, defId: c.defId, name: c.name, suit: c.suit, rank: c.rank, type: c.type, subtype: c.subtype||'' }));
    s.role = st.mode==='identity' ? p.role : p.team;
  } else {
    // 其他玩家的角色只有在身份已揭露/团队模式才给
    if (st.mode !== 'identity' || !p.alive) s.role = st.mode==='identity' ? p.role : p.team;
    s.roleHidden = !s.role;
  }
  return s;
}

function playerCtx(st, p) {
  return {
    idx: p.idx, name: p.name,
    generalName: p.general.name, fac: p.fac, maxHp: p.maxHp,
    skills: p.skills,
    roleText: st.mode === 'identity'
      ? ({主:'主公',忠:'忠臣',反:'反贼',内:'内奸'})[p.role]
      : (p.team === 'A' ? '红队 A' : '蓝队 B'),
    modeText: st.mode === 'identity' ? `身份局 ${st.count}人` : (st.mode === '2v2' ? '2v2 团队战' : '3v3 团队战'),
    playerCount: st.players.length, aliveCount: st.alivePlayers().length
  };
}

// ================= 与本地 AI 桥接 =================
// 我们把 API 座位的 respond/decision 接管；未接管的座位仍然用本地 bot。
// bot.js 提供的 AI.respond / AI.decidePlayPhase 都是全局函数；这里通过 seat 判断走哪条路。
import { AI as localAI } from '../core/ai-bridge.js';

let _localRespondBackup = null;
let _localPlayPhaseBackup = null;
let _localPickDiscardBackup = null;

export function installApiAI(state) {
  // 每次都重新记录当前本地 AI 引用（防止多次开局时抓到上一个 state 的闭包）
  _localRespondBackup = localAI.respond;
  _localPlayPhaseBackup = localAI.decidePlayPhase;
  _localPickDiscardBackup = localAI.pickDiscard;

  const wrappedRespond = async (st, prompt) => {
    if (!ApiCfg.boundSeats.has(prompt.p.idx) || !ApiCfg.config) return _localRespondBackup(st, prompt);
    try {
      return await apiRespond(st, prompt);
    } catch (e) {
      console.warn('[api-ai] respond failed, fallback local:', e.message);
      UI.toast(`AI 接口异常：${e.message.slice(0,60)}`, 'bad');
      return _localRespondBackup(st, prompt);
    }
  };
  const wrappedPlay = async (st, p) => {
    if (!ApiCfg.boundSeats.has(p.idx) || !ApiCfg.config) return _localPlayPhaseBackup(st, p);
    try {
      return await apiPlayPhase(st, p);
    } catch (e) {
      console.warn('[api-ai] play failed, fallback local:', e.message);
      UI.toast(`AI 接口异常：${e.message.slice(0,60)}`, 'bad');
      return _localPlayPhaseBackup(st, p);
    }
  };
  localAI.respond = wrappedRespond;
  localAI.decidePlayPhase = wrappedPlay;
}

async function apiRespond(st, prompt) {
  const p = prompt.p;
  const kinds = prompt.kinds;
  const ctx = prompt.ctx || {};
  const snap = snapshotState(st, p, {
    pending: {
      kinds,
      sourceName: ctx.source?.name || null,
      targetName: ctx.target?.name || null,
      cause: ctx.cause || null,
      isSelf: !!ctx.isSelf
    }
  });
  // 列出可用响应牌
  const eligible = p.hand.filter(c => kinds.includes(cardKindToPrompt(c, p)));
  const options = [
    { action: 'pass' },
    ...eligible.map(c => ({ action: 'play', cardId: c.id, cardName: c.name }))
  ];
  const sysMsg = buildSystemMessage(ApiCfg.config, playerCtx(st, p));
  const userMsg = JSON.stringify({
    kind: 'respond',
    prompt: `你需要响应【${kinds.join('/')}】。来源：${ctx.source?.name||'无'}，目标：${ctx.target?.name||'无'}，${ctx.isSelf?'（你自己）':''}。请从 options 中选择。`,
    options,
    state: snap
  });
  const txt = await callApi(st, { system: sysMsg, user: userMsg, history: [] });
  const j = parseJsonLoose(txt);
  if (j.action === 'play' && j.cardId) {
    const c = p.hand.find(x => x.id === j.cardId);
    if (c) return c;
  }
  return null;
}

function cardKindToPrompt(c, p) {
  if (c.defId === 'tao') return 'tao';
  if (c.defId === 'shan') return 'shan';
  if (c.defId === 'sha') return 'sha';
  if (p.hasSkill('wusheng') && (c.suit === 'h' || c.suit === 'd')) return 'sha';
  if (p.hasSkill('longdan')) {
    if (c.defId === 'shan') return 'sha';
    if (c.defId === 'sha') return 'shan';
  }
  if (p.hasSkill('qingguo') && (c.suit === 's' || c.suit === 'c')) return 'shan';
  return '';
}

async function apiPlayPhase(st, p) {
  // 让 API 一次决策一步，循环调用
  const { useCard } = engine;
  const sysMsg = buildSystemMessage(ApiCfg.config, playerCtx(st, p));
  let guard = 0;
  while (guard++ < 20 && !st.finished && p.alive) {
    const options = buildPlayOptions(st, p);
    const snap = snapshotState(st, p);
    const userMsg = JSON.stringify({
      kind: 'play',
      prompt: '现在是你的出牌阶段。请从 options 中选择一项行动；如无可行动作，返回 {"action":"end"}。',
      options,
      state: snap
    });
    const txt = await callApi(st, { system: sysMsg, user: userMsg, history: [] });
    const j = parseJsonLoose(txt);
    if (!j || j.action === 'end') break;
    if (j.action === 'use' && j.cardId) {
      const card = p.hand.find(c => c.id === j.cardId);
      if (!card) continue;
      const targets = (j.targetIds || []).map(id => st.players.find(x => String(x.idx) === String(id) || x.id === id)).filter(Boolean);
      try { await useCard(st, p, card, { targets }); } catch (e) { console.warn('useCard err', e); }
      await UI.syncAll(st);
      continue;
    }
    if (j.action === 'skill') {
      // 主动技交由本地兜底
      break;
    }
    break;
  }
  // 结束出牌
  UI.endPlayPhase();
}

function buildPlayOptions(st, p) {
  const out = [{ action: 'end', label: '结束出牌阶段' }];
  p.hand.forEach(c => {
    const legalTargets = legalTargetsFor(st, p, c);
    if (legalTargets === null) {
      out.push({ action: 'use', cardId: c.id, cardName: c.name, targetIds: [p.idx] });
    } else if (legalTargets.length) {
      out.push({
        action: 'use', cardId: c.id, cardName: c.name,
        targetOptions: legalTargets.map(t => ({ idx: t.idx, name: t.name }))
      });
    }
  });
  // 主动技
  p.skills.filter(s => s.type === 'active' && !p.skillUseFlag.has(s.id)).forEach(s => {
    out.push({ action: 'skill', skillId: s.id, skillName: s.name, desc: s.desc });
  });
  return out;
}
function legalTargetsFor(st, p, c) {
  const { canAttack, distance } = engine;
  if (c.defId === 'sha') {
    return st.alivePlayers().filter(x => x !== p && canAttack(st, p, x) && !(x.hasSkill('kongcheng') && x.hand.length === 0));
  }
  if (c.defId === 'juedou') return st.alivePlayers().filter(x => x !== p && !(x.hasSkill('kongcheng') && x.hand.length === 0));
  if (c.defId === 'nanman' || c.defId === 'wanjian') return st.alivePlayers().filter(x => x !== p);
  if (c.defId === 'taoyuan' || c.defId === 'wugu') return st.alivePlayers();
  if (c.defId === 'guohe' || c.defId === 'zhiji') return st.alivePlayers().filter(x => x !== p && (x.hand.length || Object.values(x.equip).some(Boolean)));
  if (c.defId === 'shunshou') return st.alivePlayers().filter(x => x !== p && distance(st, p, x) <= 1 && (x.hand.length || Object.values(x.equip).some(Boolean)));
  if (c.defId === 'huogong') return st.alivePlayers().filter(x => x !== p);
  if (c.defId === 'le' || c.defId === 'bingliang') return st.alivePlayers().filter(x => x !== p && !x.judges.some(j => j.defId === c.defId));
  if (c.defId === 'shandian') return st.players.some(x => x.judges.some(j => j.defId === 'shandian')) ? [] : [p];
  if (c.defId === 'tao') return p.hp < p.maxHp ? [p] : [];
  if (c.defId === 'jiu') return [p];
  if (c.defId === 'wuzhongseng') return [p];
  if (c.defId === 'tiesuo') return st.alivePlayers().filter(x => x !== p);
  if (c.defId === 'wuxie' || c.defId === 'shan') return null;
  if (c.type === 'equip') return [p];
  return [];
}
