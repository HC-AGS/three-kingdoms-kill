// 卡牌组件渲染
import { SUIT_NAME, RANK_NAME, suitColor, isRed } from '../data/cards.js';
import { generalPortrait, cardArt } from './portraits.js';

// 构建一张牌 DOM
export function buildCardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = `sgs-card t-${card.type}`;
  if (opts.small) el.classList.add('small');
  const col = suitColor(card.suit);
  const suit = SUIT_NAME[card.suit] || '?';
  const rank = RANK_NAME[card.rank] || card.rank;
  el.innerHTML = `
    <div class="card-corner ${col}"><span class="r">${rank}</span><span class="s tr">${suit}</span></div>
    <div class="card-art">${cardArt(card.defId || 'sha')}</div>
    <div class="card-name${card.name.length > 3 ? ' small' : ''}">${card.name}</div>
    <div class="card-type">${typeCN(card.type, card.subtype)}</div>
  `;
  // 提示
  el.title = `${card.name}\n${suit}${rank} · ${typeCN(card.type, card.subtype)}\n${card.desc || ''}`;
  return el;
}
function typeCN(type, subtype) {
  if (type === 'basic') return '基本牌';
  if (type === 'trick') return subtype === 'delay' ? '延时锦囊' : '锦囊牌';
  if (type === 'equip') {
    if (subtype === 'weapon') return '武器';
    if (subtype === 'armor') return '防具';
    if (subtype === 'horseA') return '进攻马';
    if (subtype === 'horseD') return '防御马';
  }
  return '';
}

export function buildCardBackEl() {
  const el = document.createElement('div');
  el.className = 'sgs-card card-back';
  el.innerHTML = `<div class="card-back-inner">烽</div>`;
  return el;
}

export function buildEquipMini(card) {
  if (!card) return `<div class="equip-mini empty"></div>`;
  const { equipGlyph } = require_portraits();
  return `<div class="equip-mini" title="${card.name}">
    <div class="eq-art">${cardArt(card.defId)}</div>
    <div class="eq-name">${card.name.length > 4 ? card.name.slice(0,3)+'..' : card.name}</div>
    <div class="eq-kind">${typeCN(card.type, card.subtype)}</div>
  </div>`;
}
function require_portraits() { return { equipGlyph: (id) => id }; }

export function buildGeneralPortrait(gen, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'general-port' + (opts.big ? ' big' : '');
  wrap.innerHTML = generalPortrait(gen);
  const fac = document.createElement('div');
  fac.className = 'gp-fac f-' + ({'魏':'wei','蜀':'shu','吴':'wu','群':'qun'})[gen.fac];
  fac.textContent = gen.fac;
  const nm = document.createElement('div');
  nm.className = 'gp-name';
  nm.textContent = gen.shortName || gen.name;
  wrap.appendChild(fac);
  wrap.appendChild(nm);
  return wrap;
}
