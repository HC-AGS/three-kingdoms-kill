// API 驱动的 AI 座位 — 所有 AI 座位共用一个 API 端点，接管完整决策链
import { buildSystemMessage } from './prompt.js';
import { UI } from '../core/ui-bridge.js';
import { AI } from '../core/ai-bridge.js';
import { areEnemies, areAllies } from '../core/state.js';
import * as engine from '../core/engine.js';

// 全局：所有 API 座位共享的配置
export const ApiCfg = {
  config: null,              // 扫码/手填的 JSON
  boundSeats: new Set(),     // 哪些座位号走 API
  calls: 0,
  errors: 0,
  lastError: null,
  state: null,               // 当前 GameState（由 installApiAI 注入）
  verbose: false
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
export function isApiSeat(p) {
  return !!(ApiCfg.config && p && ApiCfg.boundSeats.has(p.idx));
}

// ============ CORS 代理 ============
export const DEFAULT_CORS_PROXY = 'https://corsproxy.io/?';
export function wrapWithProxy(endpoint, cfg) {
  const p = cfg && cfg.corsProxy !== undefined ? cfg.corsProxy : DEFAULT_CORS_PROXY;
  if (!p || p === 'none' || p === 'false' || p === false) return endpoint;
  const target = encodeURIComponent(endpoint);
  if (p.endsWith('?') || /[?&]$|[?&]url=$/.test(p)) return p + target;
  if (p.includes('{url}')) return p.replace('{url}', target);
  return p + target;
}

// ============ 请求 ============
export async function callApi(prompt) {
  const cfg = ApiCfg.config;
  if (!cfg) throw new Error('未配置 API');
  const body = buildRequestBody(cfg, prompt);
  const headers = { 'Content-Type': 'application/json', ...(cfg.headers || {}) };
  if (cfg.apiKey) {
    if ((cfg.provider || 'openai-compat') === 'anthropic') {
      headers['x-api-key'] = cfg.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    }
  }
  const url = wrapWithProxy(cfg.endpoint, cfg);
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 20000);
  ApiCfg.calls++;
  try {
    const res = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal
    });
    clearTimeout(tm);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      const t = await res.text();
      try { return extractResponseText(cfg, JSON.parse(t)); }
      catch { throw new Error('非 JSON 响应: ' + t.slice(0, 200)); }
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
  if (fmt === 'anthropic') {
    return {
      model: cfg.model,
      max_tokens: cfg.maxTokens || 800,
      temperature: cfg.temperature ?? 0.6,
      top_p: cfg.topP,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    };
  }
  const b = {
    model: cfg.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature: cfg.temperature ?? 0.6,
    max_tokens: cfg.maxTokens || 800,
    top_p: cfg.topP
  };
  if (cfg.responseFormat === 'json') b.response_format = { type: 'json_object' };
  return b;
}

function extractResponseText(cfg, json) {
  if (cfg.responsePath) return getByPath(json, cfg.responsePath);
  const fmt = cfg.requestFormat || (cfg.provider === 'anthropic' ? 'anthropic' : 'openai');
  if (fmt === 'anthropic') return json.content?.[0]?.text || '';
  return json.choices?.[0]?.message?.content || json.output?.text
      || json.message?.content || json.result || '';
}
function getByPath(obj, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((a,k) => (a == null ? a : a[k]), obj);
}
export function parseJsonLoose(text) {
  if (!text) throw new Error('空响应');
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const m = s.match(/\{[\s\S]*\}/) || s.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('响应中未找到 JSON: ' + s.slice(0, 120));
  return JSON.parse(m[0]);
}

// ============ 通用询问：所有 AI 决策都走这里 ============
// req: { kind, prompt, options?, extra? }
// 返回：API 响应解析后的 JSON（结构由 kind 约定）
export async function apiAsk(p, req) {
  if (!p || !isApiSeat(p)) return null;
  const st = ApiCfg.state;
  if (!st) return null;
  const sysMsg = buildSystemMessage(ApiCfg.config, playerCtx(st, p));
  const userMsg = JSON.stringify({
    kind: req.kind,
    prompt: req.prompt,
    ...(req.options ? { options: req.options } : {}),
    ...(req.extra || {}),
    state: snapshotState(st, p, req.stateExtra || {})
  });
  const txt = await callApi({ system: sysMsg, user: userMsg });
  return parseJsonLoose(txt);
}

// 带兜底：失败/超时/未接管 → fallback
export async function apiAskSafe(p, req, fallback) {
  if (!isApiSeat(p)) return fallback();
  try {
    const r = await apiAsk(p, req);
    if (r == null) return fallback();
    return r;
  } catch (e) {
    console.warn('[api-ai] ask failed:', e.message);
    ApiCfg.lastError = e.message;
    UI.toast?.(`AI 接口异常: ${e.message.slice(0, 60)}`, 'bad');
    return fallback();
  }
}

// ============ 状态快照 ============
export function snapshotState(st, p, extra = {}) {
  const you = serializePlayer(st, p, true);
  const others = st.alivePlayers().filter(x => x !== p).map(o => serializePlayer(st, o, false, p));
  const dead = st.players.filter(x => !x.alive).map(o => ({
    idx: o.idx, name: o.name, general: o.general.name,
    role: st.mode === 'identity' ? o.role : o.team
  }));
  return {
    turn: st.turnCount, round: st.round, phase: st.phase,
    mode: st.mode, modeText: st.mode === 'identity' ? `身份局 ${st.count}人` : (st.mode === '2v2' ? '2v2 团队战' : '3v3 团队战'),
    you, others, dead,
    deckCount: st.deck.length, discardCount: st.discard.length,
    logTail: st.logs.slice(-20).map(l => l.msg.replace(/<[^>]+>/g, '')),
    ...extra
  };
}
function serializePlayer(st, p, isSelf, viewer = null) {
  const s = {
    idx: p.idx, name: p.name, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
    general: p.general.name, fac: p.fac, gender: p.gender, chained: !!p.chained,
    handCount: p.hand.length,
    equips: Object.entries(p.equip).filter(([,v])=>v).map(([k,v]) => ({ slot:k, name:v.name, defId:v.defId, range: v.range })),
    judges: p.judges.map(j => j.defId),
    skills: p.skills.map(sk => ({ id: sk.id, name: sk.name, desc: sk.desc }))
  };
  if (viewer && viewer !== p) {
    const { distance } = engine;
    s.distanceFromYou = distance(st, viewer, p);
  }
  if (isSelf) {
    s.hand = p.hand.map(c => ({
      id: c.id, defId: c.defId, name: c.name, suit: c.suit, rank: c.rank,
      type: c.type, subtype: c.subtype || ''
    }));
    s.role = st.mode === 'identity' ? p.role : p.team;
    s.attackRange = p.attackRange();
    s.handLimit = p.handLimit();
  } else {
    if (st.mode !== 'identity' || !p.alive) s.role = st.mode === 'identity' ? p.role : p.team;
    else s.roleHidden = true;
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

// ============ 决策：出牌阶段 ============
async function apiPlayPhase(st, p) {
  const { useCard } = engine;
  let guard = 0;
  while (guard++ < 30 && !st.finished && p.alive && st.phase === 'play') {
    const options = buildPlayOptions(st, p);
    if (options.length === 0) break;   // 没牌可出
    const resp = await apiAskSafe(p, {
      kind: 'play',
      prompt: '现在是你的出牌阶段。请从 options 中选择一项行动；无可行动作则 action:"end"。',
      options
    }, () => ({ action: 'end' }));
    if (!resp || resp.action === 'end') break;
    if (resp.action === 'use' && resp.cardId) {
      const card = p.hand.find(c => c.id === resp.cardId);
      if (!card) continue;
      // 目标：从 targetIds（idx 数组）解析
      const targets = (resp.targetIds || [])
        .map(id => st.players.find(x => String(x.idx) === String(id) || x.id === id))
        .filter(Boolean);
      // 校验合法性
      const legal = legalTargetsFor(st, p, card);
      if (legal === null) continue;   // 该牌无法主动使用
      if (Array.isArray(legal)) {
        const legalSet = new Set(legal.map(x => x.idx));
        const filtered = targets.filter(t => legalSet.has(t.idx));
        if (filtered.length === 0) continue;
        try { await useCard(st, p, card, { targets: filtered }); }
        catch (e) { console.warn('[api-ai] useCard err', e); continue; }
        await UI.syncAll(st);
        continue;
      }
      // legal === undefined：默认自 target
      try { await useCard(st, p, card, { targets: targets.length ? targets : [p] }); }
      catch (e) { console.warn(e); continue; }
      await UI.syncAll(st);
      continue;
    }
    if (resp.action === 'skill' && resp.skillId) {
      // 让本地 bot 兜底处理主动技（苦肉、青囊、仁德、反间、义绝、天义、辕门、离间、制衡、突袭等）
      const ok = await runLocalActiveSkill(st, p, resp.skillId, resp);
      if (!ok) break;
      await UI.syncAll(st);
      continue;
    }
    break;
  }
  UI.endPlayPhase();
}

async function runLocalActiveSkill(st, p, skillId, resp) {
  // 借用本地 bot 的主动技处理（内部有 hasSkill/skillUseFlag 检查）
  const { botRunActiveSkill } = await import('../core/bot.js');
  return await botRunActiveSkill(st, p, skillId, resp?.targetIds || []);
}

function buildPlayOptions(st, p) {
  const out = [];
  // 所有手牌 × 合法目标
  p.hand.forEach(c => {
    const legal = legalTargetsFor(st, p, c);
    if (legal === null) return;   // 不能主动使用
    if (Array.isArray(legal)) {
      if (legal.length === 0) return;
      out.push({
        action: 'use', cardId: c.id, cardName: c.name, defId: c.defId,
        targetOptions: legal.map(t => ({ idx: t.idx, name: t.name }))
      });
    } else {
      // self target only
      out.push({ action: 'use', cardId: c.id, cardName: c.name, defId: c.defId, targetIds: [p.idx] });
    }
  });
  // 主动技
  p.skills.forEach(s => {
    if (s.type === 'active' && !p.skillUseFlag.has(s.id)) {
      out.push({ action: 'skill', skillId: s.id, skillName: s.name, desc: s.desc });
    }
  });
  out.push({ action: 'end', label: '结束出牌阶段' });
  return out;
}

function legalTargetsFor(st, p, c) {
  const { canAttack, distance } = engine;
  const isEnemy = x => areEnemies(st, p, x);
  const alive = st.alivePlayers();
  const others = alive.filter(x => x !== p);
  const defId = c.defId;
  switch (defId) {
    case 'sha': {
      if (p.mark.shaDisabled) return [];
      const used = p.turnData?.usedSha ? 1 : 0;
      const limit = (p.hasSkill('paoxiao') || p.equip.weapon?.defId === 'nuliang') ? Infinity : 1 + (p.mark.extraShaAllowed || 0);
      if (used >= limit) return [];
      return others.filter(x => canAttack(st, p, x) && !(x.hasSkill('kongcheng') && x.hand.length === 0));
    }
    case 'juedou':
      return others.filter(x => !(x.hasSkill('kongcheng') && x.hand.length === 0));
    case 'nanman':
    case 'wanjian':
      return others;
    case 'taoyuan':
    case 'wugu':
      return alive;
    case 'guohe':
    case 'zhiji':
      return others.filter(x => x.hand.length || Object.values(x.equip).some(Boolean));
    case 'shunshou':
      return others.filter(x => distance(st, p, x) <= 1 && (x.hand.length || Object.values(x.equip).some(Boolean)));
    case 'huogong':
      return others;
    case 'le':
    case 'bingliang':
      return others.filter(x => !x.judges.some(j => j.defId === defId));
    case 'shandian':
      return alive.some(x => x.judges.some(j => j.defId === 'shandian')) ? [] : [p];
    case 'tao':
      return p.hp < p.maxHp ? [p] : [];
    case 'jiu':
      return p.turnData?.usedSha ? [] : [p];
    case 'wuzhongseng':
      return [p];
    case 'tiesuo':
      return others;   // 也可选自己 — 我们放宽为 others + [p]
    case 'wuxie':
    case 'shan':
      return null;   // 不能主动使用
    default:
      if (c.type === 'equip') return [p];
      return [];
  }
}

// ============ 决策：响应牌（杀/闪/桃） ============
async function apiRespond(st, prompt) {
  const p = prompt.p;
  const kinds = prompt.kinds;
  const ctx = prompt.ctx || {};
  const eligible = p.hand.filter(c => kinds.includes(cardKindToPrompt(c, p, kinds)));
  const options = [
    { action: 'pass' },
    ...eligible.map(c => ({ action: 'play', cardId: c.id, cardName: c.name, suit: c.suit, rank: c.rank }))
  ];
  const resp = await apiAskSafe(p, {
    kind: 'respond',
    prompt: `你需要响应【${kinds.join('/')}】。来源：${ctx.source?.name||'无'}，目标：${ctx.target?.name||'无'}${ctx.isSelf?'（你自己）':''}，原因：${ctx.cause||'unknown'}。请从 options 选择。`,
    options,
    stateExtra: { pending: { kinds, sourceName: ctx.source?.name||null, targetName: ctx.target?.name||null, cause: ctx.cause||null, isSelf: !!ctx.isSelf } }
  }, () => ({ action: 'pass' }));
  if (resp && resp.action === 'play' && resp.cardId) {
    const c = p.hand.find(x => x.id === resp.cardId);
    if (c) return c;
  }
  return null;
}

function cardKindToPrompt(c, p, kinds) {
  if (kinds.includes('tao') && c.defId === 'tao') return 'tao';
  if (kinds.includes('tao') && p.hasSkill('jijiu') && (c.suit === 'h' || c.suit === 'd')) return 'tao';
  if (kinds.includes('shan') && c.defId === 'shan') return 'shan';
  if (kinds.includes('shan') && p.hasSkill('qingguo') && (c.suit === 's' || c.suit === 'c')) return 'shan';
  if (kinds.includes('shan') && p.hasSkill('longdan') && c.defId === 'sha') return 'shan';
  if (kinds.includes('sha') && c.defId === 'sha') return 'sha';
  if (kinds.includes('sha') && p.hasSkill('wusheng') && (c.suit === 'h' || c.suit === 'd')) return 'sha';
  if (kinds.includes('sha') && p.hasSkill('longdan') && c.defId === 'shan') return 'sha';
  if (kinds.includes('sha') && p.equip.weapon?.defId === 'zhangba' && p.hand.length >= 2) return 'sha';
  return '';
}

// ============ 决策：yes/no 类询问（触发技） ============
export async function apiYesNo(p, title, text) {
  if (!isApiSeat(p)) return false;
  const resp = await apiAskSafe(p, {
    kind: 'yesno',
    prompt: `${title}：${text}`,
    options: [{ action: 'yes' }, { action: 'no' }],
    extra: { skillName: title, questionText: text }
  }, () => ({ action: 'no' }));
  return !!(resp && (resp.action === 'yes' || resp.answer === true));
}

// ============ 决策：多选一 ============
export async function apiMultiChoice(p, title, choices) {
  if (!isApiSeat(p)) return choices[0];
  const resp = await apiAskSafe(p, {
    kind: 'choose',
    prompt: `${title}：从下列选项中选一个`,
    options: choices.map((c, i) => ({ index: i, label: c })),
    extra: { title }
  }, () => ({ choice: 0 }));
  const idx = typeof resp?.choice === 'number' ? resp.choice
            : typeof resp?.index === 'number' ? resp.index : 0;
  return choices[Math.max(0, Math.min(choices.length - 1, idx))];
}

// ============ 决策：从若干目标里挑 N 个 ============
export async function apiChooseTargets(p, title, candidates, min, max) {
  if (!isApiSeat(p) || candidates.length === 0) return null;
  const resp = await apiAskSafe(p, {
    kind: 'choose',
    prompt: `${title}：从候选里选 ${min}~${max} 人`,
    options: candidates.map(t => ({ idx: t.idx, name: t.name, hp: `${t.hp}/${t.maxHp}`, handCount: t.hand.length, fac: t.fac })),
    extra: { min, max, title }
  }, () => ({ choices: candidates.slice(0, Math.min(max, candidates.length)).map(t => t.idx) }));
  const picks = (resp?.choices || resp?.targetIds || (resp?.choice != null ? [resp.choice] : []))
    .map(id => candidates.find(t => String(t.idx) === String(id)))
    .filter(Boolean);
  if (picks.length === 0) return null;
  return picks.slice(0, max);
}

// ============ 决策：弃牌 ============
export function apiPickDiscardLocal(p, n) {
  // 兜底：不用 API 时本地启发式（同步返回，防止无限调用）
  if (!p.hand.length) return [];
  const score = c => {
    let s = 0;
    if (c.defId === 'sha') s += 3;
    if (c.defId === 'shan') s += 2;
    if (c.defId === 'tao') s -= 2;
    if (c.defId === 'jiu') s -= 1;
    if (c.defId === 'wuxie') s -= 2;
    if (c.type === 'equip') s -= 3;
    if (c.type === 'trick') s -= 1;
    return s;
  };
  return p.hand.slice().sort((a,b) => score(b) - score(a)).slice(0, n);
}
export async function apiPickDiscard(p, n) {
  if (!isApiSeat(p)) return apiPickDiscardLocal(p, n);
  const resp = await apiAskSafe(p, {
    kind: 'discard',
    prompt: `你必须弃置 ${n} 张手牌`
  }, () => ({ cardIds: apiPickDiscardLocal(p, n).map(c => c.id) }));
  const ids = resp?.cardIds || [];
  const picks = ids.map(id => p.hand.find(c => c.id === id)).filter(Boolean).slice(0, n);
  if (picks.length === 0) return apiPickDiscardLocal(p, n);
  return picks;
}

// ============ 决策：拼点 ============
export async function apiPickPinPoint(p) {
  if (!isApiSeat(p)) return p.hand.slice().sort((a,b) => b.rank - a.rank)[0];
  const resp = await apiAskSafe(p, {
    kind: 'pinpoint',
    prompt: '拼点：请从手牌中选一张（K最大，A最小，同点没赢）'
  }, () => ({ cardId: p.hand.slice().sort((a,b) => b.rank - a.rank)[0]?.id }));
  const c = p.hand.find(x => x.id === resp?.cardId);
  return c || p.hand.slice().sort((a,b) => b.rank - a.rank)[0];
}

// ============ 决策：五谷选牌 ============
export async function apiPickWuGu(p, pool) {
  if (!isApiSeat(p) || !pool.length) return pool[0];
  const resp = await apiAskSafe(p, {
    kind: 'wugu',
    prompt: '五谷丰登 — 从下列亮牌中选一张',
    options: pool.map(c => ({ cardId: c.id, name: c.name, defId: c.defId, suit: c.suit, rank: c.rank, type: c.type }))
  }, () => ({ cardId: pool[0].id }));
  return pool.find(c => c.id === resp?.cardId) || pool[0];
}

// ============ 决策：观星排列 ============
export async function apiChooseGuanxing(p, view) {
  if (!isApiSeat(p)) {
    const good = ['tao','sha','jiu','wuxie','wuzhongseng','shunshou','guohe','nuliang'];
    const top = view.filter(c => good.includes(c.defId) || c.type === 'equip');
    const bot = view.filter(c => !top.includes(c));
    return { top: top.length ? top : view.slice(0,1), bottom: bot.length ? bot : view.slice(1) };
  }
  const resp = await apiAskSafe(p, {
    kind: 'guanxing',
    prompt: '观星：请把这些牌分成"牌堆顶"和"牌堆底"两组（先手牌堆顶）',
    options: view.map(c => ({ cardId: c.id, name: c.name, defId: c.defId, suit: c.suit, rank: c.rank, type: c.type }))
  }, () => ({ top: view.map(c => c.id), bottom: [] }));
  const pick = (arr) => (arr || []).map(id => view.find(c => c.id === id)).filter(Boolean);
  const top = pick(resp?.top), bot = pick(resp?.bottom || resp?.bot);
  const usedSet = new Set([...top, ...bot]);
  const rest = view.filter(c => !usedSet.has(c));
  return { top: top.length ? top : rest, bottom: bot.length ? bot : [] };
}

// ============ 决策：鬼才/鬼道（换判定牌） ============
export async function apiTryGuicai(p, currentCard, target, judgeName) {
  if (!isApiSeat(p) || !p.hand.length) return null;
  const resp = await apiAskSafe(p, {
    kind: 'choose',
    prompt: `【鬼才】${target.name} 正在判定【${judgeName}】，当前判定牌：${suitMark(currentCard.suit)}${currentCard.rank} ${currentCard.name}。你可以打出一张手牌替换它，或不替换。`,
    options: [{ action: 'pass' }, ...p.hand.map(c => ({ action:'play', cardId: c.id, cardName: c.name, suit: c.suit, rank: c.rank }))],
    extra: { skillName: '鬼才', targetIdx: target.idx, targetName: target.name, judgeName, currentCard: { suit: currentCard.suit, rank: currentCard.rank, name: currentCard.name } }
  }, () => ({ action: 'pass' }));
  if (resp?.action === 'play' && resp.cardId) return p.hand.find(c => c.id === resp.cardId);
  return null;
}
export async function apiTryGuidao(p, currentCard, target, judgeName) {
  if (!isApiSeat(p)) return null;
  const blacks = p.hand.filter(c => c.suit === 's' || c.suit === 'c');
  if (!blacks.length) return null;
  const resp = await apiAskSafe(p, {
    kind: 'choose',
    prompt: `【鬼道】${target.name} 正在判定【${judgeName}】，当前判定牌：${suitMark(currentCard.suit)}${currentCard.rank} ${currentCard.name}。你可以用一张黑色牌替换，或不替换。`,
    options: [{ action: 'pass' }, ...blacks.map(c => ({ action:'play', cardId: c.id, cardName: c.name, suit: c.suit, rank: c.rank }))],
    extra: { skillName: '鬼道', targetIdx: target.idx, targetName: target.name, judgeName, currentCard: { suit: currentCard.suit, rank: currentCard.rank, name: currentCard.name } }
  }, () => ({ action: 'pass' }));
  if (resp?.action === 'play' && resp.cardId) return blacks.find(c => c.id === resp.cardId);
  return null;
}
function suitMark(s) { return { s:'♠', h:'♥', c:'♣', d:'♦' }[s] || '?'; }

// ============ 决策：无懈可击是否使用 ============
export async function apiShouldUseWuxie(p, defId, source, target) {
  if (!isApiSeat(p)) return false;
  const resp = await apiAskSafe(p, {
    kind: 'yesno',
    prompt: `【无懈可击】${source?.name||'?'} 对 ${target.name} 使用了锦囊【${defNameOf(defId)}】。是否使用【无懈可击】抵消它对 ${target.name} 的效果？`,
    options: [{action:'yes'},{action:'no'}],
    extra: { skillName: '无懈可击', trickDefId: defId, sourceName: source?.name, targetName: target.name }
  }, () => ({ action: 'no' }));
  return !!(resp && (resp.action === 'yes' || resp.answer === true));
}
function defNameOf(id) { return id; }

// ============ 决策：天香转移 ============
export async function apiTianxiang(p, dmgCtx) {
  if (!isApiSeat(p)) return null;
  const st = ApiCfg.state;
  const cands = st.alivePlayers().filter(x => x !== p);
  if (!cands.length) return null;
  const resp = await apiAskSafe(p, {
    kind: 'choose',
    prompt: `【天香】你受到 ${dmgCtx.amount} 点${dmgCtx.type==='fire'?'火焰':dmgCtx.type==='thunder'?'雷电':''}伤害，是否弃一张红桃牌将其转移给一名角色？`,
    options: [{ action: 'pass' }, ...cands.map(x => ({ action: 'transfer', targetIdx: x.idx, name: x.name, hp: `${x.hp}/${x.maxHp}` }))],
    extra: { skillName: '天香', damageAmount: dmgCtx.amount, damageType: dmgCtx.type, sourceName: dmgCtx.src?.name }
  }, () => ({ action: 'pass' }));
  if (resp?.action === 'transfer' && resp.targetIdx != null) {
    return cands.find(x => String(x.idx) === String(resp.targetIdx)) || null;
  }
  return null;
}

// ============ 安装：接管本地 AI + UI 询问 ============
let _localRespondBackup = null;
let _localPlayPhaseBackup = null;
let _localPickDiscardBackup = null;
let _localPickPinPointBackup = null;
let _localPickWuGuBackup = null;
let _localGuanxingBackup = null;
let _localAskYesNoBackup = null;
let _localAskMultiBackup = null;
let _localTryGuicaiBackup = null;
let _localTryGuidaoBackup = null;
let _localShouldWuxieBackup = null;
let _localTianxiangBackup = null;

export function installApiAI(state) {
  ApiCfg.state = state;
  // 本地 AI 备份
  _localRespondBackup = AI.respond;
  _localPlayPhaseBackup = AI.decidePlayPhase;
  _localPickDiscardBackup = AI.pickDiscard;
  _localPickPinPointBackup = AI.pickPinPointCard;
  _localPickWuGuBackup = AI.pickFromWuGu;
  _localGuanxingBackup = AI.chooseGuanxing;
  _localTryGuicaiBackup = AI.tryGuicai;
  _localTryGuidaoBackup = AI.tryGuidao;
  _localShouldWuxieBackup = AI.shouldUseWuxie;
  _localTianxiangBackup = AI.shouldUseTianxiang;

  AI.respond = async (st, prompt) => {
    if (isApiSeat(prompt.p)) return await apiRespond(st, prompt);
    return _localRespondBackup(st, prompt);
  };
  AI.decidePlayPhase = async (st, p) => {
    if (isApiSeat(p)) return await apiPlayPhase(st, p);
    return _localPlayPhaseBackup(st, p);
  };
  AI.pickDiscard = (st, p, n) => {
    // UI.chooseDiscard 是异步的；此处同步兜底（异步版本在下面 installAskHooks 中替换）
    return apiPickDiscardLocal(p, n);
  };
  AI.pickPinPointCard = async (st, p) => {
    if (isApiSeat(p)) return await apiPickPinPoint(p);
    return _localPickPinPointBackup(st, p);
  };
  AI.pickFromWuGu = async (st, p, pool) => {
    if (isApiSeat(p)) return await apiPickWuGu(p, pool);
    return _localPickWuGuBackup(st, p, pool);
  };
  AI.chooseGuanxing = async (st, p, view) => {
    if (isApiSeat(p)) return await apiChooseGuanxing(p, view);
    return _localGuanxingBackup(st, p, view);
  };
  AI.tryGuicai = async (st, p, curCard, target, judgeName) => {
    if (isApiSeat(p)) return await apiTryGuicai(p, curCard, target, judgeName);
    return _localTryGuicaiBackup(st, p, curCard, target, judgeName);
  };
  AI.tryGuidao = async (st, p, curCard, target, judgeName) => {
    if (isApiSeat(p)) return await apiTryGuidao(p, curCard, target, judgeName);
    return _localTryGuidaoBackup(st, p, curCard, target, judgeName);
  };
  AI.shouldUseWuxie = async (st, p, defId, source, target) => {
    if (isApiSeat(p)) return await apiShouldUseWuxie(p, defId, source, target);
    return _localShouldWuxieBackup(st, p, defId, source, target);
  };
  AI.shouldUseTianxiang = async (st, p, ctx) => {
    if (isApiSeat(p)) return !!(await apiTianxiang(p, ctx));
    return _localTianxiangBackup(st, p, ctx);
  };

  installAskHooks(state);
}

// API 接管 UI 端的 ask*（askYesNo / askMultiChoice / chooseDiscard / chooseTargets 等）
function installAskHooks(state) {
  if (!_localAskYesNoBackup) _localAskYesNoBackup = UI.askYesNo;
  if (!_localAskMultiBackup) _localAskMultiBackup = UI.askMultiChoice;
  UI.askYesNo = async (p, title, text) => {
    if (isApiSeat(p)) return await apiYesNo(p, title, text);
    return _localAskYesNoBackup(p, title, text);
  };
  UI.askMultiChoice = async (p, title, choices) => {
    if (isApiSeat(p)) return await apiMultiChoice(p, title, choices);
    return _localAskMultiBackup(p, title, choices);
  };
  // chooseDiscard：View 内部对非 human 玩家调用 AI.pickDiscard，已经接管
  // chooseTargets：View 内部对非 human 玩家调用 AI.decideTargets；这里追加 API 支持
  if (!UI._chooseTargetsBackup) UI._chooseTargetsBackup = UI.chooseTargets;
  UI.chooseTargets = async (p, cands, opts = {}) => {
    if (isApiSeat(p)) {
      const r = await apiChooseTargets(p, opts.title || '选择目标', cands, opts.min ?? 1, opts.max ?? 1);
      return r;
    }
    return UI._chooseTargetsBackup(p, cands, opts);
  };
}
