// 卡牌数据（126张）— 依据「三国杀·烽烟革新版」文档
// 花色: s=黑桃♠ h=红桃♥ c=梅花♣ d=方块♦
// 点数: 1=A 11=J 12=Q 13=K
export const SUIT_NAME = { s: '♠', h: '♥', c: '♣', d: '♦' };
export const SUIT_CN = { s: '黑桃', h: '红桃', c: '梅花', d: '方块' };
export const RANK_NAME = { 1:'A', 11:'J', 12:'Q', 13:'K' };
export function rankText(r) { return RANK_NAME[r] || String(r); }
export function isRed(suit) { return suit === 'h' || suit === 'd'; }
export function suitColor(suit) { return isRed(suit) ? 'red' : 'black'; }

// 卡种定义
export const CARD_DEFS = {
  // ===== 基本牌 =====
  sha:  { name: '杀',   type: 'basic', subtype: '', kind: 'attack', desc: '对距离1以内一名角色造成1点伤害；每回合限出1张' },
  shan: { name: '闪',   type: 'basic', subtype: '', kind: 'dodge',  desc: '抵消一张【杀】的伤害' },
  tao:  { name: '桃',   type: 'basic', subtype: '', kind: 'peach',  desc: '回复1点体力（回合内对自己用；回合外对濒死角色用）' },
  jiu:  { name: '酒',   type: 'basic', subtype: '', kind: 'wine',   desc: '本回合下一张【杀】伤害+1；自己濒死时可当【桃】用' },

  // ===== 延时锦囊 =====
  le:      { name: '乐不思蜀', type: 'trick', subtype: 'delay', delay: true,  desc: '判定：若不为♥，跳过出牌阶段' },
  shandian:{ name: '闪电',    type: 'trick', subtype: 'delay', delay: true,  desc: '判定：若为♠2~9，受到3点雷电伤害，否则移到下家' },
  bingliang:{name: '兵粮寸断', type: 'trick', subtype: 'delay', delay: true, desc: '判定：若不为♣，跳过摸牌阶段' },

  // ===== 普通锦囊 =====
  wuzhongseng: { name: '无中生有', type: 'trick', subtype: 'normal', target: 'self',       desc: '摸两张牌' },
  guohe:       { name: '过河拆桥', type: 'trick', subtype: 'normal', target: 'other',      desc: '弃置一名角色的一张牌' },
  shunshou:    { name: '顺手牵羊', type: 'trick', subtype: 'normal', target: 'other_d1',   desc: '获得距离1以内一名角色的一张牌' },
  juedou:      { name: '决斗',     type: 'trick', subtype: 'normal', target: 'other',      desc: '与一名角色轮流打出【杀】，先打不出者受1点伤害' },
  nanman:      { name: '南蛮入侵', type: 'trick', subtype: 'normal', target: 'all_others', desc: '所有其他角色打出【杀】，否则受1点伤害' },
  wanjian:     { name: '万箭齐发', type: 'trick', subtype: 'normal', target: 'all_others', desc: '所有其他角色打出【闪】，否则受1点伤害' },
  taoyuan:     { name: '桃园结义', type: 'trick', subtype: 'normal', target: 'all',        desc: '所有角色各回复1点体力' },
  wugu:        { name: '五谷丰登', type: 'trick', subtype: 'normal', target: 'all',        desc: '亮出牌堆顶X张牌（X=存活人数），每人选一张收为手牌' },
  wuxie:       { name: '无懈可击', type: 'trick', subtype: 'normal', target: 'counter',    desc: '抵消一张锦囊牌对一名角色的效果' },
  jiedao:      { name: '借刀杀人', type: 'trick', subtype: 'normal', target: 'other_w',    desc: '令装备武器的角色对其攻击范围内角色使用【杀】，否则武器归你' },
  huogong:     { name: '火攻',     type: 'trick', subtype: 'normal', target: 'other',      desc: '展示一张手牌，令对方展示同花色手牌并弃之，否则受1点火焰伤害' },
  tiesuo:      { name: '铁索连环', type: 'trick', subtype: 'normal', target: 'up_to_2',    desc: '将两名角色连环（属性伤害传导），或解除所有连环' },
  zhiji:       { name: '知己知彼', type: 'trick', subtype: 'normal', target: 'other',      desc: '观看一名角色的手牌' },

  // ===== 武器 =====
  nuliang:    { name: '诸葛连弩',     type: 'equip', subtype: 'weapon', range: 1, desc: '出牌阶段可无限出【杀】' },
  shuanggu:   { name: '雌雄双股剑',   type: 'equip', subtype: 'weapon', range: 2, desc: '你使用【杀】指定异性角色后，可令其弃一张手牌或让你摸一张牌' },
  qinggang:   { name: '青釭剑',       type: 'equip', subtype: 'weapon', range: 2, desc: '你使用【杀】时无视目标的防具' },
  qinglong:   { name: '青龙偃月刀',   type: 'equip', subtype: 'weapon', range: 3, desc: '你的【杀】被【闪】抵消后，可再追一张【杀】' },
  zhangba:    { name: '丈八蛇矛',     type: 'equip', subtype: 'weapon', range: 3, desc: '你可以将两张手牌当【杀】使用' },
  guanshi:    { name: '贯石斧',       type: 'equip', subtype: 'weapon', range: 3, desc: '你的【杀】被【闪】抵消后，可弃两张手牌使此【杀】依然造成伤害' },
  fangtian:   { name: '方天画戟',     type: 'equip', subtype: 'weapon', range: 4, desc: '你使用【杀】时，若这是你手牌最后一张，可额外指定两个目标' },
  qilin:      { name: '麒麟弓',       type: 'equip', subtype: 'weapon', range: 5, desc: '你使用【杀】造成伤害后，可弃置目标一匹马' },
  ganjiang:   { name: '干将莫邪',     type: 'equip', subtype: 'weapon', range: 2, desc: '当你失去此装备时，可令一名角色摸一张牌' },
  kaishan:    { name: '开山大斧',     type: 'equip', subtype: 'weapon', range: 3, desc: '你使用【杀】未造成伤害后，可弃置目标一张牌' },
  luori:      { name: '落日弓',       type: 'equip', subtype: 'weapon', range: 4, desc: '你使用【杀】指定目标后，可令本回合该角色不能用【闪】响应下一张【杀】' },

  // ===== 防具 =====
  bagua:   { name: '八卦阵',   type: 'equip', subtype: 'armor', desc: '需出【闪】时，可进行判定：若为红色，视为使用【闪】' },
  renwang: { name: '仁王盾',   type: 'equip', subtype: 'armor', desc: '黑色【杀】对你无效' },
  tengjia: { name: '藤甲',     type: 'equip', subtype: 'armor', desc: '普通【杀】【南蛮】【万箭】对你无效；受火焰伤害+1' },
  mingguang:{name: '明光铠',   type: 'equip', subtype: 'armor', desc: '你成为【杀】的目标后，可弃一张牌抵消此【杀】（每回合限一次）' },

  // ===== 坐骑 =====
  chitu:    { name: '赤兔',     type: 'equip', subtype: 'horseA', desc: '进攻马：你计算与其他角色距离-1' },
  dilu:     { name: '的卢',     type: 'equip', subtype: 'horseD', desc: '防御马：其他角色计算与你距离+1' },
  jueying:  { name: '绝影',     type: 'equip', subtype: 'horseD', desc: '防御马：其他角色计算与你距离+1' },
  zhaohuang:{ name: '爪黄飞电', type: 'equip', subtype: 'horseA', desc: '进攻马：距离-1；手牌上限+1' },
  baima:    { name: '白马',     type: 'equip', subtype: 'horseA', desc: '进攻马：距离-1；你使用【杀】无距离限制' },
  zixin:    { name: '紫骍',     type: 'equip', subtype: 'horseD', desc: '防御马：其他角色计算与你距离+1' },
  jingfan:  { name: '惊帆',     type: 'equip', subtype: 'horseA', desc: '坐骑：距离-1（攻+防合一）' },
  kuaihang: { name: '快航',     type: 'equip', subtype: 'horseA', desc: '坐骑：距离-1；跳过出牌阶段后可弃此牌改为摸两张牌' }
};

// 每张卡的花色/点数列表（严格按文档分布）
const LIST = [];
let uid = 0;
function push(defId, suit, rank, n = 1) {
  for (let i = 0; i < n; i++) {
    LIST.push({ id: `${defId}#${++uid}`, defId, suit, rank, ...CARD_DEFS[defId] });
  }
}

// ===== 杀 ×30: ♠×9 ♥×5 ♣×9 ♦×7 =====
push('sha','s',7,1); push('sha','s',8,1); push('sha','s',9,1); push('sha','s',10,1);
push('sha','s',3,1); push('sha','s',4,1); push('sha','s',5,1); push('sha','s',6,1); push('sha','s',2,1);
push('sha','h',10,1); push('sha','h',11,1); push('sha','h',12,1); push('sha','h',13,1); push('sha','h',9,1);
push('sha','c',2,1); push('sha','c',3,1); push('sha','c',4,1); push('sha','c',5,1);
push('sha','c',6,1); push('sha','c',7,1); push('sha','c',8,1); push('sha','c',9,1); push('sha','c',10,1);
push('sha','d',6,1); push('sha','d',7,1); push('sha','d',8,1); push('sha','d',9,1);
push('sha','d',10,1); push('sha','d',11,1); push('sha','d',12,1);

// ===== 闪 ×16: ♠×2 ♥×8 ♣×4 ♦×2 =====
push('shan','s',11,1); push('shan','s',12,1);
push('shan','h',2,1); push('shan','h',2,1);
push('shan','h',7,1); push('shan','h',8,1); push('shan','h',9,1); push('shan','h',10,1);
push('shan','h',11,1); push('shan','h',12,1);
push('shan','c',10,1); push('shan','c',11,1); push('shan','c',12,1); push('shan','c',13,1);
push('shan','d',2,1); push('shan','d',2,1);

// ===== 桃 ×9: ♥×7 ♦×2 =====
push('tao','h',3,1); push('tao','h',4,1); push('tao','h',6,1);
push('tao','h',8,1); push('tao','h',9,1); push('tao','h',12,1); push('tao','h',13,1);
push('tao','d',1,1); push('tao','d',2,1);

// ===== 酒 ×3: ♠×1 ♣×1 ♦×1 =====
push('jiu','s',13,1); push('jiu','c',13,1); push('jiu','d',13,1);

// ===== 延时锦囊 6 张 =====
push('le','h',6,1); push('le','s',6,1); push('le','c',6,1);
push('shandian','h',12,1); push('shandian','s',12,1);
push('bingliang','c',10,1);

// ===== 普通锦囊 36 张 =====
push('wuzhongseng','h',7,1); push('wuzhongseng','h',8,1); push('wuzhongseng','h',9,1); push('wuzhongseng','h',11,1);
push('guohe','s',3,1); push('guohe','s',4,1); push('guohe','s',12,1); push('guohe','h',12,1);
push('shunshou','s',3,1); push('shunshou','s',4,1); push('shunshou','s',11,1);
push('juedou','c',1,1); push('juedou','h',1,1); push('juedou','d',1,1);
push('nanman','s',7,1); push('nanman','s',13,1); push('nanman','c',7,1);
push('wanjian','h',1,1); push('wanjian','h',1,1); push('wanjian','h',13,1);
push('taoyuan','h',1,1);
push('wugu','h',3,1); push('wugu','h',4,1);
push('wuxie','s',11,1); push('wuxie','s',12,1); push('wuxie','s',13,1); push('wuxie','c',12,1);
push('jiedao','s',12,1); push('jiedao','s',13,1);
push('huogong','h',2,1); push('huogong','d',3,1);
push('tiesuo','c',11,1); push('tiesuo','c',12,1); push('tiesuo','h',11,1);
push('zhiji','h',5,1); push('zhiji','d',5,1);

// ===== 武器 12 张（补一张诸葛连弩凑齐 26 装备 / 126 总数）=====
push('nuliang','c',5,1); push('nuliang','h',5,1); push('nuliang','d',5,1);
push('shuanggu','s',2,1);
push('qinggang','s',7,1);
push('qinglong','s',5,1);
push('zhangba','s',12,1);
push('guanshi','d',3,1);
push('fangtian','d',4,1);
push('qilin','h',10,1);
push('ganjiang','s',2,1);
push('kaishan','s',6,1);
push('luori','h',4,1);

// ===== 防具 5 张 =====
push('bagua','s',2,1); push('bagua','c',2,1);
push('renwang','s',5,1);
push('tengjia','s',4,1);
push('mingguang','h',3,1);

// ===== 坐骑 8 张 =====
push('chitu','d',13,1);
push('dilu','c',9,1);
push('jueying','d',9,1);
push('zhaohuang','h',13,1);
push('baima','h',11,1);
push('zixin','s',10,1);
push('jingfan','d',7,1);
push('kuaihang','c',13,1);

// 冻结
LIST.forEach(c => Object.freeze(c));
Object.freeze(LIST);

export const CARD_LIST = LIST;
export const CARD_COUNT = LIST.length;

// 构造一副新牌堆（洗牌）
export function buildDeck() {
  const arr = LIST.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 快速查询
export function defOf(defId) { return CARD_DEFS[defId]; }
export function isBasic(c) { return c.type === 'basic'; }
export function isTrick(c) { return c.type === 'trick'; }
export function isEquip(c) { return c.type === 'equip'; }
export function isWeapon(c) { return c.subtype === 'weapon'; }
export function isArmor(c) { return c.subtype === 'armor'; }
export function isHorse(c) { return c.subtype === 'horseA' || c.subtype === 'horseD'; }
export function isAttackHorse(c) { return c.subtype === 'horseA'; }
export function isDefenseHorse(c) { return c.subtype === 'horseD'; }
