// 主入口 — 菜单交互 / 开局流程 / 选身份 / 选武将 / 启动游戏
import { CARD_LIST, CARD_DEFS, buildDeck } from './data/cards.js';
import { GENERALS, genOf, FAC_COLOR } from './data/generals.js';
import { GameState, Player, assignRoles, areEnemies, areAllies } from './core/state.js';
import { installAI } from './core/bot.js';
import { Skills } from './core/skills.js';
import { Turn } from './core/turn.js';
import { draw, addToDiscard } from './core/state.js';
import { View, openModal, closeModal } from './ui/render.js';
import { generalPortrait, cardArt } from './ui/portraits.js';
import { bindGlobalEvents } from './ui/render.js';
import { openApiCfgModal } from './ui/qr.js';
import { ApiCfg, loadConfig, setConfig, installApiAI } from './ai/api-bot.js';
import { Mobile } from './ui/mobile.js';

// ============ 菜单交互 ============
const tabs = $$('#menu-tabs .tab');
const panels = $$('.panel');
let menuOpt = {
  name: '无名',
  mode: 'identity',
  count: 6,
  diff: 'normal',
  sound: true,
  fast: false,
  tutor: true,
  useApi: false
};

function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function $(sel) { return document.querySelector(sel); }

tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  panels.forEach(p => p.classList.toggle('active', p.dataset.panel === t.dataset.tab));
}));

$('#opt-name').addEventListener('input', e => menuOpt.name = e.target.value || '无名');

function bindSeg(id, cb) {
  const box = document.getElementById(id);
  box.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      box.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cb(b.dataset.v);
    });
  });
}
bindSeg('opt-mode', v => {
  menuOpt.mode = v;
  // 2v2 必须 4 人；3v3 必须 6 人
  if (v === '2v2') { forceCount(4); }
  else if (v === '3v3') { forceCount(6); }
  else if (v === 'identity') { /* 保持 */ }
  updateModeDesc();
});
bindSeg('opt-count', v => menuOpt.count = parseInt(v));
bindSeg('opt-diff', v => menuOpt.diff = v);
$('#opt-sound').addEventListener('change', e => menuOpt.sound = e.target.checked);
$('#opt-fast').addEventListener('change', e => menuOpt.fast = e.target.checked);
$('#opt-tutor').addEventListener('change', e => menuOpt.tutor = e.target.checked);
$('#opt-useapi').addEventListener('change', e => {
  menuOpt.useApi = e.target.checked;
  updateApiStatus();
});
$('#btn-api-cfg').addEventListener('click', () => {
  openApiCfgModal(cfg => {
    updateApiStatus();
    // 保存后自动勾选
    if (cfg) { $('#opt-useapi').checked = true; menuOpt.useApi = true; }
  });
});
function updateApiStatus() {
  const cfg = loadConfig();
  const el = $('#api-cfg-status');
  if (!el) return;
  if (cfg) {
    const seat = cfg.seat || {};
    const mode = seat.mode || 'replace-all';
    const modeCN = { 'replace-all': '全AI', 'replace-one': '单座位', 'assist': '辅助我' }[mode] || mode;
    const proxy = cfg.corsProxy === '' || cfg.corsProxy === null ? '直连' : (cfg.corsProxy || 'corsproxy.io');
    el.innerHTML = `<span style="color:#a8dc9b;">✓ ${escapeFn(cfg.name||'未命名')}</span> · ${escapeFn(cfg.model||'')} · <span title="座位模式">${modeCN}</span> · <span title="CORS 代理">${proxy}</span>`;
  } else el.innerHTML = `<span style="color:#8d7c5a;">未配置</span>`;
}
function escapeFn(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
loadConfig();
updateApiStatus();

// 手机端初始化：横屏引导 + 全屏（防抛异常影响主流程）
try { Mobile.init(); } catch (e) { console.warn('[mobile] init failed', e); }

function forceCount(n) {
  menuOpt.count = n;
  const box = document.getElementById('opt-count');
  box.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', parseInt(b.dataset.v) === n);
    b.disabled = parseInt(b.dataset.v) !== n;
  });
  $('#opt-count-tip').textContent = `（${n} 人固定）`;
}
function updateModeDesc() {
  const box = $('#mode-desc');
  const d = {
    identity: `身份局：<b>${menuOpt.count}</b> 人。每人随机身份（主公/忠臣/反贼/内奸），主公亮明。所有玩家互相博弈，最后达成胜利条件者获胜。适合喜欢推理与伪装的玩家。`,
    '2v2': `2v2 团队战：4 位玩家分成两队（红 A / 蓝 B），交错就座。击杀敌方全体即胜。节奏快、无身份伪装。`,
    '3v3': `3v3 团队战：6 位玩家分成两队（红 A / 蓝 B），交错就座。击杀敌方全体即胜。规模适中、讲究配合。`
  };
  box.innerHTML = d[menuOpt.mode] || '';
  // 人数限制
  if (menuOpt.mode === '2v2') forceCount(4);
  else if (menuOpt.mode === '3v3') forceCount(6);
  else {
    $('#opt-count').querySelectorAll('button').forEach(b => b.disabled = false);
    $('#opt-count-tip').textContent = '';
  }
}
$('#btn-start').addEventListener('click', () => startGame());
$('#btn-quick').addEventListener('click', () => {
  menuOpt.mode = ['identity','2v2','3v3'][Math.floor(Math.random()*3)];
  forceCount(menuOpt.mode === '2v2' ? 4 : menuOpt.mode === '3v3' ? 6 : [4,5,6,7,8][Math.floor(Math.random()*5)]);
  startGame();
});
$('#btn-again').addEventListener('click', () => startGame());
$('#btn-home').addEventListener('click', () => gotoMenu());
updateModeDesc();

// ============ 图鉴渲染 ============
function renderGenerals(filter = 'all', search = '') {
  const grid = $('#gen-grid');
  grid.innerHTML = '';
  GENERALS.forEach(g => {
    if (filter !== 'all' && g.fac !== filter) return;
    if (search) {
      const s = search.toLowerCase();
      const hit = g.name.toLowerCase().includes(s) || g.title.toLowerCase().includes(s)
        || g.skills.some(sk => sk.name.toLowerCase().includes(s) || sk.desc.toLowerCase().includes(s));
      if (!hit) return;
    }
    const el = document.createElement('div');
    el.className = 'gen-card';
    el.innerHTML = `
      <div class="gc-top">
        <div class="gc-port">${generalPortrait(g)}</div>
        <div class="gc-info">
          <div class="gc-name">${g.name}</div>
          <div class="gc-fac f-${(g.fac==='魏'?'wei':g.fac==='蜀'?'shu':g.fac==='吴'?'wu':'qun')}">${g.fac}</div>
          <div class="gc-hp">${g.hp} 体力</div>
          <div class="gc-skills">${g.skills.map(s => `<b style="color:#d8c69a;">${s.name}</b>${s.tag==='lord'?' <span style="color:#c9a24a;">主</span>':''}`).join('　')}</div>
        </div>
      </div>
    `;
    el.onclick = () => showGenDetail(g);
    grid.appendChild(el);
  });
}
function showGenDetail(g) {
  openModal({
    title: `${g.title} · ${g.name}`,
    body: `<div style="display:flex;gap:16px;">
      <div style="width:150px;height:190px;border:1px solid #c9a24a;">${generalPortrait(g)}</div>
      <div style="flex:1;">
        <div style="font-size:24px;font-family:KaiTi,STKaiti,serif;color:#f5dfa3;letter-spacing:6px;">${g.name}</div>
        <div style="color:#c8b68c;font-size:13px;margin-top:4px;letter-spacing:2px;">${g.fac} · ${g.gender === 'M' ? '男' : '女'} · ${g.hp}体力 · ${g.title}</div>
        <div style="margin-top:14px;">
          ${g.skills.map(s => `<div style="margin:10px 0;background:rgba(0,0,0,.28);border-left:3px solid #c9a24a;padding:8px 10px;">
            <div style="color:#f5dfa3;font-size:15px;letter-spacing:2px;"><b>【${s.name}】</b>${s.tag==='lord'?' <span style="font-size:11px;color:#c9a24a;">主公技</span>':''}
            </div>
            <div style="color:#d8c69a;font-size:12px;line-height:1.7;margin-top:4px;">${s.desc}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`,
    hideFooter: true
  });
}
$('#gen-filter').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  $('#gen-filter').querySelectorAll('button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  renderGenerals(b.dataset.fac, $('#gen-search').value);
}));
$('#gen-search').addEventListener('input', e => {
  const cur = $('#gen-filter button.on').dataset.fac;
  renderGenerals(cur, e.target.value);
});

// 更新计数
const gc = GENERALS.reduce((a,g) => { a[g.fac]=(a[g.fac]||0)+1; return a; }, {});
$('#c-all').textContent = GENERALS.length;
$('#c-wei').textContent = gc['魏']||0;
$('#c-shu').textContent = gc['蜀']||0;
$('#c-wu').textContent = gc['吴']||0;
$('#c-qun').textContent = gc['群']||0;
renderGenerals('all', '');

// ============ 卡牌图鉴 ============
function renderCards(filter = 'all') {
  const grid = $('#card-grid');
  grid.innerHTML = '';
  const groups = {};
  CARD_LIST.forEach(c => {
    const key = c.defId;
    if (!groups[key]) groups[key] = { def: c, count: 0, suits: {} };
    groups[key].count++;
    groups[key].suits[c.suit+c.rank] = (groups[key].suits[c.suit+c.rank]||0) + 1;
  });
  Object.values(groups).forEach(g => {
    const c = g.def;
    if (filter !== 'all' && filter !== c.type) return;
    const el = document.createElement('div');
    el.className = 'card-cell';
    el.innerHTML = `<div class="catalog-card">
      <div style="display:flex;gap:8px;">
        <div style="width:64px;height:90px;flex-shrink:0;border:1px solid #8a6a25;border-radius:6px;background:linear-gradient(180deg,#f7ecd0,#d9c69a);position:relative;overflow:hidden;">
          ${cardArt(c.defId)}
          <div style="position:absolute;left:0;right:0;bottom:6px;text-align:center;font-family:KaiTi,STKaiti,serif;font-size:11px;color:#3a2410;letter-spacing:1px;font-weight:700;">${c.name}</div>
        </div>
        <div style="flex:1;">
          <h4>${c.name}<span class="num">× ${g.count}</span></h4>
          <div style="font-size:11px;color:#8a6a25;letter-spacing:1px;">${typeOf(c)}</div>
          <p style="margin-top:6px;">${c.desc || ''}</p>
        </div>
      </div>
    </div>`;
    grid.appendChild(el);
  });
}
function typeOf(c) {
  if (c.type === 'basic') return '基本牌';
  if (c.type === 'trick') return c.subtype === 'delay' ? '延时锦囊' : '普通锦囊';
  if (c.type === 'equip') return { weapon:'武器', armor:'防具', horseA:'进攻马', horseD:'防御马' }[c.subtype] || '装备';
  return c.type;
}
$('#card-filter').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  $('#card-filter').querySelectorAll('button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  renderCards(b.dataset.t);
}));
renderCards('all');

// ============ 规则手册 ============
// (RULES_FULL 定义在下面，先声明再赋值)

const RULES_FULL = `
<h3>一、游戏概述</h3>
<p>三国杀·重制版 · 适配 4~8 人 · 30~60 分钟。核心机制：身份局、回合流程、体力/手牌、基本牌体系。</p>

<h3>二、身份配置</h3>
<table>
<tr><th>人数</th><th>主公</th><th>忠臣</th><th>反贼</th><th>内奸</th></tr>
<tr><td>4</td><td>1</td><td>1</td><td>1</td><td>1</td></tr>
<tr><td>5</td><td>1</td><td>1</td><td>2</td><td>1</td></tr>
<tr><td>6</td><td>1</td><td>1</td><td>3</td><td>1</td></tr>
<tr><td>7</td><td>1</td><td>2</td><td>3</td><td>1</td></tr>
<tr><td>8</td><td>1</td><td>2</td><td>4</td><td>1</td></tr>
</table>

<h3>三、胜利条件</h3>
<ul>
<li><b>主公</b>：消灭所有反贼和内奸</li>
<li><b>忠臣</b>：保护主公，与主公共同胜利</li>
<li><b>反贼</b>：杀死主公</li>
<li><b>内奸</b>：最后只剩自己与主公，且杀死主公</li>
</ul>

<h3>四、回合流程</h3>
<ol>
<li><b>判定阶段</b>：处理延时锦囊（乐不思蜀 / 闪电 / 兵粮寸断）</li>
<li><b>摸牌阶段</b>：从牌堆顶摸 2 张</li>
<li><b>出牌阶段</b>：使用手牌（默认【杀】每回合限 1 张）</li>
<li><b>弃牌阶段</b>：弃至体力值（手牌上限 = 当前体力）</li>
<li><b>结束阶段</b>：闭月 / 崩坏 等技能结算</li>
</ol>

<h3>五、基本概念</h3>
<ul>
<li>体力降至 0 进入濒死，需他人使用【桃】救回（每回复1点需1张桃）</li>
<li>距离：相邻为 1，每装备一匹马 ±1</li>
<li>攻击范围：默认 1，装备武器增加</li>
<li>手牌上限 = 当前体力值（受技能/装备微调）</li>
</ul>

<h3>六、卡牌体系（共 126 张）</h3>
<table>
<tr><th>类别</th><th>数量</th><th>说明</th></tr>
<tr><td>基本牌【杀闪桃酒】</td><td>58</td><td>杀×30、闪×16、桃×9、酒×3</td></tr>
<tr><td>锦囊牌</td><td>42</td><td>延时 6 + 普通 36</td></tr>
<tr><td>装备牌</td><td>26</td><td>武器 13 + 防具 5 + 坐骑 8</td></tr>
</table>

<h3>七、武将体系（共 32 名）</h3>
<p>魏 8 · 蜀 8 · 吴 8 · 群 8。每位武将 2~4 个技能，主公技需主公身份才能发动。</p>

<h3>八、属性伤害与铁索连环</h3>
<ul>
<li>普通伤害：【杀】【决斗】【南蛮】【万箭】</li>
<li>火焰伤害：【火攻】、【藤甲传导】</li>
<li>雷电伤害：【闪电】【雷击】</li>
<li>装备【藤甲】时：普通杀/南蛮/万箭对其无效；受火焰伤害+1</li>
<li>被【铁索连环】：受到属性伤害时所有连环角色同量承受，结算后解除</li>
</ul>

<h3>九、拼点规则</h3>
<ol>
<li>双方各扣一张手牌，同时亮出</li>
<li>点数：K > Q > J > 10 > ... > 2 > A</li>
<li>同点数算没赢</li>
<li>拼点的牌都弃置</li>
</ol>

<h3>十、游戏准备</h3>
<ol>
<li>分发身份牌；主公亮明身份</li>
<li>每人从随机 3 张候选中选 1 位武将</li>
<li>主公可选用主公武将并获得额外 +1 体力</li>
<li>分发体力标记</li>
<li>洗牌堆，每人发 4 张起始手牌</li>
<li>随机决定先手；身份局默认从主公开始顺时针</li>
</ol>

<h3>十一、平衡性说明</h3>
<p>本改版保持身份博弈、回合制对抗、手牌管理三大核心体验不变；通过扩充武将数量、增加卡牌种类、深化技能联动，提升游戏深度与重开性。</p>
`;
$('#rules-body').innerHTML = RULES_FULL;

// ============ 开局流程 ============
async function startGame() {
  const st = new GameState({
    mode: menuOpt.mode,
    count: menuOpt.count,
    difficulty: menuOpt.diff
  });
  // 分配身份 / 队伍
  const roles = assignRoles(menuOpt.mode, menuOpt.count);
  // 主公固定在第 0 位（身份局）；团队模式玩家固定在第 0 位
  if (menuOpt.mode === 'identity') {
    // 玩家是主公吗？随机
    const lordPos = Math.floor(Math.random() * menuOpt.count);
    // 交换玩家位置和主公位置：玩家总在 0 号
    const t = roles[0]; roles[0] = roles[lordPos]; roles[lordPos] = t;
  }
  // 构建玩家
  const names = buildNames(menuOpt.count, menuOpt.name);
  // 随机武将池
  const pool = GENERALS.slice();
  shuffle(pool);
  // 主公必须选主公武将
  const candidates = [];
  for (let i = 0; i < menuOpt.count; i++) {
    const role = roles[i];
    if (i === 0 && role === '主') {
      // 主公候选：从有 lordSkill 的武将中挑 3 个
      const lords = GENERALS.filter(g => g.lordSkill);
      shuffle(lords);
      candidates.push(lords.slice(0, 3));
    } else {
      candidates.push(pool.slice(i*3, i*3+3));
      // 保证每人有 3 个
      while (candidates[i].length < 3) candidates[i].push(pool[candidates[i].length]);
    }
  }
  // 询问玩家选武将（第 0 位 = 玩家）
  const chosen = await askPickGeneral(candidates[0], menuOpt.mode === 'identity' && roles[0] === '主');
  // AI 选武将
  const aiChosen = [];
  for (let i = 1; i < menuOpt.count; i++) aiChosen[i] = candidates[i][Math.floor(Math.random() * candidates[i].length)];
  // 构建 Player
  for (let i = 0; i < menuOpt.count; i++) {
    const gen = i === 0 ? chosen : aiChosen[i];
    let pname;
    if (i === 0) pname = menuOpt.name;
    else {
      // AI 名字：随机前缀 + 武将名（避免误导玩家）
      const prefixes = ['老', '小', '大', '少', '狂', '智', '勇', '神'];
      pname = pickOne(prefixes) + gen.name;
    }
    const p = new Player({
      idx: i,
      name: pname,
      isHuman: i === 0,
      general: gen,
      role: menuOpt.mode === 'identity' ? roles[i] : (i % 2 === 0 ? 'A' : 'B'),
      team: menuOpt.mode === 'identity' ? null : (i % 2 === 0 ? 'A' : 'B')
    });
    // 主公武将 +1 体力
    if (menuOpt.mode === 'identity' && roles[i] === '主') {
      p.hp += 1; p.maxHp += 1;
    }
    st.players.push(p);
  }
  // 洗牌堆
  st.deck = buildDeck();
  // 起始手牌
  st.players.forEach(p => {
    const cards = draw(st, 4);
    p.hand.push(...cards);
  });
  st.log('牌堆已洗，每人摸 4 张起始手牌。', 'hdr');
  // 安装 AI / 技能钩子
  installAI(st);
  Skills.installAll(st);
  // API AI — 如果开启且有配置：默认接管所有 AI 座位
  if (menuOpt.useApi && ApiCfg.config) {
    const seat = ApiCfg.config.seat || {};
    const mode = seat.mode || 'replace-all';
    ApiCfg.boundSeats.clear();
    if (mode === 'replace-one') {
      const idxWanted = seat.index >= 0 ? seat.index : -1;
      const candidates = st.players.filter(p => !p.isHuman);
      if (idxWanted >= 0 && candidates.some(p => p.idx === idxWanted)) ApiCfg.boundSeats.add(idxWanted);
      else if (candidates.length) ApiCfg.boundSeats.add(candidates[Math.floor(Math.random() * candidates.length)].idx);
    } else if (mode === 'assist') {
      st.players.forEach(p => { if (p.isHuman) ApiCfg.boundSeats.add(p.idx); });
    } else {
      // replace-all（默认）：所有非人类座位都走同一 API
      st.players.forEach(p => { if (!p.isHuman) ApiCfg.boundSeats.add(p.idx); });
    }
    installApiAI(st);
    const names = [...ApiCfg.boundSeats].map(i => st.players[i]?.name).filter(Boolean);
    st.log(`【API AI】接管 ${names.length} 个座位：${names.join('、') || '（无）'}`, 'hdr');
    if (ApiCfg.config.corsProxy !== '' && ApiCfg.config.corsProxy !== null && ApiCfg.config.corsProxy !== undefined) {
      st.log(`【API】经 CORS 代理：${ApiCfg.config.corsProxy}`, 'hdr');
    }
  }
  // 左慈化身：随机 2 个技能
  st.players.forEach(p => {
    if (p.hasSkill('huashen')) {
      const others = GENERALS.filter(g => g.id !== p.id && g.id !== 'zuoci');
      shuffle(others);
      const [g1, g2] = others.slice(0, 2);
      const s1 = g1.skills[0], s2 = g2.skills[0];
      p.skills.push({ ...s1, id: 'hs_' + s1.id, tag: 'avatar', desc: `【化身 · ${g1.name}】${s1.desc}` });
      p.skills.push({ ...s2, id: 'hs_' + s2.id, tag: 'avatar', desc: `【化身 · ${g2.name}】${s2.desc}` });
      st.log(`<b>${p.name}</b>【化身】获得 <b>${g1.name}·${s1.name}</b> 与 <b>${g2.name}·${s2.name}</b>`);
    }
  });
  // 进入界面
  View.mount(st, st.players[0]);
  bindGlobalEvents();
  // 展示身份
  await showRoleIntro(st);
  // 开始
  View.toast('游戏开始！', 'good');
  Turn.begin(st);
}

function buildNames(n, selfName) {
  const pool = ['张昭','周瑜','鲁肃','赵云','貂蝉','吕布','华佗','董卓','袁绍','颜良','文丑','孙尚香','夏侯渊','黄忠','张辽','郭嘉','甄姬','刘备','关羽','张飞','诸葛亮','马超','黄盖','大乔','小乔','太史慈','吕蒙','甘宁','左慈','张角','司马懿','曹操','夏侯惇','许褚'];
  shuffle(pool);
  const names = [selfName];
  for (let i = 1; i < n; i++) names.push(pool[i]);
  return names;
}
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function askPickGeneral(cands, isLord) {
  return new Promise(resolve => {
    let pickedIdx = 0;
    openModal({
      title: isLord ? '主公选将' : '选择你的武将',
      body: `<p>你的候选武将（点击选择，双击展开技能详情）：</p><div class="gen-pick" id="pick-slot"></div>`,
      confirmText: '选他出战',
      onConfirm: () => {
        resolve(cands[pickedIdx]);
      },
      onMount: () => {
        const slot = document.getElementById('pick-slot');
        cands.forEach((g, i) => {
          const el = document.createElement('div');
          el.className = 'gen-pick-item' + (i === 0 ? ' picked' : '');
          el.dataset.idx = i;
          el.innerHTML = `<div class="gpi-port">${generalPortrait(g)}</div>
            <div class="gpi-name">${g.name}</div>
            <div class="gpi-fac f-${g.fac==='魏'?'wei':g.fac==='蜀'?'shu':g.fac==='吴'?'wu':'qun'}">${g.fac}</div>
            <div class="gpi-hp">${g.hp} 体力${isLord && g.lordSkill ? ' · 主公 +1' : ''}</div>
            <div class="skill-detail">${g.skills.map(s => `<div><b>【${s.name}】</b>${s.desc}</div>`).join('')}</div>`;
          el.onclick = () => {
            slot.querySelectorAll('.gen-pick-item').forEach(x => x.classList.remove('picked'));
            el.classList.add('picked');
            pickedIdx = i;
          };
          el.ondblclick = () => { el.classList.toggle('expanded'); };
          slot.appendChild(el);
        });
      }
    });
  });
}

async function showRoleIntro(st) {
  const p = st.players[0];
  const mode = st.mode;
  const self = p;
  const info = mode === 'identity'
    ? `你的身份：<b>${{主:'主公',忠:'忠臣',反:'反贼',内:'内奸'}[self.role]}</b><br/>
       ${self.role === '主' ? '亮明身份！所有反贼与内奸会针对你。' :
         self.role === '忠' ? '与主公并肩作战，消灭反贼和内奸。' :
         self.role === '反' ? '与其他反贼配合，杀死主公即胜。' :
         '隐藏自己，杀光所有人后独自面对主公。'}`
    : `你的队伍：<b>${self.team === 'A' ? '红队 A' : '蓝队 B'}</b><br/>
       敌方队伍：<b>${self.team === 'A' ? '蓝队 B' : '红队 A'}</b>，击杀对方全部成员即胜。`;
  return new Promise(resolve => {
    openModal({
      title: '身份揭晓',
      body: `<div style="text-align:center;">
        <div style="width:140px;height:180px;margin:0 auto 12px;border:1px solid #c9a24a;">${generalPortrait(self.general)}</div>
        <div style="font-size:20px;font-family:KaiTi,STKaiti,serif;color:#f5dfa3;letter-spacing:4px;">${self.name} · ${self.general.name}</div>
        <div style="color:#c8b68c;font-size:13px;margin-top:4px;">${self.general.title} · ${self.general.fac} · ${self.general.hp}体力</div>
        <div style="margin-top:14px;color:#d8c69a;font-size:14px;line-height:1.8;">${info}</div>
        <div style="margin-top:14px;color:#c8b68c;font-size:12px;">技能：${self.skills.map(s => `【${s.name}】`).join(' ')}</div>
      </div>`,
      hideFooter: false,
      confirmText: '开始游戏',
      cancelText: '再来一次',
      onConfirm: resolve,
      onCancel: resolve
    });
  });
}

export function gotoMenu() {
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-result').classList.remove('active');
  document.getElementById('screen-menu').classList.add('active');
}
