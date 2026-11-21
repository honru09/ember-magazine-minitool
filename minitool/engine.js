/* 《余烬弹匣：末日突围》60 FPS 硬核动作射击核心引擎（5秒全图吸取收尾 + 个人装备加成 + 5波次长节奏战役 + 击退连杀，ES2017） */
(function (global) {
  'use strict';

  var DATA = global.EM_DATA;
  var WORLD_W = 1480;
  var WORLD_H = 560;
  var GROUND_Y = 492;
  var GRAVITY = 0.36;
  var VICTORY_LOOT_TICKS = 300; /* 击杀 Boss 后 5 秒全图战利品自动吸取收尾时间！ */

  var PLATFORMS = [
    { x: 170, y: 374, w: 235 },
    { x: 622, y: 328, w: 236 },
    { x: 1075, y: 374, w: 235 }
  ];

  function limitNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function createProfile() {
    var w1 = DATA.rollWeapon('pistol_init', 'white', 0);
    return {
      heroChosen: false,
      accountLv: 1,
      accountXp: 0,
      accountXpNeed: 120,
      totalKills: 0,
      stones: 20,
      chips: 0,
      merit: 0,
      warcarMods: {},
      bestWave: 0,
      bestScore: 0,
      heroId: 'chen',
      chapterId: 'ch1',
      diffId: 'normal',
      chapterStars: {},
      talents: {},
      gearBag: [],
      equippedGear: { armor: null, helmet: null, chip: null },
      equipped: { primary: true, secondary: false, armor: false, helmet: false, chip: false, warcar: true },
      unlockedGuns: { pistol_init: true },
      unlockedGearKeys: {},
      unlockedTitles: {},
      activeTitle: null,
      unlockedDrones: {},
      activeDroneId: null,
      partner: null,
      bag: [w1],
      primaryUid: w1.uid,
      secondaryUid: null,
      followRewardClaimed: false,
      followPromptSeen: false,
      lastCoverIdx: 0,
      settings: {
        master: 80, sfx: 80, music: 55, quality: 'high', vibrate: true, showFps: false
      }
    };
  }

  function getTalentLv(profile, id) {
    return (profile && profile.talents && profile.talents[id]) ? profile.talents[id] : 0;
  }

  function findGearItem(profile, uid) {
    if (!profile || !profile.gearBag || !uid) return null;
    for (var i = 0; i < profile.gearBag.length; i += 1) {
      if (profile.gearBag[i].uid === uid) return profile.gearBag[i];
    }
    return null;
  }

  function getEquippedGearItem(profile, slot) {
    if (!profile || !profile.equippedGear) return null;
    return findGearItem(profile, profile.equippedGear[slot]);
  }

  function getGearLv(profile, id) {
    var item = getEquippedGearItem(profile, id);
    return item ? (item.enh || 0) : 0;
  }

  function isSlotEquipped(profile, slot) {
    if (!profile || !profile.equipped) return false;
    if (slot === 'primary') return !!(profile.equipped.primary !== false && findBagGun(profile, profile.primaryUid));
    if (slot === 'secondary') return !!(profile.equipped.secondary !== false && findBagGun(profile, profile.secondaryUid));
    if (slot === 'armor' || slot === 'helmet' || slot === 'chip') {
      return !!(profile.equipped[slot] !== false && getEquippedGearItem(profile, slot));
    }
    if (slot === 'warcar') return !!(profile.equipped.warcar !== false && profile.accountLv >= 10 && profile.activeDroneId);
    return profile.equipped[slot] !== false;
  }

  function toggleEquipSlot(profile, slot) {
    if (!profile.equipped) profile.equipped = { primary: true, secondary: false, armor: false, helmet: false, chip: false, warcar: true };
    if (slot === 'secondary' && !findBagGun(profile, profile.secondaryUid)) return false;
    if ((slot === 'armor' || slot === 'helmet' || slot === 'chip') && !getEquippedGearItem(profile, slot)) return false;
    if (slot === 'warcar' && (profile.accountLv < 10 || !profile.activeDroneId)) return false;
    profile.equipped[slot] = !(profile.equipped[slot] !== false);
    checkTitleUnlocks(profile);
    return profile.equipped[slot];
  }

  function setAllEquipped(profile, flag) {
    profile.equipped = {
      primary: !!flag && !!findBagGun(profile, profile.primaryUid),
      secondary: !!flag && !!findBagGun(profile, profile.secondaryUid),
      armor: !!flag && !!getEquippedGearItem(profile, 'armor'),
      helmet: !!flag && !!getEquippedGearItem(profile, 'helmet'),
      chip: !!flag && !!getEquippedGearItem(profile, 'chip'),
      warcar: !!flag && profile.accountLv >= 10 && !!profile.activeDroneId
    };
    checkTitleUnlocks(profile);
  }

  /* 强化只提升等级（+0..+15），绝不改变品质！+6起带概率+祝福值保底必成且永不掉级 */
  function enhanceGearItem(profile, uid) {
    var g = findGearItem(profile, uid);
    if (!g) return { ok: false, reason: '请先通过战斗掉落获取该部位装备' };
    var cur = g.enh || 0;
    if (cur >= 15) return { ok: false, reason: g.name + '已达最高强化 +15' };
    var cfg = DATA.ENH_TABLE[cur];
    if (profile.stones < cfg.cost) return { ok: false, reason: '强化石不足（需 ' + cfg.cost + '）' };
    profile.stones -= cfg.cost;
    var bless = g.blessing || 0;
    var okRoll = (bless >= 100) || (Math.random() < cfg.rate);
    if (okRoll) {
      g.enh = cur + 1;
      g.blessing = 0;
      DATA.recalcGearStats(g);
      return { ok: true, success: true, item: g, name: g.name, lv: g.enh };
    }
    g.blessing = Math.min(100, bless + (cur >= 10 ? 28 : 38));
    return { ok: true, success: false, item: g, name: g.name, lv: cur, blessing: g.blessing, reason: '强化未成功（不掉级），祝福值升至 ' + g.blessing + '%！' };
  }

  function upgradeGearItemLv(profile, uid) {
    var g = findGearItem(profile, uid);
    if (!g) return { ok: false, reason: '未找到装备' };
    var accLv = profile.accountLv || 1;
    if ((g.itemLv || 1) >= accLv) return { ok: false, reason: '装备等级已追平当前账号等级 Lv.' + accLv };
    var cost = 14 + (g.itemLv || 1) * 4;
    if (profile.stones < cost) return { ok: false, reason: '转化升级需 ' + cost + ' 强化石' };
    profile.stones -= cost;
    g.itemLv = Math.min(accLv, (g.itemLv || 1) + 2);
    DATA.recalcGearStats(g);
    return { ok: true, item: g };
  }

  function upgradeGear(profile, slot) {
    var item = getEquippedGearItem(profile, slot);
    if (!item) return { ok: false, reason: '尚未获得该部位装备，进入战斗击杀尸潮即可掉落！' };
    var res = enhanceGearItem(profile, item.uid);
    if (res.ok && profile.equipped) profile.equipped[slot] = true;
    return res;
  }

  function equipGearItem(profile, uid) {
    var g = findGearItem(profile, uid);
    if (!g) return false;
    if (!profile.equippedGear) profile.equippedGear = { armor: null, helmet: null, chip: null };
    if (!profile.equipped) profile.equipped = { primary: true, secondary: false, armor: false, helmet: false, chip: false, warcar: true };
    profile.equippedGear[g.slot] = g.uid;
    profile.equipped[g.slot] = true;
    checkTitleUnlocks(profile);
    return true;
  }

  function salvageGearItem(profile, uid) {
    if (!profile.gearBag) return { ok: false, reason: '无装备' };
    var eq = profile.equippedGear || {};
    if (eq.armor === uid || eq.helmet === uid || eq.chip === uid) {
      return { ok: false, reason: '已穿戴中的装备不可直接熔炼' };
    }
    for (var i = 0; i < profile.gearBag.length; i += 1) {
      if (profile.gearBag[i].uid === uid) {
        var g = profile.gearBag[i];
        var gain = (DATA.RARITIES[g.rarity] ? DATA.RARITIES[g.rarity].salvage : 8) + (g.enh || 0) * 5;
        profile.gearBag.splice(i, 1);
        profile.stones += gain;
        return { ok: true, stones: gain, name: g.name };
      }
    }
    return { ok: false, reason: '未找到该装备' };
  }

  function storeGearToBag(profile, game, gear) {
    if (!profile.gearBag) profile.gearBag = [];
    if (!profile.unlockedGearKeys) profile.unlockedGearKeys = {};
    profile.unlockedGearKeys[gear.slot + '_' + gear.rarity] = true;
    if (profile.gearBag.length >= 24) {
      var sv = DATA.RARITIES[gear.rarity] ? DATA.RARITIES[gear.rarity].salvage : 8;
      profile.stones += sv;
      return false;
    }
    profile.gearBag.unshift(gear);
    if (!profile.equippedGear) profile.equippedGear = { armor: null, helmet: null, chip: null };
    /* 若该槽位为空则自动穿戴，即刻改变外观与属性！ */
    if (!getEquippedGearItem(profile, gear.slot)) {
      profile.equippedGear[gear.slot] = gear.uid;
      if (!profile.equipped) profile.equipped = {};
      profile.equipped[gear.slot] = true;
    }
    if (game) {
      if (!game.lootedGears) game.lootedGears = [];
      game.lootedGears.push(gear);
    }
    checkTitleUnlocks(profile);
    return true;
  }

  /* 局外个人整体经验与升级（独立于局内肉鸽翻牌升级！10级解锁无人机，20级解锁伙伴！） */
  function grantAccountXp(profile, amount) {
    if (!amount || amount <= 0) return { leveled: 0, newLv: profile.accountLv || 1, unlockedDrone: false, unlockedPartner: false };
    if (!profile.accountLv) profile.accountLv = 1;
    if (!profile.accountXp) profile.accountXp = 0;
    if (!profile.accountXpNeed) profile.accountXpNeed = 120;
    var oldLv = profile.accountLv;
    profile.accountXp += Math.round(amount);
    var leveled = 0;
    while (profile.accountXp >= profile.accountXpNeed && profile.accountLv < 99) {
      profile.accountXp -= profile.accountXpNeed;
      profile.accountLv += 1;
      leveled += 1;
      profile.accountXpNeed = Math.round(120 * Math.pow(1.22, profile.accountLv - 1));
    }
    var unlockedDrone = false;
    var unlockedPartner = false;
    if (oldLv < 10 && profile.accountLv >= 10) unlockedDrone = true;
    if (oldLv < 20 && profile.accountLv >= 20) unlockedPartner = true;
    checkTitleUnlocks(profile);
    return { leveled: leveled, newLv: profile.accountLv, unlockedDrone: unlockedDrone, unlockedPartner: unlockedPartner };
  }

  function unlockTitle(profile, tid) {
    if (!profile.unlockedTitles) profile.unlockedTitles = {};
    if (profile.unlockedTitles[tid]) return false;
    profile.unlockedTitles[tid] = true;
    if (!profile.activeTitle) profile.activeTitle = tid;
    return true;
  }

  function checkTitleUnlocks(profile) {
    if (!profile) return;
    if (!profile.unlockedTitles) profile.unlockedTitles = {};
    if (profile.followRewardClaimed) unlockTitle(profile, 'pioneer');
    if (profile.chapterStars && profile.chapterStars.ch1 > 0) unlockTitle(profile, 'rookie_clear');
    if ((profile.totalKills || 0) >= 300) unlockTitle(profile, 'slayer_300');
    if (isSlotEquipped(profile, 'armor') && isSlotEquipped(profile, 'helmet') && isSlotEquipped(profile, 'chip')) unlockTitle(profile, 'full_gear');
    var gunCnt = profile.unlockedGuns ? Object.keys(profile.unlockedGuns).length : 0;
    if (gunCnt >= 8) unlockTitle(profile, 'collector_8');
    if ((profile.accountLv || 1) >= 10) unlockTitle(profile, 'drone_cmd');
    if ((profile.accountLv || 1) >= 20) unlockTitle(profile, 'duo_bond');
    if (profile.chapterStars && profile.chapterStars.ch6 > 0) unlockTitle(profile, 'citadel_king');
  }

  function getActiveTitleDef(profile) {
    if (!profile || !profile.activeTitle || !profile.unlockedTitles || !profile.unlockedTitles[profile.activeTitle]) return null;
    for (var i = 0; i < DATA.TITLES.length; i += 1) {
      if (DATA.TITLES[i].id === profile.activeTitle) return DATA.TITLES[i];
    }
    return null;
  }

  function equipTitle(profile, tid) {
    if (!tid) { profile.activeTitle = null; return true; }
    if (!profile.unlockedTitles || !profile.unlockedTitles[tid]) return false;
    profile.activeTitle = tid;
    return true;
  }

  function findDroneDef(id) {
    if (!id) return null;
    for (var i = 0; i < DATA.DRONE_DEFS.length; i += 1) {
      if (DATA.DRONE_DEFS[i].id === id) return DATA.DRONE_DEFS[i];
    }
    return null;
  }

  function unlockOrEquipDrone(profile, droneId) {
    if ((profile.accountLv || 1) < 10) return { ok: false, reason: '账号 Lv.10 开放重工军需商店无人机购买' };
    var d = findDroneDef(droneId);
    if (!d) return { ok: false, reason: '未知无人机' };
    if (!profile.unlockedDrones) profile.unlockedDrones = {};
    if (!profile.unlockedDrones[d.id]) {
      if ((profile.accountLv || 1) < d.unlockLv) return { ok: false, reason: '需个人等级达到 Lv.' + d.unlockLv };
      if ((profile.merit || 0) < d.costMerit) return { ok: false, reason: '战功点不足（需 ' + d.costMerit + ' 战功点，通关/击杀首领获取）' };
      profile.merit -= d.costMerit;
      profile.unlockedDrones[d.id] = true;
    }
    profile.activeDroneId = d.id;
    if (profile.equipped) profile.equipped.warcar = true;
    return { ok: true, drone: d };
  }

  function buyWarcarMod(profile, modId) {
    var mod = null;
    for (var i = 0; i < DATA.WARCAR_MODS.length; i += 1) {
      if (DATA.WARCAR_MODS[i].id === modId) { mod = DATA.WARCAR_MODS[i]; break; }
    }
    if (!mod) return { ok: false, reason: '未知改装项' };
    if (!profile.warcarMods) profile.warcarMods = {};
    if (profile.warcarMods[mod.id]) return { ok: false, reason: '该战车改装已拥有' };
    if ((profile.merit || 0) < mod.costMerit) return { ok: false, reason: '战功点不足（需 ' + mod.costMerit + ' 战功点）' };
    profile.merit -= mod.costMerit;
    profile.warcarMods[mod.id] = true;
    return { ok: true, mod: mod };
  }

  /* 20 级解锁伙伴系统：从另外三位幸存者中任选一位作为初始白板手枪伙伴共同培养！ */
  function selectPartner(profile, heroId) {
    if ((profile.accountLv || 1) < 20) return { ok: false, reason: '个人等级达到 Lv.20 解锁伙伴系统' };
    if (heroId === profile.heroId) return { ok: false, reason: '不能选择自己，请从其余三位幸存者中选择' };
    if (profile.partner) return { ok: false, reason: '已招募专属伙伴，不可更换' };
    var hDef = findHero(heroId);
    var pistol = DATA.rollWeapon('pistol_init', 'white', 0);
    profile.partner = {
      heroId: hDef.id,
      lv: 1,
      weapon: pistol
    };
    return { ok: true, partner: profile.partner, heroDef: hDef };
  }

  function cultivatePartner(profile) {
    if (!profile.partner) return { ok: false, reason: '尚未招募伙伴' };
    var p = profile.partner;
    if (p.lv >= 30) return { ok: false, reason: '伙伴已达最高等级 Lv.30' };
    var cost = 20 + p.lv * 14;
    if (profile.stones < cost) return { ok: false, reason: '强化石不足（需 ' + cost + '）' };
    profile.stones -= cost;
    p.lv += 1;
    p.weapon.enh = Math.min(15, Math.floor(p.lv / 2));
    p.weapon.dmg = Math.round(14 * (1 + p.lv * 0.16));
    p.weapon.power = DATA.computeWeaponPower(p.weapon);
    return { ok: true, lv: p.lv };
  }

  function findHero(id) {
    for (var i = 0; i < DATA.HEROES.length; i += 1) {
      if (DATA.HEROES[i].id === id) return DATA.HEROES[i];
    }
    return DATA.HEROES[0];
  }

  function findBagGun(profile, uid) {
    if (!profile || !profile.bag) return null;
    for (var i = 0; i < profile.bag.length; i += 1) {
      if (profile.bag[i].uid === uid) return profile.bag[i];
    }
    return null;
  }

  function cloneWeapon(w) { return JSON.parse(JSON.stringify(w)); }

  function ensureProfileBag(profile) {
    if (!profile.accountLv) profile.accountLv = 1;
    if (!profile.accountXp) profile.accountXp = 0;
    if (!profile.accountXpNeed) profile.accountXpNeed = Math.round(120 * Math.pow(1.22, profile.accountLv - 1));
    if (typeof profile.merit !== 'number') profile.merit = 0;
    if (!profile.warcarMods) profile.warcarMods = {};
    if (!profile.gearBag) profile.gearBag = [];
    if (!profile.equippedGear) profile.equippedGear = { armor: null, helmet: null, chip: null };
    if (!profile.equipped) profile.equipped = { primary: true, secondary: false, armor: false, helmet: false, chip: false, warcar: true };
    if (!profile.unlockedGuns) profile.unlockedGuns = {};
    if (!profile.unlockedGearKeys) profile.unlockedGearKeys = {};
    if (!profile.unlockedTitles) profile.unlockedTitles = {};
    if (!profile.unlockedDrones) profile.unlockedDrones = {};
    if (!profile.bag || !profile.bag.length) {
      var w1 = DATA.rollWeapon('pistol_init', 'white', 0, profile.accountLv || 1);
      profile.bag = [w1];
      profile.primaryUid = w1.uid;
      profile.secondaryUid = null;
    }
    for (var i = 0; i < profile.bag.length; i += 1) {
      var g = profile.bag[i];
      var tpl = DATA.findTemplate(g.tplId);
      g.tplId = tpl.id;
      g.img = tpl.img;
      g.muzzleLen = tpl.muzzleLen || 46;
      g.cls = tpl.cls || '步枪';
      g.role = g.role || DATA.getWeaponRole(tpl);
      if (!g.itemLv) g.itemLv = 1;
      if (typeof g.blessing !== 'number') g.blessing = 0;
      if (!g.wSkills) g.wSkills = [];
      DATA.recalcWeaponStats(g);
      profile.unlockedGuns[g.tplId] = true;
    }
    for (var gi = 0; gi < profile.gearBag.length; gi += 1) {
      var gear = profile.gearBag[gi];
      if (!gear.itemLv) gear.itemLv = 1;
      if (typeof gear.blessing !== 'number') gear.blessing = 0;
      DATA.recalcGearStats(gear);
    }
    if (!findBagGun(profile, profile.primaryUid)) profile.primaryUid = profile.bag[0].uid;
    if (profile.secondaryUid && !findBagGun(profile, profile.secondaryUid)) profile.secondaryUid = null;
    if (profile.secondaryUid === profile.primaryUid) profile.secondaryUid = null;
    if (!profile.secondaryUid) profile.equipped.secondary = false;
    var slots = ['armor', 'helmet', 'chip'];
    for (var s = 0; s < slots.length; s += 1) {
      var sl = slots[s];
      if (profile.equippedGear[sl] && !findGearItem(profile, profile.equippedGear[sl])) {
        profile.equippedGear[sl] = null;
        profile.equipped[sl] = false;
      }
    }
  }

  /* 计算首页个人角色装备面板实时属性与综合战力（初始低属性小手枪+无装，随局外等级/称号/穿戴装备真实成长！） */
  function computeHeroStats(profile) {
    ensureProfileBag(profile);
    var heroDef = findHero(profile.heroId);
    var pGun = findBagGun(profile, profile.primaryUid) || profile.bag[0];
    var sGun = profile.secondaryUid ? findBagGun(profile, profile.secondaryUid) : null;
    var eqPrimary = isSlotEquipped(profile, 'primary');
    var eqSecondary = isSlotEquipped(profile, 'secondary') && !!sGun;

    var armorItem = getEquippedGearItem(profile, 'armor');
    var helmetItem = getEquippedGearItem(profile, 'helmet');
    var chipItem = getEquippedGearItem(profile, 'chip');
    var eqArmor = isSlotEquipped(profile, 'armor') && !!armorItem;
    var eqHelmet = isSlotEquipped(profile, 'helmet') && !!helmetItem;
    var eqChip = isSlotEquipped(profile, 'chip') && !!chipItem;

    var accLv = profile.accountLv || 1;
    var titleDef = getActiveTitleDef(profile);
    var tHp = titleDef ? (titleDef.hpAdd || 0) : 0;
    var tSh = titleDef ? (titleDef.shAdd || 0) : 0;
    var tAtk = titleDef ? (titleDef.atkAdd || 0) : 0;
    var tCrit = titleDef ? (titleDef.critAdd || 0) : 0;

    var armorHp = eqArmor ? armorItem.hp : 0;
    var armorRed = eqArmor ? armorItem.dmgReduce : 0;
    var helmetSh = eqHelmet ? helmetItem.shield : 0;
    var helmetCrit = eqHelmet ? helmetItem.critAdd : 0;
    var chipAtk = eqChip ? chipItem.atkAdd : 0;
    var chipPen = eqChip ? chipItem.penAdd : 0;

    var maxHp = heroDef.hp + (accLv - 1) * 18 + getTalentLv(profile, 'hp') * 55 + armorHp + tHp;
    var shield = getTalentLv(profile, 'shield') * 50 + (heroDef.id === 'lu' ? 60 : 0) + helmetSh + tSh;
    var dmgReduce = armorRed;
    var crit = heroDef.crit + getTalentLv(profile, 'crit') * 0.05 + helmetCrit + tCrit + (eqPrimary && pGun ? pGun.critAdd : 0);
    var armorPen = (heroDef.armorPen || 0) + getTalentLv(profile, 'pen') * 0.08 + chipPen;
    var dmgMult = heroDef.dmgMult * (1 + (accLv - 1) * 0.025 + getTalentLv(profile, 'atk') * 0.14 + chipAtk + tAtk);
    var activePwr = eqPrimary && pGun ? pGun.power : (eqSecondary && sGun ? Math.round(sGun.power * 0.75) : 8);
    var dps = Math.max(8, Math.round(activePwr * dmgMult));
    var gearBonusPower = (eqArmor ? armorItem.power : 0) + (eqHelmet ? helmetItem.power : 0) + (eqChip ? chipItem.power : 0);
    var droneDef = (accLv >= 10 && profile.activeDroneId) ? findDroneDef(profile.activeDroneId) : null;
    var droneCol = droneDef ? droneDef.col : -1;
    var eqDrone = !!(droneDef && profile.equipped && profile.equipped.warcar !== false);
    /* 紧缩实感综合评分（新手约 15~25，满配毕业约 380~520，拒绝虚高数万！） */
    var combatPower = Math.max(10, Math.round(dps + (eqSecondary && sGun ? sGun.power * 0.35 : 0) + gearBonusPower + (eqDrone ? 28 : 0) + (accLv - 1) * 2.5));
    return {
      heroDef: heroDef, primaryGun: pGun, secondaryGun: sGun,
      armorItem: armorItem, helmetItem: helmetItem, chipItem: chipItem,
      armorPassive: (eqArmor && armorItem.passive) ? armorItem.passive : null,
      helmetPassive: (eqHelmet && helmetItem.passive) ? helmetItem.passive : null,
      corePassive: (eqChip && chipItem.passive) ? chipItem.passive : null,
      droneDef: droneDef, titleDef: titleDef,
      maxHp: maxHp, shield: shield, dmgReduce: dmgReduce,
      crit: crit, armorPen: armorPen, dmgMult: dmgMult,
      critPct: Math.min(95, Math.round(crit * 100)),
      penPct: Math.min(95, Math.round(armorPen * 100)),
      dps: dps, combatPower: combatPower,
      grade: DATA.getRatingGrade(combatPower),
      visualGear: {
        primary: eqPrimary,
        secondary: eqSecondary,
        armor: eqArmor,
        armorTier: eqArmor ? DATA.getRarityTierIndex(armorItem.rarity) : 0,
        helmet: eqHelmet,
        helmetTier: eqHelmet ? DATA.getRarityTierIndex(helmetItem.rarity) : 0,
        chip: eqChip,
        chipTier: eqChip ? DATA.getRarityTierIndex(chipItem.rarity) : 0,
        warcar: eqDrone,
        droneCol: droneCol
      }
    };
  }

  /* 将爆出的神枪安全存入背包（24格大容量；若满则自动替换最弱未装备低阶枪，否则转高额强化石，保证零遗漏！） */
  function storeGunToProfileBag(profile, game, gun) {
    if (!profile.bag) profile.bag = [];
    if (!profile.unlockedGuns) profile.unlockedGuns = {};
    profile.unlockedGuns[gun.tplId] = true;
    /* 若该 uid 已在背包中则直接同步数据，避免重复占位 */
    for (var ex = 0; ex < profile.bag.length; ex += 1) {
      if (profile.bag[ex].uid === gun.uid) {
        profile.bag[ex] = cloneWeapon(gun);
        return true;
      }
    }
    var rarRank = { white: 1, green: 2, blue: 3, purple: 4, orange: 5, red: 6, darkgold: 7 };
    if (profile.bag.length < 24) {
      profile.bag.unshift(cloneWeapon(gun));
      if (game) game.lootedGuns.push(gun);
      return true;
    }
    var weakestIdx = -1;
    var weakestScore = 1e12;
    for (var i = 0; i < profile.bag.length; i += 1) {
      var bg = profile.bag[i];
      if (bg.uid === profile.primaryUid || bg.uid === profile.secondaryUid) continue;
      var sc = (rarRank[bg.rarity] || 1) * 100000 + bg.power;
      if (sc < weakestScore) { weakestScore = sc; weakestIdx = i; }
    }
    var newScore = (rarRank[gun.rarity] || 1) * 100000 + gun.power;
    if (weakestIdx >= 0 && newScore > weakestScore) {
      var oldSalv = DATA.RARITIES[profile.bag[weakestIdx].rarity].salvage;
      if (game) game.earnedStones += oldSalv;
      else profile.stones += oldSalv;
      profile.bag.splice(weakestIdx, 1);
      profile.bag.unshift(cloneWeapon(gun));
      if (game) game.lootedGuns.push(gun);
      return true;
    }
    var sv = DATA.RARITIES[gun.rarity].salvage;
    if (game) { game.runStones += sv; game.earnedStones += sv; }
    else profile.stones += sv;
    return false;
  }

  function enhanceBagGun(profile, uid) {
    var w = findBagGun(profile, uid);
    if (!w) return { ok: false, reason: '未找到武器' };
    var cur = w.enh || 0;
    if (cur >= 15) return { ok: false, reason: '已达最高强化 +15' };
    var cfg = DATA.ENH_TABLE[cur];
    if (profile.stones < cfg.cost) return { ok: false, reason: '强化石不足（需 ' + cfg.cost + '）' };
    profile.stones -= cfg.cost;
    var bless = w.blessing || 0;
    var okRoll = (bless >= 100) || (Math.random() < cfg.rate);
    if (okRoll) {
      w.enh = cur + 1;
      w.blessing = 0;
      DATA.recalcWeaponStats(w);
      return { ok: true, success: true, weapon: w };
    }
    w.blessing = Math.min(100, bless + (cur >= 10 ? 28 : 38));
    return { ok: true, success: false, weapon: w, blessing: w.blessing, reason: '强化未成功（不掉级），祝福值升至 ' + w.blessing + '%！' };
  }

  function upgradeWeaponItemLv(profile, uid) {
    var w = findBagGun(profile, uid);
    if (!w) return { ok: false, reason: '未找到武器' };
    var accLv = profile.accountLv || 1;
    if ((w.itemLv || 1) >= accLv) return { ok: false, reason: '武器等级已追平当前账号 Lv.' + accLv };
    var cost = 16 + (w.itemLv || 1) * 5;
    if (profile.stones < cost) return { ok: false, reason: '升级需 ' + cost + ' 强化石' };
    profile.stones -= cost;
    w.itemLv = Math.min(accLv, (w.itemLv || 1) + 2);
    DATA.recalcWeaponStats(w);
    return { ok: true, weapon: w };
  }

  function reforgeBagGun(profile, uid) {
    var w = findBagGun(profile, uid);
    if (!w) return { ok: false, reason: '未找到武器' };
    var rar = DATA.RARITIES[w.rarity];
    if (!rar || rar.affixes <= 0) return { ok: false, reason: '普通白装无词条可洗练' };
    if (profile.stones < 18) return { ok: false, reason: '洗练需要 18 强化石' };
    profile.stones -= 18;
    DATA.applyRandomAffixes(w, DATA.findTemplate(w.tplId), rar.affixes);
    return { ok: true, weapon: w };
  }

  function salvageSingleBagGun(profile, uid) {
    if (uid === profile.primaryUid || uid === profile.secondaryUid) {
      return { ok: false, reason: '已装备的主/副武器不可直接熔炼' };
    }
    for (var i = 0; i < profile.bag.length; i += 1) {
      if (profile.bag[i].uid === uid) {
        var w = profile.bag[i];
        var gain = (DATA.RARITIES[w.rarity] ? DATA.RARITIES[w.rarity].salvage : 8) + w.enh * 6;
        profile.bag.splice(i, 1);
        profile.stones += gain;
        return { ok: true, stones: gain, name: w.name };
      }
    }
    return { ok: false, reason: '未找到该武器' };
  }

  /* 局内打开个人装备栏穿戴/强化/升级防具后，即时同步到当前战斗中的英雄身上！ */
  function syncHeroLoadout(profile, game) {
    if (!profile || !game || !game.hero) return;
    ensureProfileBag(profile);
    var st = computeHeroStats(profile);
    var h = game.hero;
    var oldMaxHp = h.maxHp;
    var hpGain = Math.max(0, st.maxHp - oldMaxHp);
    h.maxHp = st.maxHp;
    h.hp = Math.min(h.maxHp, h.hp + hpGain);
    var oldMaxSh = h.maxShield;
    var nextMaxSh = Math.max(160, st.shield + 160);
    h.maxShield = nextMaxSh;
    if (nextMaxSh > oldMaxSh) {
      h.shield = Math.min(h.maxShield, h.shield + (nextMaxSh - oldMaxSh));
    } else {
      h.shield = Math.min(h.maxShield, h.shield);
    }
    h.dmgReduce = st.dmgReduce;
    h.crit = st.crit - (st.visualGear.primary && st.primaryGun ? st.primaryGun.critAdd : 0);
    h.armorPen = st.armorPen;
    h.dmgMult = st.dmgMult;
    h.visualGear = st.visualGear;
    h.armorPassive = st.armorPassive;
    h.helmetPassive = st.helmetPassive;
    h.corePassive = st.corePassive;

    var pGun = cloneWeapon(st.primaryGun);
    var sGun = st.secondaryGun ? cloneWeapon(st.secondaryGun) : null;
    if (hasSkill(game, 'rapidMag')) {
      pGun.mag = Math.round(pGun.mag * 1.5);
      if (sGun) sGun.mag = Math.round(sGun.mag * 1.5);
    }
    if (h.weapons[0] && h.weapons[0].uid === pGun.uid) pGun.ammo = Math.min(pGun.mag, h.weapons[0].ammo);
    else pGun.ammo = pGun.mag;
    if (sGun) {
      if (h.weapons[1] && h.weapons[1].uid === sGun.uid) sGun.ammo = Math.min(sGun.mag, h.weapons[1].ammo);
      else sGun.ammo = sGun.mag;
      h.weapons = [pGun, sGun];
    } else {
      h.weapons = [pGun];
      h.activeSlot = 0;
    }
    h.reloadTicks = 0;
    /* 同步局内无人机状态 */
    if (st.visualGear.warcar && st.droneDef) {
      game.drone = game.drone || { x: h.x - 42, y: h.y - 84, cd: 20 };
      game.drone.def = st.droneDef;
    } else {
      game.drone = null;
    }
  }

  function salvageLowBagGuns(profile) {
    var gained = 0; var count = 0;
    for (var i = profile.bag.length - 1; i >= 0; i -= 1) {
      var w = profile.bag[i];
      if (w.uid === profile.primaryUid || w.uid === profile.secondaryUid) continue;
      if (w.rarity === 'white' || w.rarity === 'green' || w.rarity === 'blue') {
        gained += DATA.RARITIES[w.rarity].salvage;
        profile.bag.splice(i, 1);
        count += 1;
      }
    }
    profile.stones += gained;
    return { count: count, stones: gained };
  }

  function craftBlueprint(profile, tplId, rarityId, chipCost) {
    if (profile.chips < chipCost) return { ok: false, reason: '神枪碎片不足（需 ' + chipCost + '）' };
    if (profile.bag.length >= 24) return { ok: false, reason: '军械背包已满（24格），请先熔炼低阶装' };
    profile.chips -= chipCost;
    var crafted = DATA.rollWeapon(tplId, rarityId, 2);
    profile.bag.unshift(crafted);
    if (!profile.unlockedGuns) profile.unlockedGuns = {};
    profile.unlockedGuns[crafted.tplId] = true;
    profile.primaryUid = crafted.uid;
    return { ok: true, weapon: crafted };
  }

  function createGame(profile) {
    ensureProfileBag(profile);
    var st = computeHeroStats(profile);
    var heroDef = st.heroDef;
    var chapter = DATA.findChapter(profile.chapterId);
    var diff = DATA.findDiff(profile.diffId);

    var pGun = cloneWeapon(st.primaryGun);
    pGun.ammo = pGun.mag;
    var weaponsArr = [pGun];
    if (st.secondaryGun) {
      var sGun = cloneWeapon(st.secondaryGun);
      sGun.ammo = sGun.mag;
      weaponsArr.push(sGun);
    }

    var droneState = null;
    if (st.visualGear.warcar && st.droneDef) {
      droneState = { def: st.droneDef, x: WORLD_W * 0.5 - 46, y: GROUND_Y - 88, cd: 25 };
    }

    var partnerState = null;
    if ((profile.accountLv || 1) >= 20 && profile.partner) {
      var pDef = findHero(profile.partner.heroId);
      partnerState = {
        id: pDef.id, name: pDef.short, runSheet: pDef.runSheet, shootSheet: pDef.shootSheet,
        fw: pDef.fw, fh: pDef.fh, runFrames: pDef.runFrames || 10, shootFrames: pDef.shootFrames || 6,
        shoulderY: pDef.shoulderY || 40, sleeve: pDef.sleeve, glove: pDef.glove,
        lv: profile.partner.lv || 1,
        weapon: cloneWeapon(profile.partner.weapon || DATA.rollWeapon('pistol_init', 'white', 0)),
        x: WORLD_W * 0.5 - 78, y: GROUND_Y, vx: 0, vy: 0, facing: 1, aimAngle: 0,
        animTick: 0, shootCd: 18, recoil: 0, onGround: true
      };
    }

    var game = {
      status: chapter.intro && chapter.intro.length ? 'story' : 'running',
      storyQueue: chapter.intro ? chapter.intro.slice() : [],
      chapterId: chapter.id,
      chapterEp: chapter.ep,
      chapterName: chapter.name,
      chHpMult: chapter.chHpMult || 1.0,
      chDmgMult: chapter.chDmgMult || 1.0,
      chSpdMult: chapter.chSpdMult || 1.0,
      mapKey: chapter.mapKey,
      weather: chapter.weather || 'rain',
      endless: !!chapter.endless,
      diff: diff,
      tick: 0,
      hitstopTicks: 0,
      victoryLootTicks: 0,
      lootedGuns: [],
      lootedGears: [],
      waveIdx: 0,
      spawnedInWave: 0,
      bossSpawned: false,
      bossTalkShown: false,
      bossSummonCd: 0,
      spawnCd: 22,
      waveClearDelay: 0,
      reviveUsed: false,
      autoFire: true,
      manualAim: null,
      kills: 0,
      combo: 0,
      comboTicks: 0,
      maxCombo: 0,
      score: 0,
      earnedStones: 0,
      earnedChips: 0,
      earnedMerit: 0,
      runStones: 20,
      xp: 0,
      xpNeed: 110,
      lv: 1,
      shakeTicks: 0,
      shakeAmp: 0,
      nukeFlash: 0,
      warCarCharge: 30,
      warCar: null,
      drone: droneState,
      partner: partnerState,
      bannerText: chapter.endless ? '无尽第 1 波 · 孤城死守开始！' : chapter.waves[0].title,
      bannerTicks: 165,
      pendingSkills: null,
      pendingLevelUps: 0,
      pendingLootQueue: [],
      skills: {},
      devourStacks: 0,
      nextId: 10,
      hero: {
        id: heroDef.id, name: heroDef.name, short: heroDef.short,
        runSheet: heroDef.runSheet, shootSheet: heroDef.shootSheet, portrait: 'p_' + heroDef.id,
        fw: heroDef.fw, fh: heroDef.fh, runFrames: heroDef.runFrames || 10, shootFrames: heroDef.shootFrames || 6,
        shoulderY: heroDef.shoulderY || 40, sleeve: heroDef.sleeve || '#546848', glove: heroDef.glove || '#f4d2b4',
        x: WORLD_W * 0.5, y: GROUND_Y, vx: 0, vy: 0,
        facing: 1, aimAngle: 0,
        hp: st.maxHp, maxHp: st.maxHp, shield: st.shield, maxShield: Math.max(120, st.shield + 120),
        shieldFlash: 0,
        dmgReduce: st.dmgReduce,
        speed: heroDef.speed,
        crit: st.crit - (st.visualGear.primary && st.primaryGun ? st.primaryGun.critAdd : 0),
        critDmgBonus: getTalentLv(profile, 'crit') * 0.12,
        armorPen: st.armorPen,
        dmgMult: st.dmgMult,
        visualGear: st.visualGear,
        armorPassive: st.armorPassive,
        helmetPassive: st.helmetPassive,
        corePassive: st.corePassive,
        godHandCd: 0, reactCd: 0, windTicks: 0, frenzyTicks: 0, rushTicks: 0, shotCount: 0, lastHurtTick: -999,
        onGround: true, jumpsLeft: 2, squash: 0, dropThrough: 0, invuln: 45,
        shootCd: 0, reloadTicks: 0, recoil: 0, animTick: 0, shootAnim: 0,
        weapons: weaponsArr, activeSlot: (weaponsArr.length > 1 && !st.visualGear.primary && st.visualGear.secondary) ? 1 : 0,
        crazyTicks: 0, crazyCd: 0, missileCd: 0, healCd: 0, nukeCd: 240
      },
      enemies: [], bullets: [], eBullets: [], drops: [], decals: [],
      effects: [], particles: [], shells: [], poisonPools: [], floats: [], events: []
    };
    return game;
  }

  function getWaveConfig(game) {
    var ch = DATA.findChapter(game.chapterId);
    if (!ch.endless) return ch.waves[game.waveIdx] || null;
    var wNum = game.waveIdx + 1;
    var bosses = ['boss_golem', 'boss_volt', 'boss_venom', 'boss_cannon', 'boss_falcon', 'boss_emperor'];
    return {
      title: '无尽第 ' + wNum + ' 波 · 终焉尸海！',
      total: 36 + wNum * 8,
      pool: ['walker', 'toxic', 'skel', 'vamp', 'shield', 'crimson', 'bomber'],
      boss: (wNum % 2 === 0) ? bosses[(Math.floor(wNum / 2) - 1) % bosses.length] : null
    };
  }

  function hasSkill(game, id) { return !!(game && game.skills && game.skills[id]); }
  function getActiveWeapon(game) { return game.hero.weapons[game.hero.activeSlot] || game.hero.weapons[0]; }
  function swapWeapon(game) {
    if (!game || !game.hero.weapons || game.hero.weapons.length < 2) return;
    game.hero.activeSlot = game.hero.activeSlot === 0 ? 1 : 0;
    game.hero.reloadTicks = 0; game.hero.shootCd = 6;
  }

  function addShake(game, ticks, amp) {
    game.shakeTicks = Math.max(game.shakeTicks, ticks);
    game.shakeAmp = Math.max(game.shakeAmp, amp || 5);
  }

  function enhanceRunWeapon(profile, game) {
    var w = getActiveWeapon(game);
    if (!w) return { ok: false, reason: '无武器' };
    var cur = w.enh || 0;
    if (cur >= 15) return { ok: false, reason: '已达最高强化 +15' };
    var cfg = DATA.ENH_TABLE[cur];
    var cost = cfg.cost;
    if (game.runStones < cost) return { ok: false, reason: '本局强化石不足（需 ' + cost + '）' };
    game.runStones -= cost;
    var bless = w.blessing || 0;
    var okRoll = (bless >= 100) || (Math.random() < cfg.rate);
    if (okRoll) {
      w.enh = cur + 1;
      w.blessing = 0;
      DATA.recalcWeaponStats(w);
      var bg = findBagGun(profile, w.uid);
      if (bg) { bg.enh = w.enh; bg.blessing = 0; DATA.recalcWeaponStats(bg); }
      pushFloat(game, game.hero.x, game.hero.y - 84, w.name + ' +' + w.enh + ' 强化成功！', '#ffe566', true);
      spawnParticles(game, game.hero.x, game.hero.y - 40, '#ffe566', 14, 4.5);
      game.events.push('upgrade');
      return { ok: true, success: true, weapon: w };
    }
    w.blessing = Math.min(100, bless + (cur >= 10 ? 28 : 38));
    var bg2 = findBagGun(profile, w.uid);
    if (bg2) bg2.blessing = w.blessing;
    pushFloat(game, game.hero.x, game.hero.y - 80, '强化未成（不掉级）祝福 ' + w.blessing + '%', '#a9c7e8', false);
    return { ok: true, success: false, weapon: w, reason: '强化未成功（不掉级），祝福值升至 ' + w.blessing + '%！' };
  }

  function getCurrentPendingLoot(game) {
    return (game && game.pendingLootQueue && game.pendingLootQueue.length > 0) ? game.pendingLootQueue[0] : null;
  }

  function equipPendingLoot(profile, game) {
    var nw = getCurrentPendingLoot(game);
    if (!nw) return false;
    game.pendingLootQueue.shift();
    var oldW = game.hero.weapons[game.hero.activeSlot];
    if (oldW) storeGunToProfileBag(profile, null, oldW);
    storeGunToProfileBag(profile, game, nw);
    if (game.hero.activeSlot === 0) profile.primaryUid = nw.uid;
    else profile.secondaryUid = nw.uid;
    nw.ammo = nw.mag;
    game.hero.weapons[game.hero.activeSlot] = nw;
    pushFloat(game, game.hero.x, game.hero.y - 84, '已装备 [' + DATA.RARITIES[nw.rarity].name + '] ' + nw.name, DATA.RARITIES[nw.rarity].color, true);
    game.events.push('upgrade');
    return true;
  }

  function stashPendingLoot(profile, game) {
    var nw = getCurrentPendingLoot(game);
    if (!nw) return false;
    game.pendingLootQueue.shift();
    var stored = storeGunToProfileBag(profile, game, nw);
    var rar = DATA.RARITIES[nw.rarity] || DATA.RARITIES.white;
    pushFloat(game, game.hero.x, game.hero.y - 78, (stored ? '已存入军械库：' : '满包熔炼：') + nw.name, rar.color, true);
    game.events.push('upgrade');
    return true;
  }

  function salvagePendingLoot(game) {
    var nw = getCurrentPendingLoot(game);
    if (!nw) return false;
    game.pendingLootQueue.shift();
    var salv = DATA.RARITIES[nw.rarity].salvage;
    game.runStones += salv;
    game.earnedStones += Math.ceil(salv * 0.75);
    pushFloat(game, game.hero.x, game.hero.y - 72, '熔炼神枪 +' + salv + ' 强化石', '#78f5b8', false);
    return true;
  }

  /* 将队列中全部尚未处理的拾取神枪安全入库（通关/撤退/阵亡兜底，绝不丢失！） */
  function flushPendingLootToBag(profile, game) {
    if (!game || !game.pendingLootQueue || !game.pendingLootQueue.length) return;
    while (game.pendingLootQueue.length > 0) {
      storeGunToProfileBag(profile, game, game.pendingLootQueue.shift());
    }
  }

  /* 收集单个掉落物（支持战中排队入列、绝不覆盖前一把武器，以及 Boss 战后 5 秒全图自动吸取） */
  function collectDrop(profile, game, dr, isVacuum) {
    var h = game.hero;
    if (dr.kind === 'stone') {
      game.runStones += dr.amount;
      game.earnedStones += dr.amount;
      pushFloat(game, h.x + (Math.random() - 0.5) * 30, h.y - 70, '+' + dr.amount + ' 强化石', '#78f5b8', false);
    } else if (dr.kind === 'chip') {
      game.earnedChips += dr.amount;
      pushFloat(game, h.x, h.y - 86, '+' + dr.amount + ' 神枪碎片！', '#ffe566', true);
      game.events.push('drop_rare');
    } else if (dr.kind === 'med') {
      h.hp = Math.min(h.maxHp, h.hp + dr.amount);
      pushFloat(game, h.x, h.y - 68, '生命 +' + dr.amount, '#5ce68a', false);
      game.events.push('skill_heal');
    } else if (dr.kind === 'gear' && dr.gear) {
      var gr = DATA.RARITIES[dr.gear.rarity] || DATA.RARITIES.white;
      var hadBefore = !!getEquippedGearItem(profile, dr.gear.slot);
      var okG = storeGearToBag(profile, game, dr.gear);
      if (!hadBefore && okG) syncHeroLoadout(profile, game);
      pushFloat(game, h.x, h.y - 90, (okG ? (!hadBefore ? '自动穿戴：' : '拾取装备：') : '满包熔炼：') + '[' + gr.name + '] ' + dr.gear.name, gr.color, true);
      game.events.push('drop_rare');
    } else if (dr.kind === 'gun' && dr.weapon) {
      var curW = getActiveWeapon(game);
      var rar = DATA.RARITIES[dr.weapon.rarity] || DATA.RARITIES.white;
      if (isVacuum) {
        var stored = storeGunToProfileBag(profile, game, dr.weapon);
        pushFloat(game, h.x, h.y - 92, (stored ? '已自动入库：' : '满包熔炼：') + '[' + rar.name + '] ' + dr.weapon.name, rar.color, true);
        game.events.push('drop_rare');
      } else if (dr.weapon.power > curW.power || dr.weapon.rarity === 'blue' || dr.weapon.rarity === 'purple' || dr.weapon.rarity === 'orange' || dr.weapon.rarity === 'red' || dr.weapon.rarity === 'darkgold') {
        /* 放入有序拾取队列（最多排队 12 把，绝不覆盖上一把未处理的武器！） */
        if (game.pendingLootQueue.length < 12) {
          game.pendingLootQueue.push(dr.weapon);
          pushFloat(game, dr.x, dr.y - 42, '拾取待决：[' + rar.name + '] ' + dr.weapon.name, rar.color, true);
        } else {
          storeGunToProfileBag(profile, game, dr.weapon);
          pushFloat(game, dr.x, dr.y - 42, '已自动存包：' + dr.weapon.name, rar.color, false);
        }
        game.events.push('drop_rare');
      } else {
        var sv = rar.salvage;
        game.runStones += sv; game.earnedStones += Math.ceil(sv * 0.6);
        pushFloat(game, dr.x, dr.y - 28, '低阶熔炼 +' + sv + ' 强化石', '#c8d6e0', false);
      }
    }
  }

  /* 立刻完成 5 秒收尾：强制把队列与场上全部剩余掉落收入囊中！ */
  function finishVictoryLootSweep(profile, game) {
    if (!game) return;
    flushPendingLootToBag(profile, game);
    for (var i = game.drops.length - 1; i >= 0; i -= 1) {
      collectDrop(profile, game, game.drops[i], true);
      game.drops.splice(i, 1);
    }
    game.victoryLootTicks = 0;
    game.status = 'victory';
  }

  /* 跳跃高度精准下调 30%（一跳 -9.35、二段跳 -8.35，手感干脆利落不发飘！） */
  function triggerJump(game) {
    var h = game.hero;
    if (!h || h.jumpsLeft <= 0) return false;
    h.vy = h.jumpsLeft === 2 ? -9.35 : -8.35;
    h.onGround = false; h.jumpsLeft -= 1; h.squash = -5;
    spawnParticles(game, h.x, h.y, '#c9d6e0', 6, 2.2);
    return true;
  }

  function triggerDropThrough(game) {
    if (game.hero.y < GROUND_Y - 10) { game.hero.dropThrough = 20; game.hero.onGround = false; }
  }

  function triggerSkill(profile, game, skillId) {
    var h = game.hero;
    var cdMult = Math.max(0.45, 1 - getTalentLv(profile, 'cd') * 0.1);
    if (skillId === 'crazy') {
      if (h.crazyCd > 0) return false;
      var plus = hasSkill(game, 'crazyPlus');
      h.crazyTicks = plus ? 540 : 360;
      h.crazyCd = Math.round((plus ? 580 : 820) * cdMult);
      addShake(game, 10, 4);
      pushEffect(game, { type: 'ring', x: h.x, y: h.y - 36, r: 12, maxR: 125, color: '#ff4d4d', life: 24, maxLife: 24 });
      pushFloat(game, h.x, h.y - 84, '燃血狂暴！射速暴击飙升！', '#ff5e57', true);
      game.events.push('skill_crazy');
      return true;
    }
    if (skillId === 'missile') {
      if (h.missileCd > 0) return false;
      h.missileCd = Math.round(620 * cdMult);
      var cnt = hasSkill(game, 'missilePlus') ? 18 : 10;
      var baseDmg = Math.round(getActiveWeapon(game).dmg * h.dmgMult * (hasSkill(game, 'missilePlus') ? 2.7 : 2.0));
      for (var i = 0; i < cnt; i += 1) {
        var ang = -Math.PI * 0.88 + (i / Math.max(1, cnt - 1)) * Math.PI * 0.76;
        game.bullets.push({
          x: h.x, y: h.y - 42, vx: Math.cos(ang) * 7.8, vy: Math.sin(ang) * 7.8 - 2.2,
          dmg: baseDmg, splash: 84, pierce: 0, knock: 10, color: '#ff9642',
          kind: 'missile', homing: true, life: 165, elem: 'fire', hitIds: {}
        });
      }
      addShake(game, 14, 5);
      pushFloat(game, h.x, h.y - 84, '万弹归宗！全屏覆盖轰炸！', '#ffb84d', true);
      game.events.push('skill_missile');
      return true;
    }
    if (skillId === 'heal') {
      if (h.healCd > 0) return false;
      var sMult = h.id === 'shen' ? 0.65 : 1;
      h.healCd = Math.round(680 * cdMult * sMult);
      var rec = Math.round(h.maxHp * 0.45);
      h.hp = Math.min(h.maxHp, h.hp + rec);
      h.shield = Math.min(h.maxShield, h.shield + 115);
      h.invuln = Math.max(h.invuln, 55);
      pushEffect(game, { type: 'ring', x: h.x, y: h.y - 36, r: 10, maxR: 120, color: '#5ce68a', life: 26, maxLife: 26 });
      pushFloat(game, h.x, h.y - 84, '群体圣光！生命+' + rec + ' 护盾+115', '#78f7bc', true);
      game.events.push('skill_heal');
      return true;
    }
    if (skillId === 'nuke') {
      if (h.nukeCd > 0) return false;
      h.nukeCd = Math.round((hasSkill(game, 'nukeCharge') ? 680 : 1200) * cdMult);
      if (hasSkill(game, 'nukeCharge')) {
        h.invuln = Math.max(h.invuln, 220);
        h.shield = Math.min(h.maxShield, h.shield + 130);
      }
      executeNukeBlast(game, false);
      return true;
    }
    return false;
  }

  function callWarCar(profile, game) {
    if (!game || game.warCar || game.warCarCharge < 100) return false;
    game.warCarCharge = 0;
    var mods = (profile && profile.warcarMods) ? profile.warcarMods : {};
    var boosted = getTalentLv(profile, 'warcar') > 0;
    var bladeMult = mods.wc_blade ? 1.45 : 1;
    if (mods.wc_aegis && game.hero) {
      game.hero.shield = Math.min(game.hero.maxShield + 180, game.hero.shield + 180);
      game.hero.shieldFlash = 16;
      pushFloat(game, game.hero.x, game.hero.y - 86, '电磁护盾战车 +180 护盾！', '#69e8ff', true);
    }
    game.warCar = {
      x: -140, y: GROUND_Y, vx: 8.2,
      twin: !!mods.wc_twin,
      dmg: Math.round((getActiveWeapon(game).dmg * game.hero.dmgMult * 6.8 + 280) * (boosted ? 1.85 : 1) * bladeMult),
      shootCd: 0
    };
    game.bannerText = '破晓重装战车破墙进场！全线碾压开道！';
    game.bannerTicks = 150;
    addShake(game, 26, 8);
    game.events.push('boom_big');
    return true;
  }

  function executeNukeBlast(game, isRevive) {
    var h = game.hero;
    addShake(game, 38, 10);
    game.nukeFlash = 34;
    game.hitstopTicks = 3;
    pushEffect(game, { type: 'emp', x: h.x, y: h.y - 36, r: 24, maxR: 820, color: '#ffe566', life: 36, maxLife: 36 });
    pushEffect(game, { type: 'expl', x: h.x, y: h.y - 44, size: 300, life: 24, maxLife: 24 });
    var nukeDmg = Math.round(getActiveWeapon(game).dmg * h.dmgMult * 14 + 640);
    for (var i = 0; i < game.enemies.length; i += 1) {
      var e = game.enemies[i];
      if (e.isBoss) { e.hp -= Math.round(Math.min(e.maxHp * 0.35, nukeDmg * 1.4)); e.knockVx = (e.x >= h.x ? 1 : -1) * 8; }
      else { e.hp = 0; }
      e.hitFlash = 14;
    }
    game.eBullets.length = 0;
    if (isRevive) {
      game.reviveUsed = true;
      h.hp = h.maxHp; h.shield = h.maxShield; h.invuln = 180;
      game.status = 'running';
      game.bannerText = '绝境核爆满血复活！全图尸海已被瞬间蒸发！';
      game.bannerTicks = 150;
    } else {
      pushFloat(game, h.x, h.y - 90, '巅峰核爆 · 全图蒸发！', '#ffe566', true);
    }
    game.events.push('skill_nuke');
  }

  function openSkillPick(game) {
    var pool = [];
    for (var i = 0; i < DATA.ROGUE_SKILLS.length; i += 1) {
      var sk = DATA.ROGUE_SKILLS[i];
      if (!game.skills[sk.id] || sk.id === 'devour' || sk.id === 'accurate') pool.push(sk);
    }
    var picks = [];
    while (picks.length < 3 && pool.length > 0) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (picks.length > 0) { game.pendingSkills = picks; game.status = 'skill_pick'; game.events.push('levelup'); }
  }

  function pickRogueSkill(game, skillId) {
    if (!game || !game.pendingSkills) return false;
    game.skills[skillId] = (game.skills[skillId] || 0) + 1;
    if (skillId === 'devour') game.hero.hp = Math.min(game.hero.maxHp, game.hero.hp + Math.round(game.hero.maxHp * 0.45));
    else if (skillId === 'rapidMag') {
      for (var i = 0; i < game.hero.weapons.length; i += 1) {
        game.hero.weapons[i].mag = Math.round(game.hero.weapons[i].mag * 1.5);
        game.hero.weapons[i].ammo = game.hero.weapons[i].mag;
      }
    }
    game.pendingSkills = null;
    if (game.pendingLevelUps > 0) {
      game.pendingLevelUps -= 1;
      openSkillPick(game);
    } else {
      game.status = 'running';
    }
    return true;
  }

  function pushEffect(game, ef) { if (game.effects.length > 65) game.effects.shift(); game.effects.push(ef); }
  function pushDecal(game, x, kind) {
    if (game.decals.length > 28) game.decals.shift();
    game.decals.push({ x: x, kind: kind, r: kind === 'scorch' ? (24 + Math.random() * 14) : (12 + Math.random() * 10), life: 360, maxLife: 360 });
  }
  function spawnParticles(game, x, y, color, count, speed, dirX) {
    for (var i = 0; i < count; i += 1) {
      if (game.particles.length > 96) game.particles.shift();
      var ang = dirX ? (Math.atan2((Math.random() - 0.65) * 1.1, dirX) + (Math.random() - 0.5) * 0.9) : (Math.random() * Math.PI * 2);
      var sp = (0.4 + Math.random() * 0.95) * (speed || 3.0);
      game.particles.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.0, r: 2.2 + Math.random() * 2.6, color: color, life: 20 + Math.floor(Math.random() * 14), maxLife: 34 });
    }
  }
  function pushFloat(game, x, y, text, color, big) {
    if (game.floats.length > 28) game.floats.shift();
    game.floats.push({ x: x, y: y, text: text, color: color || '#ffe566', big: !!big, life: 42, maxLife: 42 });
  }

  /* 经典防毕业稀缺掉率模型（严格对标金字塔掉率 + 无尽模式波次阶梯解禁，绝不 10 分钟全身满红！） */
  function rollLootRarity(profile, game, isBoss, isElite) {
    var luck = getTalentLv(profile, 'luck') * 0.025 + game.diff.luckAdd * 0.25;
    var r = Math.random();
    var chIdx = 0;
    for (var ci = 0; ci < DATA.CHAPTERS.length; ci += 1) { if (DATA.CHAPTERS[ci].id === game.chapterId) { chIdx = ci; break; } }
    var res = 'white';

    if (isBoss) {
      var dgP = (chIdx >= 4 || game.endless) ? (game.diff.id === 'asura' ? 0.015 : (game.diff.id === 'nightmare' ? 0.005 : 0.001)) : 0;
      var redP = (game.diff.id === 'asura' ? 0.070 : (game.diff.id === 'nightmare' ? 0.030 : 0.011)) + luck * 0.02;
      var orgP = (game.diff.id === 'asura' ? 0.165 : (game.diff.id === 'nightmare' ? 0.085 : 0.038)) + luck * 0.04;
      var purP = (game.diff.id === 'asura' ? 0.400 : (game.diff.id === 'nightmare' ? 0.280 : 0.150)) + luck * 0.06;
      var bluP = (game.diff.id === 'asura' ? 0.350 : (game.diff.id === 'nightmare' ? 0.480 : 0.380));
      if (r < dgP) res = 'darkgold';
      else if (r < dgP + redP) res = 'red';
      else if (r < dgP + redP + orgP) res = 'orange';
      else if (r < dgP + redP + orgP + purP) res = 'purple';
      else if (r < dgP + redP + orgP + purP + bluP) res = 'blue';
      else res = 'green';
    } else if (isElite) {
      if (r < 0.004 + luck * 0.008) res = 'red';
      else if (r < 0.018 + luck * 0.018) res = 'orange';
      else if (r < 0.090 + luck * 0.035) res = 'purple';
      else if (r < 0.400) res = 'blue';
      else res = 'green';
    } else {
      if (r < 0.0005 + luck * 0.001) res = 'red';
      else if (r < 0.0040 + luck * 0.004) res = 'orange';
      else if (r < 0.0250 + luck * 0.015) res = 'purple';
      else if (r < 0.1000 + luck * 0.025) res = 'blue';
      else if (r < 0.4800) res = 'green';
      else res = 'white';
    }

    /* 无尽模式防速成阶梯解禁：1~5波最高蓝/微紫，6~12波开放紫/橙，13~20波开放红，21波+开放暗金！ */
    if (game.endless) {
      var wNum = game.waveIdx + 1;
      if (wNum <= 5 && (res === 'orange' || res === 'red' || res === 'darkgold')) res = 'blue';
      else if (wNum <= 12 && (res === 'red' || res === 'darkgold')) res = 'orange';
      else if (wNum <= 20 && res === 'darkgold') res = 'red';
    }
    return res;
  }

  function spawnDrop(profile, game, x, y, isBoss, isElite) {
    var gearSlots = ['armor', 'helmet', 'chip'];
    var accLv = profile.accountLv || 1;
    var dropLv = Math.max(1, accLv - Math.floor(Math.random() * 3));
    if (isBoss) {
      game.earnedMerit += Math.round((160 + game.waveIdx * 25) * game.diff.scoreMult);
      var bossGuns = (game.diff.id === 'normal') ? 1 : 2;
      for (var k = 0; k < bossGuns; k += 1) {
        var rar = rollLootRarity(profile, game, true, false);
        var gun = DATA.rollWeapon(null, rar, 0, accLv);
        game.drops.push({ id: game.nextId++, kind: 'gun', x: limitNum(x + (k - 0.5) * 56, 60, WORLD_W - 60), y: y - 18, vx: (k === 0 ? -1.8 : 1.8), vy: -6.4, weapon: gun, life: 1200 });
      }
      if (Math.random() < (game.diff.id === 'normal' ? 0.75 : 1.0)) {
        var grar = rollLootRarity(profile, game, true, false);
        var gSlot = gearSlots[Math.floor(Math.random() * gearSlots.length)];
        game.drops.push({ id: game.nextId++, kind: 'gear', x: limitNum(x + 36, 60, WORLD_W - 60), y: y - 18, vx: 2.2, vy: -6.6, gear: DATA.rollGear(gSlot, grar, 0, accLv), life: 1200 });
      }
      var chipAmt = game.diff.id === 'asura' ? 5 : (game.diff.id === 'nightmare' ? 3 : 2);
      game.drops.push({ id: game.nextId++, kind: 'chip', x: x, y: y - 22, vx: 0, vy: -7.2, amount: chipAmt, life: 1200 });
      for (var st = 0; st < 3; st += 1) {
        game.drops.push({ id: game.nextId++, kind: 'stone', x: x + (st - 1) * 28, y: y - 16, vx: (st - 1) * 1.8, vy: -5.8, amount: 12, life: 1200 });
      }
      game.drops.push({ id: game.nextId++, kind: 'med', x: x - 26, y: y - 14, vx: -1.5, vy: -5.4, amount: 160, life: 1200 });
      game.events.push('drop_rare');
      return;
    }
    if (isElite) {
      game.earnedMerit += Math.round(28 * game.diff.scoreMult);
      if (Math.random() < 0.28) {
        var erar = rollLootRarity(profile, game, false, true);
        var egun = DATA.rollWeapon(null, erar, 0, dropLv);
        game.drops.push({ id: game.nextId++, kind: 'gun', x: x, y: y - 16, vx: -0.6, vy: -5.6, weapon: egun, life: 960 });
        if (erar === 'orange' || erar === 'red' || erar === 'darkgold') game.events.push('drop_rare');
      }
      if (Math.random() < 0.28) {
        var egrar = rollLootRarity(profile, game, false, true);
        var egSlot = gearSlots[Math.floor(Math.random() * gearSlots.length)];
        game.drops.push({ id: game.nextId++, kind: 'gear', x: x + 12, y: y - 16, vx: 0.9, vy: -5.6, gear: DATA.rollGear(egSlot, egrar, 0, dropLv), life: 960 });
      }
      game.drops.push({ id: game.nextId++, kind: 'stone', x: x + 18, y: y - 12, vx: 1.2, vy: -4.8, amount: 10, life: 780 });
      return;
    }
    if (Math.random() < 0.016) {
      var rar2 = rollLootRarity(profile, game, false, false);
      var gun2 = DATA.rollWeapon(null, rar2, 0, dropLv);
      game.drops.push({ id: game.nextId++, kind: 'gun', x: x, y: y - 14, vx: 0, vy: -4.8, weapon: gun2, life: 840 });
      if (rar2 === 'orange' || rar2 === 'red' || rar2 === 'darkgold') game.events.push('drop_rare');
    } else if (Math.random() < 0.016) {
      var grar2 = rollLootRarity(profile, game, false, false);
      var gSlot2 = gearSlots[Math.floor(Math.random() * gearSlots.length)];
      game.drops.push({ id: game.nextId++, kind: 'gear', x: x, y: y - 14, vx: 0, vy: -4.8, gear: DATA.rollGear(gSlot2, grar2, 0, dropLv), life: 840 });
    } else if (Math.random() < 0.34) {
      game.drops.push({ id: game.nextId++, kind: 'stone', x: x, y: y - 10, vx: (Math.random() - 0.5) * 2, vy: -4.2, amount: 4 + game.waveIdx, life: 720 });
    } else if (Math.random() < 0.14) {
      game.drops.push({ id: game.nextId++, kind: 'med', x: x, y: y - 10, vx: 0, vy: -4.2, amount: 64, life: 720 });
    }
  }

  function spawnEnemy(game, type, fromLeft, forceElite) {
    var def = DATA.ENEMIES[type] || DATA.ENEMIES.walker;
    var chIdx = 0;
    for (var ci = 0; ci < DATA.CHAPTERS.length; ci += 1) { if (DATA.CHAPTERS[ci].id === game.chapterId) { chIdx = ci; break; } }
    var isElite = !def.isBoss && (!!forceElite || (game.spawnedInWave > 5 && Math.random() < (game.diff.id === 'asura' ? 0.22 : (game.diff.id === 'nightmare' ? 0.16 : 0.10))));
    var chScale = game.endless ? (1.25 + game.waveIdx * 0.38) : (game.chHpMult || (1 + chIdx * 0.32));
    var scale = (1 + game.waveIdx * 0.20) * chScale * game.diff.hpMult * (isElite ? 1.95 : 1);
    var hp = Math.round(def.hp * scale);
    game.enemies.push({
      id: game.nextId++, type: type, name: (isElite ? '精英·' : '') + def.name,
      isBoss: !!def.isBoss, isElite: isElite, flying: !!def.flying, explodeOnDeath: !!def.explodeOnDeath,
      sheet: def.sheet, frames: def.frames, fw: def.fw, fh: def.fh,
      x: fromLeft ? (20 + Math.random() * 44) : (WORLD_W - 20 - Math.random() * 44),
      y: def.flying ? 232 : GROUND_Y,
      w: Math.round(def.w * (isElite ? 1.14 : 1)), h: Math.round(def.h * (isElite ? 1.14 : 1)),
      hp: hp, maxHp: hp,
      dmg: Math.round(def.dmg * (1 + game.waveIdx * 0.12) * (game.chDmgMult || 1) * game.diff.dmgMult * (isElite ? 1.32 : 1)),
      speed: def.speed * (game.chSpdMult || 1) * (isElite ? 1.14 : 1),
      armor: Math.min(0.68, (def.armor || 0) + (chIdx === 0 ? 0 : game.diff.armorAdd) + (isElite ? 0.10 : 0)),
      ranged: def.ranged || '', range: def.range || 56,
      score: Math.round(def.score * game.diff.scoreMult * (isElite ? 2.6 : 1)),
      facing: fromLeft ? 1 : -1,
      knockVx: 0,
      cd: 34 + Math.floor(Math.random() * 40),
      hitFlash: 0, slowTicks: 0, burnTicks: 0, phase: Math.random() * 6.28, animTick: 0
    });
  }

  function findNearestEnemy(x, y, list) {
    var best = null; var bestD2 = 1e9;
    for (var i = 0; i < list.length; i += 1) {
      var e = list[i]; if (e.hp <= 0) continue;
      var dx = e.x - x; var dy = (e.y - e.h * 0.5) - (y - 40);
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  }

  function hasWeaponSkill(w, id) {
    if (!w) return false;
    if (w.godSkill && w.godSkill.id === id) return true;
    if (w.wSkills) {
      for (var i = 0; i < w.wSkills.length; i += 1) if (w.wSkills[i].id === id) return true;
    }
    return false;
  }

  function firePlayerWeapon(game) {
    var h = game.hero; var w = getActiveWeapon(game);
    if (!w) return;
    var coreP = h.corePassive ? h.corePassive.id : '';
    var effMag = coreP === 'cp_mag' ? Math.round(w.mag * 1.35) : w.mag;
    if (w.ammo <= 0) {
      h.reloadTicks = Math.round((hasSkill(game, 'rapidMag') ? 14 : 36) * (coreP === 'cp_mag' ? 0.75 : 1));
      w.ammo = effMag;
      pushFloat(game, h.x, h.y - 80, '极速换匣', '#80e8ff', false);
      return;
    }

    var comboBoost = game.combo >= 30 ? 0.80 : (game.combo >= 15 ? 0.88 : 1);
    var rateMult = (h.crazyTicks > 0 ? 0.52 : 1) * (h.rushTicks > 0 ? 0.50 : 1) * (h.windTicks > 0 ? 0.85 : 1) * (hasSkill(game, 'rapidMag') ? 0.75 : 1) * comboBoost;
    h.shootCd = Math.max(4, Math.round(w.rate * rateMult));
    h.recoil = (w.type === 'shotgun' || w.type === 'sniper' || w.type === 'rocket') ? 11 : 7;
    h.shootAnim = 14;
    h.shotCount = (h.shotCount || 0) + 1;
    if (h.rushTicks <= 0) w.ammo -= 1;

    if (w.type === 'shotgun' || w.type === 'sniper' || w.type === 'rocket' || w.type === 'grenade') {
      addShake(game, 5, (w.type === 'rocket' || w.type === 'grenade') ? 4.5 : 3.0);
    }

    var shY = h.y - (h.shoulderY || 40);
    var mLen = Math.max(30, (w.muzzleLen || 48) - h.recoil * 0.7);
    var muzzleX = h.x + Math.cos(h.aimAngle) * mLen;
    var muzzleY = shY + Math.sin(h.aimAngle) * mLen;
    pushEffect(game, { type: 'muzzle', x: muzzleX, y: muzzleY, ang: h.aimAngle, frame: Math.floor(Math.random() * 4), life: 6, maxLife: 6 });

    if (game.shells.length < 34 && w.type !== 'laser' && w.type !== 'lightning' && w.type !== 'flamer' && w.type !== 'crossbow' && w.type !== 'rocket') {
      game.shells.push({ x: h.x + Math.cos(h.aimAngle) * 14, y: shY + Math.sin(h.aimAngle) * 14 - 3, vx: -h.facing * (1.4 + Math.random() * 1.8), vy: -3.5 - Math.random() * 1.5, life: 52 });
    }

    var effElem = w.elem || (h.corePassive && h.corePassive.elem ? h.corePassive.elem : '');
    var elemBoost = (h.id === 'shen' && (effElem === 'ice' || effElem === 'fire' || effElem === 'lightning')) ? 1.28 : 1;
    var despBoost = hasWeaponSkill(w, 'gs_desp') ? (1 + Math.max(0, 1 - h.hp / Math.max(1, h.maxHp)) * 1.2) : 1;
    var frenzyBoost = h.frenzyTicks > 0 ? 1.18 : 1;
    var baseDmg = w.dmg * h.dmgMult * elemBoost * despBoost * frenzyBoost * (1 + game.devourStacks * 0.015);
    var totalCrit = h.crit + w.critAdd + (h.crazyTicks > 0 ? 0.35 : 0) + (hasSkill(game, 'accurate') ? 0.2 : 0);
    var critMult = 1.95 + h.critDmgBonus + w.critDmgAdd + (hasSkill(game, 'accurate') ? 0.65 : 0);
    var pierce = w.pierce + (hasSkill(game, 'through') ? 3 : 0) + (hasWeaponSkill(w, 'gs_pierce') ? 4 : 0);
    var splash = Math.round((w.splash + (hasSkill(game, 'splash') ? 50 : 0)) * (coreP === 'cp_fire' ? 1.25 : 1));
    var pen = h.armorPen + (hasSkill(game, 'through') ? 0.30 : 0) + (coreP === 'cp_venom' ? 0.18 : 0) + (w.type === 'sniper' || w.type === 'laser' ? 0.35 : 0);
    var pellets = (w.pellets || 1) + (coreP === 'cp_prism' ? 1 : 0);

    for (var p = 0; p < pellets; p += 1) {
      var a = h.aimAngle + (Math.random() - 0.5) * (w.spread + (coreP === 'cp_prism' ? 0.04 : 0));
      var isCrit = Math.random() < totalCrit;
      var dmg = Math.round(baseDmg * (isCrit ? critMult : 1));
      game.bullets.push({
        x: muzzleX, y: muzzleY, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        dmg: dmg, isCrit: isCrit, pierce: pierce, pierceHits: 0, splash: splash, pen: pen, knock: w.knock || 4,
        color: w.color, kind: w.type, elem: effElem, hitIds: {},
        gsPierce: hasWeaponSkill(w, 'gs_pierce'),
        life: w.type === 'flamer' ? 38 : 110
      });
    }

    var mChance = (hasSkill(game, 'hitMissile') ? 0.28 : 0) + (w.missileChance || 0) + (hasWeaponSkill(w, 'gs_missile') ? 0.18 : 0);
    var swarmFire = (coreP === 'cp_swarm' && h.shotCount % 8 === 0);
    if (swarmFire || (mChance > 0 && Math.random() < mChance)) {
      game.bullets.push({
        x: h.x, y: h.y - 44, vx: h.facing * 6.5, vy: -4.4,
        dmg: Math.round(baseDmg * 1.55), isCrit: false, pierce: 0, splash: 68, pen: 0.28, knock: 8,
        color: '#ff9642', kind: 'missile', homing: true, elem: 'fire', hitIds: {}, life: 140
      });
    }
    game.events.push('shoot_' + w.type);
  }

  function stepGame(profile, game, input) {
    if (!game || (game.status !== 'running' && game.status !== 'victory_loot')) return;

    /* 强打击微顿帧（仅 1~3 帧，营造沉重斩杀打击感） */
    if (game.hitstopTicks > 0) {
      game.hitstopTicks -= 1;
      return;
    }

    game.tick += 1;
    var h = game.hero;
    var isLootPhase = game.status === 'victory_loot';

    if (game.shakeTicks > 0) { game.shakeTicks -= 1; if (game.shakeTicks === 0) game.shakeAmp = 0; }
    if (game.nukeFlash > 0) game.nukeFlash -= 1;
    if (game.bannerTicks > 0) { game.bannerTicks -= 1; if (game.bannerTicks === 0) game.bannerText = ''; }
    if (game.comboTicks > 0) { game.comboTicks -= 1; if (game.comboTicks === 0) game.combo = 0; }
    if (h.invuln > 0) h.invuln -= 1;
    if (h.shieldFlash > 0) h.shieldFlash -= 1;
    if (h.shootCd > 0) h.shootCd -= 1;
    if (h.reloadTicks > 0) h.reloadTicks -= 1;
    if (h.recoil > 0) h.recoil -= 1;
    if (h.shootAnim > 0) h.shootAnim -= 1;
    if (h.squash > 0) h.squash -= 1; else if (h.squash < 0) h.squash += 1;
    if (h.dropThrough > 0) h.dropThrough -= 1;
    if (h.crazyTicks > 0) h.crazyTicks -= 1;
    if (h.godHandCd > 0) h.godHandCd -= 1;
    if (h.reactCd > 0) h.reactCd -= 1;
    if (h.windTicks > 0) h.windTicks -= 1;
    if (h.frenzyTicks > 0) h.frenzyTicks -= 1;
    if (h.rushTicks > 0) h.rushTicks -= 1;
    if (h.helmetPassive && h.helmetPassive.id === 'gp_sh_regen' && game.tick - (h.lastHurtTick || -999) > 240 && game.tick % 60 === 0 && h.shield < h.maxShield) {
      h.shield = Math.min(h.maxShield, h.shield + Math.round(h.maxShield * 0.10));
    }
    if (h.crazyCd > 0) h.crazyCd -= 1;
    if (h.missileCd > 0) h.missileCd -= 1;
    if (h.healCd > 0) h.healCd -= 1;
    if (h.nukeCd > 0) h.nukeCd -= 1;

    /* 主角移动与平台跳跃 */
    var moveX = (input && input.moveX) ? limitNum(input.moveX, -1, 1) : 0;
    var spd = h.speed * (h.crazyTicks > 0 ? 1.25 : 1);
    h.vx = moveX * spd;
    h.x = limitNum(h.x + h.vx, 32, WORLD_W - 32);
    if (Math.abs(h.vx) > 0.3) {
      h.animTick += 1;
      if (!game.manualAim) h.facing = h.vx > 0 ? 1 : -1;
    }

    var prevY = h.y; var wasAir = !h.onGround;
    h.vy += GRAVITY; h.y += h.vy; h.onGround = false;
    if (h.vy >= 0 && h.dropThrough <= 0) {
      for (var pi = 0; pi < PLATFORMS.length; pi += 1) {
        var pl = PLATFORMS[pi];
        if (h.x >= pl.x - 10 && h.x <= pl.x + pl.w + 10 && prevY <= pl.y + 5 && h.y >= pl.y) {
          h.y = pl.y; h.vy = 0; h.onGround = true; h.jumpsLeft = 2;
          if (wasAir) h.squash = 6;
          break;
        }
      }
    }
    if (h.y >= GROUND_Y) { h.y = GROUND_Y; h.vy = 0; h.onGround = true; h.jumpsLeft = 2; if (wasAir) h.squash = 7; }

    /* ========== Boss 击溃后的 5 秒全图战利品自动飞回吸取收尾阶段！ ========== */
    if (isLootPhase) {
      game.victoryLootTicks -= 1;
      for (var vdi = game.drops.length - 1; vdi >= 0; vdi -= 1) {
        var vdr = game.drops[vdi];
        var vdx = h.x - vdr.x;
        var vdy = (h.y - 36) - vdr.y;
        var vdist = Math.sqrt(vdx * vdx + vdy * vdy);
        var pullSpd = 12 + (VICTORY_LOOT_TICKS - game.victoryLootTicks) * 0.08;
        if (vdist < 38) {
          collectDrop(profile, game, vdr, true);
          spawnParticles(game, h.x, h.y - 40, '#ffe566', 6, 3.0);
          game.drops.splice(vdi, 1);
        } else {
          vdr.x += (vdx / Math.max(1, vdist)) * pullSpd;
          vdr.y += (vdy / Math.max(1, vdist)) * pullSpd;
        }
      }
      stepVisualLists(game);
      if (game.victoryLootTicks <= 0) {
        finishVictoryLootSweep(profile, game);
      }
      return;
    }

    /* 10 级解锁无人机浮游炮自动巡航与开火 AI */
    if (game.drone && game.drone.def) {
      var drn = game.drone;
      var dDef = drn.def;
      var targetX = h.x - h.facing * 44;
      var targetY = h.y - 84 + Math.sin(game.tick * 0.08) * 7;
      drn.x += (targetX - drn.x) * 0.14;
      drn.y += (targetY - drn.y) * 0.14;
      if (drn.cd > 0) drn.cd -= 1;
      var dNear = findNearestEnemy(drn.x, drn.y, game.enemies);
      if (dNear && drn.cd <= 0) {
        drn.cd = dDef.rate;
        var dang = Math.atan2((dNear.y - dNear.h * 0.5) - drn.y, dNear.x - drn.x);
        var dDmg = Math.round(dDef.dmg * h.dmgMult * (1 + (profile.accountLv - 10) * 0.04));
        game.bullets.push({
          x: drn.x, y: drn.y, vx: Math.cos(dang) * 19, vy: Math.sin(dang) * 19,
          dmg: dDmg, isCrit: false,
          pierce: dDef.kind === 'laser' ? 5 : (dDef.kind === 'lightning' ? 2 : 0),
          splash: dDef.kind === 'missile' ? 68 : 0,
          homing: dDef.kind === 'missile',
          pen: 0.25, knock: 3.5, color: dDef.color, kind: dDef.kind, elem: dDef.elem,
          hitIds: {}, life: 95
        });
        pushEffect(game, { type: 'muzzle', x: drn.x, y: drn.y, ang: dang, frame: 0, life: 5, maxLife: 5 });
      }
    }

    /* 20 级解锁专属伙伴 AI（白板角色持手枪/培养武器与主角并肩作战！） */
    if (game.partner) {
      var pt = game.partner;
      if (pt.recoil > 0) pt.recoil -= 1;
      if (pt.shootCd > 0) pt.shootCd -= 1;
      var followX = h.x - h.facing * 72;
      var pdx = followX - pt.x;
      if (Math.abs(pdx) > 18) {
        pt.vx = (pdx > 0 ? 1 : -1) * Math.min(4.2, Math.abs(pdx) * 0.14);
        pt.x = limitNum(pt.x + pt.vx, 28, WORLD_W - 28);
        pt.animTick += 1;
      } else { pt.vx = 0; }
      pt.y = GROUND_Y;
      var pNear = findNearestEnemy(pt.x, pt.y, game.enemies);
      if (pNear) {
        var peDx = pNear.x - pt.x;
        var peDy = (pNear.y - pNear.h * 0.5) - (pt.y - 40);
        pt.aimAngle = Math.atan2(peDy, peDx);
        pt.facing = peDx >= 0 ? 1 : -1;
        if (pt.shootCd <= 0) {
          var pw = pt.weapon;
          pt.shootCd = Math.max(8, pw.rate + 4);
          pt.recoil = 5;
          var pDmg = Math.round(pw.dmg * (1 + (pt.lv - 1) * 0.12));
          game.bullets.push({
            x: pt.x + Math.cos(pt.aimAngle) * 36, y: pt.y - 40 + Math.sin(pt.aimAngle) * 36,
            vx: Math.cos(pt.aimAngle) * 17, vy: Math.sin(pt.aimAngle) * 17,
            dmg: pDmg, isCrit: false, pierce: pw.pierce || 0, splash: 0, pen: 0.1, knock: 2.5,
            color: '#e6eef8', kind: 'pistol', elem: pw.elem || '', hitIds: {}, life: 95
          });
          pushEffect(game, { type: 'muzzle', x: pt.x + Math.cos(pt.aimAngle) * 38, y: pt.y - 40 + Math.sin(pt.aimAngle) * 38, ang: pt.aimAngle, frame: 1, life: 5, maxLife: 5 });
        }
      } else {
        pt.facing = h.facing;
        pt.aimAngle = pt.facing > 0 ? 0 : Math.PI;
      }
    }

    /* 破晓重装战车全线碾压 */
    if (game.warCar) {
      var wc = game.warCar;
      wc.x += wc.vx; wc.shootCd -= 1;
      if (game.tick % 4 === 0) spawnParticles(game, wc.x - 95, GROUND_Y - 6, '#b8a890', 2, 2.2, -1);
      if (wc.shootCd <= 0) {
        wc.shootCd = 14;
        game.bullets.push({ x: wc.x + 98, y: wc.y - 78, vx: 18, vy: -0.5, dmg: Math.round(wc.dmg * 0.6), isCrit: true, pierce: 2, splash: 108, pen: 0.45, knock: 14, color: '#ffe566', kind: 'rocket', elem: 'fire', hitIds: {}, life: 90 });
        if (wc.twin) {
          game.bullets.push({ x: wc.x + 94, y: wc.y - 62, vx: 17.5, vy: -1.4, dmg: Math.round(wc.dmg * 0.55), isCrit: true, pierce: 2, splash: 100, pen: 0.45, knock: 12, color: '#ff9642', kind: 'rocket', elem: 'fire', hitIds: {}, life: 90 });
        }
        game.events.push('shoot_rocket');
      }
      for (var wi = 0; wi < game.enemies.length; wi += 1) {
        var we = game.enemies[wi];
        if (we.hp > 0 && !we.flying && Math.abs(we.x - wc.x) < 105) {
          we.hp -= wc.dmg * 0.24; we.hitFlash = 6; we.knockVx = 10;
        }
      }
      if (wc.x > WORLD_W + 200) game.warCar = null;
    }

    /* 瞄准与射击（以真实肩膀枢轴为瞄准圆心，360°丝滑指向敌人） */
    var aimTarget = null;
    var aimOriginY = h.y - (h.shoulderY || 28);
    if (game.manualAim) {
      var mdx = game.manualAim.x - h.x; var mdy = game.manualAim.y - aimOriginY;
      h.aimAngle = Math.atan2(mdy, mdx); h.facing = mdx >= 0 ? 1 : -1; aimTarget = true;
    } else {
      var near = findNearestEnemy(h.x, h.y, game.enemies);
      if (near) {
        var edx = near.x - h.x; var edy = (near.y - near.h * 0.5) - aimOriginY;
        h.aimAngle = Math.atan2(edy, edx); h.facing = edx >= 0 ? 1 : -1; aimTarget = near;
      } else { h.aimAngle = h.facing > 0 ? 0 : Math.PI; }
    }
    if ((game.autoFire && aimTarget) || (input && input.fireHeld) || game.manualAim) {
      if (h.shootCd <= 0 && h.reloadTicks <= 0) firePlayerWeapon(game);
    }

    /* 高密度多波次尸海刷怪 + Boss 剧情登场与狂暴召怪 */
    var wCfg = getWaveConfig(game);
    if (wCfg) {
      if (game.spawnedInWave < wCfg.total) {
        game.spawnCd -= 1;
        if (game.spawnCd <= 0 && game.enemies.length < 38) {
          var burst = (wCfg.total - game.spawnedInWave >= 2 && game.enemies.length < 32) ? (Math.random() < 0.55 ? 2 : 1) : 1;
          var forceEl = !!(wCfg.forceElites && game.spawnedInWave >= 6 && game.spawnedInWave % 10 === 0);
          for (var bs = 0; bs < burst && game.spawnedInWave < wCfg.total; bs += 1) {
            var zType = wCfg.pool[Math.floor(Math.random() * wCfg.pool.length)];
            spawnEnemy(game, zType, (bs % 2 === 0) ? (Math.random() < 0.5) : (Math.random() >= 0.5), forceEl && bs === 0);
            game.spawnedInWave += 1;
          }
          game.spawnCd = Math.max(24, 48 - game.waveIdx * 4);
        }
      } else if (wCfg.boss && !game.bossSpawned) {
        game.bossSpawned = true;
        spawnEnemy(game, wCfg.boss, h.x > WORLD_W * 0.5, false);
        game.bannerText = '高能警告：' + DATA.ENEMIES[wCfg.boss].name + ' 降临！';
        game.bannerTicks = 180;
        addShake(game, 28, 9);
        game.events.push('boom_big');
        var chObj = DATA.findChapter(game.chapterId);
        if (!game.bossTalkShown && chObj && chObj.bossTalk && chObj.bossTalk.length) {
          game.bossTalkShown = true;
          game.storyQueue = chObj.bossTalk.slice();
          game.status = 'story';
          return;
        }
      } else if (game.enemies.length === 0) {
        game.waveClearDelay += 1;
        if (game.waveClearDelay >= 90) {
          game.waveClearDelay = 0;
          if (!game.endless && game.waveIdx + 1 >= DATA.findChapter(game.chapterId).waves.length) {
            /* 通关！进入 5 秒全图战利品自动飞回吸取收尾阶段！ */
            flushPendingLootToBag(profile, game);
            game.earnedStones += Math.round(115 * game.diff.scoreMult);
            game.earnedChips += game.diff.id === 'asura' ? 8 : (game.diff.id === 'nightmare' ? 5 : 3);
            game.score += Math.round(3000 * game.diff.scoreMult);
            game.victoryLootTicks = VICTORY_LOOT_TICKS;
            game.bannerText = '首领已击溃！5 秒全图战利品自动吸取入库...';
            game.bannerTicks = VICTORY_LOOT_TICKS;
            game.status = 'victory_loot';
            game.events.push('levelup');
            return;
          }
          game.waveIdx += 1; game.spawnedInWave = 0; game.bossSpawned = false;
          var nextCfg = getWaveConfig(game);
          if (nextCfg) { game.bannerText = nextCfg.title; game.bannerTicks = 160; }
          openSkillPick(game);
          return;
        }
      }
    }

    for (var ppi = game.poisonPools.length - 1; ppi >= 0; ppi -= 1) {
      var pp = game.poisonPools[ppi]; pp.life -= 1;
      if (game.tick % 16 === 0) {
        for (var pei = 0; pei < game.enemies.length; pei += 1) {
          var pe = game.enemies[pei];
          if (Math.abs(pe.x - pp.x) < pp.r && Math.abs(pe.y - pp.y) < 48) pe.hp -= 18 * h.dmgMult;
        }
      }
      if (pp.life <= 0) game.poisonPools.splice(ppi, 1);
    }

    /* 子弹命中 + 护甲破甲 + 真实物理击退 */
    var feedbackChain = hasSkill(game, 'feedback');
    for (var bi = game.bullets.length - 1; bi >= 0; bi -= 1) {
      var b = game.bullets[bi]; b.life -= 1;
      if (b.homing) {
        var mt = findNearestEnemy(b.x, b.y, game.enemies);
        if (mt) {
          var ta = Math.atan2((mt.y - mt.h * 0.5) - b.y, mt.x - b.x);
          b.vx = b.vx * 0.88 + Math.cos(ta) * 1.65;
          b.vy = b.vy * 0.88 + Math.sin(ta) * 1.65;
        }
      }
      if (b.kind === 'grenade') b.vy += 0.28;
      b.x += b.vx; b.y += b.vy;
      if (b.life <= 0 || b.x < -50 || b.x > WORLD_W + 50 || b.y > GROUND_Y + 20 || b.y < -80) {
        if (b.splash > 0 && b.y >= GROUND_Y) triggerBulletExplosion(game, b);
        game.bullets.splice(bi, 1); continue;
      }
      var consumed = false;
      for (var ei = 0; ei < game.enemies.length; ei += 1) {
        var en = game.enemies[ei];
        if (en.hp <= 0 || (b.hitIds && b.hitIds[en.id])) continue;
        if (Math.abs(b.x - en.x) < en.w * 0.52 + 8 && b.y >= en.y - en.h - 6 && b.y <= en.y + 8) {
          if (b.hitIds) b.hitIds[en.id] = true;
          var effArmor = Math.max(0, en.armor - (b.pen || 0));
          var dealt = Math.max(1, Math.round(b.dmg * (1 - effArmor)));
          if (b.gsPierce && (b.pierceHits || 0) > 0) {
            dealt = Math.round(dealt * (1 + Math.min(1.1, b.pierceHits * 0.22)));
          }
          b.pierceHits = (b.pierceHits || 0) + 1;
          var dirX = b.vx >= 0 ? 1 : -1;
          applyEnemyHit(game, en, dealt, b.isCrit, b.elem, dirX, b.knock || 4);
          if (b.splash > 0) triggerBulletExplosion(game, b);
          if (b.elem === 'lightning' || feedbackChain) triggerChainLightning(game, en, Math.round(dealt * 0.58));
          if (b.pierce > 0) b.pierce -= 1;
          else { consumed = true; break; }
        }
      }
      if (consumed) game.bullets.splice(bi, 1);
    }

    /* 僵尸与 Boss AI（含击退减速衰减 + Boss 二阶段召唤精英护卫） */
    for (var zi = 0; zi < game.enemies.length; zi += 1) {
      var z = game.enemies[zi]; if (z.hp <= 0) continue;
      z.phase += 0.14; z.animTick += 1;
      if (z.hitFlash > 0) z.hitFlash -= 1;
      if (z.slowTicks > 0) z.slowTicks -= 1;
      if (z.burnTicks > 0) { z.burnTicks -= 1; if (z.burnTicks % 22 === 0) z.hp -= 17 * h.dmgMult; }
      if (z.cd > 0) z.cd -= 1;

      if (Math.abs(z.knockVx) > 0.25) {
        z.x = limitNum(z.x + z.knockVx, 24, WORLD_W - 24);
        z.knockVx *= 0.78;
      } else { z.knockVx = 0; }

      var dx = h.x - z.x; var adx = Math.abs(dx);
      if (adx > 10) z.facing = dx > 0 ? 1 : -1;
      var rage = (z.isBoss && z.hp < z.maxHp * 0.5) ? 1.45 : 1;
      var mSpd = z.speed * rage * (z.slowTicks > 0 ? 0.52 : 1);

      if (z.flying) z.y = 222 + Math.sin(z.phase * 0.65) * 34;

      if (z.isBoss && rage > 1) {
        game.bossSummonCd -= 1;
        if (game.bossSummonCd <= 0 && game.enemies.length < 24 && wCfg) {
          game.bossSummonCd = 240;
          var sType = wCfg.pool[Math.floor(Math.random() * wCfg.pool.length)];
          spawnEnemy(game, sType, true, false);
          spawnEnemy(game, sType, false, false);
        }
      }

      if (z.ranged && adx <= z.range && z.cd <= 0) {
        z.cd = Math.round((z.isBoss ? 78 : 128) / rage);
        var ang = Math.atan2((h.y - 36) - (z.y - z.h * 0.55), h.x - z.x);
        var shots = z.type === 'boss_cannon' ? (rage > 1 ? 5 : 3) : (z.type === 'boss_emperor' ? (rage > 1 ? 8 : 5) : (z.type === 'boss_falcon' || z.type === 'boss_volt' ? 4 : (z.type === 'boss_venom' ? 3 : 1)));
        for (var s = 0; s < shots; s += 1) {
          var sa = ang + (s - (shots - 1) * 0.5) * 0.20;
          game.eBullets.push({
            x: z.x + z.facing * 22, y: z.y - z.h * 0.55,
            vx: Math.cos(sa) * (z.isBoss ? 5.8 : 4.6), vy: Math.sin(sa) * (z.isBoss ? 5.8 : 4.6),
            dmg: z.dmg, kind: z.ranged, life: 220
          });
        }
      } else if (adx > (z.flying ? 165 : 34)) {
        z.x = limitNum(z.x + z.facing * mSpd, 24, WORLD_W - 24);
      }

      if (!z.flying && adx < z.w * 0.45 + 16 && Math.abs(h.y - z.y) < 54 && z.cd <= 0) {
        z.cd = 50;
        damageHero(game, z.dmg);
        if (h.armorPassive && h.armorPassive.id === 'gp_thorns') {
          var refDmg = Math.max(8, Math.round(z.dmg * 0.38));
          z.hp -= refDmg;
          z.hitFlash = 6;
          pushFloat(game, z.x, z.y - z.h - 8, '反伤 ' + refDmg, '#ff8d6b', false);
        }
      }
    }

    for (var ebi = game.eBullets.length - 1; ebi >= 0; ebi -= 1) {
      var eb = game.eBullets[ebi]; eb.life -= 1; eb.x += eb.vx; eb.y += eb.vy;
      if (eb.life <= 0 || eb.x < -30 || eb.x > WORLD_W + 30 || eb.y > GROUND_Y + 14) { game.eBullets.splice(ebi, 1); continue; }
      if (Math.abs(eb.x - h.x) < 22 && eb.y >= h.y - 60 && eb.y <= h.y) {
        damageHero(game, eb.dmg);
        spawnParticles(game, eb.x, eb.y, '#ff5c5c', 7, 2.8);
        game.eBullets.splice(ebi, 1);
      }
    }

    /* 击杀结算 + 连杀加成 + 地面焦痕/血渍 + 斩杀顿帧 */
    var vamp = getActiveWeapon(game).vampAdd + (hasSkill(game, 'bloodShield') ? 7 : 0);
    var carGain = getTalentLv(profile, 'warcar') > 0 ? 7.5 : 3.8;
    for (var dz = game.enemies.length - 1; dz >= 0; dz -= 1) {
      var dead = game.enemies[dz];
      if (dead.hp <= 0) {
        game.kills += 1;
        game.combo += 1;
        game.comboTicks = 170;
        if (game.combo > game.maxCombo) game.maxCombo = game.combo;
        var comboBonus = 1 + Math.min(0.6, game.combo * 0.015);
        game.score += Math.round(dead.score * comboBonus);
        game.xp += dead.isBoss ? 180 : (dead.isElite ? 45 : 16);
        game.warCarCharge = Math.min(100, game.warCarCharge + (dead.isBoss ? 50 : carGain));
        if (hasSkill(game, 'devour')) game.devourStacks = Math.min(45, game.devourStacks + 1);
        if (vamp > 0) h.hp = Math.min(h.maxHp, h.hp + vamp);
        if (hasSkill(game, 'bloodShield')) h.shield = Math.min(h.maxShield, h.shield + 14);
        if (hasSkill(game, 'poisonFog') || dead.explodeOnDeath || (h.corePassive && h.corePassive.id === 'cp_venom')) game.poisonPools.push({ x: dead.x, y: GROUND_Y, r: dead.explodeOnDeath ? 82 : 64, life: 180 });
        var curGunKill = getActiveWeapon(game);
        if (hasWeaponSkill(curGunKill, 'ws_reload')) curGunKill.ammo = Math.min(curGunKill.mag, curGunKill.ammo + Math.max(1, Math.round(curGunKill.mag * 0.12)));
        if (hasWeaponSkill(curGunKill, 'ws_heal')) h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.03));
        if (hasWeaponSkill(curGunKill, 'ws_frenzy')) h.frenzyTicks = 150;
        if (hasWeaponSkill(curGunKill, 'ws_splash')) triggerBulletExplosion(game, { x: dead.x, y: dead.y - 30, dmg: Math.round(curGunKill.dmg * h.dmgMult * 0.65), splash: 130 });
        game.earnedMerit += dead.isBoss ? 120 : (dead.isElite ? 16 : 3);
        if (dead.explodeOnDeath) {
          pushEffect(game, { type: 'expl', x: dead.x, y: dead.y - 34, size: 148, life: 20, maxLife: 20 });
          pushDecal(game, dead.x, 'scorch');
          addShake(game, 12, 6);
          if (Math.abs(dead.x - h.x) < 82 && Math.abs(dead.y - h.y) < 64) damageHero(game, dead.dmg);
          game.events.push('boom_small');
        } else {
          pushDecal(game, dead.x, dead.isBoss ? 'scorch' : 'splat');
        }
        if (h.nukeCd > 0) h.nukeCd = Math.max(0, h.nukeCd - (hasSkill(game, 'nukeCharge') ? 22 : 9));
        pushEffect(game, { type: dead.isBoss ? 'expl' : 'blood', x: dead.x, y: dead.y - dead.h * 0.45, size: dead.isBoss ? 220 : (dead.isElite ? 96 : 74), life: dead.isBoss ? 26 : 14, maxLife: dead.isBoss ? 26 : 14 });
        spawnParticles(game, dead.x, dead.y - dead.h * 0.4, dead.isBoss ? '#ff9838' : '#7ef78a', dead.isBoss ? 22 : 7, dead.isBoss ? 5.2 : 3.2);
        spawnDrop(profile, game, dead.x, dead.y, dead.isBoss, dead.isElite);
        if (dead.isBoss) {
          addShake(game, 34, 10);
          game.hitstopTicks = 3;
          game.events.push('boom_big');
        } else if (dead.isElite) {
          addShake(game, 10, 5);
          game.hitstopTicks = 1;
          game.events.push('boom_small');
        }
        game.enemies.splice(dz, 1);
      }
    }

    if (game.xp >= game.xpNeed) {
      while (game.xp >= game.xpNeed) {
        game.xp -= game.xpNeed; game.lv += 1; game.xpNeed = Math.round(game.xpNeed * 1.42);
        h.hp = Math.min(h.maxHp, h.hp + 55);
        game.pendingLevelUps += 1;
      }
      if (game.status === 'running' && game.pendingLevelUps > 0) {
        game.pendingLevelUps -= 1;
        openSkillPick(game);
        return;
      }
    }

    /* 掉落物物理与吸取 */
    for (var dri = game.drops.length - 1; dri >= 0; dri -= 1) {
      var dr = game.drops[dri]; dr.life -= 1;
      if (dr.vx) { dr.x = limitNum(dr.x + dr.vx, 30, WORLD_W - 30); dr.vx *= 0.92; }
      if (dr.y < GROUND_Y) { dr.vy += 0.25; dr.y = Math.min(GROUND_Y, dr.y + dr.vy); }
      var ddx = h.x - dr.x; var ddy = (h.y - 26) - dr.y;
      var dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < 165 && dr.kind !== 'gun') { dr.x += (ddx / Math.max(1, dist)) * 6.4; dr.y += (ddy / Math.max(1, dist)) * 6.4; }
      if (dist < 46) {
        collectDrop(profile, game, dr, false);
        game.drops.splice(dri, 1); continue;
      }
      if (dr.life <= 0) game.drops.splice(dri, 1);
    }

    stepVisualLists(game);

    if (h.hp <= 0) {
      if (!game.reviveUsed) { h.hp = 1; game.status = 'revive_prompt'; }
      else { game.status = 'defeat'; }
    }
  }

  function stepVisualLists(game) {
    for (var efi = game.effects.length - 1; efi >= 0; efi -= 1) { game.effects[efi].life -= 1; if (game.effects[efi].life <= 0) game.effects.splice(efi, 1); }
    for (var pti = game.particles.length - 1; pti >= 0; pti -= 1) { var pt = game.particles[pti]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.12; pt.life -= 1; if (pt.life <= 0) game.particles.splice(pti, 1); }
    for (var shi = game.shells.length - 1; shi >= 0; shi -= 1) { var sh = game.shells[shi]; sh.x += sh.vx; sh.y += sh.vy; sh.vy += 0.22; if (sh.y > GROUND_Y) { sh.y = GROUND_Y; sh.vy *= -0.35; sh.vx *= 0.65; } sh.life -= 1; if (sh.life <= 0) game.shells.splice(shi, 1); }
    for (var dci = game.decals.length - 1; dci >= 0; dci -= 1) { game.decals[dci].life -= 1; if (game.decals[dci].life <= 0) game.decals.splice(dci, 1); }
    for (var fli = game.floats.length - 1; fli >= 0; fli -= 1) { game.floats[fli].y -= 0.78; game.floats[fli].life -= 1; if (game.floats[fli].life <= 0) game.floats.splice(fli, 1); }
  }

  function applyEnemyHit(game, en, dmg, isCrit, elem, dirX, knock) {
    var h = game.hero;
    var w = getActiveWeapon(game);
    var coreP = h.corePassive ? h.corePassive.id : '';
    var mult = 1;
    if (coreP === 'cp_ice' && en.slowTicks > 0) mult *= 1.20;
    if (coreP === 'cp_hunter' && en.hp > en.maxHp * 0.85) mult *= 1.35;
    if (isCrit && h.helmetPassive && h.helmetPassive.id === 'gp_headshot' && (en.isElite || en.isBoss)) mult *= 1.25;
    var finalDmg = Math.max(1, Math.round(dmg * mult));

    en.hp -= finalDmg;
    en.hitFlash = 7;
    if (!en.isBoss) {
      en.knockVx = dirX * Math.min(12, (knock || 4) * (en.isElite ? 0.45 : 0.85));
    }
    if (elem === 'ice' || hasWeaponSkill(w, 'ws_slow')) en.slowTicks = Math.max(en.slowTicks, 120);
    if (elem === 'fire' || elem === 'poison' || hasWeaponSkill(w, 'ws_poison')) en.burnTicks = Math.max(en.burnTicks, 120);
    if (hasWeaponSkill(w, 'ws_stun') && !en.isBoss && Math.random() < 0.12) en.slowTicks = Math.max(en.slowTicks, 90);
    if (coreP === 'cp_bolt' && Math.random() < 0.15) triggerChainLightning(game, en, Math.round(finalDmg * 0.55));
    if (hasWeaponSkill(w, 'gs_rush') && h.rushTicks <= 0 && Math.random() < 0.08) {
      h.rushTicks = 210;
      pushFloat(game, h.x, h.y - 92, '神·快感触发！射速翻倍免耗弹', '#ffe566', true);
    }
    if (hasWeaponSkill(w, 'gs_refresh') && Math.random() < 0.10) {
      h.crazyCd = Math.round(h.crazyCd * 0.82); h.missileCd = Math.round(h.missileCd * 0.82);
      h.healCd = Math.round(h.healCd * 0.82); h.nukeCd = Math.round(h.nukeCd * 0.82);
    }
    if (hasWeaponSkill(w, 'gs_detonate') && Math.random() < 0.14) {
      triggerBulletExplosion(game, { x: en.x, y: en.y - en.h * 0.4, dmg: finalDmg * 2, splash: 92 });
    }
    if (hasWeaponSkill(w, 'gs_exec') && !en.isBoss && en.hp > 0 && en.hp < en.maxHp * 0.45 && Math.random() < 0.15) {
      en.hp = 0;
      pushFloat(game, en.x, en.y - en.h - 14, '神·瞬秒斩杀!', '#ff4d57', true);
    }
    spawnParticles(game, en.x, en.y - en.h * 0.5, isCrit ? '#ffe566' : '#7ff798', isCrit ? 6 : 3, isCrit ? 3.8 : 2.6, dirX);
    if (isCrit || finalDmg >= 60) {
      pushFloat(game, en.x + (Math.random() - 0.5) * 20, en.y - en.h - 8, (isCrit ? '暴击 ' : '') + finalDmg, isCrit ? '#ffe052' : '#ffffff', isCrit);
    }
    game.events.push('hit');
  }

  function triggerBulletExplosion(game, b) {
    pushEffect(game, { type: 'expl', x: b.x, y: b.y, size: Math.max(88, b.splash * 1.45), life: 18, maxLife: 18 });
    if (b.y > GROUND_Y - 70) pushDecal(game, b.x, 'scorch');
    spawnParticles(game, b.x, b.y, '#ff9842', 9, 4.0);
    addShake(game, b.splash >= 80 ? 12 : 6, b.splash >= 80 ? 6.5 : 3.5);
    var r2 = b.splash * b.splash;
    for (var i = 0; i < game.enemies.length; i += 1) {
      var e = game.enemies[i]; if (e.hp <= 0) continue;
      var dx = e.x - b.x; var dy = (e.y - e.h * 0.5) - b.y;
      if (dx * dx + dy * dy <= r2) {
        e.hp -= Math.round(b.dmg * 0.58);
        e.hitFlash = 6;
        if (!e.isBoss) e.knockVx = (dx >= 0 ? 1 : -1) * 7.5;
      }
    }
    game.events.push(b.splash >= 80 ? 'boom_big' : 'boom_small');
  }

  function triggerChainLightning(game, origin, dmg) {
    var jumped = 0;
    for (var i = 0; i < game.enemies.length && jumped < 3; i += 1) {
      var e = game.enemies[i]; if (e === origin || e.hp <= 0) continue;
      var dx = e.x - origin.x; var dy = e.y - origin.y;
      if (dx * dx + dy * dy <= 220 * 220) {
        e.hp -= dmg; e.hitFlash = 7;
        pushEffect(game, { type: 'beam', x: origin.x, y: origin.y - origin.h * 0.5, tx: e.x, ty: e.y - e.h * 0.5, color: '#78f5ff', life: 12, maxLife: 12 });
        jumped += 1;
      }
    }
  }

  function damageHero(game, dmg) {
    var h = game.hero; if (h.invuln > 0) return;
    h.lastHurtTick = game.tick;
    var extraRed = (h.armorPassive && h.armorPassive.id === 'gp_iron' && h.hp < h.maxHp * 0.4) ? 0.25 : 0;
    var realDmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.70, (h.dmgReduce || 0) + extraRed))));
    h.invuln = 32;
    addShake(game, 14, 6);
    if (h.corePassive && h.corePassive.id === 'cp_wind') {
      h.windTicks = 360;
      pushFloat(game, h.x, h.y - 88, '穿风爆发！移速射速 +15%', '#7ef7c8', false);
    }
    if (h.armorPassive && h.armorPassive.id === 'gp_react' && h.reactCd <= 0) {
      h.reactCd = 480;
      pushEffect(game, { type: 'ring', x: h.x, y: h.y - 40, r: 16, maxR: 150, color: '#ffa93b', life: 18, maxLife: 18 });
      for (var ri = 0; ri < game.enemies.length; ri += 1) {
        var re = game.enemies[ri];
        if (Math.abs(re.x - h.x) < 150) { re.knockVx = (re.x >= h.x ? 1 : -1) * 14; re.hp -= 25; }
      }
      pushFloat(game, h.x, h.y - 96, '反应装甲震退！', '#ffa93b', true);
    }
    if (h.shield > 0) {
      var absorb = Math.min(h.shield, realDmg);
      h.shield -= absorb; realDmg -= absorb;
      h.shieldFlash = 16;
      pushEffect(game, { type: 'ring', x: h.x, y: h.y - 44, r: 22, maxR: 62, color: '#64e8ff', life: 14, maxLife: 14 });
    }
    if (realDmg > 0) {
      if (h.hp - realDmg <= 0 && h.helmetPassive && h.helmetPassive.id === 'gp_godhand' && h.godHandCd <= 0) {
        h.hp = Math.max(1, Math.round(h.maxHp * 0.15));
        h.invuln = 150;
        h.godHandCd = 3300;
        pushEffect(game, { type: 'ring', x: h.x, y: h.y - 44, r: 20, maxR: 130, color: '#ffe566', life: 24, maxLife: 24 });
        pushFloat(game, h.x, h.y - 96, '头盔神技·绝境护佑无敌2.5s！', '#ffe566', true);
        return;
      }
      h.hp -= realDmg;
    }
    pushFloat(game, h.x, h.y - 76, '-' + Math.round(dmg), h.shieldFlash > 0 && realDmg === 0 ? '#64e8ff' : '#ff5252', true);
  }

  global.EM_ENGINE = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, GROUND_Y: GROUND_Y, PLATFORMS: PLATFORMS,
    VICTORY_LOOT_TICKS: VICTORY_LOOT_TICKS,
    createProfile: createProfile, ensureProfileBag: ensureProfileBag,
    getTalentLv: getTalentLv, getGearLv: getGearLv, upgradeGear: upgradeGear,
    findGearItem: findGearItem, getEquippedGearItem: getEquippedGearItem,
    enhanceGearItem: enhanceGearItem, upgradeGearItemLv: upgradeGearItemLv,
    equipGearItem: equipGearItem, salvageGearItem: salvageGearItem,
    grantAccountXp: grantAccountXp, checkTitleUnlocks: checkTitleUnlocks, unlockTitle: unlockTitle,
    getActiveTitleDef: getActiveTitleDef, equipTitle: equipTitle,
    findDroneDef: findDroneDef, unlockOrEquipDrone: unlockOrEquipDrone, buyWarcarMod: buyWarcarMod,
    selectPartner: selectPartner, cultivatePartner: cultivatePartner,
    isSlotEquipped: isSlotEquipped, toggleEquipSlot: toggleEquipSlot, setAllEquipped: setAllEquipped,
    computeHeroStats: computeHeroStats, findBagGun: findBagGun,
    enhanceBagGun: enhanceBagGun, upgradeWeaponItemLv: upgradeWeaponItemLv, reforgeBagGun: reforgeBagGun,
    salvageSingleBagGun: salvageSingleBagGun, syncHeroLoadout: syncHeroLoadout,
    salvageLowBagGuns: salvageLowBagGuns, craftBlueprint: craftBlueprint,
    createGame: createGame, getWaveConfig: getWaveConfig,
    getActiveWeapon: getActiveWeapon, swapWeapon: swapWeapon,
    enhanceRunWeapon: enhanceRunWeapon, getCurrentPendingLoot: getCurrentPendingLoot,
    equipPendingLoot: equipPendingLoot, stashPendingLoot: stashPendingLoot,
    salvagePendingLoot: salvagePendingLoot, flushPendingLootToBag: flushPendingLootToBag,
    finishVictoryLootSweep: finishVictoryLootSweep,
    triggerJump: triggerJump, triggerDropThrough: triggerDropThrough,
    triggerSkill: triggerSkill, callWarCar: callWarCar,
    executeNukeBlast: executeNukeBlast, pickRogueSkill: pickRogueSkill,
    stepGame: stepGame
  };
})(window);
