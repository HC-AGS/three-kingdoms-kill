// 武将头像生成 — 全部原创的抽象古风剪影（无外部资源）
// 每个武将由 (fac, gender, color, id) 组合参数化生成独特的 SVG 剪影
const SUIT_SYM = { s:'♠', h:'♥', c:'♣', d:'♦' };
const FAC_COLOR = { '魏':'#2b5b8a', '蜀':'#1e6f3d', '吴':'#a8241c', '群':'#7a5a1e' };
const FAC_HILITE = { '魏':'#7fb1dc', '蜀':'#5fbf7f', '吴':'#e25b4a', '群':'#d9a53a' };

// 根据 id 生成稳定的伪随机种子（同 id 永远一样）
function seedFrom(id) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h & 0xffff) / 0xffff; };
}

// 生成一个武将的 SVG（返回字符串）— 原创抽象剪影
export function generalPortrait(gen) {
  const rand = seedFrom(gen.id);
  const bg = FAC_COLOR[gen.fac] || '#3a3a3a';
  const bg2 = FAC_HILITE[gen.fac] || '#8a8a8a';
  const accent = gen.color || '#c9a24a';
  const female = gen.gender === 'F';
  // 头部姿态：由种子决定
  const headShift = (rand() - 0.5) * 6;
  const shoulderTilt = (rand() - 0.5) * 5;
  // 头饰类型
  const hatKind = female
    ? ['bun','veil','bun'][Math.floor(rand() * 3)]
    : ['crown','helmet','turban','general','scholar'][Math.floor(rand() * 5)];
  // 主武器/道具：根据势力和 id 尾数选择
  const props = ['sword','spear','fan','bow','axe','scroll','staff','shield'][Math.floor(rand() * 8)];
  // 背景纹理
  const bgPattern = buildBgPattern(bg, bg2, rand);
  const body = buildBody(female, hatKind, headShift, accent, shoulderTilt);
  const prop = buildProp(props, accent);
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 128" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="g_${gen.id}_bg" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${bg2}" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="${bg}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#120a04" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="g_${gen.id}_accent" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect width="100" height="128" fill="url(#g_${gen.id}_bg)"/>
  ${bgPattern}
  <g transform="translate(${50} ${58})">
    ${prop}
    ${body}
  </g>
  <rect x="0" y="100" width="100" height="28" fill="url(#g_${gen.id}_bg)" opacity="0.85"/>
</svg>`;
}

function buildBgPattern(bg, bg2, rand) {
  // 抽象山峦 / 云纹 / 火焰
  const kind = Math.floor(rand() * 3);
  const op = 0.18 + rand() * 0.15;
  if (kind === 0) {
    // 山峦剪影
    return `
<g opacity="${op}" stroke="${bg2}" stroke-width="1.2" fill="none">
  <path d="M0 92 L14 62 L28 88 L44 54 L60 84 L76 66 L92 88 L100 76"/>
  <path d="M0 100 L18 78 L34 96 L52 74 L70 94 L86 80 L100 96" opacity="0.7"/>
</g>`;
  }
  if (kind === 1) {
    // 云纹
    return `
<g opacity="${op}" fill="${bg2}">
  <path d="M8 32 q6 -8 14 -2 q4 -6 12 -1 q6 -4 10 4 q-4 2 -10 1 q-6 5 -12 0 q-8 6 -14 -2z"/>
  <path d="M52 20 q6 -7 12 -1 q5 -6 12 1 q5 6 -2 8 q-6 3 -10 -2 q-6 4 -12 -6z" opacity="0.8"/>
  <path d="M8 108 q8 -6 16 0 q8 -6 16 0 q6 -4 12 2 q-4 4 -10 2 q-6 4 -14 -1 q-8 5 -20 -3z" opacity="0.9"/>
</g>`;
  }
  // 火焰
  return `
<g opacity="${op}" fill="${bg2}">
  <path d="M14 118 q-6 -20 6 -32 q-4 12 6 18 q-2 -18 10 -26 q-6 14 4 24 q2 14 -14 20z"/>
  <path d="M74 118 q-4 -18 6 -28 q-4 10 4 16 q0 -14 10 -22 q-6 12 4 20 q2 14 -14 20z" opacity="0.85"/>
</g>`;
}

function buildBody(female, hatKind, headShift, accent, shoulderTilt) {
  const skin = female ? '#f3e0c4' : '#e8cfa8';
  const hair = '#1a0d04';
  const armor = female ? '#4a3520' : '#3a2410';
  const robe = female ? '#7a2a3a' : '#2a1a0c';
  return `
<!-- 肩/披风 -->
<g transform="rotate(${shoulderTilt} 0 0)">
  <path d="M-32 68 Q-26 40 -14 34 L14 34 Q26 40 32 68 L28 70 Q20 46 10 44 L-10 44 Q-20 46 -28 70 Z" fill="${robe}" opacity="0.95"/>
  <path d="M-24 62 Q-16 34 -6 30 L6 30 Q16 34 24 62 L20 64 Q14 40 4 38 L-4 38 Q-14 40 -20 64 Z" fill="${armor}"/>
  <!-- 甲片纹理 -->
  <g stroke="${accent}" stroke-width="0.6" fill="none" opacity="0.55">
    <path d="M-16 44 Q0 52 16 44"/>
    <path d="M-18 52 Q0 60 18 52"/>
    <path d="M-20 60 Q0 68 20 60"/>
  </g>
  <!-- 领口 -->
  <path d="M-6 30 Q0 36 6 30 L4 28 Q0 32 -4 28 Z" fill="${accent}" opacity="0.85"/>
</g>
<!-- 脖子 -->
<path d="M-5 20 Q-4 30 0 32 Q4 30 5 20 Z" fill="${skin}" opacity="0.9"/>
<!-- 头 -->
<g transform="translate(${headShift} 0)">
  <ellipse cx="0" cy="4" rx="14" ry="17" fill="${skin}"/>
  <!-- 眉毛 -->
  <path d="M-8 -1 Q-5 -3 -2 -1" stroke="${hair}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M2 -1 Q5 -3 8 -1" stroke="${hair}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <!-- 眼睛 -->
  <ellipse cx="-5" cy="3" rx="1.4" ry="0.9" fill="#1a0d04"/>
  <ellipse cx="5" cy="3" rx="1.4" ry="0.9" fill="#1a0d04"/>
  <!-- 鼻子 -->
  <path d="M0 5 L-1 10 Q0 11 1 10 Z" fill="#c4a585" opacity="0.7"/>
  <!-- 嘴 -->
  <path d="M-3 13 Q0 14.5 3 13" stroke="#8a3a2a" stroke-width="0.9" fill="none" stroke-linecap="round"/>
  ${female ? '<path d="M-2 13.5 Q0 15 2 13.5" fill="#c44a3a" opacity="0.75"/><circle cx="-9" cy="8" r="1" fill="#e2a894" opacity="0.55"/><circle cx="9" cy="8" r="1" fill="#e2a894" opacity="0.55"/>' : ''}
  <!-- 胡子（男性） -->
  ${!female ? '<path d="M-5 12 Q0 18 5 12" fill="#1a0d04" opacity="0.85"/><path d="M-3 15 L-4 21 M0 16 L0 22 M3 15 L4 21" stroke="#1a0d04" stroke-width="1" fill="none" opacity="0.75"/>' : ''}
  <!-- 头发 -->
  <path d="M-14 -4 Q-14 -16 0 -18 Q14 -16 14 -4 Q10 -8 0 -9 Q-10 -8 -14 -4 Z" fill="${hair}"/>
  ${hatSvg(hatKind, female, accent, hair)}
</g>`;
}

function hatSvg(kind, female, accent, hair = '#1a0d04') {
  if (female) {
    if (kind === 'bun') return `
<ellipse cx="-10" cy="-14" rx="4.5" ry="4.5" fill="${hair}"/>
<ellipse cx="10" cy="-14" rx="4.5" ry="4.5" fill="${hair}"/>
<circle cx="-10" cy="-16" r="1.5" fill="${accent}" opacity="0.9"/>
<circle cx="10" cy="-16" r="1.5" fill="${accent}" opacity="0.9"/>
<path d="M-12 -18 Q0 -22 12 -18" stroke="${accent}" stroke-width="0.8" fill="none" opacity="0.7"/>
`;
    // veil
    return `
<path d="M-14 -6 Q-18 -18 0 -22 Q18 -18 14 -6 Z" fill="${hair}"/>
<path d="M-14 -6 Q-16 8 -12 14" stroke="${accent}" stroke-width="1" fill="none" opacity="0.5"/>
<path d="M14 -6 Q16 8 12 14" stroke="${accent}" stroke-width="1" fill="none" opacity="0.5"/>
<circle cx="0" cy="-14" r="1.8" fill="${accent}"/>
`;
  }
  if (kind === 'crown') {
    return `
<path d="M-9 -18 L-9 -12 L9 -12 L9 -18 L6 -15 L3 -20 L0 -15 L-3 -20 L-6 -15 Z" fill="${accent}" stroke="#5a3a10" stroke-width="0.5"/>
<circle cx="0" cy="-14" r="1.2" fill="#c44a3a"/>
<path d="M-9 -12 L9 -12" stroke="${accent}" stroke-width="1.2"/>
`;
  }
  if (kind === 'helmet') {
    return `
<path d="M-14 -6 Q-14 -20 0 -22 Q14 -20 14 -6 L11 -8 Q10 -18 0 -19 Q-10 -18 -11 -8 Z" fill="${accent}"/>
<path d="M0 -22 L0 -26 L-2 -26 L0 -30 L2 -26 L0 -26" fill="${accent}"/>
<path d="M-11 -8 Q-11 -4 -8 -2" stroke="${accent}" stroke-width="1" fill="none"/>
<path d="M11 -8 Q11 -4 8 -2" stroke="${accent}" stroke-width="1" fill="none"/>
<circle cx="-11" cy="-8" r="1.2" fill="#c44a3a"/>
<circle cx="11" cy="-8" r="1.2" fill="#c44a3a"/>
`;
  }
  if (kind === 'turban') {
    return `
<path d="M-14 -6 Q-14 -20 0 -22 Q14 -20 14 -6 L12 -8 Q10 -18 0 -19 Q-10 -18 -12 -8 Z" fill="${accent}"/>
<path d="M-11 -14 Q0 -18 11 -14" stroke="#3a2410" stroke-width="1" fill="none" opacity="0.55"/>
<path d="M-9 -18 Q0 -20 9 -18" stroke="#3a2410" stroke-width="1" fill="none" opacity="0.45"/>
`;
  }
  if (kind === 'general') {
    return `
<path d="M-14 -6 Q-14 -22 0 -24 Q14 -22 14 -6 L11 -8 Q10 -20 0 -21 Q-10 -20 -11 -8 Z" fill="${accent}"/>
<path d="M-14 -6 L-18 -2 L-14 0 Z" fill="${accent}"/>
<path d="M14 -6 L18 -2 L14 0 Z" fill="${accent}"/>
<path d="M0 -24 L-3 -30 M0 -24 L3 -30" stroke="#c44a3a" stroke-width="1.4"/>
<circle cx="0" cy="-24" r="1.6" fill="#c44a3a"/>
`;
  }
  // scholar
  return `
<path d="M-12 -14 Q-14 -22 0 -22 Q14 -22 12 -14 L10 -16 Q8 -20 0 -20 Q-8 -20 -10 -16 Z" fill="${accent}"/>
<path d="M-12 -14 L-14 -10 L-4 -12 Z" fill="${accent}"/>
<path d="M12 -14 L14 -10 L4 -12 Z" fill="${accent}"/>
<circle cx="0" cy="-18" r="1" fill="#3a2410"/>
`;
}

function buildProp(kind, accent) {
  const dark = '#1a0d04';
  if (kind === 'sword') return `
<g transform="translate(-38 -14) rotate(-15)">
  <rect x="0" y="0" width="2.4" height="36" fill="#a8b5c9"/>
  <rect x="-3" y="36" width="8.4" height="2" fill="${accent}"/>
  <rect x="-1" y="38" width="4.4" height="10" fill="#3a2410"/>
  <circle cx="1.2" cy="50" r="2" fill="${accent}"/>
</g>`;
  if (kind === 'spear') return `
<g transform="translate(-40 -12) rotate(-20)">
  <rect x="0" y="0" width="1.6" height="56" fill="#5a3a20"/>
  <path d="M0 -10 L1.6 -10 L2.5 0 L-0.9 0 Z" fill="#c9c9c9"/>
  <path d="M-0.5 2 L2 2 L1.5 6 L0 6 Z" fill="${accent}"/>
</g>`;
  if (kind === 'fan') return `
<g transform="translate(32 6) rotate(15)">
  <path d="M-12 0 Q0 -18 12 0 Q0 -6 -12 0z" fill="#e8d8b3" stroke="#8a6a25" stroke-width="0.6"/>
  <g stroke="${accent}" stroke-width="0.5" fill="none" opacity="0.7">
    <path d="M-9 -1 Q0 -14 9 -1"/>
    <path d="M-6 -1 Q0 -10 6 -1"/>
  </g>
  <rect x="-0.7" y="0" width="1.4" height="9" fill="#5a3a20"/>
</g>`;
  if (kind === 'bow') return `
<g transform="translate(-42 -4) rotate(-12)">
  <path d="M0 0 Q-8 -18 0 -34" stroke="#5a3a20" stroke-width="2.4" fill="none"/>
  <path d="M0 0 Q-8 -18 0 -34" stroke="${accent}" stroke-width="0.6" fill="none" opacity="0.6"/>
  <line x1="0" y1="0" x2="0" y2="-34" stroke="#e8d8b3" stroke-width="0.5"/>
</g>`;
  if (kind === 'axe') return `
<g transform="translate(38 -12)">
  <rect x="-1" y="-4" width="2" height="44" fill="#5a3a20"/>
  <path d="M0 -8 Q14 -14 14 0 Q14 10 0 6 Z" fill="${accent}" stroke="#3a2410" stroke-width="0.6"/>
</g>`;
  if (kind === 'scroll') return `
<g transform="translate(36 0)">
  <rect x="-2" y="-12" width="16" height="22" fill="#f2e5c9" stroke="#8a6a25" stroke-width="0.6"/>
  <circle cx="-2" cy="-12" r="3" fill="#e8d8b3" stroke="#8a6a25" stroke-width="0.6"/>
  <circle cx="-2" cy="10" r="3" fill="#e8d8b3" stroke="#8a6a25" stroke-width="0.6"/>
  <line x1="2" y1="-6" x2="11" y2="-6" stroke="#3a2410" stroke-width="0.4" opacity="0.7"/>
  <line x1="2" y1="-2" x2="11" y2="-2" stroke="#3a2410" stroke-width="0.4" opacity="0.7"/>
  <line x1="2" y1="2" x2="11" y2="2" stroke="#3a2410" stroke-width="0.4" opacity="0.7"/>
</g>`;
  if (kind === 'staff') return `
<g transform="translate(-38 -10)">
  <rect x="0" y="0" width="1.8" height="54" fill="#5a3a20"/>
  <circle cx="0.9" cy="-2" r="3" fill="${accent}" opacity="0.85"/>
  <path d="M-4 6 L5 6" stroke="${accent}" stroke-width="1"/>
</g>`;
  // shield
  return `
<g transform="translate(-40 -6)">
  <path d="M0 -12 Q9 -12 9 0 Q9 12 0 18 Q-9 12 -9 0 Q-9 -12 0 -12 Z" fill="${accent}" stroke="#3a2410" stroke-width="0.7"/>
  <circle cx="0" cy="3" r="3" fill="#3a2410" opacity="0.5"/>
</g>`;
}

// 卡牌图案：装备/锦囊的抽象小图
export function cardArt(defId, size = 1) {
  const S = size * 1;
  const dark = '#3a2410';
  const gold = '#c9a24a';
  const red = '#a8241c';
  const map = {
    sha: `<g><path d="M14 44 L18 30 L26 22 L34 16 L46 14 L48 20 L40 24 L34 34 L30 42 Z" fill="#8a1e1e" stroke="#3a0606" stroke-width="1"/><path d="M46 6 L54 4 L50 12 Z" fill="#c9c9c9" stroke="#5a5a5a" stroke-width="0.6"/><path d="M14 46 L12 52 L18 50 Z" fill="#5a3a20"/></g>`,
    shan: `<g><path d="M4 26 Q22 4 40 26 Q22 20 4 26 Z" fill="#4a7f8a" stroke="#1a3a4a" stroke-width="0.8"/><circle cx="22" cy="16" r="3" fill="#c9c9c9" opacity="0.7"/><path d="M6 30 Q22 26 38 30" stroke="#4a7f8a" stroke-width="0.8" fill="none" opacity="0.5"/></g>`,
    tao: `<g><ellipse cx="16" cy="26" rx="10" ry="11" fill="#d94a5a" stroke="#6d1512" stroke-width="0.8"/><ellipse cx="24" cy="22" rx="8" ry="9" fill="#e26a7a" stroke="#8a2a2a" stroke-width="0.6"/><path d="M20 12 Q22 4 26 3 Q24 8 26 12" stroke="#4a7f3a" stroke-width="1.2" fill="none"/><ellipse cx="24" cy="6" rx="4" ry="2.5" fill="#4a7f3a"/></g>`,
    jiu: `<g><path d="M14 22 Q14 8 22 8 Q30 8 30 22 L30 42 Q30 50 22 50 Q14 50 14 42 Z" fill="#8a3a1e" stroke="#3a1208" stroke-width="0.8"/><path d="M18 26 Q18 24 22 24 Q26 24 26 26" stroke="#e2b884" stroke-width="0.6" fill="none" opacity="0.7"/><rect x="10" y="6" width="24" height="3" fill="#c9a24a"/><path d="M16 44 L28 44" stroke="#c9a24a" stroke-width="1"/></g>`,
    le: `<g><rect x="6" y="14" width="32" height="24" fill="#f2e5c9" stroke="#8a6a25" stroke-width="0.8"/><path d="M10 20 L34 20 M10 26 L34 26 M10 32 L26 32" stroke="#3a2410" stroke-width="0.6"/><text x="22" y="46" text-anchor="middle" font-size="9" font-family="KaiTi,STKaiti,serif" fill="#8a1e1e">乐</text></g>`,
    shandian: `<g><path d="M22 4 L10 28 L20 28 L14 50 L34 22 L24 22 L30 4 Z" fill="#e2d84a" stroke="#8a6a25" stroke-width="0.8"/><circle cx="22" cy="24" r="2" fill="#fff" opacity="0.6"/></g>`,
    bingliang: `<g><path d="M10 20 L30 20 L28 46 L12 46 Z" fill="#8a6a25" stroke="#3a2410" stroke-width="0.8"/><path d="M12 24 L28 24 M12 28 L28 28" stroke="#3a2410" stroke-width="0.5" opacity="0.6"/><text x="20" y="42" text-anchor="middle" font-size="10" font-family="KaiTi,STKaiti,serif" fill="#e8d8b3">兵</text></g>`,
    wuzhongseng: `<g><circle cx="20" cy="24" r="14" fill="#f2d67a" stroke="#8a6a25" stroke-width="0.8" opacity="0.85"/><path d="M20 12 L20 36 M10 24 L30 24" stroke="#8a6a25" stroke-width="0.8"/><text x="20" y="48" text-anchor="middle" font-size="10" font-family="KaiTi,STKaiti,serif" fill="#3a2410">无中</text></g>`,
    guohe: `<g><path d="M4 34 Q18 12 36 32" stroke="#5a3a20" stroke-width="2.4" fill="none"/><path d="M10 30 L14 24 L18 30 L14 36 Z" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.6"/><path d="M28 20 L34 30" stroke="#8a1e1e" stroke-width="1.8"/></g>`,
    shunshou: `<g><path d="M14 12 Q22 6 30 14 L28 34 Q22 44 14 34 Z" fill="#e8cfa8" stroke="#8a6a25" stroke-width="0.8"/><circle cx="22" cy="24" r="3" fill="#8a6a25" opacity="0.5"/><path d="M10 32 L14 30 M34 32 L30 30" stroke="#c9a24a" stroke-width="1.2"/></g>`,
    juedou: `<g><path d="M6 40 L28 12" stroke="#c9c9c9" stroke-width="3" fill="none"/><path d="M34 40 L12 12" stroke="#c9c9c9" stroke-width="3" fill="none"/><path d="M2 44 L10 36 M38 44 L30 36" stroke="#8a1e1e" stroke-width="2"/><path d="M6 44 L14 36" stroke="#3a2410" stroke-width="1.4"/></g>`,
    nanman: `<g><path d="M8 40 Q20 6 32 40" fill="#8a3a1e" stroke="#3a1208" stroke-width="0.8"/><circle cx="20" cy="22" r="4" fill="#e8cfa8" stroke="#3a2410" stroke-width="0.6"/><path d="M12 44 L28 44" stroke="#5a3a20" stroke-width="2"/><path d="M4 46 L8 38 M36 46 L32 38" stroke="#8a1e1e" stroke-width="1.4"/></g>`,
    wanjian: `<g><path d="M6 42 L34 42" stroke="#5a3a20" stroke-width="1"/><path d="M-2 30 Q20 20 42 30" stroke="#8a6a25" stroke-width="1.6" fill="none"/><path d="M20 22 L20 42" stroke="#c9c9c9" stroke-width="1"/><path d="M20 20 L18 24 L22 24 Z" fill="#8a1e1e"/><path d="M10 26 L10 40 M30 26 L30 40" stroke="#c9c9c9" stroke-width="0.8"/></g>`,
    taoyuan: `<g><circle cx="20" cy="24" r="14" fill="#f2d67a" stroke="#8a6a25" stroke-width="0.8"/><path d="M12 24 Q20 12 28 24 Q20 34 12 24" fill="#8a1e1e" opacity="0.7"/><text x="20" y="48" text-anchor="middle" font-size="8" font-family="KaiTi,STKaiti,serif" fill="#3a2410">桃园</text></g>`,
    wugu: `<g><rect x="6" y="20" width="28" height="24" fill="#e8d8b3" stroke="#8a6a25" stroke-width="0.8"/><circle cx="14" cy="28" r="3" fill="#c94a3a"/><circle cx="26" cy="28" r="3" fill="#4a7f3a"/><circle cx="14" cy="38" r="3" fill="#d9a53a"/><circle cx="26" cy="38" r="3" fill="#8a6a25"/><path d="M4 20 L36 20" stroke="#5a3a20" stroke-width="2"/></g>`,
    wuxie: `<g><path d="M20 4 L34 10 L34 26 Q34 42 20 48 Q6 42 6 26 L6 10 Z" fill="#4a7f8a" stroke="#1a3a4a" stroke-width="1"/><text x="20" y="32" text-anchor="middle" font-size="10" font-family="KaiTi,STKaiti,serif" fill="#f2e5c9">无懈</text></g>`,
    jiedao: `<g><path d="M8 40 L32 18" stroke="#c9c9c9" stroke-width="2.4"/><path d="M32 18 L36 14" stroke="#c9c9c9" stroke-width="2.4"/><path d="M30 16 L36 22 M34 12 L40 18" stroke="#8a1e1e" stroke-width="1.6"/><circle cx="12" cy="38" r="3" fill="#e8cfa8" stroke="#3a2410" stroke-width="0.6"/></g>`,
    huogong: `<g><path d="M20 6 Q30 18 20 34 Q12 22 20 6" fill="#e2543a" stroke="#8a1e1e" stroke-width="0.8"/><path d="M20 14 Q24 22 20 30 Q17 22 20 14" fill="#f2d67a" opacity="0.9"/><path d="M12 40 Q20 34 28 40 L26 48 Q20 44 14 48 Z" fill="#5a3a20"/></g>`,
    tiesuo: `<g><path d="M6 24 Q14 14 20 24 Q26 34 34 24" stroke="#c9c9c9" stroke-width="3" fill="none"/><circle cx="6" cy="24" r="2" fill="#8a8a8a"/><circle cx="34" cy="24" r="2" fill="#8a8a8a"/><path d="M8 32 L12 34 M28 34 L32 32" stroke="#c9a24a" stroke-width="1.4"/></g>`,
    zhiji: `<g><circle cx="16" cy="22" r="7" fill="#e8cfa8" stroke="#3a2410" stroke-width="0.6"/><circle cx="28" cy="22" r="7" fill="#e8cfa8" stroke="#3a2410" stroke-width="0.6"/><path d="M14 22 Q16 20 18 22 M26 22 Q28 20 30 22" stroke="#3a2410" stroke-width="0.6" fill="none"/><path d="M12 32 Q22 40 32 32" stroke="#8a6a25" stroke-width="1.2" fill="none"/><text x="22" y="48" text-anchor="middle" font-size="7" font-family="KaiTi,STKaiti,serif" fill="#3a2410">知己</text></g>`,
    nuliang: `<g><path d="M14 18 L14 36 L26 36 L26 18 Z" fill="#5a3a20" stroke="#3a1208" stroke-width="0.6"/><circle cx="20" cy="26" r="4" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.6"/><path d="M20 22 L20 14 L26 12" stroke="#8a6a25" stroke-width="1"/><path d="M10 40 L30 40" stroke="#3a2410" stroke-width="1.4"/></g>`,
    shuanggu: `<g><path d="M8 8 L14 40 L20 8 Z" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.6"/><path d="M20 8 L26 40 L32 8 Z" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.6"/><rect x="14" y="40" width="12" height="3" fill="#8a6a25"/></g>`,
    qinggang: `<g><path d="M20 4 L26 24 L24 44 L16 44 L14 24 Z" fill="#a8b5c9" stroke="#3a2410" stroke-width="0.8"/><rect x="10" y="44" width="20" height="3" fill="${gold}"/><rect x="18" y="47" width="4" height="6" fill="#3a2410"/></g>`,
    qinglong: `<g><path d="M8 26 Q20 4 32 26 L32 40 L8 40 Z" fill="#a8b5c9" stroke="#3a2410" stroke-width="0.8"/><rect x="6" y="40" width="28" height="3" fill="${gold}"/><path d="M14 46 L26 46 L24 52 L16 52 Z" fill="#5a3a20"/></g>`,
    zhangba: `<g><rect x="19" y="10" width="2" height="36" fill="#5a3a20"/><path d="M14 6 L26 6 L22 20 L18 20 Z" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.6"/><path d="M20 14 L24 20 L18 22 Z" fill="${gold}" opacity="0.7"/></g>`,
    guanshi: `<g><rect x="19" y="14" width="2" height="30" fill="#5a3a20"/><path d="M10 10 L30 10 L26 22 L14 22 Z" fill="#8a8a8a" stroke="#3a2410" stroke-width="0.8"/><path d="M14 22 L26 22 L20 28 Z" fill="#6a6a6a"/></g>`,
    fangtian: `<g><rect x="19" y="6" width="2" height="42" fill="#5a3a20"/><path d="M10 8 L30 8 L24 20 L16 20 Z" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.8"/><path d="M6 6 L14 6 L10 12 Z" fill="${gold}"/><path d="M26 6 L34 6 L30 12 Z" fill="${gold}"/><circle cx="20" cy="14" r="1.6" fill="${red}"/></g>`,
    qilin: `<g><path d="M4 26 Q18 8 34 26" stroke="#5a3a20" stroke-width="2.4" fill="none"/><line x1="4" y1="26" x2="34" y2="26" stroke="#e8d8b3" stroke-width="0.5"/><path d="M20 24 L20 40 L18 44 L22 44 L20 40" stroke="#c9c9c9" stroke-width="0.9" fill="none"/><path d="M18 18 L22 18" stroke="${red}" stroke-width="1.4"/></g>`,
    ganjiang: `<g><path d="M12 6 L18 34 L22 34 L28 6 Z" fill="#a8b5c9" stroke="#3a2410" stroke-width="0.6"/><path d="M12 6 L14 34 L18 34 Z" fill="#8a8aa8" opacity="0.8"/><rect x="10" y="34" width="20" height="3" fill="${gold}"/><path d="M18 44 L22 44" stroke="#3a2410" stroke-width="2"/></g>`,
    kaishan: `<g><rect x="19" y="14" width="2" height="30" fill="#5a3a20"/><path d="M8 8 L32 8 L28 24 L12 24 Z" fill="#8a8a8a" stroke="#3a2410" stroke-width="0.8"/><path d="M16 24 L24 24 L20 30 Z" fill="#6a6a6a"/><path d="M10 8 L14 18" stroke="${gold}" stroke-width="0.8"/></g>`,
    luori: `<g><path d="M6 24 Q20 6 34 24" stroke="#8a3a1e" stroke-width="2.4" fill="none"/><line x1="6" y1="24" x2="34" y2="24" stroke="#e8d8b3" stroke-width="0.5"/><circle cx="20" cy="16" r="4" fill="#f2d67a" stroke="#8a6a25" stroke-width="0.6"/><path d="M18 34 L22 34 L20 42 Z" fill="${red}"/></g>`,
    bagua: `<g><circle cx="20" cy="24" r="16" fill="none" stroke="#8a6a25" stroke-width="1.2"/><circle cx="20" cy="24" r="12" fill="none" stroke="#8a6a25" stroke-width="0.8"/><path d="M20 12 L20 18 M20 30 L20 36 M8 24 L14 24 M26 24 L32 24 M11 15 L15 19 M25 29 L29 33 M29 15 L25 19 M15 29 L11 33" stroke="#8a6a25" stroke-width="0.9"/><circle cx="20" cy="24" r="3" fill="${red}"/></g>`,
    renwang: `<g><path d="M20 6 L34 12 L34 30 Q34 44 20 48 Q6 44 6 30 L6 12 Z" fill="${red}" stroke="#6d1512" stroke-width="1"/><path d="M14 14 Q20 20 26 14 Q20 24 14 14" fill="${gold}"/><circle cx="20" cy="30" r="4" fill="${gold}" opacity="0.8"/></g>`,
    tengjia: `<g><path d="M8 14 Q20 4 32 14 L34 40 Q20 48 6 40 Z" fill="#4a7f3a" stroke="#1a3a10" stroke-width="0.8"/><g stroke="#1a3a10" stroke-width="0.6" fill="none" opacity="0.55"><path d="M12 18 L28 18 M12 24 L28 24 M12 30 L28 30 M12 36 L28 36"/><path d="M14 14 L14 42 M20 12 L20 44 M26 14 L26 42"/></g></g>`,
    mingguang: `<g><path d="M8 14 Q20 4 32 14 L34 40 Q20 48 6 40 Z" fill="#c9c9c9" stroke="#3a2410" stroke-width="0.8"/><circle cx="20" cy="22" r="6" fill="${gold}" opacity="0.9"/><path d="M14 34 L26 34 M14 38 L26 38" stroke="${gold}" stroke-width="0.8"/></g>`,
    chitu: `<g><path d="M8 34 Q18 20 30 32" fill="#e2543a" stroke="#8a1e1e" stroke-width="0.8"/><path d="M14 38 L14 46 M18 38 L18 46 M24 38 L24 46 M28 38 L28 46" stroke="#3a1208" stroke-width="1.4"/><circle cx="26" cy="24" r="4" fill="#e2543a" stroke="#8a1e1e" stroke-width="0.6"/><path d="M32 14 Q34 8 30 6 L28 14" fill="#5a3a20"/></g>`,
    dilu: `<g><ellipse cx="20" cy="30" rx="14" ry="10" fill="#4a7f5a" stroke="#1a3a20" stroke-width="0.8"/><path d="M14 24 Q18 18 24 24" fill="#4a7f5a" stroke="#1a3a20" stroke-width="0.6"/><circle cx="22" cy="24" r="1" fill="#1a3a20"/><path d="M10 36 L10 44 M14 38 L14 46 M26 38 L26 46 M30 36 L30 44" stroke="#1a3a20" stroke-width="1.4"/></g>`,
    jueying: `<g><path d="M6 32 Q16 22 28 30 Q32 26 34 32 L32 44 L10 44 Z" fill="#3a3a8a" stroke="#1a1a4a" stroke-width="0.8"/><path d="M14 26 Q16 20 22 24" fill="#3a3a8a"/><circle cx="20" cy="26" r="1" fill="${gold}"/><path d="M8 44 L8 48 M14 44 L14 48 M26 44 L26 48 M32 44 L32 48" stroke="#1a1a4a" stroke-width="1.2"/></g>`,
    zhaohuang: `<g><path d="M8 32 Q20 20 32 32 L30 44 L10 44 Z" fill="#d9a53a" stroke="#8a6a25" stroke-width="0.8"/><path d="M22 22 Q26 16 30 22" fill="#d9a53a" stroke="#8a6a25" stroke-width="0.6"/><circle cx="26" cy="24" r="1.4" fill="#3a2410"/><path d="M14 30 L10 22 L14 24" fill="#d9a53a"/><path d="M10 44 L10 48 M16 44 L16 48 M24 44 L24 48 M30 44 L30 48" stroke="#5a3a20" stroke-width="1.2"/></g>`,
    baima: `<g><path d="M8 32 Q20 22 32 32 L30 44 L10 44 Z" fill="#f2f2f2" stroke="#8a8a8a" stroke-width="0.8"/><path d="M22 22 Q26 16 30 22" fill="#f2f2f2" stroke="#8a8a8a" stroke-width="0.6"/><circle cx="26" cy="24" r="1" fill="#3a2410"/><path d="M10 44 L10 48 M16 44 L16 48 M24 44 L24 48 M30 44 L30 48" stroke="#8a8a8a" stroke-width="1.2"/><path d="M22 12 L22 22 L26 20" stroke="#c9c9c9" stroke-width="1" fill="none"/></g>`,
    zixin: `<g><path d="M8 32 Q20 20 32 32 L30 44 L10 44 Z" fill="#7a4a8a" stroke="#3a1a4a" stroke-width="0.8"/><path d="M22 22 Q26 16 30 22" fill="#7a4a8a"/><circle cx="26" cy="24" r="1" fill="${gold}"/><path d="M8 44 L8 48 M14 44 L14 48 M26 44 L26 48 M32 44 L32 48" stroke="#3a1a4a" stroke-width="1.2"/></g>`,
    jingfan: `<g><path d="M8 30 Q20 20 32 30 L32 44 L8 44 Z" fill="#8a3a1e" stroke="#3a1208" stroke-width="0.8"/><path d="M14 22 Q22 12 30 22" fill="#8a3a1e" stroke="#3a1208" stroke-width="0.6"/><circle cx="24" cy="24" r="1.4" fill="${gold}"/><path d="M6 22 Q4 14 10 12 L12 22" fill="#3a2410" opacity="0.85"/><path d="M34 22 Q36 14 30 12 L28 22" fill="#3a2410" opacity="0.85"/></g>`,
    kuaihang: `<g><path d="M6 32 L34 32 L30 46 L10 46 Z" fill="#4a7f8a" stroke="#1a3a4a" stroke-width="0.8"/><path d="M14 20 L20 8 L26 20 Z" fill="#4a7f8a" stroke="#1a3a4a" stroke-width="0.6"/><path d="M8 46 Q20 52 32 46" stroke="#1a3a4a" stroke-width="0.8" fill="none"/><path d="M12 38 L20 44 L28 38" stroke="#c9a24a" stroke-width="0.8" fill="none"/></g>`
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 54">${map[defId] || `<rect width="40" height="54" fill="#8a6a25" opacity="0.3"/>`}</svg>`;
}

// 装备小图标（用于座位装备位）
export function equipGlyph(defId) {
  // 简单符号版 — 用于超小展示
  const map = {
    nuliang:'弩', shuanggu:'剑', qinggang:'剑', qinglong:'刀', zhangba:'矛', guanshi:'斧', fangtian:'戟', qilin:'弓', ganjiang:'剑', kaishan:'斧', luori:'弓',
    bagua:'卦', renwang:'盾', tengjia:'藤', mingguang:'铠',
    chitu:'马', dilu:'马', jueying:'马', zhaohuang:'马', baima:'马', zixin:'马', jingfan:'马', kuaihang:'舟'
  };
  return map[defId] || '装';
}
