/* 《余烬弹匣：末日突围》核心数值与剧情配置（25把原创高清枪械 + 6集5波次长节奏战役 + 4名可动分体主角，ES2017） */
(function (global) {
  'use strict';

  var RARITIES = {
    white:    { id: 'white',    name: '普通', color: '#dde6ef', glow: 'rgba(221,230,239,0.45)', mult: 1.00, affixes: 0, salvage: 6  },
    green:    { id: 'green',    name: '精良', color: '#5ce68a', glow: 'rgba(92,230,138,0.58)',  mult: 1.24, affixes: 1, salvage: 12 },
    blue:     { id: 'blue',     name: '稀有', color: '#58b4ff', glow: 'rgba(88,180,255,0.68)',  mult: 1.54, affixes: 1, salvage: 20 },
    purple:   { id: 'purple',   name: '史诗', color: '#c875ff', glow: 'rgba(200,117,255,0.78)', mult: 1.94, affixes: 2, salvage: 36 },
    orange:   { id: 'orange',   name: '传说', color: '#ffa93b', glow: 'rgba(255,169,59,0.88)',  mult: 2.50, affixes: 3, salvage: 62 },
    red:      { id: 'red',      name: '神装', color: '#ff4d57', glow: 'rgba(255,77,87,0.95)',   mult: 3.25, affixes: 3, salvage: 100 },
    darkgold: { id: 'darkgold', name: '暗金', color: '#ffe566', glow: 'rgba(255,229,102,1.0)',  mult: 4.25, affixes: 4, salvage: 180 }
  };

  var GEAR_DEFS = [
    { id: 'armor',  name: '战术防具', icon: 'assets/icons/eq_armor.svg',  statDesc: '提升生命上限与物理减伤', baseHp: 38, baseRed: 0.04, maxEnh: 15 },
    { id: 'helmet', name: '战术头盔', icon: 'assets/icons/eq_helmet.svg', statDesc: '提升能量护盾与暴击率',   baseSh: 28, baseCrit: 0.03, maxEnh: 15 },
    { id: 'chip',   name: '火控核心', icon: 'assets/icons/eq_chip.svg',   statDesc: '提升全局攻击与护甲穿透', baseAtk: 0.05, basePen: 0.04, maxEnh: 15 }
  ];

  var GEAR_NAMES = {
    armor:  { white: '制式防弹衣', green: '凯夫拉战术甲', blue: '合金突击重甲', purple: '紫晶特战护甲', orange: '炽焰统领战甲', red: '绯红神威重甲', darkgold: '暗金圣耀外骨骼' },
    helmet: { white: '军用制式钢盔', green: '夜视战术头盔', blue: '全息蔚蓝目镜盔', purple: '紫晶V型特战盔', orange: '炽焰指挥重盔', red: '绯红血月战盔', darkgold: '暗金王冠霸主盔' },
    chip:   { white: '基础火控模组', green: '双核战术电芯', blue: '蔚蓝等离子核心', purple: '紫晶幽能推进芯', orange: '烈焰光翼核心', red: '绯红聚变反应芯', darkgold: '暗金炽天使核心' }
  };

  /* 强化只升级等级（+0..+15），绝不改变品质！外观阶位由装备本身品质决定 */
  function getRarityTierIndex(rarId) {
    if (rarId === 'darkgold') return 5;
    if (rarId === 'red' || rarId === 'orange') return 4;
    if (rarId === 'purple') return 3;
    if (rarId === 'blue') return 2;
    if (rarId === 'green') return 1;
    return 0;
  }

  /* 紧缩实感评级标准（10~320 评分，一眼看懂武器档次！） */
  function getRatingGrade(score) {
    if (score >= 280) return { grade: 'EX', color: '#ffe566' };
    if (score >= 220) return { grade: 'SS', color: '#ff5268' };
    if (score >= 150) return { grade: 'S',  color: '#ffa93b' };
    if (score >= 100) return { grade: 'A+', color: '#d484ff' };
    if (score >= 60)  return { grade: 'A',  color: '#58b4ff' };
    if (score >= 35)  return { grade: 'B',  color: '#5ce68a' };
    if (score >= 20)  return { grade: 'C',  color: '#b8d0e8' };
    return { grade: 'D', color: '#9aa8bd' };
  }

  /* 武器被动技能池（蓝装 85% 带 1 个，紫装必带 1 个，橙装 1~2 个，红/暗金必带 2 个！） */
  var WEAPON_SKILLS = [
    { id: 'ws_reload',  name: '击毙回弹', desc: '击杀目标立即回复 12% 弹匣弹药' },
    { id: 'ws_slow',    name: '击中减速', desc: '命中降低敌人 35% 移速持续 2 秒' },
    { id: 'ws_poison',  name: '剧毒侵蚀', desc: '命中附加持续毒伤（每秒 18% 伤害）' },
    { id: 'ws_splash',  name: '击毙溅射', desc: '击杀时对周围 140px 造成 35% 溅射伤害' },
    { id: 'ws_heal',    name: '击毙回血', desc: '每次击杀回复 3% 最大生命值' },
    { id: 'ws_frenzy',  name: '振奋连杀', desc: '击杀后 2.5 秒内攻击力提升 +18%' },
    { id: 'ws_cripple', name: '致残压制', desc: '命中降低敌人 22% 攻击力持续 2.5 秒' },
    { id: 'ws_stun',    name: '高压麻痹', desc: '命中 12% 概率麻痹敌人 1.2 秒' }
  ];

  /* 神级武器技能池（仅红色神装与暗金神武独占，决定毕业追求！） */
  var GOD_SKILLS = [
    { id: 'gs_rush',     name: '神·快感', desc: '命中 8% 概率触发 3.5 秒狂暴，射速翻倍且免耗弹！' },
    { id: 'gs_pierce',   name: '神·穿刺', desc: '穿透不衰减，每穿 1 敌额外增伤 +22%！' },
    { id: 'gs_exec',     name: '神·瞬秒', desc: '对血量低于 45% 非首领敌人 15% 概率一击斩杀！' },
    { id: 'gs_missile',  name: '神·派生', desc: '每次开火 18% 概率自动派生追踪高爆微导弹！' },
    { id: 'gs_desp',     name: '神·搏命', desc: '自身血越低攻越高，残血最高 +120% 增伤！' },
    { id: 'gs_refresh',  name: '神·刷新', desc: '命中 10% 概率缩减主动技能冷却 18%！' },
    { id: 'gs_detonate', name: '神·引爆', desc: '命中 14% 概率脚下引爆 200% 范围震荡弹！' }
  ];

  /* 防具/头盔/核心（首饰）专属被动与元素附魔池 */
  var GEAR_PASSIVES = {
    helmet: [
      { id: 'gp_godhand',  name: '绝境护佑', desc: '致命伤害免疫死亡并无敌 2.5 秒（冷却 55s）' },
      { id: 'gp_sh_regen', name: '极速充能', desc: '脱战 4 秒后每秒回复 10% 最大护盾' },
      { id: 'gp_headshot', name: '鹰眼锁头', desc: '对精英与首领暴击伤害额外 +25%' }
    ],
    armor: [
      { id: 'gp_react',  name: '反应装甲', desc: '受击向四周爆发震荡波击退尸群（冷却 8s）' },
      { id: 'gp_iron',   name: '钢铁意志', desc: '生命低于 40% 时额外获得 +25% 伤害减免' },
      { id: 'gp_thorns', name: '荆棘反震', desc: '反弹 60% 近战伤害并附带减速' }
    ],
    chip: [
      { id: 'cp_fire',   name: '炎核吊坠', elem: 'fire',      desc: '火元素附魔：普攻附带灼烧且爆炸范围 +25%' },
      { id: 'cp_ice',    name: '霜晶挂坠', elem: 'ice',       desc: '冰元素附魔：普攻减速，对减速敌增伤 +20%' },
      { id: 'cp_bolt',   name: '磁暴指环', elem: 'lightning', desc: '雷元素附魔：射击 15% 触发连锁感电链' },
      { id: 'cp_venom',  name: '腐毒徽章', elem: 'poison',    desc: '毒元素附魔：击杀留毒潭并额外破甲 +18%' },
      { id: 'cp_mag',    name: '扩容弹链芯', elem: '',        desc: '全局弹匣容量 +35%，换弹提速 +25%' },
      { id: 'cp_swarm',  name: '微导蜂巢芯', elem: 'fire',    desc: '每发射 8 发子弹自动发射 1 枚无人追踪微导弹' },
      { id: 'cp_wind',   name: '穿风骨环',   elem: '',        desc: '受击后触发 6 秒 +15% 移速与射速爆发' },
      { id: 'cp_hunter', name: '猎手目镜芯', elem: '',        desc: '对生命 >85% 敌人首击造成 +35% 破袭伤害' },
      { id: 'cp_prism',  name: '复弹棱镜芯', elem: '',        desc: '所有武器射击额外附加 +1 发副弹丸！' }
    ]
  };

  /* 强化成功率与递增增幅表（+1..+15，仅升强化等级绝不改品质，失败积累祝福值必成！） */
  var ENH_TABLE = [
    { rate: 1.00, add: 0.030, cost: 12 },
    { rate: 1.00, add: 0.060, cost: 16 },
    { rate: 1.00, add: 0.090, cost: 22 },
    { rate: 1.00, add: 0.120, cost: 28 },
    { rate: 1.00, add: 0.150, cost: 36 },
    { rate: 0.78, add: 0.195, cost: 46 },
    { rate: 0.74, add: 0.240, cost: 58 },
    { rate: 0.70, add: 0.285, cost: 72 },
    { rate: 0.65, add: 0.330, cost: 88 },
    { rate: 0.60, add: 0.375, cost: 108 },
    { rate: 0.48, add: 0.435, cost: 132 },
    { rate: 0.44, add: 0.495, cost: 160 },
    { rate: 0.40, add: 0.555, cost: 192 },
    { rate: 0.35, add: 0.615, cost: 230 },
    { rate: 0.30, add: 0.675, cost: 280 }
  ];

  function getEnhAddMult(enh) {
    var lv = Math.max(0, Math.min(15, enh || 0));
    return lv <= 0 ? 0 : ENH_TABLE[lv - 1].add;
  }

  function rollGear(slot, rarityId, enh, itemLv) {
    var rar = RARITIES[rarityId] || RARITIES.white;
    var lv = enh || 0;
    var iLv = Math.max(1, itemLv || 1);
    var nameMap = GEAR_NAMES[slot] || GEAR_NAMES.armor;
    var g = {
      uid: 'g_' + slot + '_' + Math.floor(Math.random() * 1e8) + '_' + Date.now().toString(36).slice(-3),
      slot: slot,
      rarity: rar.id,
      itemLv: iLv,
      enh: lv,
      blessing: 0,
      name: nameMap[rar.id] || '战术装备',
      passive: null,
      hp: 0, shield: 0, dmgReduce: 0, critAdd: 0, atkAdd: 0, penAdd: 0
    };
    /* 核心（首饰）从绿装起必带元素/流派被动，头盔/防具从蓝装起附带战术被动！ */
    var pPool = GEAR_PASSIVES[slot] || [];
    var needPassive = (slot === 'chip' && rar.id !== 'white') || (slot !== 'chip' && (rar.id === 'blue' || rar.id === 'purple' || rar.id === 'orange' || rar.id === 'red' || rar.id === 'darkgold'));
    if (needPassive && pPool.length) {
      var pick = pPool[Math.floor(Math.random() * pPool.length)];
      g.passive = { id: pick.id, name: pick.name, elem: pick.elem || '', desc: pick.desc };
      if (slot === 'chip') g.name = pick.name;
    }
    recalcGearStats(g);
    return g;
  }

  function recalcGearStats(g) {
    var rar = RARITIES[g.rarity] || RARITIES.white;
    var lvScale = 1 + ((g.itemLv || 1) - 1) * 0.045;
    var enhScale = 1 + getEnhAddMult(g.enh || 0);
    var mult = rar.mult * lvScale * enhScale;
    g.hp = 0; g.shield = 0; g.dmgReduce = 0; g.critAdd = 0; g.atkAdd = 0; g.penAdd = 0;
    if (g.slot === 'armor') {
      g.hp = Math.round(32 * mult);
      g.dmgReduce = Math.min(0.45, Number((0.03 * rar.mult + (g.enh || 0) * 0.007).toFixed(3)));
    } else if (g.slot === 'helmet') {
      g.shield = Math.round(24 * mult);
      g.critAdd = Math.min(0.30, Number((0.02 * rar.mult + (g.enh || 0) * 0.005).toFixed(3)));
    } else if (g.slot === 'chip') {
      g.atkAdd = Number((0.04 * rar.mult * (1 + getEnhAddMult(g.enh || 0) * 0.6)).toFixed(3));
      g.penAdd = Math.min(0.38, Number((0.025 * rar.mult + (g.enh || 0) * 0.006).toFixed(3)));
    }
    /* 紧缩真实评分：单件防具/首饰评分约 8 ~ 95 */
    g.power = Math.max(6, Math.round(g.hp * 0.14 + g.shield * 0.22 + g.dmgReduce * 90 + g.critAdd * 110 + g.atkAdd * 120 + g.penAdd * 85 + (g.passive ? 10 : 0)));
    return g;
  }

  /* 重工军需商店：10级解锁无人机 + 破晓战车底盘改装（纯战功点高价购置，绝不白给掉落！） */
  var DRONE_DEFS = [
    { id: 'd_mg',      col: 0, name: '哨兵机枪浮游炮',   rarity: 'green',    unlockLv: 10, costMerit: 1200,  dmg: 18, rate: 16, kind: 'rifle',     elem: '',          color: '#7ef7a6', desc: 'Lv.10 军需商店购置！高速双管机枪自动压制尸群' },
    { id: 'd_laser',   col: 1, name: '寒霜激光无人机',   rarity: 'blue',     unlockLv: 12, costMerit: 3500,  dmg: 44, rate: 30, kind: 'laser',     elem: 'ice',       color: '#69e8ff', desc: '发射穿透冰霜射线，冻结并减速成排感染者' },
    { id: 'd_missile', col: 2, name: '烈焰微导弹无人机', rarity: 'orange',   unlockLv: 15, costMerit: 7800,  dmg: 76, rate: 46, kind: 'missile',   elem: 'fire',      color: '#ff9642', desc: '周期发射高爆追踪微导弹，大范围轰杀精英怪' },
    { id: 'd_tesla',   col: 3, name: '天穹磁暴浮游炮',   rarity: 'darkgold', unlockLv: 18, costMerit: 15000, dmg: 68, rate: 34, kind: 'lightning', elem: 'lightning', color: '#ffe566', desc: '释放高压感电链，在尸群间跳跃麻痹清场' }
  ];

  var WARCAR_MODS = [
    { id: 'wc_blade', name: '重装推土铲改装', rarity: 'blue',   costMerit: 2200, desc: '破晓战车全线碾压伤害永久 +45%' },
    { id: 'wc_twin',  name: '双联高爆火炮塔', rarity: 'orange', costMerit: 5200, desc: '战车行进时发射双联高爆火箭弹齐射' },
    { id: 'wc_aegis', name: '电磁偏导护盾车', rarity: 'red',    costMerit: 9600, desc: '召唤战车瞬间为主角附加 +180 能量护盾' }
  ];

  /* 完整称号系统（佩戴栏仅展示已拥有称号，图鉴中可查看全部未解锁藏品！） */
  var TITLES = [
    { id: 'pioneer',      name: '开创者',     rarity: 'orange',   color: '#ffe566', desc: '攻击 +5% · 暴击 +3%',       hint: '通过「关注有礼」领取创作者补给解锁', atkAdd: 0.05, critAdd: 0.03, hpAdd: 0,  shAdd: 0 },
    { id: 'rookie_clear', name: '断桥生还者', rarity: 'green',    color: '#5ce68a', desc: '生命上限 +35',              hint: '首次通关第 1 集《断桥夜雨》解锁',    atkAdd: 0,    critAdd: 0,    hpAdd: 35, shAdd: 0 },
    { id: 'slayer_300',   name: '尸潮清道夫', rarity: 'blue',     color: '#58b4ff', desc: '攻击 +6%',                  hint: '累计击杀 300 只感染者解锁',          atkAdd: 0.06, critAdd: 0,    hpAdd: 0,  shAdd: 0 },
    { id: 'full_gear',    name: '全副武装',   rarity: 'purple',   color: '#c875ff', desc: '护盾上限 +40',              hint: '同时穿戴头盔、防具与火控核心解锁',   atkAdd: 0,    critAdd: 0,    hpAdd: 0,  shAdd: 40 },
    { id: 'collector_8',  name: '军械收藏家', rarity: 'orange',   color: '#ffa93b', desc: '暴击率 +5%',                hint: '藏品图鉴解锁 8 把不同武器解锁',      atkAdd: 0,    critAdd: 0.05, hpAdd: 0,  shAdd: 0 },
    { id: 'drone_cmd',    name: '苍穹操控师', rarity: 'blue',     color: '#69e8ff', desc: '攻击 +4% · 护盾 +25',       hint: '个人账号等级达到 Lv.10 解锁',        atkAdd: 0.04, critAdd: 0,    hpAdd: 0,  shAdd: 25 },
    { id: 'duo_bond',     name: '双雄并肩',   rarity: 'red',      color: '#ff6b8b', desc: '生命 +50 · 攻击 +6%',       hint: '个人账号等级达到 Lv.20 解锁伙伴',    atkAdd: 0.06, critAdd: 0,    hpAdd: 50, shAdd: 0 },
    { id: 'citadel_king', name: '孤城主宰',   rarity: 'darkgold', color: '#ffe566', desc: '全属性攻击 +10% · 生命 +80', hint: '通关大结局《黎明余烬》解锁',         atkAdd: 0.10, critAdd: 0.03, hpAdd: 80, shAdd: 30 }
  ];

  /* 26 把全流派原创高清枪械（含新手初始白板小手枪） */
  var WEAPON_TEMPLATES = [
    { id: 'pistol_init', name: '制式小手枪', cls: '初始手枪', type: 'pistol',    img: 'w_pistol_init', muzzleLen: 42, minRar: 'white',    dmg: 14,  rate: 13, pellets: 1, spread: 0.05, speed: 17.0, mag: 12,  pierce: 0, splash: 0,   knock: 2.2, elem: '',          color: '#e6eef8' },
    { id: 'm4',         name: '余烬步枪',   cls: '突击步枪', type: 'rifle',     img: 'w_m4',         muzzleLen: 52, minRar: 'white',    dmg: 24,  rate: 10, pellets: 1, spread: 0.05, speed: 17.5, mag: 36,  pierce: 0, splash: 0,   knock: 3.4, elem: '',          color: '#ffd97a' },
    { id: 'ak47',       name: '赤焰突击',   cls: '突击步枪', type: 'rifle',     img: 'w_ak47',       muzzleLen: 52, minRar: 'blue',     dmg: 35,  rate: 11, pellets: 1, spread: 0.07, speed: 18.0, mag: 34,  pierce: 1, splash: 0,   knock: 4.8, elem: 'fire',      color: '#ff9c4a' },
    { id: 'gale',       name: '疾风卡宾',   cls: '突击步枪', type: 'rifle',     img: 'w_gale',       muzzleLen: 52, minRar: 'green',    dmg: 29,  rate: 8,  pellets: 1, spread: 0.06, speed: 18.5, mag: 44,  pierce: 0, splash: 0,   knock: 3.6, elem: '',          color: '#7ef7b2' },
    { id: 'mp5',        name: '幽灵冲锋枪', cls: '冲锋枪',   type: 'rifle',     img: 'w_mp5',        muzzleLen: 48, minRar: 'green',    dmg: 19,  rate: 5,  pellets: 1, spread: 0.09, speed: 17.5, mag: 56,  pierce: 0, splash: 0,   knock: 2.5, elem: '',          color: '#8ee6ff' },
    { id: 'm249',       name: '铁幕班机枪', cls: '重机枪',   type: 'rifle',     img: 'w_m249',       muzzleLen: 54, minRar: 'blue',     dmg: 28,  rate: 7,  pellets: 1, spread: 0.11, speed: 18.0, mag: 90,  pierce: 1, splash: 0,   knock: 3.8, elem: '',          color: '#ffe078' },
    { id: 'gatling',    name: '暴风加特林', cls: '重机枪',   type: 'rifle',     img: 'w_gatling',    muzzleLen: 55, minRar: 'purple',   dmg: 27,  rate: 5,  pellets: 2, spread: 0.14, speed: 18.0, mag: 110, pierce: 0, splash: 0,   knock: 3.0, elem: 'fire',      color: '#ff9642' },
    { id: 'silverfox',  name: '银狐双枪',   cls: '双持手枪', type: 'pistol',    img: 'w_silverfox',  muzzleLen: 44, minRar: 'green',    dmg: 22,  rate: 8,  pellets: 2, spread: 0.08, speed: 17.5, mag: 38,  pierce: 0, splash: 0,   knock: 3.0, elem: '',          color: '#80e8ff' },
    { id: 'scarlet',    name: '绯焰双铳',   cls: '双持手枪', type: 'pistol',    img: 'w_scarlet',    muzzleLen: 44, minRar: 'orange',   dmg: 42,  rate: 7,  pellets: 2, spread: 0.06, speed: 19.0, mag: 44,  pierce: 1, splash: 34,  knock: 4.5, elem: 'fire',      color: '#ff5e42' },
    { id: 'viper',      name: '蝰蛇霰弹',   cls: '霰弹枪',   type: 'shotgun',   img: 'w_viper',      muzzleLen: 50, minRar: 'white',    dmg: 19,  rate: 24, pellets: 5, spread: 0.28, speed: 15.5, mag: 12,  pierce: 0, splash: 0,   knock: 7.5, elem: '',          color: '#ffe08a' },
    { id: 'ember_sg',   name: '余烬双管霰', cls: '霰弹枪',   type: 'shotgun',   img: 'w_ember_sg',   muzzleLen: 50, minRar: 'blue',     dmg: 25,  rate: 21, pellets: 6, spread: 0.30, speed: 16.0, mag: 14,  pierce: 0, splash: 26,  knock: 8.5, elem: 'fire',      color: '#ff7042' },
    { id: 'inferno',    name: '炎狱爆霰',   cls: '霰弹神武', type: 'shotgun',   img: 'w_inferno',    muzzleLen: 50, minRar: 'red',      dmg: 33,  rate: 18, pellets: 7, spread: 0.32, speed: 17.0, mag: 16,  pierce: 1, splash: 42,  knock: 9.8, elem: 'fire',      color: '#ff4252' },
    { id: 'falcon',     name: '苍隼狙击',   cls: '狙击枪',   type: 'sniper',    img: 'w_falcon',     muzzleLen: 58, minRar: 'green',    dmg: 108, rate: 33, pellets: 1, spread: 0.01, speed: 26.0, mag: 10,  pierce: 4, splash: 0,   knock: 10.5,elem: '',          color: '#fff2a6' },
    { id: 'barrett',    name: '雷霆重狙',   cls: '反器材狙', type: 'sniper',    img: 'w_barrett',    muzzleLen: 58, minRar: 'orange',   dmg: 162, rate: 34, pellets: 1, spread: 0.01, speed: 27.5, mag: 10,  pierce: 6, splash: 42,  knock: 13.5,elem: 'fire',      color: '#ffbe58' },
    { id: 'frost_sr',   name: '断铁寒狙',   cls: '狙击枪',   type: 'sniper',    img: 'w_frost_sr',   muzzleLen: 58, minRar: 'purple',   dmg: 142, rate: 30, pellets: 1, spread: 0.01, speed: 27.0, mag: 12,  pierce: 5, splash: 0,   knock: 11.5,elem: 'ice',       color: '#78f2ff' },
    { id: 'aurelia',    name: '耀金裁决狙', cls: '狙击神武', type: 'sniper',    img: 'w_aurelia',    muzzleLen: 58, minRar: 'red',      dmg: 184, rate: 26, pellets: 1, spread: 0.01, speed: 28.0, mag: 14,  pierce: 7, splash: 52,  knock: 13.0,elem: 'lightning', color: '#ffe559' },
    { id: 'grenade',    name: '破片榴弹枪', cls: '榴弹发射', type: 'grenade',   img: 'w_grenade',    muzzleLen: 50, minRar: 'purple',   dmg: 96,  rate: 26, pellets: 1, spread: 0.06, speed: 12.2, mag: 12,  pierce: 0, splash: 104, knock: 12.0,elem: 'fire',      color: '#ff9638' },
    { id: 'rocket',     name: '破城火箭筒', cls: '火箭筒',   type: 'rocket',    img: 'w_rocket',     muzzleLen: 56, minRar: 'blue',     dmg: 90,  rate: 33, pellets: 1, spread: 0.03, speed: 13.0, mag: 10,  pierce: 0, splash: 96,  knock: 11.0,elem: 'fire',      color: '#ff8a3d' },
    { id: 'crimson_rl', name: '猩焰重炮',   cls: '火箭筒',   type: 'rocket',    img: 'w_crimson_rl', muzzleLen: 56, minRar: 'orange',   dmg: 112, rate: 28, pellets: 2, spread: 0.14, speed: 13.5, mag: 12,  pierce: 0, splash: 108, knock: 12.0,elem: 'fire',      color: '#ff4f38' },
    { id: 'trinity_rl', name: '末日三联炮', cls: '火箭神武', type: 'rocket',    img: 'w_trinity_rl', muzzleLen: 56, minRar: 'red',      dmg: 156, rate: 29, pellets: 3, spread: 0.22, speed: 13.5, mag: 12,  pierce: 0, splash: 126, knock: 13.5,elem: 'fire',      color: '#ff3648' },
    { id: 'pyro',       name: '炽焰喷火器', cls: '喷火器',   type: 'flamer',    img: 'w_pyro',       muzzleLen: 52, minRar: 'blue',     dmg: 22,  rate: 5,  pellets: 2, spread: 0.24, speed: 10.5, mag: 76,  pierce: 2, splash: 34,  knock: 2.2, elem: 'fire',      color: '#ff9033' },
    { id: 'cryo',       name: '极寒冻气炮', cls: '冻气炮',   type: 'flamer',    img: 'w_cryo',       muzzleLen: 52, minRar: 'purple',   dmg: 28,  rate: 6,  pellets: 2, spread: 0.20, speed: 11.5, mag: 72,  pierce: 2, splash: 40,  knock: 2.5, elem: 'ice',       color: '#69e8ff' },
    { id: 'star_laser', name: '星轨激光炮', cls: '能量激光', type: 'laser',     img: 'w_star_laser', muzzleLen: 54, minRar: 'orange',   dmg: 80,  rate: 14, pellets: 1, spread: 0.01, speed: 29.0, mag: 36,  pierce: 9, splash: 0,   knock: 5.0, elem: 'laser',     color: '#52f7ff' },
    { id: 'tesla',      name: '苍雷电弧枪', cls: '感电线圈', type: 'lightning', img: 'w_tesla',      muzzleLen: 54, minRar: 'orange',   dmg: 68,  rate: 14, pellets: 1, spread: 0.06, speed: 22.0, mag: 40,  pierce: 2, splash: 72,  knock: 5.5, elem: 'lightning', color: '#80f8ff' },
    { id: 'aegis',      name: '极源·天罚',  cls: '暗金神武', type: 'lightning', img: 'w_aegis',      muzzleLen: 54, minRar: 'darkgold', dmg: 102, rate: 12, pellets: 2, spread: 0.10, speed: 23.0, mag: 54,  pierce: 3, splash: 92,  knock: 7.0, elem: 'lightning', color: '#ffe566' },
    { id: 'astral',     name: '星陨重弩',   cls: '暗金重弩', type: 'crossbow',  img: 'w_astral',     muzzleLen: 56, minRar: 'darkgold', dmg: 168, rate: 18, pellets: 3, spread: 0.14, speed: 24.5, mag: 26,  pierce: 6, splash: 58,  knock: 9.5, elem: 'ice',       color: '#7ef7ff' }
  ];

  var AFFIX_POOL = [
    { id: 'crit',    label: '暴击率+14%',    critAdd: 0.14 },
    { id: 'critDmg', label: '暴击伤害+48%',  critDmgAdd: 0.48 },
    { id: 'spd',     label: '射速+20%',      rateMult: 0.82 },
    { id: 'pierce',  label: '护甲穿透+2',    pierceAdd: 2 },
    { id: 'vamp',    label: '击杀吸血+6',    vampAdd: 6 },
    { id: 'burn',    label: '烈焰灼烧',      elem: 'fire' },
    { id: 'frost',   label: '极寒减速',      elem: 'ice' },
    { id: 'shock',   label: '高压感电链',    elem: 'lightning' },
    { id: 'missile', label: '派生微导弹',    missileChance: 0.20 }
  ];

  var BLUEPRINTS = [
    { tplId: 'ak47',       rarity: 'purple',   chips: 5,  desc: '高伤烈焰穿甲突击步枪，稳健压制前中期尸潮' },
    { tplId: 'grenade',    rarity: 'orange',   chips: 8,  desc: '6发滚筒高爆抛物线榴弹发射器，轰飞成排重盾尸群' },
    { tplId: 'barrett',    rarity: 'orange',   chips: 9,  desc: '重型反器材穿甲大狙，穿透 6 敌并附带高爆震荡波' },
    { tplId: 'inferno',    rarity: 'red',      chips: 12, desc: '7弹丸烈焰爆破霰弹，近距离一枪轰退重甲尸海' },
    { tplId: 'aurelia',    rarity: 'red',      chips: 14, desc: '高额穿甲雷霆狙击，专克高护甲精英与巨型首领' },
    { tplId: 'trinity_rl', rarity: 'red',      chips: 15, desc: '三联发重型火炮，瞬间清空整条街道尸群' },
    { tplId: 'aegis',      rarity: 'darkgold', chips: 22, desc: '暗金神武！双发高压闪电链，自带全图感电清屏' },
    { tplId: 'astral',     rarity: 'darkgold', chips: 22, desc: '暗金神武！三矢穿甲冰霜星弩，兼备冻结与秒杀' }
  ];

  /* 4 位素体无头盔无静置手分体主角（统一 112x120 锚点，支持魔兽世界式全装备实时穿卸叠加！） */
  var HEROES = [
    {
      id: 'chen', name: '陈烬 · 前消防特勤', short: '陈烬', role: '突击队长',
      quote: '“只要弹匣里还有最后一颗子弹，桥头就不会丢。”',
      desc: '生命与输出均衡，步枪/穿甲专精，破甲能力+15%',
      hp: 360, speed: 4.5, crit: 0.16, dmgMult: 1.08, armorPen: 0.15,
      runSheet: 'h_chen_run', shootSheet: 'h_chen_shoot', portrait: 'p_chen', fw: 112, fh: 120, runFrames: 10, shootFrames: 6,
      shoulderY: 40, sleeve: '#546848', glove: '#f4d2b4'
    },
    {
      id: 'lin', name: '林栀 · 绯刃外科特工', short: '林栀', role: '战术刺客',
      quote: '“别死在我前面，血清还没送到江北。”',
      desc: '高机动与高暴击（暴击+18%、移速+16%），双枪连射专家',
      hp: 310, speed: 5.2, crit: 0.34, dmgMult: 1.04, armorPen: 0.10,
      runSheet: 'h_lin_run', shootSheet: 'h_lin_shoot', portrait: 'p_lin', fw: 112, fh: 120, runFrames: 10, shootFrames: 6,
      shoulderY: 40, sleeve: '#662640', glove: '#3a3242'
    },
    {
      id: 'lu', name: '陆铁 · 重装机甲技工', short: '陆铁', role: '重炮手',
      quote: '“破晓战车刚焊好，谁敢碰我弟兄我碾平他！”',
      desc: '重型外骨骼装甲，生命+110、开局护盾+95、爆炸伤害+22%',
      hp: 470, speed: 4.0, crit: 0.14, dmgMult: 1.24, armorPen: 0.08,
      runSheet: 'h_lu_run', shootSheet: 'h_lu_shoot', portrait: 'p_lu', fw: 112, fh: 120, runFrames: 8, shootFrames: 6,
      shoulderY: 40, sleeve: '#9c742a', glove: '#dce4ef'
    },
    {
      id: 'shen', name: '沈青 · 防疫研究员', short: '沈青', role: '生化专家',
      quote: '“三年前我没能拦住那份协议，今天我亲手终结它。”',
      desc: '元素伤害+28%，群体圣光冷却-35%，专克剧毒与重甲',
      hp: 345, speed: 4.6, crit: 0.20, dmgMult: 1.14, armorPen: 0.25,
      runSheet: 'h_shen_run', shootSheet: 'h_shen_shoot', portrait: 'p_shen', fw: 112, fh: 120, runFrames: 10, shootFrames: 6,
      shoulderY: 40, sleeve: '#345472', glove: '#2c3442'
    }
  ];

  var DIFFICULTIES = [
    { id: 'normal',    name: '标准生存', hpMult: 1.25, dmgMult: 1.22, armorAdd: 0.05, luckAdd: 0.00, scoreMult: 1.0, desc: '节奏扎实有压迫感，适合体验全剧情与配装成长' },
    { id: 'nightmare', name: '噩梦封锁', hpMult: 2.00, dmgMult: 1.72, armorAdd: 0.15, luckAdd: 0.24, scoreMult: 1.8, desc: '精英尸潮频出、护甲更高，紫/橙/红装掉率飙升' },
    { id: 'asura',     name: '修罗炼狱', hpMult: 3.05, dmgMult: 2.30, armorAdd: 0.25, luckAdd: 0.45, scoreMult: 3.0, desc: '极限硬核血战！海量狂暴尸潮，高频掉落暗金神武！' }
  ];

  /* 6 集连续剧战役（逻辑递进：首关新手友好 -> 硬仗 -> 割草爽关 -> 暗夜苦战 -> 重炮狂欢 -> 终局血战！） */
  var CHAPTERS = [
    {
      id: 'ch1', ep: '第 1 集', name: '断桥夜雨', tag: '新手启程', mapKey: 'ch1_bridge', weather: 'rain', bossId: 'boss_golem',
      mapX: 14, mapY: 57, recRating: 12, dropPreview: '白/绿装 · 步枪与首件防弹衣',
      chHpMult: 0.52, chDmgMult: 0.60, chSpdMult: 0.88,
      desc: '江北跨江大桥封锁线崩塌之夜，手感友好易上手，刷出你的第一件护甲与步枪',
      intro: [
        { speaker: '陈烬', portrait: 'p_chen', text: '雨越下越大了……东桥头的照明弹已经熄了十分钟，撤离队恐怕撑不住了。' },
        { speaker: '林栀', portrait: 'p_lin',  text: '听！桥墩底下有敲击钢管的求救信号——是修车厂的老陆，他还活着！' },
        { speaker: '陆铁', portrait: 'p_lu',   text: '嘿！手里就算只有小手枪也能杀出去！小心，尸群正从桥头压过来！' }
      ],
      bossTalk: [
        { speaker: '陈烬', portrait: 'p_chen', text: '地面在抖！47号矿道里的重甲巨像冲上桥面了——跳上钢架躲开它的震地砸击！' }
      ],
      waves: [
        { title: '第 1 波 · 断桥前哨遭遇战',         total: 16, pool: ['walker', 'skel'], boss: null },
        { title: '第 2 波 · 夜雨双侧尸群合围',       total: 22, pool: ['walker', 'skel', 'vamp'], boss: null },
        { title: '第 3 波 · 精英突变小队突袭！',     total: 26, pool: ['walker', 'skel', 'vamp'], boss: null, forceElites: 1 },
        { title: '第 4 波 · 桥面防线狂潮总攻',       total: 30, pool: ['walker', 'skel', 'vamp', 'bomber'], boss: null },
        { title: '终局决战 · 巨像「铁镐·47号」破桥！', total: 24, pool: ['walker', 'skel', 'vamp'], boss: 'boss_golem' }
      ]
    },
    {
      id: 'ch2', ep: '第 2 集', name: '三号线末班车', tag: '高压硬仗', mapKey: 'ch2_subway', weather: 'dust', bossId: 'boss_volt',
      mapX: 28, mapY: 59, recRating: 32, dropPreview: '绿/蓝装 · 战术头盔与穿甲枪',
      chHpMult: 0.92, chDmgMult: 0.90, chSpdMult: 0.96,
      desc: '潜入断电地铁隧道，面对重盾防暴尸与电弧队长，需要灵活走位与穿甲配装',
      intro: [
        { speaker: '陆铁', portrait: 'p_lu',   text: '地面高架全堵死了，走三号线检修通道，我闭着眼都能摸出去。' },
        { speaker: '林栀', portrait: 'p_lin',  text: '墙上全是市民撤离时写的粉笔字……“别怕，妈妈在站台等你”。我们一定要把血清送出去。' }
      ],
      bossTalk: [
        { speaker: '陆铁', portrait: 'p_lu',   text: '高压变电站跳闸了！那个带着电弧的警备队长盯上我们了，别被它的雷球贴脸！' }
      ],
      waves: [
        { title: '第 1 波 · 隧道漆黑伏击',           total: 26, pool: ['walker', 'shield', 'vamp'], boss: null },
        { title: '第 2 波 · 站台防暴尸群涌入',       total: 34, pool: ['skel', 'shield', 'vamp'], boss: null },
        { title: '第 3 波 · 变电站精英警卫突围！',   total: 38, pool: ['skel', 'shield', 'vamp', 'bomber'], boss: null, forceElites: 2 },
        { title: '第 4 波 · 末班车厢尸海压境',       total: 42, pool: ['shield', 'vamp', 'bomber', 'skel'], boss: null },
        { title: '终局决战 · 电弧队长高压封锁！',     total: 34, pool: ['shield', 'vamp', 'bomber'], boss: 'boss_volt' }
      ]
    },
    {
      id: 'ch3', ep: '第 3 集', name: '绿雾冷库', tag: '割草爽关', mapKey: 'ch3_lab', weather: 'spores', bossId: 'boss_venom',
      mapX: 42, mapY: 32, recRating: 58, dropPreview: '蓝/紫装 · 元素首饰核心高爆',
      chHpMult: 0.78, chDmgMult: 0.88, chSpdMult: 1.04,
      desc: '海量脆皮实验体蜂拥而出！高密度连杀刷经验与强化石的极致爽快关卡',
      intro: [
        { speaker: '沈青', portrait: 'p_shen', text: '别摘面罩，冷库三号罐泄露了……陈队，我有件事一直没敢告诉你们。' },
        { speaker: '陈烬', portrait: 'p_chen', text: '现在说还不晚，老沈。是上面主动放开的封锁阀，对吗？' },
        { speaker: '沈青', portrait: 'p_shen', text: '……是的。这群培养舱体虽然脆，但数量惊人，正好用来检验我们的新火力！' }
      ],
      bossTalk: [
        { speaker: '沈青', portrait: 'p_shen', text: '母体苏醒了！它的毒雾会腐蚀护盾，用穿甲和冰霜火力压制它！' }
      ],
      waves: [
        { title: '第 1 波 · 毒雾通道割草开路',       total: 36, pool: ['walker', 'toxic', 'vamp'], boss: null },
        { title: '第 2 波 · 低温冷库百尸狂涌',       total: 46, pool: ['walker', 'toxic', 'bomber'], boss: null },
        { title: '第 3 波 · 实验体精英破舱！',       total: 52, pool: ['toxic', 'vamp', 'bomber', 'crimson'], boss: null, forceElites: 3 },
        { title: '第 4 波 · 培养槽破裂极致尸海',     total: 58, pool: ['walker', 'toxic', 'bomber', 'crimson'], boss: null },
        { title: '终局决战 · 腐雾毒王降临冷库！',     total: 44, pool: ['toxic', 'bomber', 'crimson'], boss: 'boss_venom' }
      ]
    },
    {
      id: 'ch4', ep: '第 4 集', name: '霓虹孤楼', tag: '暗夜苦战', mapKey: 'ch4_neon', weather: 'rain', bossId: 'boss_cannon',
      mapX: 57, mapY: 58, recRating: 105, dropPreview: '紫/稀有橙装 · 重炮与史诗防具',
      chHpMult: 1.38, chDmgMult: 1.24, chSpdMult: 1.02,
      desc: '高甲精英与重炮火力封锁燃烧商街，真正考验走位、技能循环与装备练度的硬核关卡',
      intro: [
        { speaker: '林栀', portrait: 'p_lin',  text: '不对劲……电台里那段求救录音每三十秒就重复一次，连背景电流声都一模一样！' },
        { speaker: '陈烬', portrait: 'p_chen', text: '是陷阱！这群怪物学会了用幸存者的声音钓鱼——全员上高台，准备硬仗！' }
      ],
      bossTalk: [
        { speaker: '陆铁', portrait: 'p_lu',   text: '赤钢重炮尸王堵住街口了！兄弟们顶住，攒满怒气我就把破晓战车开进来撞翻它！' }
      ],
      waves: [
        { title: '第 1 波 · 霓虹商街伏击战',         total: 32, pool: ['skel', 'shield', 'crimson'], boss: null },
        { title: '第 2 波 · 雨夜商业街混战',         total: 40, pool: ['toxic', 'shield', 'crimson', 'bomber'], boss: null },
        { title: '第 3 波 · 孤楼精英狂爪突袭！',     total: 46, pool: ['shield', 'crimson', 'bomber', 'vamp'], boss: null, forceElites: 3 },
        { title: '第 4 波 · 燃烧街区尸海总攻',       total: 52, pool: ['toxic', 'shield', 'crimson', 'bomber'], boss: null },
        { title: '终局决战 · 赤钢火炮尸王轰炸！',     total: 42, pool: ['shield', 'crimson', 'bomber'], boss: 'boss_cannon' }
      ]
    },
    {
      id: 'ch5', ep: '第 5 集', name: '铁幕空港', tag: '重炮狂欢', mapKey: 'ch5_airport', weather: 'rain', bossId: 'boss_falcon',
      mapX: 73, mapY: 38, recRating: 155, dropPreview: '紫/橙/极稀红装 · 战功点丰厚',
      chHpMult: 1.12, chDmgMult: 1.10, chSpdMult: 1.06,
      desc: '高爆桶与满屏弹雨交织的高能爽快突围战！搭配无人机与重武轰平跑道',
      intro: [
        { speaker: '林栀', portrait: 'p_lin',  text: '直升机……在我们眼前被击落了。上面根本没打算让任何人离开这座城。' },
        { speaker: '陈烬', portrait: 'p_chen', text: '那就别逃了。把最后一盒弹匣压满，咱们杀回信号塔，把他们的清扫指令彻底关掉！' }
      ],
      bossTalk: [
        { speaker: '沈青', portrait: 'p_shen', text: '头顶！军用“苍穹清道夫”锁定了我们，注意它半血后的暴雨激光扫射！' }
      ],
      waves: [
        { title: '第 1 波 · 暴雨跑道抢滩',           total: 42, pool: ['skel', 'bomber', 'crimson', 'toxic'], boss: null },
        { title: '第 2 波 · 航站楼外围爆破潮',       total: 50, pool: ['shield', 'crimson', 'bomber', 'toxic'], boss: null },
        { title: '第 3 波 · 铁幕精英防卫群！',       total: 54, pool: ['crimson', 'shield', 'bomber', 'toxic'], boss: null, forceElites: 3 },
        { title: '第 4 波 · 空港跑道全线狂轰',       total: 60, pool: ['shield', 'crimson', 'bomber', 'vamp'], boss: null },
        { title: '终局决战 · 苍穹猎隼机甲空袭！',     total: 46, pool: ['crimson', 'shield', 'bomber'], boss: 'boss_falcon' }
      ]
    },
    {
      id: 'ch6', ep: '大结局', name: '黎明余烬', tag: '终局血战', mapKey: 'ch6_citadel', weather: 'embers', bossId: 'boss_emperor',
      mapX: 88, mapY: 22, recRating: 220, dropPreview: '橙/红/暗金神武 · 巅峰首领战',
      chHpMult: 1.75, chDmgMult: 1.48, chSpdMult: 1.05,
      desc: '血月之下直面信号塔顶端的零号尸皇，巅峰硬核决战，点燃孤城黎明！',
      intro: [
        { speaker: '陆铁', portrait: 'p_lu',   text: '跑了六天六夜，鞋底都磨穿了……陈队，打完这一仗，请你喝头一顿热乎羊汤。' },
        { speaker: '陈烬', portrait: 'p_chen', text: '一言为定。活下去，天快亮了——所有人，准备决战！' }
      ],
      bossTalk: [
        { speaker: '沈青', portrait: 'p_shen', text: '零号战神苏醒了！所有尸潮的源头就在它身上——倾泻全部火力，终结这场噩梦！' }
      ],
      waves: [
        { title: '第 1 波 · 血月禁区抢攻',           total: 38, pool: ['toxic', 'shield', 'crimson', 'bomber'], boss: null },
        { title: '第 2 波 · 外城墙尸海狂潮',         total: 46, pool: ['skel', 'toxic', 'shield', 'crimson'], boss: null },
        { title: '第 3 波 · 尸皇禁卫精英军团！',     total: 52, pool: ['toxic', 'shield', 'crimson', 'bomber'], boss: null, forceElites: 4 },
        { title: '第 4 波 · 信号塔底背水死战',       total: 58, pool: ['skel', 'toxic', 'shield', 'crimson', 'bomber'], boss: null },
        { title: '最终决战 · 焚天尸皇「零号战神」！', total: 48, pool: ['shield', 'crimson', 'bomber'], boss: 'boss_emperor' }
      ]
    },
    {
      id: 'endless', ep: '无尽防线', name: '荒野死守试炼', tag: '阶梯爆装', mapKey: 'ch6_citadel', weather: 'embers', endless: true, bossId: 'boss_emperor',
      mapX: 82, mapY: 75, recRating: 60, dropPreview: '波次阶梯解禁：6波紫 / 13波红 / 21波暗金',
      chHpMult: 1.25, chDmgMult: 1.18, chSpdMult: 1.0,
      desc: '无限升级尸潮与六大首领轮番压境，用极限配装与伙伴冲击战力榜首！',
      intro: [
        { speaker: '陈烬', portrait: 'p_chen', text: '没有退路，也没有援军。看看我们手里的枪，能守住这座孤城多少波！' }
      ],
      bossTalk: [],
      waves: []
    }
  ];

  var ROGUE_SKILLS = [
    { id: 'through',    rarity: 'gold',   icon: 'sk_through',     name: '穿甲金刚钻', desc: '所有子弹穿透 +3，无视敌人 30% 护甲减伤' },
    { id: 'splash',     rarity: 'gold',   icon: 'sk_splash',      name: '高爆全局溅射',desc: '子弹命中触发范围高爆溅射伤害 +50%，强力击飞' },
    { id: 'hitMissile', rarity: 'gold',   icon: 'sk_hitMissile',  name: '派生微导弹', desc: '射击有 28% 概率自动齐射追踪爆破导弹' },
    { id: 'feedback',   rarity: 'purple', icon: 'sk_feedback',    name: '电离链式折射',desc: '命中释放高压电弧，弹射 3 只周围感染者' },
    { id: 'accurate',   rarity: 'purple', icon: 'sk_accurate',    name: '致命精准',   desc: '全局暴击率 +20%，暴击伤害 +65%' },
    { id: 'bloodShield',rarity: 'blue',   icon: 'sk_bloodShield', name: '嗜血圣盾',   desc: '每击杀 1 只敌人回复 7 生命与 14 护盾' },
    { id: 'poisonFog',  rarity: 'purple', icon: 'sk_poisonFog',   name: '腐雾领域',   desc: '击杀留下腐蚀毒雾，持续融化后续尸海' },
    { id: 'devour',     rarity: 'blue',   icon: 'sk_devour',      name: '余烬吞噬',   desc: '击杀叠加永久攻击乘区，并立刻回血 45%' },
    { id: 'rapidMag',   rarity: 'blue',   icon: 'sk_rapidMag',    name: '扩容快匣',   desc: '全局射速 +25%，弹夹容量 +50%，极速换弹' },
    { id: 'crazyPlus',  rarity: 'purple', icon: 'sk_crazyPlus',   name: '无尽燃血',   desc: '【狂暴】持续时间 +50%，冷却缩短 30%' },
    { id: 'missilePlus',rarity: 'gold',   icon: 'sk_missilePlus', name: '万弹齐发',   desc: '【万弹归宗】增至 18 枚追踪导弹，伤害 +55%' },
    { id: 'nukeCharge', rarity: 'gold',   icon: 'sk_nukeCharge',  name: '核能过载',   desc: '【巅峰核爆】充能翻倍，附带 4 秒无敌护盾' }
  ];

  /* 全面调优怪物移速（下调约 35%–40%），走位拉扯更有战术空间与打击节奏！ */
  var ENEMIES = {
    walker:  { id: 'walker',  name: '街区行尸',   sheet: 'z_walker',  frames: 6, fw: 104, fh: 114, hp: 145,  dmg: 22, speed: 1.28, armor: 0.06, w: 58, h: 78, score: 20 },
    toxic:   { id: 'toxic',   name: '辐射毒尸',   sheet: 'z_toxic',   frames: 6, fw: 104, fh: 114, hp: 195,  dmg: 26, speed: 1.20, armor: 0.10, w: 58, h: 78, score: 34, ranged: 'acid', range: 330 },
    skel:    { id: 'skel',    name: '骸骨暴徒',   sheet: 'z_skel',    frames: 6, fw: 104, fh: 114, hp: 215,  dmg: 28, speed: 1.40, armor: 0.16, w: 58, h: 80, score: 32, ranged: 'axe', range: 280 },
    vamp:    { id: 'vamp',    name: '暗影血魅',   sheet: 'z_vamp',    frames: 6, fw: 104, fh: 114, hp: 200,  dmg: 30, speed: 2.05, armor: 0.12, w: 56, h: 78, score: 42 },
    shield:  { id: 'shield',  name: '重盾防暴尸', sheet: 'z_shield',  frames: 6, fw: 112, fh: 118, hp: 500,  dmg: 32, speed: 0.96, armor: 0.52, w: 66, h: 84, score: 56 },
    crimson: { id: 'crimson', name: '猩红狂爪',   sheet: 'z_crimson', frames: 6, fw: 104, fh: 114, hp: 280,  dmg: 36, speed: 2.15, armor: 0.16, w: 58, h: 80, score: 58, ranged: 'shock', range: 260 },
    bomber:  { id: 'bomber',  name: '自爆毒囊',   sheet: 'z_bomber',  frames: 6, fw: 108, fh: 114, hp: 185,  dmg: 58, speed: 1.68, armor: 0.06, w: 62, h: 80, score: 54, explodeOnDeath: true },

    boss_golem:   { id: 'boss_golem',   name: '巨像「铁镐·47号」',  sheet: 'boss_golem',   frames: 6, fw: 176, fh: 164, hp: 5600,  dmg: 48, speed: 1.38, armor: 0.25, w: 138, h: 136, score: 850,  isBoss: true, ranged: 'pick',   range: 420 },
    boss_volt:    { id: 'boss_volt',    name: '高压「电弧队长」',   sheet: 'boss_volt',    frames: 6, fw: 168, fh: 168, hp: 7000,  dmg: 52, speed: 1.58, armor: 0.25, w: 128, h: 140, score: 1150, isBoss: true, ranged: 'shock',  range: 480 },
    boss_venom:   { id: 'boss_venom',   name: '腐雾母体「毒王」',   sheet: 'boss_venom',   frames: 6, fw: 172, fh: 168, hp: 8600,  dmg: 56, speed: 1.32, armor: 0.28, w: 132, h: 140, score: 1450, isBoss: true, ranged: 'acid',   range: 500 },
    boss_cannon:  { id: 'boss_cannon',  name: '赤钢「火炮尸王」',   sheet: 'boss_cannon',  frames: 6, fw: 172, fh: 168, hp: 10800, dmg: 62, speed: 1.28, armor: 0.34, w: 134, h: 140, score: 1850, isBoss: true, ranged: 'rocket', range: 540 },
    boss_falcon:  { id: 'boss_falcon',  name: '苍穹「猎隼机甲」',   sheet: 'boss_falcon',  frames: 6, fw: 168, fh: 168, hp: 12400, dmg: 60, speed: 1.85, armor: 0.30, w: 132, h: 138, score: 2200, isBoss: true, flying: true, ranged: 'laser', range: 580 },
    boss_emperor: { id: 'boss_emperor', name: '焚天尸皇「零号战神」',sheet: 'boss_emperor', frames: 6, fw: 184, fh: 176, hp: 17200, dmg: 74, speed: 1.65, armor: 0.36, w: 144, h: 148, score: 3500, isBoss: true, ranged: 'flame',  range: 550 }
  };

  var TALENT_BRANCHES = [
    {
      branch: 'firepower', title: '火力乘区分支', color: '#ff7042',
      nodes: [
        { id: 'atk',   name: '膛线专精',   desc: '全枪械基础伤害乘区 +15%/级', costs: [20, 45, 85, 140, 220] },
        { id: 'crit',  name: '弱点狙杀',   desc: '全局暴击率 +6%/级，暴伤 +12%/级', costs: [25, 55, 100, 160, 240] },
        { id: 'pen',   name: '钨芯破甲',   desc: '无视敌人 10% 护甲减伤 / 级', costs: [35, 75, 130, 200] }
      ]
    },
    {
      branch: 'survival', title: '钢铁生存分支', color: '#52c8ff',
      nodes: [
        { id: 'hp',     name: '凯夫拉内衬', desc: '英雄生命上限 +60 / 级', costs: [18, 40, 75, 125, 195] },
        { id: 'shield', name: '圣光偏导盾', desc: '开局自带能量护盾 +55 / 级', costs: [22, 50, 90, 145] },
        { id: 'cd',     name: '战术冷却',   desc: '4大主动神技冷却 -10% / 级', costs: [28, 60, 110, 175] }
      ]
    },
    {
      branch: 'support', title: '爆装支援分支', color: '#ffe566',
      nodes: [
        { id: 'luck',   name: '余烬洪福',   desc: '橙/红/暗金极品神枪爆率大增', costs: [30, 65, 115, 180, 260] },
        { id: 'forge',  name: '军械锻造师', desc: '强化增幅额外 +8%/级', costs: [35, 80, 140] },
        { id: 'warcar', name: '破晓战车引擎',desc: '召唤战车怒气减半，碾压威力翻倍', costs: [95] }
      ]
    }
  ];

  function findTemplate(id) {
    for (var i = 0; i < WEAPON_TEMPLATES.length; i += 1) {
      if (WEAPON_TEMPLATES[i].id === id) return WEAPON_TEMPLATES[i];
    }
    return WEAPON_TEMPLATES[0];
  }
  function findChapter(id) {
    for (var i = 0; i < CHAPTERS.length; i += 1) {
      if (CHAPTERS[i].id === id) return CHAPTERS[i];
    }
    return CHAPTERS[0];
  }
  function findDiff(id) {
    for (var i = 0; i < DIFFICULTIES.length; i += 1) {
      if (DIFFICULTIES[i].id === id) return DIFFICULTIES[i];
    }
    return DIFFICULTIES[0];
  }
  function getWeaponImgKey(w) {
    if (!w) return 'w_m4';
    var tpl = findTemplate(w.tplId || 'm4');
    return tpl.img;
  }
  function getWeaponImgSrc(w) {
    return 'assets/guns/' + getWeaponImgKey(w) + '.webp';
  }

  function getWeaponRole(w) {
    var t = w ? w.type : 'rifle';
    if (w && w.tplId === 'pistol_init') return '新手过渡';
    if (t === 'sniper' || t === 'crossbow') return '高甲斩首';
    if (t === 'rocket' || t === 'grenade') return '爆破击飞';
    if (t === 'shotgun') return '近距轰退';
    if (t === 'laser' || t === 'lightning') return '穿透清屏';
    if (t === 'flamer') return '元素压制';
    if (t === 'pistol') return '灵活连射';
    return (w && w.mag >= 55) ? '群体割草' : '均衡突击';
  }

  /* 紧缩真实武器评分（10 ~ 320，告别几千几万虚高，每次强化/升级都100%有实感跳动！） */
  function computeWeaponPower(w) {
    var rps = 60 / Math.max(4, w.rate || 10);
    var baseDps = (w.dmg || 14) * (w.pellets || 1) * rps;
    var critZone = 1 + (0.12 + (w.critAdd || 0)) * (0.85 + (w.critDmgAdd || 0));
    var mechZone = 1 + (w.pierce || 0) * 0.055 + ((w.splash || 0) > 0 ? 0.14 : 0) + (w.elem ? 0.06 : 0);
    var skBonus = (w.wSkills ? w.wSkills.length * 7 : 0) + (w.godSkill ? 24 : 0);
    var enhBonus = (w.enh || 0) * 1.4 + ((w.itemLv || 1) - 1) * 0.8;
    var raw = (baseDps * critZone * mechZone) / 8.8 + skBonus + enhBonus;
    return Math.max(10, Math.round(raw));
  }

  function recalcWeaponStats(w) {
    var tpl = findTemplate(w.tplId || 'pistol_init');
    var rar = RARITIES[w.rarity] || RARITIES.white;
    var enh = w.enh || 0;
    var iLv = w.itemLv || 1;
    var lvScale = 1 + (iLv - 1) * 0.032;
    var enhScale = 1 + getEnhAddMult(enh);
    w.dmg = Math.max(8, Math.round(tpl.dmg * (0.82 + rar.mult * 0.36) * lvScale * enhScale) + enh + Math.floor((iLv - 1) * 0.5));
    w.power = computeWeaponPower(w);
    return w;
  }

  function applyRandomAffixes(w, tpl, count) {
    w.rate = tpl.rate; w.pierce = tpl.pierce; w.elem = tpl.elem;
    w.knock = tpl.knock || 4; w.muzzleLen = tpl.muzzleLen || 48; w.img = tpl.img;
    w.critAdd = 0; w.critDmgAdd = 0; w.vampAdd = 0; w.missileChance = 0; w.affixLabels = [];
    var pool = AFFIX_POOL.slice();
    for (var i = 0; i < count && pool.length > 0; i += 1) {
      var af = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      w.affixLabels.push(af.label);
      if (af.critAdd) w.critAdd += af.critAdd;
      if (af.critDmgAdd) w.critDmgAdd += af.critDmgAdd;
      if (af.rateMult) w.rate = Math.max(4, Math.round(w.rate * af.rateMult));
      if (af.pierceAdd) w.pierce += af.pierceAdd;
      if (af.vampAdd) w.vampAdd += af.vampAdd;
      if (af.elem && !w.elem) w.elem = af.elem;
      if (af.missileChance) w.missileChance += af.missileChance;
    }
    w.power = computeWeaponPower(w);
  }

  function rollWeaponSkills(rarId) {
    var wsCount = 0;
    if (rarId === 'blue') wsCount = Math.random() < 0.85 ? 1 : 0;
    else if (rarId === 'purple') wsCount = 1;
    else if (rarId === 'orange') wsCount = Math.random() < 0.45 ? 2 : 1;
    else if (rarId === 'red' || rarId === 'darkgold') wsCount = 2;
    var pool = WEAPON_SKILLS.slice();
    var out = [];
    for (var i = 0; i < wsCount && pool.length > 0; i += 1) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    var god = null;
    if (rarId === 'red' || rarId === 'darkgold') {
      god = GOD_SKILLS[Math.floor(Math.random() * GOD_SKILLS.length)];
    }
    return { wSkills: out, godSkill: god };
  }

  function rollWeapon(templateId, rarityId, lv, itemLv) {
    var tpl = templateId ? findTemplate(templateId) : WEAPON_TEMPLATES[1 + Math.floor(Math.random() * (WEAPON_TEMPLATES.length - 1))];
    var rar = RARITIES[rarityId] || RARITIES[tpl.minRar] || RARITIES.white;
    var enh = lv || 0;
    var iLv = Math.max(1, itemLv || 1);
    var sks = rollWeaponSkills(rar.id);
    var w = {
      uid: 'w_' + Math.floor(Math.random() * 1e9) + '_' + Date.now().toString(36).slice(-3),
      tplId: tpl.id, name: tpl.name, cls: tpl.cls, type: tpl.type, img: tpl.img,
      muzzleLen: tpl.muzzleLen || 48, rarity: rar.id, itemLv: iLv, enh: enh, blessing: 0,
      dmg: tpl.dmg, rate: tpl.rate, pellets: tpl.pellets, spread: tpl.spread, speed: tpl.speed,
      mag: tpl.mag, ammo: tpl.mag, pierce: tpl.pierce, splash: tpl.splash, knock: tpl.knock || 4,
      elem: tpl.elem, color: tpl.color,
      critAdd: 0, critDmgAdd: 0, vampAdd: 0, missileChance: 0, affixLabels: [],
      wSkills: sks.wSkills, godSkill: sks.godSkill
    };
    recalcWeaponStats(w);
    applyRandomAffixes(w, tpl, rar.affixes);
    w.power = computeWeaponPower(w);
    return w;
  }

  global.EM_DATA = {
    RARITIES: RARITIES,
    GEAR_DEFS: GEAR_DEFS,
    GEAR_NAMES: GEAR_NAMES,
    GEAR_PASSIVES: GEAR_PASSIVES,
    WEAPON_SKILLS: WEAPON_SKILLS,
    GOD_SKILLS: GOD_SKILLS,
    ENH_TABLE: ENH_TABLE,
    getEnhAddMult: getEnhAddMult,
    getRatingGrade: getRatingGrade,
    getWeaponRole: getWeaponRole,
    getRarityTierIndex: getRarityTierIndex,
    rollGear: rollGear,
    recalcGearStats: recalcGearStats,
    recalcWeaponStats: recalcWeaponStats,
    DRONE_DEFS: DRONE_DEFS,
    WARCAR_MODS: WARCAR_MODS,
    TITLES: TITLES,
    WEAPON_TEMPLATES: WEAPON_TEMPLATES,
    BLUEPRINTS: BLUEPRINTS,
    HEROES: HEROES,
    DIFFICULTIES: DIFFICULTIES,
    CHAPTERS: CHAPTERS,
    ROGUE_SKILLS: ROGUE_SKILLS,
    ENEMIES: ENEMIES,
    TALENT_BRANCHES: TALENT_BRANCHES,
    findTemplate: findTemplate,
    findChapter: findChapter,
    findDiff: findDiff,
    getWeaponImgKey: getWeaponImgKey,
    getWeaponImgSrc: getWeaponImgSrc,
    computeWeaponPower: computeWeaponPower,
    applyRandomAffixes: applyRandomAffixes,
    rollWeapon: rollWeapon
  };
})(window);
