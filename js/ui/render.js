// UI 主控 — 渲染座位 / 手牌 / 中央 / 日志 / 弹窗
import { UI } from '../core/ui-bridge.js';
import { buildCardEl, buildGeneralPortrait, buildCardBackEl } from './card-view.js';
import { generalPortrait, cardArt, equipGlyph } from './portraits.js';
import { SUIT_NAME, RANK_NAME, suitColor, CARD_DEFS } from '../data/cards.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// 运行时状态引用
let GS = null;     // GameState
let SELF = null;
let humanPromptResolver = null;
let endPlayResolver = null;

const modalStack = [];

export const View = {
  mount(state, selfPlayer) {
    GS = state;
    SELF = selfPlayer;
    document.getElementById('screen-game').classList.add('active');
    document.getElementById('screen-menu').classList.remove('active');
    this.buildSeats();
    this.refreshAll();
  },
  buildSeats() {
    const seats = document.getElementById('seats');
    seats.innerHTML = '';
    seats.className = 'seats seat-count-' + GS.players.length;
    const n = GS.players.length;
    // 座位索引 = (self 固定在 0 号位)
    const selfIdx = SELF.idx;
    GS.players.forEach(p => {
      const pos = (p.idx - selfIdx + n) % n;
      const el = document.createElement('div');
      el.className = 'seat-panel seat-pos-' + Math.min(pos, 7);
      el.id = 'seat-' + p.id;
      el.dataset.self = p.idx === selfIdx ? '1' : '0';
      seats.appendChild(el);
    });
    // 自己头像栏放在 handbar
    document.getElementById('you-general').innerHTML = '';
    const youG = buildGeneralPortrait(SELF.general, { big:false });
    document.getElementById('you-general').appendChild(youG);
    document.getElementById('you-name').textContent = SELF.name || SELF.general.name;
    document.getElementById('you-role').textContent = roleText(GS.mode, SELF);
  },
  refreshAll() {
    this.renderSeats();
    this.renderHand();
    this.renderCenter();
    this.renderLog();
  },
  renderSeats() {
    if (!GS || !SELF) return;
    const n = GS.players.length;
    const selfIdx = SELF.idx;
    GS.players.forEach(p => {
      const pos = (p.idx - selfIdx + n) % n;
      const el = document.getElementById('seat-' + p.id);
      if (!el) return;
      el.className = 'seat-panel seat-pos-' + Math.min(pos, 7);
      if (p.idx === selfIdx) el.dataset.self = '1';
      if (p.idx === GS.currentIdx && p.alive) el.classList.add('current');
      if (!p.alive) el.classList.add('dead');
      if (p.hp <= 0 && p.alive) el.classList.add('dying');
      if (p.chained) el.classList.add('chained');
      // 内部
      const roleBadge = GS.mode === 'identity'
        ? (p.idx === selfIdx || !p.alive ? `<span class="role-badge ${p.role === '主' ? 'lord' : p.role === '忠' ? 'loy' : p.role === '反' ? 'reb' : 'spy'}">${p.role}</span>` : '')
        : `<span class="role-badge ${p.team === 'A' ? 'team-a' : 'team-b'}">${p.team === 'A' ? '红队' : '蓝队'}</span>`;
      const hpDots = Array.from({length: p.maxHp}, (_,i) => `<span class="hp-dot${i < p.hp ? '' : ' lost'}"></span>`).join('');
      const equipHtml = ['weapon','armor','horseA','horseD'].map(k => {
        const c = p.equip[k];
        if (!c) return `<div class="equip-mini empty"></div>`;
        return `<div class="equip-mini" title="${c.name}"><div class="eq-art">${cardArt(c.defId)}</div><div class="eq-name">${c.name.length > 4 ? c.name.slice(0,3)+'..' : c.name}</div><div class="eq-kind">${k === 'weapon' ? '武器' : k === 'armor' ? '防具' : k === 'horseA' ? '进攻马' : '防御马'}</div></div>`;
      }).join('');
      const judges = p.judges.map(j => `<div class="sp-judge" title="${CARD_DEFS[j.defId]?.name}">${CARD_DEFS[j.defId]?.name?.[0] || '?'}</div>`).join('');
      const skillTags = p.skills.filter(s => s.tag === 'lord' || p.hasSkill(s.id)).map(s => `<span class="skill-tag" title="${s.desc}">${s.name}</span>`).join('');
      const chainedMark = p.chained ? `<span style="color:#8abfff;font-size:10px;">连</span>` : '';
      const wineMark = p.mark.wineNext ? `<span style="color:#f5dfa3;font-size:10px;">酒</span>` : '';
      el.innerHTML = `
        <div class="sp-port">${generalPortrait(p.general)}</div>
        <div class="sp-judges">${judges}</div>
        <div class="sp-name-row"><span>${p.name}</span>${roleBadge}${chainedMark}${wineMark}</div>
        <div class="sp-hp"><div class="hp-bar">${hpDots}</div><span class="hp-num">${p.hp}/${p.maxHp}</span></div>
        <div class="sp-meta">手牌 <span class="hand-n">${p.idx === selfIdx ? p.hand.length : '?'}</span> ${skillTags}</div>
        <div class="sp-equips">${equipHtml}</div>
        ${!p.alive ? '<div class="dead-mark"><span>死</span></div>' : ''}
      `;
      // 高亮：本回合武将
      el.onclick = () => { this.showGeneralInfo(p); };
    });
  },
  renderHand() {
    if (!GS || !SELF) return;
    const handEl = document.getElementById('hand');
    handEl.innerHTML = '';
    SELF.hand.forEach(card => {
      const slot = document.createElement('div');
      slot.className = 'hand-slot';
      slot.dataset.cid = card.id;
      const el = buildCardEl(card);
      slot.appendChild(el);
      slot.onclick = (e) => {
        e.stopPropagation();
        onHandCardClick(SELF, card, slot);
      };
      handEl.appendChild(slot);
    });
    document.getElementById('hand-num')?.remove();
    const limit = SELF.handLimit();
    const hc = document.querySelector('.hand-count');
    if (hc) hc.innerHTML = `<em id="hand-num">${SELF.hand.length}</em>/${limit}`;
    // 是否显示"结束出牌"按钮
    const inPlay = GS.phase === 'play' && GS.currentIdx === SELF.idx;
    document.getElementById('btn-endturn').classList.toggle('hidden', !inPlay);
  },
  renderCenter() {
    document.getElementById('deck-count').textContent = GS.deck.length;
    document.getElementById('discard-count').textContent = GS.discard.length;
    const used = document.getElementById('used-area');
    // used 内容由 showUsed 添加
  },
  renderLog() {
    const logEl = document.getElementById('log-body');
    logEl.innerHTML = GS.logs.slice(-400).map(l => `<div class="log-line ${l.kind || ''}">${l.msg}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  },
  showGeneralInfo(p) {
    openModal({
      title: `${p.general.title} · ${p.name}`,
      body: `<div style="display:flex;gap:14px;">
        <div style="width:110px;height:148px;border:1px solid #c9a24a;">${generalPortrait(p.general)}</div>
        <div style="flex:1;">
          <div style="font-family:KaiTi,STKaiti,serif;color:#f5dfa3;font-size:22px;letter-spacing:4px;">${p.general.name}</div>
          <div style="color:#c8b68c;font-size:13px;margin-top:4px;">${p.general.fac} · ${p.gender === 'M' ? '男' : '女'} · ${p.general.hp}体力</div>
          <div style="margin-top:10px;color:#d8c69a;font-size:12px;line-height:1.75;">
            ${p.skills.map(s => `<div style="margin:6px 0;"><b style="color:#f5dfa3;">【${s.name}】</b>${s.desc}</div>`).join('')}
          </div>
          <div style="margin-top:10px;color:#c8b68c;font-size:12px;">手牌数：${p.hand.length} · 距离：${GS.players.filter(x => x.alive && x !== p).map(x => `${x.name}=${distCalc(GS, p, x)}`).join(' ')}</div>
        </div>
      </div>`,
      hideFooter: true
    });
  },
  // ===== 交互钩子 =====
  async syncAll(st) {
    GS = st;
    this.renderAll();
  },
  renderAll() {
    this.renderSeats();
    this.renderHand();
    this.renderCenter();
    this.renderLog();
    document.getElementById('tb-round').textContent = `第 ${GS.round} 轮`;
    document.getElementById('tb-mode').textContent = modeText(GS);
    this.renderApiBadge();
  },
  renderApiBadge() {
    const badge = document.getElementById('api-badge');
    if (!badge) return;
    // 用全局引用（api-bot.js 里也 export 到 window 便于此处访问）
    const m = window.__sgsApiBot;
    if (m) {
      const cfg = m.ApiCfg.config;
      const seats = m.ApiCfg.boundSeats.size;
      if (!cfg || !seats) { badge.classList.add('hidden'); return; }
      badge.classList.remove('hidden');
      badge.classList.toggle('err', m.ApiCfg.errors > 0);
      badge.textContent = `API ${m.ApiCfg.calls}`;
      badge.title = `${cfg.name} · 接管 ${seats} 个座位 · 调用 ${m.ApiCfg.calls} 次 · 失败 ${m.ApiCfg.errors} 次${m.ApiCfg.lastError ? '\n最近错误：' + m.ApiCfg.lastError : ''}`;
      return;
    }
    import('../ai/api-bot.js').then(mod => {
      window.__sgsApiBot = mod;
      this.renderApiBadge();
    }).catch(() => {});
  },
  setPhase(phase, p) {
    if (!SELF) return;
    const map = { prepare:'准备阶段', judge:'判定阶段', draw:'摸牌阶段', play:'出牌阶段', discard:'弃牌阶段', end:'结束阶段', dying:'濒死', done:'结束' };
    const _ph = document.getElementById('tb-phase');
    if (_ph) _ph.textContent = (p ? p.name + ' · ' : '') + (map[phase] || phase);
    // 玩家出牌阶段需要"结束出牌"按钮
    if (GS) {
      const inPlay = phase === 'play' && GS.currentIdx === SELF.idx;
      document.getElementById('btn-endturn')?.classList.toggle('hidden', !inPlay);
    }
    // 每次阶段切换刷新一次
    this.renderHand();
    this.renderSeats();
  },
  setTurnCount(n, r) {
    document.getElementById('tb-round').textContent = `第 ${r || 1} 轮 · 回合 ${n}`;
  },
  setCurrentPlayer(p) {
    $$('.seat-panel').forEach(el => el.classList.remove('current'));
    const el = document.getElementById('seat-' + p.id);
    if (el) el.classList.add('current');
  },
  showUsed(st, p, card, targets) {
    const used = document.getElementById('used-area');
    used.innerHTML = '';
    const ann = document.createElement('div');
    ann.className = 'used-annotation';
    ann.textContent = targets && targets.length
      ? `${p.name} → ${targets.map(t => t.name).join('、')}`
      : `${p.name} 使用`;
    const el = buildCardEl(card);
    el.classList.add('card-pop');
    used.appendChild(ann);
    used.appendChild(el);
    setTimeout(() => { if (used.contains(el)) el.remove(); }, 2200);
  },
  showPlayed(st, p, card) {
    const used = document.getElementById('used-area');
    const el = buildCardEl(card);
    el.classList.add('card-pop');
    el.style.position = 'absolute';
    el.style.left = (Math.random() * 60 + 20) + 'px';
    used.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  },
  showDamage(target, amount, type) {
    const el = document.getElementById('seat-' + target.id);
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'dmg-float';
    if (type === 'fire') d.style.color = '#ff8a4a';
    if (type === 'thunder') d.style.color = '#8abfff';
    if (type === 'lose') d.style.color = '#c8b68c';
    d.textContent = '-' + amount;
    d.style.left = '40%';
    d.style.top = '30%';
    el.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  },
  showHeal(target, amount) {
    const el = document.getElementById('seat-' + target.id);
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'dmg-float heal';
    d.textContent = '+' + amount;
    d.style.left = '40%';
    d.style.top = '30%';
    el.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  },
  showDying(target) {
    const el = document.getElementById('seat-' + target.id);
    if (el) { el.classList.add('dying'); setTimeout(() => el.classList.remove('dying'), 1500); }
  },
  showDelayJudge(p, name) {
    UI.toast(`${p.name} 头顶：【${name}】`, 'bad');
  },
  showPinPoint(a, b, ca, cb) {
    openModal({
      title: '拼点',
      body: `<div style="display:flex;gap:24px;justify-content:center;align-items:center;padding:12px;">
        <div style="text-align:center;">
          <div style="color:#f5dfa3;font-size:16px;margin-bottom:6px;">${a.name}</div>
          <div id="pp-a"></div>
        </div>
        <div style="color:#c9a24a;font-size:28px;">VS</div>
        <div style="text-align:center;">
          <div style="color:#f5dfa3;font-size:16px;margin-bottom:6px;">${b.name}</div>
          <div id="pp-b"></div>
        </div>
      </div>`,
      hideFooter: true
    }).then(() => {
      document.getElementById('pp-a')?.appendChild(buildCardEl(ca));
      document.getElementById('pp-b')?.appendChild(buildCardEl(cb));
    });
    setTimeout(() => closeModal(), 1400);
  },
  flash() {},
  onPlayerDead(p) {
    const el = document.getElementById('seat-' + p.id);
    if (el) el.classList.add('dead');
    UI.toast(`${p.name} 死亡`, 'bad');
  },
  onPlayerRevive(p) {
    const el = document.getElementById('seat-' + p.id);
    if (el) el.classList.remove('dead');
  },
  onGameEnd(st) {
    setTimeout(() => showResult(st), 700);
  },
  onPrompt(prompt) {
    // 更新提示条
    const bar = document.getElementById('handbar');
    if (!prompt) {
      bar.classList.remove('prompting');
      return;
    }
    bar.classList.add('prompting');
    this.updateActionButtons(prompt);
  },
  updateActionButtons(prompt) {
    const btnC = document.getElementById('btn-confirm');
    const btnX = document.getElementById('btn-cancel');
    const kinds = prompt.kinds;
    const isTargetPick = kinds.length === 0;
    if (prompt.p.idx === SELF.idx) {
      if (kinds.includes('tao')) { btnC.disabled = false; btnX.disabled = false; btnC.textContent = '使用桃'; btnX.textContent = '放弃'; }
      else if (kinds.includes('shan')) { btnC.disabled = false; btnX.disabled = false; btnC.textContent = '出闪'; btnX.textContent = '承受'; }
      else if (kinds.includes('sha')) { btnC.disabled = false; btnX.disabled = false; btnC.textContent = '出杀'; btnX.textContent = '放弃'; }
      else { btnC.disabled = true; btnX.disabled = true; }
    } else {
      btnC.disabled = true; btnX.disabled = true;
    }
  },
  // 等待人工响应
  waitHumanResponse(prompt) {
    return new Promise(resolve => { humanPromptResolver = resolve; });
  },
  // 等待玩家点击"结束出牌"
  waitEndPlayPhase(p) {
    return new Promise(resolve => { endPlayResolver = resolve; });
  },
  endPlayPhase() {
    if (endPlayResolver) { const r = endPlayResolver; endPlayResolver = null; r(); }
  },
  revealJudgement: async function(p, card, name) {
    openModal({
      title: `${p.name} · ${name} 判定`,
      body: `<div class="reveal-cards" id="rj-slot"></div>`,
      hideFooter: true
    }).then(() => {
      const el = buildCardEl(card);
      el.classList.add('card-pop');
      document.getElementById('rj-slot').appendChild(el);
    });
    await sleep(900);
    closeModal();
  },
  revealCard(card, caption) {
    openModal({
      title: caption || '揭示',
      body: `<div class="reveal-cards" id="rv-slot"></div>`,
      hideFooter: true
    }).then(() => {
      const el = buildCardEl(card);
      el.classList.add('card-pop');
      document.getElementById('rv-slot').appendChild(el);
    });
    setTimeout(() => closeModal(), 1400);
  },
  async askYesNo(p, title, text) {
    if (!p.isHuman) {
      // AI 默认拒绝（除非该技能有专用 AI 钩子）
      return false;
    }
    return new Promise(resolve => {
      openModal({
        title,
        body: `<p>${text}</p>`,
        onCancel: () => resolve(false),
        onConfirm: () => resolve(true),
        confirmText: '发动', cancelText: '放弃'
      });
    });
  },
  async askMultiChoice(p, title, choices) {
    if (!p.isHuman) return choices[0];
    return new Promise(resolve => {
      openModal({
        title,
        body: `<div class="pick-cards" id="mc-slot"></div>`,
        onMount: () => {
          const slot = document.getElementById('mc-slot');
          choices.forEach(c => {
            const b = document.createElement('button');
            b.className = 'btn ghost';
            b.textContent = c;
            b.onclick = () => { closeModal(); resolve(c); };
            slot.appendChild(b);
          });
        },
        hideFooter: true,
        onCancel: () => resolve(choices[0])
      });
    });
  },
  async askChooseColorSuit(p, title) {
    if (!p.isHuman) return 's';
    return new Promise(resolve => {
      const suits = [{s:'♠',v:'s'},{s:'♥',v:'h'},{s:'♣',v:'c'},{s:'♦',v:'d'}];
      openModal({
        title,
        body: `<div class="pick-cards" id="cs-slot"></div>`,
        onMount: () => {
          const slot = document.getElementById('cs-slot');
          suits.forEach(x => {
            const b = document.createElement('button');
            b.className = 'btn ghost';
            b.style.fontSize = '22px';
            b.innerHTML = x.s;
            b.onclick = () => { closeModal(); resolve(x.v); };
            slot.appendChild(b);
          });
        },
        hideFooter: true,
        onCancel: () => resolve('s')
      });
    });
  },
  async askGuicai(p, curCard, target, judgeName) {
    if (!p.isHuman) return null;
    return new Promise(resolve => {
      openModal({
        title: `鬼才 — ${p.name} 替换判定`,
        body: `<p>当前判定牌：<div style="display:inline-block;vertical-align:middle;" id="gc-cur"></div><br/>目标：<b>${target.name}</b> 判定：${judgeName}</p><div style="margin-top:12px;">从手牌中选择一张作为替换：</div><div class="pick-cards" id="gc-hand"></div>`,
        hideFooter: true,
        onMount: () => {
          document.getElementById('gc-cur').appendChild(buildCardEl(curCard));
          const hs = document.getElementById('gc-hand');
          p.hand.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            hs.appendChild(el);
          });
        },
        onCancel: () => resolve(null),
        footerExtra: { cancelText: '不替换', onCancel: () => resolve(null) }
      });
    });
  },
  async askGuidao(p, curCard, target, judgeName, blacks) {
    if (!p.isHuman) return null;
    return new Promise(resolve => {
      openModal({
        title: `鬼道 — ${p.name} 替换判定（黑色牌）`,
        body: `<p>当前判定：<div style="display:inline-block;vertical-align:middle;" id="gd-cur"></div> 目标：${target.name}（${judgeName}）</p><div class="pick-cards" id="gd-hand"></div>`,
        hideFooter: true,
        onMount: () => {
          document.getElementById('gd-cur').appendChild(buildCardEl(curCard));
          const hs = document.getElementById('gd-hand');
          blacks.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            hs.appendChild(el);
          });
        },
        onCancel: () => resolve(null)
      });
    });
  },
  async chooseDiscard(st, p, n) {
    return new Promise(resolve => {
      openModal({
        title: `弃置 ${n} 张牌`,
        body: `<p>你的手牌：（选择 ${n} 张弃掉）</p><div class="pick-cards" id="cd-hand"></div>`,
        hideFooter: false,
        confirmText: '确定弃置', cancelText: '取消',
        onMount: () => {
          const hs = document.getElementById('cd-hand');
          let picked = [];
          p.hand.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => {
              const i = picked.indexOf(c);
              if (i >= 0) { picked.splice(i, 1); el.style.outline = ''; el.style.transform = ''; }
              else if (picked.length < n) { picked.push(c); el.style.outline = '2px solid #f2d67a'; el.style.transform = 'translateY(-6px)'; }
            };
            hs.appendChild(el);
          });
          modalResolveOverride = () => { resolve(picked.length ? picked : null); };
        },
        onCancel: () => resolve(null)
      });
    });
  },
  async choosePinPointCard(p) {
    return new Promise(resolve => {
      openModal({
        title: '拼点 — 选择一张手牌',
        body: `<p>K最大，A最小，同点算没赢。</p><div class="pick-cards" id="pp-hand"></div>`,
        hideFooter: true,
        onMount: () => {
          const hs = document.getElementById('pp-hand');
          p.hand.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            hs.appendChild(el);
          });
        },
        onCancel: () => resolve(p.hand[0] || null)
      });
    });
  },
  async chooseTargets(p, candidates, opts = {}) {
    return new Promise(resolve => {
      const min = opts.min ?? 1, max = opts.max ?? 1;
      openModal({
        title: opts.title || '选择目标',
        body: `<p>可选目标（可多选，最多 ${max} 名）：</p><div class="pick-cards" id="tgt-slot"></div>`,
        confirmText: '确定', cancelText: '取消',
        onMount: () => {
          const wrap = document.getElementById('tgt-slot');
          let picked = [];
          candidates.forEach(t => {
            const el = document.createElement('div');
            el.className = 'gen-pick-item';
            el.style.width = '110px';
            el.innerHTML = `<div class="gpi-port">${generalPortrait(t.general)}</div><div class="gpi-name">${t.name}</div><div class="gpi-hp">${t.hp}/${t.maxHp}</div>`;
            el.onclick = () => {
              const i = picked.indexOf(t);
              if (i >= 0) { picked.splice(i,1); el.classList.remove('picked'); }
              else if (picked.length < max) { picked.push(t); el.classList.add('picked'); }
              else if (max === 1) {
                wrap.querySelectorAll('.gen-pick-item').forEach(x => x.classList.remove('picked'));
                picked = [t]; el.classList.add('picked');
              }
            };
            wrap.appendChild(el);
          });
          modalResolveOverride = () => resolve(picked.length >= min ? picked : picked.length ? picked : null);
        },
        onCancel: () => resolve(null)
      });
    });
  },
  async chooseCardsFromHandForSha(from) {
    return new Promise(resolve => {
      // 只列出杀牌（含武圣/龙胆虚拟杀）
      const cards = from.hand.filter(c => c.defId === 'sha' || (from.hasSkill('wusheng') && (c.suit === 'h' || c.suit === 'd')));
      openModal({
        title: `${from.name} — 出杀`,
        body: cards.length ? `<p>选择一张【杀】（含可转红色牌）：</p><div class="pick-cards" id="cs-hand"></div>` : '<p>无可用作【杀】的手牌</p>',
        hideFooter: true,
        onMount: () => {
          const hs = document.getElementById('cs-hand');
          cards.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            hs.appendChild(el);
          });
        },
        onCancel: () => resolve(null)
      });
    });
  },
  async chooseOneOfAnyCard(asker, target) {
    return new Promise(resolve => {
      const items = [];
      if (target.hand.length) items.push(...target.hand.map(c => ({ card: c, kind:'hand' })));
      ['weapon','armor','horseA','horseD'].forEach(k => {
        if (target.equip[k]) items.push({ card: target.equip[k], kind:k });
      });
      openModal({
        title: `选择 <b>${target.name}</b> 的一张牌`,
        body: `<div class="pick-cards" id="oc-slot"></div>`,
        hideFooter: true,
        onMount: () => {
          const slot = document.getElementById('oc-slot');
          items.forEach(it => {
            const el = buildCardEl(it.card);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(it.card); };
            slot.appendChild(el);
          });
        },
        onCancel: () => resolve(items[0]?.card || null)
      });
    });
  },
  async chooseWuGu(who, pool) {
    return new Promise(resolve => {
      openModal({
        title: `${who.name} — 五谷丰登`,
        body: `<div class="pick-cards" id="wg-slot"></div>`,
        hideFooter: true,
        onMount: () => {
          const slot = document.getElementById('wg-slot');
          pool.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            slot.appendChild(el);
          });
        },
        onCancel: () => resolve(pool[0])
      });
    });
  },
  async showWuGuReveal(pool) {
    // 仅展示不交互
    openModal({
      title: '五谷丰登 — 亮出',
      body: `<div class="pick-cards" id="wg-rev"></div>`,
      hideFooter: true,
      onMount: () => {
        const slot = document.getElementById('wg-rev');
        pool.forEach(c => slot.appendChild(buildCardEl(c)));
      }
    });
    await sleep(900);
    closeModal();
  },
  hideWuGu() {},
  async revealHandCards(target) {
    openModal({
      title: `查看 <b>${target.name}</b> 的手牌`,
      body: target.hand.length ? `<div class="pick-cards" id="rh-slot"></div>` : '<p>无手牌</p>',
      hideFooter: true,
      onMount: () => {
        const slot = document.getElementById('rh-slot');
        target.hand.forEach(c => slot.appendChild(buildCardEl(c)));
      }
    });
    await sleep(2200);
    closeModal();
  },
  async chooseGuanxing(p, view) {
    return new Promise(resolve => {
      openModal({
        title: `${p.name} — 观星`,
        body: `<p>点击牌将其放入"牌堆顶"或"牌堆底"：</p>
          <div style="margin:8px 0;"><b>牌堆顶：</b><div class="pick-cards" id="gx-top"></div></div>
          <div style="margin:8px 0;"><b>牌堆底：</b><div class="pick-cards" id="gx-bot"></div></div>
          <div style="margin:8px 0;"><b>原顺序：</b><div class="pick-cards" id="gx-origin"></div></div>`,
        confirmText: '完成', cancelText: '取消',
        onMount: () => {
          const topEl = document.getElementById('gx-top'), botEl = document.getElementById('gx-bot'), oEl = document.getElementById('gx-origin');
          const top = [], bot = [];
          view.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => {
              // 在原位循环：origin -> top -> bot -> origin
              const inTop = top.includes(c), inBot = bot.includes(c);
              if (!inTop && !inBot) { top.push(c); oEl.removeChild(el); topEl.appendChild(el); }
              else if (inTop) { top.splice(top.indexOf(c),1); bot.push(c); topEl.removeChild(el); botEl.appendChild(el); }
              else { bot.splice(bot.indexOf(c),1); oEl.removeChild(el); topEl.appendChild(el); }
            };
            oEl.appendChild(el);
          });
          modalResolveOverride = () => resolve({ top, bottom: bot });
        },
        onCancel: () => resolve({ top: view.slice(), bottom: [] })
      });
    });
  },
  async distributeCards(who, cards, aliveAll) {
    // 分配（遗计）— 简化：自动分给队友
    for (const c of cards) {
      const opts = aliveAll.slice();
      const pick = opts[Math.floor(Math.random() * opts.length)];
      const i = who.hand.indexOf(c); if (i>=0) who.hand.splice(i,1);
      pick.hand.push(c);
    }
  },
  async askSkillChoice(p, skillId, choices) {
    if (!p.isHuman) return choices[0].id;
    return new Promise(resolve => {
      openModal({
        title: `${p.name} — ${skillId === 'shensu' ? '神速' : '技能'}`,
        body: `<div class="pick-cards" id="sk-slot"></div>`,
        hideFooter: true,
        onMount: () => {
          const slot = document.getElementById('sk-slot');
          choices.forEach(ch => {
            const b = document.createElement('button');
            b.className = 'btn ghost';
            b.style.margin = '6px';
            b.innerHTML = ch.label;
            b.onclick = () => { closeModal(); resolve(ch.id); };
            slot.appendChild(b);
          });
        },
        onCancel: () => resolve('none')
      });
    });
  },
  async chooseOneHandCardOf(owner, cards, title) {
    if (!owner.isHuman) return cards[0];
    return new Promise(resolve => {
      openModal({
        title: title || `${owner.name} — 选一张手牌`,
        body: `<div class="pick-cards" id="ch-slot"></div>`,
        hideFooter: true,
        onMount: () => {
          const slot = document.getElementById('ch-slot');
          cards.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            slot.appendChild(el);
          });
        },
        onCancel: () => resolve(cards[0] || null)
      });
    });
  },
  async askChooseOneEquip(owner) { return null; },
  async askChooseOneJudgeTarget(owner) { return null; },
  async askChooseOneHandCard(owner) { return null; },
  async chooseEquip() { return null; },
  async chooseOneHandCardOf(owner, cards, title) { return owner.isHuman ? this._chooseOneHandCardOf(owner, cards, title) : cards[0]; },
  async _chooseOneHandCardOf(owner, cards, title) {
    return new Promise(resolve => {
      openModal({
        title: title || `${owner.name} — 选一张手牌`,
        body: `<div class="pick-cards" id="csb-slot"></div>`,
        hideFooter: true,
        onMount: () => {
          const slot = document.getElementById('csb-slot');
          cards.forEach(c => {
            const el = buildCardEl(c);
            el.style.cursor = 'pointer';
            el.onclick = () => { closeModal(); resolve(c); };
            slot.appendChild(el);
          });
        },
        onCancel: () => resolve(cards[0] || null)
      });
    });
  },
  async askConvertCard() { return null; },
  async chooseRecoverAmount() { return 0; },
  async showTopCards() { return null; },
  async askHandDiscardForTarget() { return null; },
  toast(msg, cls='') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.getElementById('screen-game').appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
};

// 距离 — 简化版（不依赖 engine）
function distCalc(st, from, to) {
  const alive = st.alivePlayers();
  const fi = alive.indexOf(from), ti = alive.indexOf(to);
  const n = alive.length;
  let d = Math.min(Math.abs(fi - ti), n - Math.abs(fi - ti));
  if (from.equip.horseA) d -= 1;
  if (to.equip.horseD) d += 1;
  if (from.hasSkill('jixing')) d -= 1;
  if (from.hasSkill('mashu')) d -= 1;
  return Math.max(1, d);
}
function roleText(mode, p) {
  if (mode === 'identity') {
    return { '主':'主公', '忠':'忠臣', '反':'反贼', '内':'内奸' }[p.role] || p.role;
  }
  return p.team === 'A' ? '红队 A' : '蓝队 B';
}
function modeText(st) {
  if (st.mode === 'identity') return `身份局 ${st.count}人`;
  if (st.mode === '2v2') return '2v2 团队战';
  if (st.mode === '3v3') return '3v3 团队战';
  return st.mode;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============ 模态框 =============
let modalResolveOverride = null;
export function openModal({ title, body, onMount, onConfirm, onCancel, confirmText, cancelText, hideFooter, footerExtra }) {
  const root = document.getElementById('modal-root');
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `
    <div class="modal-head"><span>${title || ''}</span></div>
    <div class="modal-body">${body || ''}</div>
    ${hideFooter ? '' : `<div class="modal-foot">
      <button class="btn ghost" data-act="cancel">${cancelText || '取消'}</button>
      <button class="btn primary" data-act="confirm">${confirmText || '确定'}</button>
    </div>`}
  `;
  root.innerHTML = '';
  root.appendChild(el);
  root.classList.add('open');
  modalStack.push(el);
  el.querySelector('[data-act=confirm]')?.addEventListener('click', () => {
    closeModal();
    if (modalResolveOverride) { const r = modalResolveOverride; modalResolveOverride = null; r(); }
    else if (onConfirm) onConfirm();
  });
  el.querySelector('[data-act=cancel]')?.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });
  if (footerExtra?.onCancel) {
    el.querySelector('[data-act=cancel]')?.addEventListener('click', footerExtra.onCancel);
  }
  if (onMount) onMount();
  return Promise.resolve();
}
export function closeModal() {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  root.classList.remove('open');
  modalStack.pop();
}

// ============ 绑定 UI Bridge =============
Object.keys(UI).forEach(k => { if (View[k]) UI[k] = View[k].bind(View); });
// 补齐
UI.showWuGuReveal = View.showWuGuReveal.bind(View);
UI.hideWuGu = View.hideWuGu.bind(View);
UI.revealCard = View.revealCard.bind(View);
UI.revealHandCards = View.revealHandCards.bind(View);
UI.showDelayJudge = View.showDelayJudge.bind(View);
UI.askGuicai = View.askGuicai.bind(View);
UI.askGuidao = View.askGuidao.bind(View);
UI.chooseGuanxing = View.chooseGuanxing.bind(View);
UI.askSkillChoice = View.askSkillChoice.bind(View);
UI.chooseCardsFromHandForSha = View.chooseCardsFromHandForSha.bind(View);
UI.chooseWuGu = View.chooseWuGu.bind(View);
UI.endPlayPhase = View.endPlayPhase.bind(View);
UI.waitEndPlayPhase = View.waitEndPlayPhase.bind(View);
UI.chooseOneOfAnyCard = View.chooseOneOfAnyCard.bind(View);
UI.distributeCards = View.distributeCards.bind(View);
UI.syncAll = View.syncAll.bind(View);
UI.notify = View.toast.bind(View);
UI.chooseOneHandCardOf = View.chooseOneHandCardOf.bind(View);
UI.askChooseColorSuit = View.askChooseColorSuit.bind(View);
UI.choosePinPointCard = View.choosePinPointCard.bind(View);
UI.chooseTargets = View.chooseTargets.bind(View);
UI.chooseDiscard = View.chooseDiscard.bind(View);
UI.askYesNo = View.askYesNo.bind(View);
UI.askMultiChoice = View.askMultiChoice.bind(View);
UI.setCurrentPlayer = View.setCurrentPlayer.bind(View);
UI.setPhase = View.setPhase.bind(View);
UI.setTurnCount = View.setTurnCount.bind(View);
UI.setCurrentPlayerName = () => {};


// 手牌点击处理
function onHandCardClick(p, card, slotEl) {
  if (!GS.pendingPrompt || GS.pendingPrompt.p !== p) {
    // 非响应状态：默认选中/取消
    slotEl.classList.toggle('selected');
    document.getElementById('btn-confirm').disabled = false;
    document.getElementById('btn-cancel').disabled = false;
    return;
  }
  const prompt = GS.pendingPrompt;
  const kinds = prompt.kinds;
  if (kinds.includes('tao') && (card.defId === 'tao' || (p.hasSkill('jijiu') && isRedSuit(card.suit)))) {
    const ans = card;
    p.hand.splice(p.hand.indexOf(card), 1);
    if (humanPromptResolver) { const r = humanPromptResolver; humanPromptResolver = null; r(ans); }
  } else if (kinds.includes('shan') && (card.defId === 'shan' || (p.hasSkill('qingguo') && !isRedSuit(card.suit)) || (p.hasSkill('longdan') && card.defId === 'sha'))) {
    let ans = card;
    if (card.defId !== 'shan') {
      // 虚拟转换
      const defId = 'shan';
      const base = CARD_DEFS[defId];
      ans = { ...base, defId, _virtual: true, _sources: [card], _base: base, suit: card.suit, rank: card.rank };
    }
    p.hand.splice(p.hand.indexOf(card), 1);
    if (humanPromptResolver) { const r = humanPromptResolver; humanPromptResolver = null; r(ans); }
  } else if (kinds.includes('sha') && (card.defId === 'sha' || (p.hasSkill('wusheng') && isRedSuit(card.suit)) || (p.hasSkill('longdan') && card.defId === 'shan'))) {
    let ans = card;
    if (card.defId !== 'sha') {
      const defId = 'sha';
      const base = CARD_DEFS[defId];
      ans = { ...base, defId, _virtual: true, _sources: [card], _base: base, suit: card.suit, rank: card.rank };
    }
    p.hand.splice(p.hand.indexOf(card), 1);
    if (humanPromptResolver) { const r = humanPromptResolver; humanPromptResolver = null; r(ans); }
  } else {
    View.toast('当前不是这张牌的响应类型', 'bad');
  }
}
function isRedSuit(s) { return s === 'h' || s === 'd'; }

function showResult(st) {
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-result').classList.add('active');
  const winners = st.winner || [];
  const kind = st.winnerKind;
  const winTxt = { lord:'主公胜', rebel:'反贼胜', spy:'内奸胜', teamA:'红队 A 胜', teamB:'蓝队 B 胜' }[kind] || '结束';
  const won = winners.includes(SELF);
  document.getElementById('rs-title').textContent = won ? '胜 利' : '战 败';
  document.getElementById('rs-title').classList.toggle('lose', !won);
  document.getElementById('rs-sub').textContent = `${modeText(st)} · ${winTxt}`;
  const box = document.getElementById('rs-players');
  box.innerHTML = '';
  st.players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'rs-player' + (p.alive ? '' : ' dead') + (winners.includes(p) ? ' win' : '');
    const roleCN = st.mode === 'identity' ? roleText('identity', p) : `{A:'红队',B:'蓝队'}[p.team]`;
    el.innerHTML = `<div class="rsp-top"><div class="rsp-port">${generalPortrait(p.general)}</div>
      <div><div class="rsp-name">${p.name}</div><div class="rsp-role">${roleCN} · ${p.general.name} · ${p.alive?'存活':'阵亡'}</div></div></div>`;
    box.appendChild(el);
  });
}

// 事件绑定（全局）
let _globalBound = false;
export function bindGlobalEvents() {
  if (_globalBound) return;
  _globalBound = true;
  document.getElementById('btn-confirm').addEventListener('click', () => {
    const sel = $$('.hand-slot.selected');
    if (!sel.length) return;
    if (!GS.pendingPrompt) {
      // 出牌阶段 — 使用手牌
      const slots = sel.map(s => SELF.hand.find(c => c.id === s.dataset.cid)).filter(Boolean);
      slots.forEach(card => onUseCardRequest(card));
      sel.forEach(s => s.classList.remove('selected'));
      return;
    }
    if (humanPromptResolver) {
      // 响应模式：取第一个选中的匹配
      const p = GS.pendingPrompt.p;
      for (const s of sel) {
        const card = SELF.hand.find(c => c.id === s.dataset.cid);
        if (card) { p.hand.splice(p.hand.indexOf(card), 1); const r = humanPromptResolver; humanPromptResolver = null; r(card); return; }
      }
    }
  });
  document.getElementById('btn-cancel').addEventListener('click', () => {
    if (humanPromptResolver) { const r = humanPromptResolver; humanPromptResolver = null; r(null); }
    $$('.hand-slot.selected').forEach(s => s.classList.remove('selected'));
  });
  document.getElementById('btn-endturn').addEventListener('click', () => {
    View.endPlayPhase();
  });
  document.getElementById('btn-log').addEventListener('click', () => {
    document.getElementById('log-panel').classList.toggle('open');
  });
  document.getElementById('btn-fullscreen')?.addEventListener('click', async () => {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFs) {
      try { document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen(); } catch(_) {}
    } else {
      try {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } catch (e) { UI.toast('全屏请求失败：' + (e.message || ''), 'bad'); }
    }
  });
  document.getElementById('btn-log-close').addEventListener('click', () => {
    document.getElementById('log-panel').classList.remove('open');
  });
  document.getElementById('btn-help').addEventListener('click', () => {
    openModal({ title: '规则速览', body: `<div class="rules-body" id="rules-quick"></div>`, hideFooter: true });
    document.getElementById('rules-quick').innerHTML = RULES_HTML;
  });
  document.getElementById('btn-quit').addEventListener('click', async () => {
    if (confirm('确定要退出本局游戏吗？')) {
      await import('../main.js').then(m => m.gotoMenu());
    }
  });
}

async function onUseCardRequest(card) {
  const { useCard } = await import('../core/engine.js');
  const { CardResolver } = await import('../core/cards-resolver.js');
  const p = SELF;
  // 出牌阶段检查
  if (GS.phase !== 'play' || GS.currentIdx !== p.idx) { View.toast('不在你的出牌阶段', 'bad'); return; }
  const defId = card.defId || card.id.split('#')[0];
  const def = CARD_DEFS[defId];
  // 杀次数限制
  if (defId === 'sha') {
    const used = p.turnData?.usedSha ? 1 : 0;
    const limit = (p.hasSkill('paoxiao') || p.equip.weapon?.defId === 'nuliang') ? Infinity : 1 + (p.mark.extraShaAllowed || 0);
    if (p.mark.shaDisabled) { View.toast('本回合无法使用【杀】', 'bad'); return; }
    if (used >= limit) { View.toast('本回合【杀】次数已用完', 'bad'); return; }
  }
  // 目标校验
  const enemies = GS.players.filter(x => x.alive && x !== p);
  const targets = def.target === 'self' ? [p] : null;
  if (!targets) {
    let cands = [];
    let min = 1, max = 1;
    if (defId === 'sha') {
      cands = enemies.filter(e => canAttackSimple(GS, p, e) && !(e.hasSkill('kongcheng') && e.hand.length === 0));
      // 方天画戟：最后一张手牌时可指定3个目标
      const isLast = p.hand.length === 1;
      if (p.equip.weapon?.defId === 'fangtian' && isLast) max = 3;
      if (p.mark.shaTargetPlus) max += p.mark.shaTargetPlus;
    } else if (defId === 'juedou') {
      cands = enemies.filter(e => !(e.hasSkill('kongcheng') && e.hand.length === 0));
    } else if (defId === 'nanman' || defId === 'wanjian') {
      min = 0; max = 0; targets = enemies.slice();
    } else if (defId === 'taoyuan') {
      min = 0; max = 0; targets = GS.players.filter(x => x.alive);
    } else if (defId === 'wugu') {
      min = 0; max = 0; targets = GS.players.filter(x => x.alive);
    } else if (defId === 'guohe' || defId === 'zhiji') {
      cands = enemies.filter(e => e.hand.length || Object.values(e.equip).some(Boolean));
    } else if (defId === 'shunshou') {
      cands = enemies.filter(e => distCalc(GS, p, e) <= 1 && (e.hand.length || Object.values(e.equip).some(Boolean)));
    } else if (defId === 'huogong') {
      cands = enemies;
    } else if (defId === 'jiedao') {
      cands = GS.players.filter(x => x.alive && x !== p && x.equip.weapon).map(actor => ({ actor, victim: enemies.find(e => canAttackSimple(GS, actor, e)) })).filter(x => x.victim).map(x => [x.actor, x.victim]);
      const pick = await View.chooseJiedaoPairs(cands);
      if (!pick) return;
      await useCard(GS, p, card, { targets: pick });
      return;
    } else if (defId === 'tiesuo') {
      cands = enemies.slice();
      max = 2;
    } else if (defId === 'le' || defId === 'bingliang' || defId === 'shandian') {
      if (defId === 'shandian') { cands = [p]; }
      else { cands = enemies.filter(e => !e.judges.some(j => j.defId === defId)); }
    } else if (defId === 'tao') {
      cands = [p];
    } else if (defId === 'jiu') {
      cands = [p];
    } else if (defId === 'shan') {
      View.toast('【闪】只能在响应【杀】时打出', 'bad'); return;
    } else if (defId === 'wuxie') {
      View.toast('【无懈可击】只能在响应锦囊时打出', 'bad'); return;
    } else if (def.type === 'equip') {
      cands = []; targets = [p];
    }
    if (cands && cands.length && !targets) {
      const picked = await View.chooseTargets(p, cands, { min, max, title: `【${def.name}】选择目标` });
      if (!picked) return;
      await useCard(GS, p, card, { targets: picked });
    } else if (targets) {
      await useCard(GS, p, card, { targets });
    } else {
      await useCard(GS, p, card, { targets: [] });
    }
  } else {
    await useCard(GS, p, card, { targets });
  }
  View.refreshAll();
}
function canAttackSimple(st, from, to) {
  if (from.equip.horseA?.defId === 'baima' || from.hasSkill('shenshe')) return true;
  const r = from.attackRange();
  return distCalc(st, from, to) <= r;
}

View.chooseJiedaoPairs = async function(pairs) {
  return new Promise(resolve => {
    openModal({
      title: '借刀杀人 — 选择一对目标',
      body: `<p>选择一名装备武器的角色（A）和其攻击范围内的一名角色（B）：</p><div class="pick-cards" id="jd-slot"></div>`,
      hideFooter: true,
      onMount: () => {
        const slot = document.getElementById('jd-slot');
        pairs.forEach(pr => {
          const [actor, victim] = pr;
          const el = document.createElement('button');
          el.className = 'btn ghost';
          el.style.margin = '6px';
          el.innerHTML = `${actor.name} → ${victim.name}`;
          el.onclick = () => { closeModal(); resolve([actor, victim]); };
          slot.appendChild(el);
        });
      },
      onCancel: () => resolve(null)
    });
  });
};
// 绑定放在定义之后（修正原绑定顺序 bug）
UI.chooseJiedaoPairs = View.chooseJiedaoPairs.bind(View);

const RULES_HTML = `
<h3>回合流程</h3>
<ul>
<li>1. 准备阶段（洛神/观星等触发）</li>
<li>2. 判定阶段（延时锦囊）</li>
<li>3. 摸牌阶段（默认摸2张）</li>
<li>4. 出牌阶段（使用手牌）</li>
<li>5. 弃牌阶段（弃到手牌上限=体力值）</li>
<li>6. 结束阶段（闭月/崩坏触发）</li>
</ul>
<h3>身份配置</h3>
<table><tr><th>人数</th><th>主公</th><th>忠臣</th><th>反贼</th><th>内奸</th></tr>
<tr><td>4</td><td>1</td><td>1</td><td>1</td><td>1</td></tr>
<tr><td>5</td><td>1</td><td>1</td><td>2</td><td>1</td></tr>
<tr><td>6</td><td>1</td><td>1</td><td>3</td><td>1</td></tr>
<tr><td>7</td><td>1</td><td>2</td><td>3</td><td>1</td></tr>
<tr><td>8</td><td>1</td><td>2</td><td>4</td><td>1</td></tr></table>
<h3>胜利条件</h3>
<ul>
<li>主公：消灭所有反贼和内奸</li>
<li>忠臣：保护主公，与主公共同胜利</li>
<li>反贼：杀死主公</li>
<li>内奸：杀光除主公外所有人，最后独自杀死主公</li>
</ul>
<h3>濒死与求桃</h3>
<p>体力≤0进入濒死。按座位顺序（濒死者优先）每人可对你使用【桃】；每救1点体力需要1张【桃】。无人救助则死亡。</p>
<h3>属性伤害与连环</h3>
<p>【火攻】【闪电】【雷击】为火焰/雷电伤害；装备【藤甲】时受火焰伤害+1，但普通【杀】【南蛮】【万箭】对其无效。被【铁索连环】的角色受到属性伤害时，其他连环角色也同量受创，结算后连环解除。</p>
<h3>拼点</h3>
<p>双方各扣一张手牌，亮出比点数（K最大，A最小）；同点数算没赢；拼点的牌都弃置。</p>
`;
