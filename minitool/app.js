/* 《余烬弹匣：末日突围》主控制器（首页个人装备中心 + 强制全量预加载 + 5秒全图吸取收尾 + 零DOM抖动60FPS，ES2017） */
(function (global) {
  'use strict';

  var DATA = global.EM_DATA;
  var ENG = global.EM_ENGINE;
  var REND = global.EM_RENDER;
  var AUD = global.EM_AUDIO;

  var STORAGE_KEY = 'ember_mag_profile_v3';
  var STEP_MS = 1000 / 60;

  var stageRoot = document.getElementById('stage-root');
  var stageSafe = document.getElementById('stage-safe');
  var screenPreload = document.getElementById('screen-preload');
  var screenSelectHero = document.getElementById('screen-select-hero');
  var screenTitle = document.getElementById('screen-title');
  var screenGame = document.getElementById('screen-game');
  var canvas = document.getElementById('game-canvas');
  var pdCanvas = document.getElementById('pd-hero-canvas');
  var pdTick = 0;
  var pdBurst = null;
  var pendingStarterHero = 'chen';

  var PRELOAD_COVERS = [
    { file: 'assets/ui/load_cover_1.webp', tag: '档案封面 01 · 断桥双雄对峙' },
    { file: 'assets/ui/load_cover_2.webp', tag: '档案封面 02 · 毒雾冷库母体苏醒' },
    { file: 'assets/ui/load_cover_3.webp', tag: '档案封面 03 · 血月余烬孤城突围' }
  ];
  var PRELOAD_TIPS = [
    '战术贴士：击溃首领后将触发 5 秒全图战利品自动飞回吸取，绝不漏捡神枪！',
    '战术贴士：首页左侧个人装备栏可直接强化防弹甲、头盔与火控芯，战力瞬间暴涨！',
    '战术贴士：军械库内含 25 把独立造型漫画神枪与 8 张神武图纸，可在全枪图鉴查看！',
    '战术贴士：面对重盾防暴尸与高甲首领，切换狙击枪或激光炮可无视高额护甲减伤！'
  ];

  /* 预缓存全部战斗 HUD DOM 节点并做脏值比对，彻底消除每帧 DOM 重排抖动 */
  var HUD = {
    avatar: document.getElementById('hud-avatar'),
    lv: document.getElementById('hud-lv'),
    heroName: document.getElementById('hud-hero-name'),
    diffTag: document.getElementById('hud-diff-tag'),
    hpFill: document.getElementById('hud-hp-fill'),
    hpText: document.getElementById('hud-hp-text'),
    shFill: document.getElementById('hud-sh-fill'),
    shText: document.getElementById('hud-sh-text'),
    wave: document.getElementById('hud-wave'),
    kills: document.getElementById('hud-kills'),
    stones: document.getElementById('hud-run-stones'),
    fps: document.getElementById('hud-fps'),
    autoBtn: document.getElementById('btn-autofire'),
    pauseBtn: document.getElementById('btn-pause'),
    comboBox: document.getElementById('hud-combo'),
    comboNum: document.getElementById('combo-num'),
    bossBar: document.getElementById('boss-bar'),
    bossName: document.getElementById('boss-name'),
    bossHpFill: document.getElementById('boss-hp-fill'),
    bossHpText: document.getElementById('boss-hp-text'),
    bossRage: document.getElementById('boss-rage-tag'),
    vacBar: document.getElementById('loot-vacuum-bar'),
    vacText: document.getElementById('loot-vacuum-text'),
    banner: document.getElementById('wave-banner'),
    lootCard: document.getElementById('loot-card'),
    lootQueueBar: document.getElementById('loot-queue-bar'),
    lootFrame: document.getElementById('loot-rarity-frame'),
    lootGun: document.getElementById('loot-gun-img'),
    lootName: document.getElementById('loot-name'),
    lootPower: document.getElementById('loot-power'),
    lootAffix: document.getElementById('loot-affix'),
    carBtn: document.getElementById('btn-warcar'),
    carText: document.getElementById('warcar-text'),
    gunCard: document.getElementById('btn-weapon-swap'),
    gunSvg: document.getElementById('hud-gun-svg'),
    gunName: document.getElementById('hud-gun-name'),
    gunAmmo: document.getElementById('hud-gun-ammo'),
    enhCost: document.getElementById('run-enh-cost'),
    cdCrazy: document.getElementById('cd-crazy'),
    cdMissile: document.getElementById('cd-missile'),
    cdHeal: document.getElementById('cd-heal'),
    cdNuke: document.getElementById('cd-nuke')
  };
  var hudPrev = {};

  function setTextCached(key, el, val) {
    if (hudPrev[key] !== val) { hudPrev[key] = val; el.textContent = val; }
  }
  function setSrcCached(key, el, val) {
    if (hudPrev[key] !== val) { hudPrev[key] = val; el.src = val; }
  }
  function setWidthCached(key, el, val) {
    if (hudPrev[key] !== val) { hudPrev[key] = val; el.style.width = val; }
  }
  function setHiddenCached(key, el, hide) {
    if (hudPrev[key] !== hide) { hudPrev[key] = hide; el.classList.toggle('hidden', hide); }
  }

  var profile = null;
  var game = null;
  var isRotated = false;
  var manualPaused = false;
  var selectedArmoryUid = null;
  var armoryTab = 'bag';
  var resultShown = false;
  var skillModalShown = false;
  var reviveModalShown = false;

  var input = { moveX: 0, fireHeld: false };
  var keys = {};
  var padState = { left: false, right: false, down: false, fire: false };
  var aimPid = null;

  var lastRafMs = 0;
  var accumMs = 0;
  var fpsFrames = 0;
  var fpsLastMs = 0;
  var toastTimer = null;

  /* ==================== 小红书小工具容器持久化桥接 ==================== */
  function getXhsApi() {
    if (global.xhs && global.xhs.miniTool) return global.xhs.miniTool;
    if (global.redapp && global.redapp.miniTool) return global.redapp.miniTool;
    return null;
  }

  function loadProfile() {
    var api = getXhsApi();
    var saved = null;
    try {
      if (api && typeof api.getStorageSync === 'function') {
        var raw = api.getStorageSync(STORAGE_KEY);
        if (raw) saved = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      }
    } catch (e) { saved = null; }
    var base = ENG.createProfile();
    if (saved && typeof saved === 'object') {
      var ks = Object.keys(base);
      for (var i = 0; i < ks.length; i += 1) {
        var k = ks[i];
        if (saved[k] !== undefined && saved[k] !== null) {
          if (k === 'settings' && typeof saved.settings === 'object') {
            base.settings = Object.assign({}, base.settings, saved.settings);
          } else if (k === 'equippedGear' && typeof saved.equippedGear === 'object') {
            base.equippedGear = Object.assign({}, base.equippedGear, saved.equippedGear);
          } else if (k === 'equipped' && typeof saved.equipped === 'object') {
            base.equipped = Object.assign({}, base.equipped, saved.equipped);
          } else {
            base[k] = saved[k];
          }
        }
      }
    }
    ENG.ensureProfileBag(base);
    return base;
  }

  function saveProfile() {
    var api = getXhsApi();
    try {
      if (api && typeof api.setStorageSync === 'function') {
        api.setStorageSync(STORAGE_KEY, JSON.stringify(profile));
      } else if (api && typeof api.setStorage === 'function') {
        api.setStorage({ key: STORAGE_KEY, data: JSON.stringify(profile) });
      }
    } catch (e) { /* 忽略 */ }
  }

  function vibrateShort() {
    if (!profile || !profile.settings || !profile.settings.vibrate) return;
    var api = getXhsApi();
    try { if (api && typeof api.vibrateShort === 'function') api.vibrateShort(); } catch (e) {}
  }

  function showToast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  /* ==================== 双端屏幕自适应 + 右上角胶囊零遮挡 ==================== */
  function layoutStage() {
    var vw = window.innerWidth || document.documentElement.clientWidth || 960;
    var vh = window.innerHeight || document.documentElement.clientHeight || 540;
    isRotated = vh > vw;

    var api = getXhsApi();
    var capRect = null;
    try {
      if (api && typeof api.getMenuButtonBoundingClientRectSync === 'function') {
        capRect = api.getMenuButtonBoundingClientRectSync();
      }
    } catch (e) { capRect = null; }

    var hudTop = document.querySelector('.hud-top');
    var titleTop = document.querySelector('.title-topbar');

    if (isRotated) {
      stageRoot.classList.add('rotated');
      stageRoot.style.width = vh + 'px';
      stageRoot.style.height = vw + 'px';
      stageRoot.style.top = '0px';
      stageRoot.style.left = vw + 'px';
      stageRoot.style.transformOrigin = 'top left';
      stageRoot.style.transform = 'rotate(90deg)';

      var leftInset = 116;
      if (capRect && typeof capRect.bottom === 'number' && capRect.bottom > 0) {
        leftInset = Math.max(116, Math.ceil(capRect.bottom) + 14);
      }
      stageSafe.style.left = leftInset + 'px';
      stageSafe.style.right = '26px';
      stageSafe.style.top = '6px';
      stageSafe.style.bottom = '6px';
      if (hudTop) hudTop.style.paddingRight = '4px';
      if (titleTop) titleTop.style.right = '10px';
    } else {
      stageRoot.classList.remove('rotated');
      stageRoot.style.width = vw + 'px';
      stageRoot.style.height = vh + 'px';
      stageRoot.style.top = '0px';
      stageRoot.style.left = '0px';
      stageRoot.style.transformOrigin = 'top left';
      stageRoot.style.transform = 'none';

      stageSafe.style.left = '0px';
      stageSafe.style.right = '0px';
      stageSafe.style.top = '0px';
      stageSafe.style.bottom = '0px';

      var rightPad = 118;
      if (capRect && typeof capRect.left === 'number' && capRect.left > 0 && capRect.left < vw) {
        rightPad = Math.max(118, Math.ceil(vw - capRect.left) + 14);
      }
      if (hudTop) hudTop.style.paddingRight = rightPad + 'px';
      if (titleTop) titleTop.style.right = rightPad + 'px';
    }
    resizeCanvas();
  }

  function resizePdCanvas() {
    if (!pdCanvas || !pdCanvas.parentNode) return;
    var pw = pdCanvas.parentNode.clientWidth || 210;
    var ph = pdCanvas.parentNode.clientHeight || 260;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var nw = Math.max(120, Math.round(pw * dpr));
    var nh = Math.max(140, Math.round(ph * dpr));
    if (pdCanvas.width !== nw || pdCanvas.height !== nh) {
      pdCanvas.width = nw;
      pdCanvas.height = nh;
    }
  }

  function resizeCanvas() {
    if (!canvas || !stageSafe) return;
    var w = stageSafe.clientWidth || 840;
    var h = stageSafe.clientHeight || 480;
    var q = (profile && profile.settings) ? profile.settings.quality : 'high';
    var dpr = q === 'low' ? 1 : (q === 'medium' ? Math.min(1.2, window.devicePixelRatio || 1) : Math.min(1.5, window.devicePixelRatio || 1));
    canvas.width = Math.max(320, Math.round(w * dpr));
    canvas.height = Math.max(200, Math.round(h * dpr));
    resizePdCanvas();
  }

  function clientToStage(clientX, clientY) {
    var rect = stageSafe.getBoundingClientRect();
    if (!isRotated) return { x: clientX - rect.left, y: clientY - rect.top };
    return { x: clientY - rect.top, y: rect.right - clientX };
  }

  /* ==================== 新用户四选一永久角色锁定界面 ==================== */
  function renderStarterHeroSelect() {
    var grid = document.getElementById('starter-hero-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < DATA.HEROES.length; i += 1) {
      var h = DATA.HEROES[i];
      var isAct = h.id === pendingStarterHero;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'starter-card' + (isAct ? ' active' : '');
      card.setAttribute('data-starter', h.id);
      card.innerHTML =
        '<img class="starter-avatar" src="assets/sheets/' + h.portrait + '.webp" alt="" />' +
        '<div class="starter-name">' + h.short + '</div>' +
        '<div class="starter-role">' + h.role + '</div>' +
        '<div class="starter-desc">' + h.desc + '</div>' +
        '<div class="starter-quote">' + h.quote + '</div>';
      grid.appendChild(card);
    }
  }

  /* ==================== 主页魔兽式个人全身展示与六格穿卸中心 ==================== */
  function fillEquipSlotHtml(el, slotId, tag, rarId, iconSrc, name, subText, nameColor, equipped, hasItem, isMaxEnh) {
    el.className = 'eq-slot rar-' + (hasItem ? (rarId || 'white') : 'white') + ((equipped && hasItem) ? '' : ' unequipped') + ((hasItem && isMaxEnh) ? ' enh-max' : '');
    var toggleHtml = hasItem
      ? ('<button class="eq-toggle-btn' + (equipped ? '' : ' off') + '" data-toggle="' + slotId + '" type="button">' + (equipped ? '卸' : '装') + '</button>')
      : '';
    var maxHtml = (hasItem && isMaxEnh) ? '<span class="enh-max-badge">MAX</span>' : '';
    el.innerHTML =
      '<span class="eq-slot-tag">' + tag + '</span>' +
      toggleHtml +
      maxHtml +
      '<img class="eq-slot-icon" src="' + iconSrc + '" alt="" />' +
      '<div class="eq-slot-name" style="color:' + (equipped && hasItem ? (nameColor || '#eef4ff') : '#8393a8') + '">' + name + '</div>' +
      '<div class="eq-slot-sub">' + (hasItem ? (equipped ? subText : '已卸下 · 点装') : subText) + '</div>';
  }

  function renderTitle() {
    ENG.checkTitleUnlocks(profile);
    var st = ENG.computeHeroStats(profile);
    var ch = DATA.findChapter(profile.chapterId);
    var df = DATA.findDiff(profile.diffId);
    var bossDef = DATA.ENEMIES[ch.bossId];
    var vg = st.visualGear;

    var bgEl = document.getElementById('title-bg');
    if (bgEl) bgEl.style.backgroundImage = 'url("assets/map/' + ch.mapKey + '.webp")';

    document.getElementById('title-stones').textContent = String(profile.stones || 0);
    document.getElementById('title-chips').textContent = String(profile.chips || 0);
    var meritEl = document.getElementById('title-merit');
    if (meritEl) meritEl.textContent = String(profile.merit || 0);
    document.getElementById('title-best').textContent = String(profile.bestScore || 0);

    /* 左栏：魔兽式全身展示 + 独立账号等级 + 已佩戴称号 + 实感评分评级 */
    document.getElementById('pd-hero-name').textContent = st.heroDef.name;
    var titleBadge = document.getElementById('pd-title-badge');
    if (titleBadge) {
      if (st.titleDef) {
        titleBadge.textContent = st.titleDef.name;
        titleBadge.style.color = st.titleDef.color || '#ffe566';
        titleBadge.classList.remove('hidden');
      } else {
        titleBadge.classList.add('hidden');
      }
    }
    var accLv = profile.accountLv || 1;
    var accXp = profile.accountXp || 0;
    var accNeed = profile.accountXpNeed || 120;
    document.getElementById('pd-acc-lv').textContent = '账号 Lv.' + accLv;
    document.getElementById('pd-xp-fill').style.width = Math.min(100, Math.round((accXp / Math.max(1, accNeed)) * 100)) + '%';
    document.getElementById('pd-xp-text').textContent = accXp + '/' + accNeed;
    document.getElementById('pd-power-val').textContent = String(st.combatPower);
    var gradeEl = document.getElementById('pd-power-grade');
    if (gradeEl && st.grade) {
      gradeEl.textContent = st.grade.grade;
      gradeEl.style.color = st.grade.color;
      gradeEl.style.borderColor = st.grade.color;
    }

    document.getElementById('pd-st-hp').textContent = st.maxHp + (st.shield > 0 ? ('+' + st.shield) : '');
    document.getElementById('pd-st-dps').textContent = String(st.dps);
    document.getElementById('pd-st-crit').textContent = st.critPct + '%';
    document.getElementById('pd-st-pen').textContent = st.penPct + '%';

    var pRar = DATA.RARITIES[st.primaryGun.rarity] || DATA.RARITIES.white;
    fillEquipSlotHtml(document.getElementById('eq-primary'), 'primary', '主枪', st.primaryGun.rarity, DATA.getWeaponImgSrc(st.primaryGun), st.primaryGun.name, '+' + st.primaryGun.enh + ' · 评' + st.primaryGun.power, pRar.color, vg.primary, true, (st.primaryGun.enh || 0) >= 15);
    if (st.secondaryGun) {
      var sRar = DATA.RARITIES[st.secondaryGun.rarity] || DATA.RARITIES.white;
      fillEquipSlotHtml(document.getElementById('eq-secondary'), 'secondary', '副枪', st.secondaryGun.rarity, DATA.getWeaponImgSrc(st.secondaryGun), st.secondaryGun.name, '+' + st.secondaryGun.enh + ' · 评' + st.secondaryGun.power, sRar.color, vg.secondary, true, (st.secondaryGun.enh || 0) >= 15);
    } else {
      fillEquipSlotHtml(document.getElementById('eq-secondary'), 'secondary', '副枪', 'white', 'assets/guns/w_pistol_init.webp', '未装备', '战斗掉落', '#8393a8', false, false, false);
    }

    var slotItems = { armor: st.armorItem, helmet: st.helmetItem, chip: st.chipItem };
    for (var gi = 0; gi < DATA.GEAR_DEFS.length; gi += 1) {
      var gd = DATA.GEAR_DEFS[gi];
      var gItem = slotItems[gd.id];
      var tagTxt = gd.id === 'armor' ? '防具' : (gd.id === 'helmet' ? '头盔' : '核心');
      if (gItem) {
        var gr = DATA.RARITIES[gItem.rarity] || DATA.RARITIES.white;
        var gCur = gItem.enh || 0;
        var gCost = gCur < 15 ? DATA.ENH_TABLE[gCur].cost : 0;
        var lvLabel = gCur >= 15 ? 'MAX +15' : ('+' + gCur + ' (' + gCost + '石)');
        fillEquipSlotHtml(document.getElementById('eq-' + gd.id), gd.id, tagTxt, gItem.rarity, gd.icon, gItem.name, lvLabel, gr.color, !!vg[gd.id], true, gCur >= 15);
      } else {
        fillEquipSlotHtml(document.getElementById('eq-' + gd.id), gd.id, tagTxt, 'white', gd.icon, '未装备', '战斗掉落', '#8393a8', false, false, false);
      }
    }

    if (accLv >= 10 && st.droneDef) {
      var dRar = DATA.RARITIES[st.droneDef.rarity] || DATA.RARITIES.green;
      fillEquipSlotHtml(document.getElementById('eq-warcar'), 'warcar', '无人机', st.droneDef.rarity, 'assets/icons/ic_tank.svg', st.droneDef.name, '重工商店', dRar.color, vg.warcar, true, false);
    } else {
      fillEquipSlotHtml(document.getElementById('eq-warcar'), 'warcar', '无人机', 'white', 'assets/icons/ic_tank.svg', '重工商店', accLv >= 10 ? '战功点购置' : 'Lv.10无人机', '#8393a8', false, false, false);
    }

    var wornCount = (vg.primary ? 1 : 0) + (vg.secondary ? 1 : 0) + (vg.armor ? 1 : 0) + (vg.helmet ? 1 : 0) + (vg.chip ? 1 : 0) + (vg.warcar ? 1 : 0);
    var stripBtn = document.getElementById('btn-pd-strip-toggle');
    if (stripBtn) stripBtn.textContent = wornCount > 0 ? '一键脱装' : '全副武装';
    var capEl = document.getElementById('pd-stage-caption');
    if (capEl) capEl.textContent = '已穿戴 ' + wornCount + '/6 · 强化保底不掉级不改品质';

    resizePdCanvas();
    REND.renderPaperdollStage(pdCanvas, profile, pdTick, pdBurst);

    /* 右栏：成长里程碑条（称号 / 重工军需 / 20级伙伴） */
    var ownedTitleCnt = profile.unlockedTitles ? Object.keys(profile.unlockedTitles).length : 0;
    document.getElementById('gc-title-val').textContent = st.titleDef ? ('【' + st.titleDef.name + '】') : (ownedTitleCnt > 0 ? ('已获 ' + ownedTitleCnt + ' 个') : '暂无称号');
    document.getElementById('btn-open-titles').classList.toggle('unlocked', ownedTitleCnt > 0);

    var modCnt = profile.warcarMods ? Object.keys(profile.warcarMods).length : 0;
    document.getElementById('gc-drone-val').textContent = st.droneDef ? st.droneDef.name : ('战功 ' + (profile.merit || 0) + (modCnt ? (' · 改' + modCnt) : ''));
    document.getElementById('btn-open-drones').classList.toggle('unlocked', accLv >= 10 || (profile.merit || 0) >= 600);

    var pLabel = 'Lv.20 解锁 (当前' + accLv + ')';
    if (accLv >= 20) {
      if (profile.partner) {
        var ph = null;
        for (var hi = 0; hi < DATA.HEROES.length; hi += 1) if (DATA.HEROES[hi].id === profile.partner.heroId) { ph = DATA.HEROES[hi]; break; }
        pLabel = (ph ? ph.short : '伙伴') + ' Lv.' + profile.partner.lv;
      } else {
        pLabel = '已解锁！三选一招募';
      }
    }
    document.getElementById('gc-partner-val').textContent = pLabel;
    document.getElementById('btn-open-partner').classList.toggle('unlocked', accLv >= 20);

    document.getElementById('home-ch-thumb').src = 'assets/map/' + ch.mapKey + '.webp';
    document.getElementById('home-ch-title').textContent = ch.ep + ' · ' + ch.name + (ch.tag ? (' [' + ch.tag + ']') : '') + ' · ' + df.name;
    document.getElementById('home-ch-sub').textContent = '推荐评分 ' + (ch.recRating || 15) + ' · 首领：' + (bossDef ? bossDef.name : '六大 Boss 轮番上阵');

    var followBtn = document.getElementById('btn-follow');
    if (followBtn) followBtn.textContent = profile.followRewardClaimed ? '已领开创者' : '关注有礼';
  }

  /* ==================== 手绘孤城全域推进战役地图 ==================== */
  function renderChaptersModal() {
    var diffBar = document.getElementById('diff-bar');
    if (diffBar) {
      diffBar.innerHTML = '';
      for (var i = 0; i < DATA.DIFFICULTIES.length; i += 1) {
        var d = DATA.DIFFICULTIES[i];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'diff-pill' + (d.id === profile.diffId ? ' active' : '');
        btn.setAttribute('data-diff', d.id);
        btn.textContent = d.name + ' ×' + d.scoreMult;
        diffBar.appendChild(btn);
      }
    }

    var st = ENG.computeHeroStats(profile);
    var starsMap = profile.chapterStars || {};
    var frontlineId = 'ch1';
    for (var fi = 0; fi < DATA.CHAPTERS.length; fi += 1) {
      var fch = DATA.CHAPTERS[fi];
      if (!fch.endless && !(starsMap[fch.id] > 0)) { frontlineId = fch.id; break; }
    }

    /* 绘制 SVG 战术推进路线（已收复金色实线 / 前线红色虚线 / 未探索灰线） */
    var svgEl = document.getElementById('world-map-routes');
    if (svgEl) {
      var pairs = [
        ['ch1', 'ch2'], ['ch2', 'ch3'], ['ch3', 'ch4'],
        ['ch4', 'ch5'], ['ch5', 'ch6'], ['ch3', 'endless']
      ];
      var linesHtml = '';
      for (var pi = 0; pi < pairs.length; pi += 1) {
        var cA = DATA.findChapter(pairs[pi][0]);
        var cB = DATA.findChapter(pairs[pi][1]);
        var clearedA = !!(starsMap[cA.id] > 0);
        var clearedB = !!(starsMap[cB.id] > 0);
        var stroke = (clearedA && clearedB) ? '#f6d268' : (clearedA ? '#ff646a' : 'rgba(176, 198, 224, 0.45)');
        var dash = (clearedA && clearedB) ? '' : ' stroke-dasharray="2.2,1.6"';
        linesHtml +=
          '<line x1="' + cA.mapX + '" y1="' + cA.mapY + '" x2="' + cB.mapX + '" y2="' + cB.mapY +
          '" stroke="rgba(0,0,0,0.65)" stroke-width="1.35" stroke-linecap="round" />' +
          '<line x1="' + cA.mapX + '" y1="' + cA.mapY + '" x2="' + cB.mapX + '" y2="' + cB.mapY +
          '" stroke="' + stroke + '" stroke-width="0.72" stroke-linecap="round"' + dash + ' />';
      }
      svgEl.innerHTML = linesHtml;
    }

    var nodesEl = document.getElementById('world-map-nodes');
    if (nodesEl) {
      nodesEl.innerHTML = '';
      for (var c = 0; c < DATA.CHAPTERS.length; c += 1) {
        var ch = DATA.CHAPTERS[c];
        var isAct = ch.id === profile.chapterId;
        var stars = starsMap[ch.id] || 0;
        var stateCls = ch.endless ? 'endless' : (stars > 0 ? 'cleared' : (ch.id === frontlineId ? 'frontline' : 'locked'));
        var badgeText = ch.endless ? '∞' : (stars > 0 ? '✓' : String(c + 1));
        var starHtml = '';
        if (!ch.endless && stars > 0) {
          starHtml = '<div class="wm-stars">';
          for (var s = 0; s < 3; s += 1) starHtml += '<img src="assets/icons/' + (s < stars ? 'ic_star.svg' : 'ic_star_off.svg') + '" alt="" />';
          starHtml += '</div>';
        }
        var nodeBtn = document.createElement('button');
        nodeBtn.type = 'button';
        nodeBtn.className = 'wm-node ' + stateCls + (isAct ? ' active' : '');
        nodeBtn.style.left = (ch.mapX || 50) + '%';
        nodeBtn.style.top = (ch.mapY || 50) + '%';
        nodeBtn.setAttribute('data-ch', ch.id);
        nodeBtn.innerHTML =
          '<div class="wm-dot">' + badgeText + '</div>' +
          '<div class="wm-label">' + ch.name + '</div>' +
          starHtml;
        nodesEl.appendChild(nodeBtn);
      }
    }

    var selCh = DATA.findChapter(profile.chapterId);
    var selDf = DATA.findDiff(profile.diffId);
    var bossDef = DATA.ENEMIES[selCh.bossId];
    var recVal = Math.round((selCh.recRating || 15) * (selDf.id === 'asura' ? 1.5 : (selDf.id === 'nightmare' ? 1.25 : 1)));
    var underGeared = st.combatPower < recVal;
    var briefEl = document.getElementById('world-map-brief');
    if (briefEl) {
      briefEl.innerHTML =
        '<div class="wmb-left">' +
          '<img class="wmb-thumb" src="assets/map/' + selCh.mapKey + '.webp" alt="" />' +
          '<div class="wmb-info">' +
            '<div class="wmb-head">' +
              '<span class="wmb-title">' + selCh.ep + ' · ' + selCh.name + '（' + selDf.name + '）</span>' +
              '<span class="wmb-rec' + (underGeared ? ' warn' : '') + '">推荐评分 ' + recVal + '（当前 ' + st.combatPower + '）</span>' +
            '</div>' +
            '<div class="wmb-desc">首领：' + (bossDef ? bossDef.name : '六大首领无尽轮战') + ' · ' + selCh.desc + '</div>' +
            '<div class="wmb-drop">掉落前瞻：' + (selCh.dropPreview || '武器与防具掉落') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="wmb-actions">' +
          '<button id="btn-map-launch" class="btn-metal btn-primary" type="button">出击突围</button>' +
        '</div>';
    }
  }

  function deltaTagHtml(diff, suffix) {
    if (!diff || Math.abs(diff) < 0.05) return '<span class="delta-eq"></span>';
    var up = diff > 0;
    var valStr = (Math.abs(diff) % 1 === 0) ? String(Math.abs(diff)) : Math.abs(diff).toFixed(1);
    return '<span class="' + (up ? 'delta-up' : 'delta-down') + '">' + (up ? '▲+' : '▼-') + valStr + (suffix || '') + '</span>';
  }

  function statBarHtml(label, val, maxVal, txt, deltaHtml) {
    var pct = Math.max(6, Math.min(100, Math.round((val / maxVal) * 100)));
    return (
      '<div class="stat-row">' +
        '<span class="stat-label">' + label + '</span>' +
        '<div class="stat-track"><div class="stat-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="stat-val" style="width:auto;min-width:48px">' + txt + (deltaHtml || '') + '</span>' +
      '</div>'
    );
  }

  function settleRunCurrenciesToProfile() {
    if (!game) return;
    var ds = Math.max(0, (game.earnedStones || 0) - (game.settledStones || 0));
    var dc = Math.max(0, (game.earnedChips || 0) - (game.settledChips || 0));
    var dm = Math.max(0, (game.earnedMerit || 0) - (game.settledMerit || 0));
    if (ds > 0) { profile.stones += ds; game.settledStones = (game.settledStones || 0) + ds; }
    if (dc > 0) { profile.chips += dc; game.settledChips = (game.settledChips || 0) + dc; }
    if (dm > 0) { profile.merit = (profile.merit || 0) + dm; game.settledMerit = (game.settledMerit || 0) + dm; }
  }

  function syncAfterArmoryChange() {
    saveProfile();
    if (game) {
      ENG.syncHeroLoadout(profile, game);
      updateBattleHud();
    } else {
      renderTitle();
    }
    renderArmoryModal();
  }

  function openInBattleArmory() {
    if (!game || (game.status !== 'running' && game.status !== 'victory_loot')) return;
    AUD.unlock();
    AUD.playClick();
    var queued = game.pendingLootQueue ? game.pendingLootQueue.length : 0;
    ENG.flushPendingLootToBag(profile, game);
    settleRunCurrenciesToProfile();
    saveProfile();
    armoryTab = 'bag';
    var activeW = ENG.getActiveWeapon(game);
    if (activeW && ENG.findBagGun(profile, activeW.uid)) selectedArmoryUid = activeW.uid;
    renderArmoryModal();
    openModal('modal-armory');
    if (queued > 0) showToast('已将 ' + queued + ' 把待处理拾取神枪自动收入背包，可立即穿戴或熔炼！');
  }

  function renderArmoryGearStrip() {
    var strip = document.getElementById('armory-gear-strip');
    if (!strip) return;
    var st = ENG.computeHeroStats(profile);
    var pRar = DATA.RARITIES[st.primaryGun.rarity] || DATA.RARITIES.white;
    var html =
      '<button class="ags-item rar-' + st.primaryGun.rarity + '" data-ags="primary" type="button">' +
        '<img class="ags-icon" src="' + DATA.getWeaponImgSrc(st.primaryGun) + '" alt="" />' +
        '<div class="ags-txt">' +
          '<div class="ags-title" style="color:' + pRar.color + '">主 · ' + st.primaryGun.name + ' +' + st.primaryGun.enh + '</div>' +
          '<div class="ags-sub">战力 ' + st.primaryGun.power + ' · 点选查看</div>' +
        '</div>' +
      '</button>';
    if (st.secondaryGun) {
      var sRar = DATA.RARITIES[st.secondaryGun.rarity] || DATA.RARITIES.white;
      html +=
        '<button class="ags-item rar-' + st.secondaryGun.rarity + '" data-ags="secondary" type="button">' +
          '<img class="ags-icon" src="' + DATA.getWeaponImgSrc(st.secondaryGun) + '" alt="" />' +
          '<div class="ags-txt">' +
            '<div class="ags-title" style="color:' + sRar.color + '">副 · ' + st.secondaryGun.name + ' +' + st.secondaryGun.enh + '</div>' +
            '<div class="ags-sub">战力 ' + st.secondaryGun.power + ' · 点选查看</div>' +
          '</div>' +
        '</button>';
    } else {
      html +=
        '<button class="ags-item rar-white" data-ags="secondary" type="button">' +
          '<img class="ags-icon" src="assets/guns/w_pistol_init.webp" alt="" style="opacity:0.35" />' +
          '<div class="ags-txt"><div class="ags-title" style="color:#8da2bc">副枪 · 空槽</div><div class="ags-sub">战斗掉落获取</div></div>' +
        '</button>';
    }

    var slotMap = { armor: st.armorItem, helmet: st.helmetItem, chip: st.chipItem };
    for (var gi = 0; gi < DATA.GEAR_DEFS.length; gi += 1) {
      var gd = DATA.GEAR_DEFS[gi];
      var item = slotMap[gd.id];
      if (item) {
        var gr = DATA.RARITIES[item.rarity] || DATA.RARITIES.white;
        var gCur = item.enh || 0;
        var gCost = gCur < 15 ? DATA.ENH_TABLE[gCur].cost : 0;
        var subTxt = gCur >= 15 ? '已满级 +15' : ('点强化等级(' + gCost + '石)');
        html +=
          '<button class="ags-item rar-' + item.rarity + (gCur >= 15 ? ' enh-max' : '') + '" data-ags="' + gd.id + '" type="button">' +
            '<img class="ags-icon" src="' + gd.icon + '" alt="" />' +
            '<div class="ags-txt">' +
              '<div class="ags-title" style="color:' + gr.color + '">' + item.name + ' +' + gCur + '</div>' +
              '<div class="ags-sub">' + subTxt + '</div>' +
            '</div>' +
          '</button>';
      } else {
        html +=
          '<button class="ags-item rar-white" data-ags="' + gd.id + '" type="button">' +
            '<img class="ags-icon" src="' + gd.icon + '" alt="" style="opacity:0.35" />' +
            '<div class="ags-txt"><div class="ags-title" style="color:#8da2bc">' + gd.name + ' · 空</div><div class="ags-sub">战斗掉落获取</div></div>' +
          '</button>';
      }
    }
    strip.innerHTML = html;
  }

  function renderArmoryModal() {
    ENG.ensureProfileBag(profile);
    var titleEl = document.querySelector('#modal-armory .modal-title');
    if (titleEl) titleEl.textContent = game ? '个人装备栏' : '装备库';

    document.getElementById('armory-stones').textContent = String(profile.stones || 0);
    document.getElementById('armory-chips').textContent = String(profile.chips || 0);
    document.getElementById('tab-bag').textContent = '武器(' + profile.bag.length + ')';
    document.getElementById('tab-gear').textContent = '防具(' + (profile.gearBag ? profile.gearBag.length : 0) + ')';

    renderArmoryGearStrip();

    document.getElementById('tab-bag').classList.toggle('active', armoryTab === 'bag');
    document.getElementById('tab-gear').classList.toggle('active', armoryTab === 'gear');
    document.getElementById('tab-forge').classList.toggle('active', armoryTab === 'forge');
    document.getElementById('tab-codex').classList.toggle('active', armoryTab === 'codex');
    document.getElementById('armory-bag-view').classList.toggle('hidden', armoryTab !== 'bag');
    document.getElementById('armory-gear-view').classList.toggle('hidden', armoryTab !== 'gear');
    document.getElementById('armory-forge-view').classList.toggle('hidden', armoryTab !== 'forge');
    document.getElementById('armory-codex-view').classList.toggle('hidden', armoryTab !== 'codex');

    var unlockedGunCnt = 0;
    for (var uc = 0; uc < DATA.WEAPON_TEMPLATES.length; uc += 1) {
      if (profile.unlockedGuns && profile.unlockedGuns[DATA.WEAPON_TEMPLATES[uc].id]) unlockedGunCnt += 1;
    }
    document.getElementById('tab-codex').textContent = '藏品图鉴';

    if (armoryTab === 'gear') {
      var gv = document.getElementById('armory-gear-view');
      gv.innerHTML = '';
      if (!profile.gearBag || !profile.gearBag.length) {
        gv.innerHTML = '<div class="modal-desc" style="text-align:center">防具背包暂无装备！进入战斗击杀尸潮、精英或首领即可爆出各品质头盔、战甲与火控核心（强化仅升等级，品质靠掉落获取）。</div>';
        return;
      }
      var accLvG = profile.accountLv || 1;
      for (var gi = 0; gi < profile.gearBag.length; gi += 1) {
        var g = profile.gearBag[gi];
        var gr = DATA.RARITIES[g.rarity] || DATA.RARITIES.white;
        var isWorn = (profile.equippedGear && profile.equippedGear[g.slot] === g.uid);
        var gEnh = g.enh || 0;
        var enhCfgG = gEnh < 15 ? DATA.ENH_TABLE[gEnh] : null;
        var costG = enhCfgG ? enhCfgG.cost : 0;
        var rateG = enhCfgG ? Math.round(enhCfgG.rate * 100) : 100;
        var canLvSyncG = (g.itemLv || 1) < accLvG;
        var lvCostG = 14 + (g.itemLv || 1) * 4;
        var statLine = g.slot === 'armor' ? ('生命+' + g.hp + ' · 减伤+' + Math.round(g.dmgReduce * 100) + '%')
          : (g.slot === 'helmet' ? ('护盾+' + g.shield + ' · 暴击+' + Math.round(g.critAdd * 100) + '%')
          : ('攻击+' + Math.round(g.atkAdd * 100) + '% · 破甲+' + Math.round(g.penAdd * 100) + '%'));
        var passiveHtml = g.passive ? ('<div class="passive-tag">特效 · ' + g.passive.name + '：' + g.passive.desc + '</div>') : '';
        var blessTxt = (g.blessing > 0 && gEnh < 15) ? (' · 祝福' + g.blessing + '%') : '';
        var row = document.createElement('div');
        row.className = 'forge-card';
        row.innerHTML =
          '<div class="forge-gun-wrap rar-' + g.rarity + (gEnh >= 15 ? ' enh-max' : '') + '" style="width:62px;height:46px;border-radius:6px;background:rgba(12,16,26,0.92)">' +
            (gEnh >= 15 ? '<span class="enh-max-badge">MAX</span>' : '') +
            '<img style="width:32px;height:32px;object-fit:contain;position:relative;z-index:2" src="assets/icons/eq_' + g.slot + '.svg" alt="" />' +
          '</div>' +
          '<div class="forge-info">' +
            '<div class="forge-name" style="color:' + gr.color + '">[' + gr.name + '] ' + g.name + ' Lv.' + (g.itemLv || 1) + ' +' + gEnh + '（评' + (g.power || 5) + '）' + (isWorn ? ' · 已穿戴' : '') + '</div>' +
            '<div class="forge-desc">' + statLine + blessTxt + '</div>' +
            passiveHtml +
          '</div>' +
          '<div style="display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end">' +
            '<button class="btn-mini btn-mini-gold" style="margin:2px" data-gear-eq="' + g.uid + '" type="button">' + (isWorn ? '已穿戴' : '穿戴') + '</button>' +
            (gEnh < 15 ? ('<button class="btn-mini" style="margin:2px" data-gear-enh="' + g.uid + '" type="button">强化(' + costG + '石 ' + rateG + '%)</button>') : '<button class="btn-mini" style="margin:2px" disabled type="button">满级+15</button>') +
            (canLvSyncG ? ('<button class="btn-mini" style="margin:2px" data-gear-lv="' + g.uid + '" type="button">同步Lv(' + lvCostG + '石)</button>') : '') +
            (isWorn ? '' : ('<button class="btn-mini btn-mini-danger" style="margin:2px" data-gear-salv="' + g.uid + '" type="button">熔炼</button>')) +
          '</div>';
        gv.appendChild(row);
      }
      return;
    }

    if (armoryTab === 'codex') {
      var codexEl = document.getElementById('armory-codex-view');
      codexEl.innerHTML = '';

      /* 分区 1：全部 26 把武器（包含未获得藏品！） */
      var h1 = document.createElement('div');
      h1.className = 'codex-sec-title';
      h1.textContent = '枪械藏品（已收录 ' + unlockedGunCnt + ' / ' + DATA.WEAPON_TEMPLATES.length + '）';
      codexEl.appendChild(h1);
      for (var ci = 0; ci < DATA.WEAPON_TEMPLATES.length; ci += 1) {
        var ct = DATA.WEAPON_TEMPLATES[ci];
        var cr = DATA.RARITIES[ct.minRar] || DATA.RARITIES.white;
        var hasIt = !!(profile.unlockedGuns && profile.unlockedGuns[ct.id]);
        var cc = document.createElement('div');
        cc.className = 'codex-card rar-' + ct.minRar + (hasIt ? '' : ' locked');
        cc.innerHTML =
          '<span class="codex-tag">' + (hasIt ? '已收录' : '未获取') + '</span>' +
          '<img class="codex-gun-img" src="assets/guns/' + ct.img + '.webp" alt="" />' +
          '<div class="codex-name" style="color:' + cr.color + '">' + ct.name + '</div>' +
          '<div class="codex-cls">' + ct.cls + ' · 伤' + (ct.dmg * ct.pellets) + ' · 弹' + ct.mag + '</div>';
        codexEl.appendChild(cc);
      }

      /* 分区 2：全部 4 款无人机藏品（含未解锁） */
      var h2 = document.createElement('div');
      h2.className = 'codex-sec-title';
      h2.textContent = '战术无人机藏品（账号 Lv.10 起解锁 · 共 ' + DATA.DRONE_DEFS.length + ' 款）';
      codexEl.appendChild(h2);
      for (var di = 0; di < DATA.DRONE_DEFS.length; di += 1) {
        var dd = DATA.DRONE_DEFS[di];
        var dr = DATA.RARITIES[dd.rarity] || DATA.RARITIES.green;
        var hasD = !!(profile.unlockedDrones && profile.unlockedDrones[dd.id]);
        var dc = document.createElement('div');
        dc.className = 'codex-card rar-' + dd.rarity + (hasD ? '' : ' locked');
        dc.innerHTML =
          '<span class="codex-tag">' + (hasD ? '已收录' : ('Lv.' + dd.unlockLv + '解锁')) + '</span>' +
          '<div class="codex-name" style="margin-top:16px;color:' + dr.color + '">' + dd.name + '</div>' +
          '<div class="codex-cls" style="white-space:normal;line-height:1.3;margin-top:4px">' + dd.desc + '</div>';
        codexEl.appendChild(dc);
      }

      /* 分区 3：全部荣誉称号藏品（含未获取称号与解锁条件，佩戴栏则严格只显示已拥有！） */
      var h3 = document.createElement('div');
      h3.className = 'codex-sec-title';
      h3.textContent = '荣誉称号藏品（共 ' + DATA.TITLES.length + ' 枚 · 未获得仅在图鉴可见）';
      codexEl.appendChild(h3);
      for (var ti = 0; ti < DATA.TITLES.length; ti += 1) {
        var td = DATA.TITLES[ti];
        var hasT = !!(profile.unlockedTitles && profile.unlockedTitles[td.id]);
        var tc = document.createElement('div');
        tc.className = 'codex-card rar-' + td.rarity + (hasT ? '' : ' locked');
        tc.innerHTML =
          '<span class="codex-tag">' + (hasT ? '已拥有' : '未获得') + '</span>' +
          '<div class="codex-name" style="margin-top:14px;color:' + td.color + '">【' + td.name + '】</div>' +
          '<div class="codex-cls">' + td.desc + '</div>' +
          '<div class="codex-cls" style="white-space:normal;color:#8fa6c2;margin-top:3px">' + td.hint + '</div>';
        codexEl.appendChild(tc);
      }

      /* 分区 4：各部位品质防具图鉴（含未获取） */
      var h4 = document.createElement('div');
      h4.className = 'codex-sec-title';
      h4.textContent = '防具/头盔/核心品质藏品（掉落收集）';
      codexEl.appendChild(h4);
      var rarOrder = ['white', 'green', 'blue', 'purple', 'orange', 'red', 'darkgold'];
      var slList = ['armor', 'helmet', 'chip'];
      for (var si = 0; si < slList.length; si += 1) {
        var sKey = slList[si];
        for (var ri = 0; ri < rarOrder.length; ri += 1) {
          var rk = rarOrder[ri];
          var rObj = DATA.RARITIES[rk];
          var hasG = !!(profile.unlockedGearKeys && profile.unlockedGearKeys[sKey + '_' + rk]);
          var gc = document.createElement('div');
          gc.className = 'codex-card rar-' + rk + (hasG ? '' : ' locked');
          gc.innerHTML =
            '<span class="codex-tag">' + (hasG ? '已收录' : '未获取') + '</span>' +
            '<img style="width:28px;height:28px;margin:8px auto 3px auto;display:block" src="assets/icons/eq_' + sKey + '.svg" alt="" />' +
            '<div class="codex-name" style="color:' + rObj.color + '">' + DATA.GEAR_NAMES[sKey][rk] + '</div>' +
            '<div class="codex-cls">' + rObj.name + '品质</div>';
          codexEl.appendChild(gc);
        }
      }
      return;
    }

    if (armoryTab === 'forge') {
      var forgeEl = document.getElementById('armory-forge-view');
      forgeEl.innerHTML = '';
      for (var fi = 0; fi < DATA.BLUEPRINTS.length; fi += 1) {
        var bp = DATA.BLUEPRINTS[fi];
        var tpl = DATA.findTemplate(bp.tplId);
        var rar = DATA.RARITIES[bp.rarity];
        var card = document.createElement('div');
        card.className = 'forge-card';
        card.innerHTML =
          '<div class="forge-gun-wrap rar-' + bp.rarity + '" style="border-radius:6px;background:rgba(12,16,26,0.92)">' +
            '<img class="gun-slot-svg" src="assets/guns/' + tpl.img + '.webp" alt="" />' +
          '</div>' +
          '<div class="forge-info">' +
            '<div class="forge-name" style="color:' + rar.color + '">[' + rar.name + '] ' + tpl.name + '（自带强化 +2）</div>' +
            '<div class="forge-desc">' + bp.desc + '</div>' +
          '</div>' +
          '<button class="btn-mini btn-mini-gold" data-craft="' + fi + '" type="button">锻造（' + bp.chips + '碎片）</button>';
        forgeEl.appendChild(card);
      }
      return;
    }

    if (!ENG.findBagGun(profile, selectedArmoryUid)) {
      selectedArmoryUid = profile.primaryUid || profile.bag[0].uid;
    }
    var sel = ENG.findBagGun(profile, selectedArmoryUid) || profile.bag[0];
    var eqPrimaryGun = ENG.findBagGun(profile, profile.primaryUid);
    var cmpGun = (eqPrimaryGun && eqPrimaryGun.uid !== sel.uid) ? eqPrimaryGun : null;
    var selRar = DATA.RARITIES[sel.rarity] || DATA.RARITIES.white;
    var selGrade = DATA.getRatingGrade(sel.power || 10);
    var curEnh = sel.enh || 0;
    var enhCfg = curEnh < 15 ? DATA.ENH_TABLE[curEnh] : null;
    var enhCost = enhCfg ? enhCfg.cost : 0;
    var enhRatePct = enhCfg ? Math.round(enhCfg.rate * 100) : 100;
    var blessPct = sel.blessing || 0;
    var rpsNum = 60 / Math.max(4, sel.rate);
    var rps = rpsNum.toFixed(1);
    var cmpRps = cmpGun ? (60 / Math.max(4, cmpGun.rate)) : rpsNum;
    var selSingle = sel.dmg * (sel.pellets || 1);
    var cmpSingle = cmpGun ? (cmpGun.dmg * (cmpGun.pellets || 1)) : selSingle;
    var selCritPct = Math.round((0.15 + (sel.critAdd || 0)) * 100);
    var cmpCritPct = cmpGun ? Math.round((0.15 + (cmpGun.critAdd || 0)) * 100) : selCritPct;

    var affHtml = '';
    if (sel.affixLabels && sel.affixLabels.length) {
      for (var ai = 0; ai < sel.affixLabels.length; ai += 1) affHtml += '<span class="affix-tag">' + sel.affixLabels[ai] + '</span>';
    } else {
      affHtml = '<span class="affix-tag">制式白板枪械（无附加词条）</span>';
    }

    var wSkillHtml = '';
    if (sel.wSkills && sel.wSkills.length) {
      wSkillHtml += '<div class="wskill-box">';
      for (var wsi = 0; wsi < sel.wSkills.length; wsi += 1) {
        wSkillHtml += '<div class="wskill-chip"><b>【枪技 · ' + sel.wSkills[wsi].name + '】</b> ' + sel.wSkills[wsi].desc + '</div>';
      }
      wSkillHtml += '</div>';
    }
    var godHtml = '';
    if (sel.godSkill) {
      godHtml = '<div class="god-skill-box"><b>★ 专属神技 · ' + sel.godSkill.name + '</b><br/>' + sel.godSkill.desc + '</div>';
    }

    var blessBarHtml = '';
    if (curEnh < 15) {
      blessBarHtml =
        '<div class="blessing-row">' +
          '<span class="blessing-label">强化+' + (curEnh + 1) + ' 概率 ' + (blessPct >= 100 ? '100%(必成)' : (enhRatePct + '%')) + ' · 永不掉级</span>' +
          '<div class="blessing-track"><div class="blessing-fill" style="width:' + blessPct + '%"></div></div>' +
          '<span class="blessing-pct">祝福 ' + blessPct + '%</span>' +
        '</div>';
    }

    var accLvW = profile.accountLv || 1;
    var canSyncLv = (sel.itemLv || 1) < accLvW;
    var lvSyncCost = 16 + (sel.itemLv || 1) * 5;
    var isEquipped = (sel.uid === profile.primaryUid || sel.uid === profile.secondaryUid);
    var salvGain = (selRar.salvage || 8) + curEnh * 6;

    document.getElementById('armory-detail').innerHTML =
      '<div class="podium-box rar-' + sel.rarity + (curEnh >= 15 ? ' enh-max' : '') + '">' +
        (curEnh >= 15 ? '<span class="enh-max-badge">MAX +15</span>' : '') +
        '<img class="podium-gun" src="' + DATA.getWeaponImgSrc(sel) + '" alt="" />' +
      '</div>' +
      '<div class="detail-title" style="color:' + selRar.color + '">' +
        '<span class="grade-badge" style="color:' + selGrade.color + ';border-color:' + selGrade.color + '">' + selGrade.grade + '</span>' +
        '[' + selRar.name + '] ' + sel.name + ' +' + curEnh +
        '<span class="role-badge">' + (sel.role || DATA.getWeaponRole(DATA.findTemplate(sel.tplId))) + '</span>' +
      '</div>' +
      '<div class="detail-sub">' + (sel.cls || '主战枪械') + ' · 武器 Lv.' + (sel.itemLv || 1) + ' · 评分：<b>' + sel.power + '</b>' + (cmpGun ? deltaTagHtml(sel.power - cmpGun.power, '') : '（当前主枪）') + '</div>' +
      statBarHtml('单发伤害', selSingle, 260, String(selSingle), cmpGun ? deltaTagHtml(selSingle - cmpSingle, '') : '') +
      statBarHtml('射速压制', rpsNum, 14, rps + '/s', cmpGun ? deltaTagHtml(Number((rpsNum - cmpRps).toFixed(1)), '') : '') +
      statBarHtml('暴击加成', selCritPct, 60, selCritPct + '%', cmpGun ? deltaTagHtml(selCritPct - cmpCritPct, '%') : '') +
      statBarHtml('护甲穿透', sel.pierce, 8, '+' + sel.pierce, cmpGun ? deltaTagHtml(sel.pierce - cmpGun.pierce, '') : '') +
      statBarHtml('弹夹容量', sel.mag, 110, String(sel.mag), cmpGun ? deltaTagHtml(sel.mag - cmpGun.mag, '') : '') +
      blessBarHtml +
      '<div class="affix-box">' + affHtml + '</div>' +
      wSkillHtml +
      godHtml +
      '<div class="detail-actions">' +
        '<button class="btn-mini btn-mini-gold" data-act="setPrimary" type="button">' + (sel.uid === profile.primaryUid ? '已是主枪' : '设为主枪') + '</button>' +
        '<button class="btn-mini" data-act="setSecondary" type="button">' + (sel.uid === profile.secondaryUid ? '已是副枪' : '设为副枪') + '</button>' +
        (curEnh < 15 ? ('<button class="btn-mini btn-mini-gold" data-act="enhance" type="button">强化(' + enhCost + '石 ' + (blessPct >= 100 ? '必成' : (enhRatePct + '%')) + ')</button>') : '<button class="btn-mini" disabled type="button">已满级 +15</button>') +
        (canSyncLv ? ('<button class="btn-mini" data-act="upgradeLv" type="button">同步等级Lv.' + Math.min(accLvW, (sel.itemLv || 1) + 2) + '(' + lvSyncCost + '石)</button>') : '') +
        '<button class="btn-mini" data-act="reforge" type="button">洗练词条(18石)</button>' +
        '<button class="btn-mini ' + (isEquipped ? '' : 'btn-mini-danger') + '" data-act="salvageOne" type="button">' + (isEquipped ? '装备中' : ('熔炼(+' + salvGain + '石)')) + '</button>' +
      '</div>';

    var gridEl = document.getElementById('armory-grid');
    gridEl.innerHTML = '';
    for (var i = 0; i < profile.bag.length; i += 1) {
      var w = profile.bag[i];
      var rar = DATA.RARITIES[w.rarity] || DATA.RARITIES.white;
      var wGrade = DATA.getRatingGrade(w.power || 10);
      var slot = document.createElement('div');
      slot.className = 'gun-slot rar-' + w.rarity + ((w.enh || 0) >= 15 ? ' enh-max' : '') + (w.uid === sel.uid ? ' selected' : '');
      slot.setAttribute('data-uid', w.uid);
      var badge = '';
      if (w.uid === profile.primaryUid) badge = '<span class="slot-badge">主枪</span>';
      else if (w.uid === profile.secondaryUid) badge = '<span class="slot-badge sec">副枪</span>';
      slot.innerHTML =
        '<img class="slot-select" src="assets/frames/select_box.svg" alt="" />' +
        badge +
        ((w.enh || 0) >= 15 ? '<span class="enh-max-badge">MAX</span>' : '') +
        '<img class="gun-slot-svg" src="' + DATA.getWeaponImgSrc(w) + '" alt="" />' +
        '<div class="gun-slot-name" style="color:' + rar.color + '">' + w.name + ' +' + w.enh + '</div>' +
        '<div class="gun-slot-pwr"><b style="color:' + wGrade.color + '">' + wGrade.grade + '</b> 评分 ' + w.power + '</div>';
      gridEl.appendChild(slot);
    }
  }

  /* ==================== 称号（仅展示已拥有）/ 10级无人机 / 20级伙伴弹窗 ==================== */
  function renderTitlesModal() {
    ENG.checkTitleUnlocks(profile);
    var box = document.getElementById('titles-list');
    if (!box) return;
    box.innerHTML = '';
    var owned = [];
    for (var i = 0; i < DATA.TITLES.length; i += 1) {
      if (profile.unlockedTitles && profile.unlockedTitles[DATA.TITLES[i].id]) owned.push(DATA.TITLES[i]);
    }
    if (!owned.length) {
      box.innerHTML = '<div class="modal-desc" style="text-align:center">你当前还没有已获得的称号（未获得称号不会显示在此处）。<br/>提示：点击「关注有礼」可立刻领取限定称号【开创者】，或在「藏品图鉴」查看全部称号获取途径！</div>';
      return;
    }
    for (var k = 0; k < owned.length; k += 1) {
      var t = owned[k];
      var isAct = profile.activeTitle === t.id;
      var card = document.createElement('div');
      card.className = 'forge-card';
      card.innerHTML =
        '<div class="forge-info">' +
          '<div class="forge-name" style="color:' + t.color + '">【' + t.name + '】' + (isAct ? '（佩戴中）' : '') + '</div>' +
          '<div class="forge-desc">' + t.desc + '</div>' +
        '</div>' +
        '<button class="btn-mini ' + (isAct ? '' : 'btn-mini-gold') + '" data-equip-title="' + (isAct ? '' : t.id) + '" type="button">' + (isAct ? '卸下' : '佩戴') + '</button>';
      box.appendChild(card);
    }
  }

  function renderDronesModal() {
    var box = document.getElementById('drones-list');
    if (!box) return;
    var meritEl = document.getElementById('shop-merit');
    if (meritEl) meritEl.textContent = String(profile.merit || 0);
    box.innerHTML = '';
    var accLv = profile.accountLv || 1;
    var merit = profile.merit || 0;

    var tip = document.createElement('div');
    tip.className = 'modal-desc';
    tip.style.padding = '4px 4px 8px 4px';
    tip.innerHTML = '重工支援装备<b>不靠打怪免费掉落</b>，需使用通关章节、击杀精英与首领积攒的<b>【战功点】</b>高价购置！当前战功：<b>' + merit + '</b> · 账号 <b>Lv.' + accLv + '</b>';
    box.appendChild(tip);

    /* 分区 1：破晓战车永久改装（随时可购） */
    var sec1 = document.createElement('div');
    sec1.className = 'shop-sec-title';
    sec1.textContent = '破晓重装战车改装（永久生效 · 战功点购置）';
    box.appendChild(sec1);
    for (var m = 0; m < DATA.WARCAR_MODS.length; m += 1) {
      var mod = DATA.WARCAR_MODS[m];
      var mRar = DATA.RARITIES[mod.rarity] || DATA.RARITIES.purple;
      var ownedMod = !!(profile.warcarMods && profile.warcarMods[mod.id]);
      var mCard = document.createElement('div');
      mCard.className = 'forge-card';
      mCard.innerHTML =
        '<div class="forge-gun-wrap rar-' + mod.rarity + '" style="width:58px;height:44px;border-radius:6px;background:rgba(12,16,26,0.92)">' +
          '<img style="width:30px;height:30px;object-fit:contain;position:relative;z-index:2" src="assets/icons/ic_tank.svg" alt="" />' +
        '</div>' +
        '<div class="forge-info">' +
          '<div class="forge-name" style="color:' + mRar.color + '">[' + mRar.name + '] ' + mod.name + (ownedMod ? '（已加装）' : '') + '</div>' +
          '<div class="forge-desc">' + mod.desc + '</div>' +
        '</div>' +
        '<button class="btn-mini ' + (ownedMod ? '' : 'btn-mini-gold') + '" data-warcar-mod="' + mod.id + '" ' + (ownedMod ? 'disabled ' : '') + 'type="button">' + (ownedMod ? '已拥有' : ('购置（' + mod.costMerit + '战功）')) + '</button>';
      box.appendChild(mCard);
    }

    /* 分区 2：战术无人机浮游炮（Lv.10 起开放购置） */
    var sec2 = document.createElement('div');
    sec2.className = 'shop-sec-title';
    sec2.textContent = '战术无人机浮游炮（账号 Lv.10 起开放 · 随身自动开火）';
    box.appendChild(sec2);
    for (var i = 0; i < DATA.DRONE_DEFS.length; i += 1) {
      var d = DATA.DRONE_DEFS[i];
      var rar = DATA.RARITIES[d.rarity] || DATA.RARITIES.green;
      var unlocked = !!(profile.unlockedDrones && profile.unlockedDrones[d.id]);
      var isAct = profile.activeDroneId === d.id;
      var btnTxt = isAct ? '出战中' : (unlocked ? '装配出战' : (accLv < d.unlockLv ? ('需Lv.' + d.unlockLv + ' / ' + d.costMerit + '战功') : ('购置（' + d.costMerit + '战功）')));
      var card = document.createElement('div');
      card.className = 'forge-card';
      card.innerHTML =
        '<div class="forge-info">' +
          '<div class="forge-name" style="color:' + rar.color + '">[' + rar.name + '] ' + d.name + '（Lv.' + d.unlockLv + '）</div>' +
          '<div class="forge-desc">' + d.desc + '</div>' +
        '</div>' +
        '<button class="btn-mini ' + (isAct ? '' : 'btn-mini-gold') + '" data-drone="' + d.id + '" type="button">' + btnTxt + '</button>';
      box.appendChild(card);
    }
  }

  function renderPartnerModal() {
    var box = document.getElementById('partner-body');
    if (!box) return;
    box.innerHTML = '';
    var accLv = profile.accountLv || 1;
    if (accLv < 20) {
      box.innerHTML = '<div class="modal-desc" style="text-align:center">当前个人账号等级：<b>Lv.' + accLv + '</b><br/>账号升至 <b>Lv.20</b> 解锁专属并肩伙伴系统！<br/>届时可从其余三位幸存者中任选一位作为初始白板角色（仅持制式小手枪）共同培养、并肩作战！</div>';
      return;
    }
    if (!profile.partner) {
      var tip = document.createElement('div');
      tip.className = 'modal-desc';
      tip.style.padding = '6px 4px 10px 4px';
      tip.textContent = '已达 Lv.20！请从其余三位幸存者中选择一位招募为专属伙伴（初始为 Lv.1 白板角色，仅持制式小手枪）：';
      box.appendChild(tip);
      for (var i = 0; i < DATA.HEROES.length; i += 1) {
        var h = DATA.HEROES[i];
        if (h.id === profile.heroId) continue;
        var card = document.createElement('div');
        card.className = 'forge-card';
        card.innerHTML =
          '<img style="width:48px;height:48px;border-radius:6px;margin-right:10px;border:1px solid #f5a63d" src="assets/sheets/' + h.portrait + '.webp" alt="" />' +
          '<div class="forge-info"><div class="forge-name">' + h.name + '</div><div class="forge-desc">' + h.desc + '</div></div>' +
          '<button class="btn-mini btn-mini-gold" data-recruit="' + h.id + '" type="button">招募为伙伴</button>';
        box.appendChild(card);
      }
      return;
    }
    var pt = profile.partner;
    var pHero = DATA.HEROES[0];
    for (var hi = 0; hi < DATA.HEROES.length; hi += 1) if (DATA.HEROES[hi].id === pt.heroId) { pHero = DATA.HEROES[hi]; break; }
    var cost = 20 + pt.lv * 14;
    box.innerHTML =
      '<div class="forge-card">' +
        '<img style="width:56px;height:56px;border-radius:6px;margin-right:12px;border:2px solid #84ffac" src="assets/sheets/' + pHero.portrait + '.webp" alt="" />' +
        '<div class="forge-info">' +
          '<div class="forge-name" style="color:#84ffac">专属伙伴：' + pHero.name + ' · Lv.' + pt.lv + '</div>' +
          '<div class="forge-desc">当前配枪：' + pt.weapon.name + ' +' + pt.weapon.enh + '（单发伤害 ' + pt.weapon.dmg + '）· 自动跟随并肩作战</div>' +
        '</div>' +
        '<button class="btn-mini btn-mini-gold" id="btn-train-partner" type="button">' + (pt.lv >= 30 ? '已满级' : ('特训升级（' + cost + '石）')) + '</button>' +
      '</div>';
  }

  function renderTalentModal() {
    document.getElementById('talent-stones').textContent = String(profile.stones || 0);
    var treeEl = document.getElementById('talent-tree');
    treeEl.innerHTML = '';
    for (var b = 0; b < DATA.TALENT_BRANCHES.length; b += 1) {
      var br = DATA.TALENT_BRANCHES[b];
      var col = document.createElement('div');
      col.className = 'talent-branch';
      var html = '<div class="branch-title" style="color:' + br.color + ';border-bottom-color:' + br.color + '">' + br.title + '</div>';
      for (var n = 0; n < br.nodes.length; n += 1) {
        var nd = br.nodes[n];
        var lv = ENG.getTalentLv(profile, nd.id);
        var maxLv = nd.costs.length;
        var isMax = lv >= maxLv;
        var cost = isMax ? 0 : nd.costs[lv];
        if (n > 0) html += '<div class="talent-connector"></div>';
        html +=
          '<div class="talent-node' + (lv > 0 ? ' leveled' : '') + '">' +
            '<div class="tn-head"><span class="tn-name">' + nd.name + '</span><span class="tn-lv">Lv.' + lv + '/' + maxLv + '</span></div>' +
            '<div class="tn-desc">' + nd.desc + '</div>' +
            '<button class="btn-mini ' + (isMax ? '' : 'btn-mini-gold') + ' tn-btn" data-talent="' + nd.id + '" type="button">' +
              (isMax ? '已满级' : ('升级（' + cost + ' 强化石）')) +
            '</button>' +
          '</div>';
      }
      col.innerHTML = html;
      treeEl.appendChild(col);
    }
  }

  function pushScoreToRankApi(scoreVal, cb) {
    var api = getXhsApi();
    if (!api || typeof api.setRankingScore !== 'function') {
      if (cb) cb(false);
      return;
    }
    try {
      var done = false;
      var finish = function (ok) { if (!done) { done = true; if (cb) cb(ok); } };
      var ret = api.setRankingScore({
        score: scoreVal,
        success: function () { finish(true); },
        fail: function () { finish(false); }
      });
      if (ret && typeof ret.then === 'function') {
        ret.then(function () { finish(true); }, function () { finish(false); });
      }
    } catch (e) { if (cb) cb(false); }
  }

  function renderRankModal(forceSync) {
    var listEl = document.getElementById('rank-list');
    var statusEl = document.getElementById('rank-sync-status');
    var myBar = document.getElementById('rank-my-bar');
    if (!listEl) return;

    var st = ENG.computeHeroStats(profile);
    var myLabel = st.heroDef.short + (st.titleDef ? ('【' + st.titleDef.name + '】') : '') + ' · Lv.' + (profile.accountLv || 1);
    var myMetric = Math.max(profile.bestScore || 0, st.combatPower * 10);
    if (myBar) {
      myBar.innerHTML =
        '<span>我的档案：<b>' + myLabel + '</b></span>' +
        '<span>评分 <b style="color:' + st.grade.color + '">[' + st.grade.grade + '] ' + st.combatPower + '</b> · 最高战绩 <b>' + (profile.bestScore || 0) + '</b></span>';
    }

    var fallbackEntries = [
      { name: '江北孤狼·陈烬 【孤城之王】', power: 412, score: 28600 },
      { name: '绯刃无双·林栀 【全副武装】', power: 328, score: 21400 },
      { name: '重装战车·陆铁 【无人机指挥官】', power: 245, score: 15800 },
      { name: '毒雾终结者·沈青 【尸潮清道夫】', power: 168, score: 9600 },
      { name: '断桥新兵·林小墨', power: 78, score: 3400 },
      { name: '我 · ' + myLabel, power: st.combatPower, score: profile.bestScore || 0, me: true }
    ];
    fallbackEntries.sort(function (a, b) { return (b.score - a.score) || (b.power - a.power); });
    drawRankRows(listEl, fallbackEntries);

    var api = getXhsApi();
    if (!api || typeof api.getRankingList !== 'function') {
      if (statusEl) { statusEl.textContent = '本地战绩榜'; statusEl.className = 'rank-sync-pill offline'; }
      if (forceSync) showToast('当前为本地预览环境，进入小红书 App 后将自动同步全网战力榜！');
      return;
    }
    if (statusEl) { statusEl.textContent = '同步云端中...'; statusEl.className = 'rank-sync-pill'; }

    var doFetch = function () {
      try {
        var settled = false;
        var handleRes = function (res) {
          if (settled) return;
          settled = true;
          var rows = (res && Array.isArray(res.list)) ? res.list : (Array.isArray(res) ? res : null);
          if (rows && rows.length) {
            drawRankRows(listEl, rows);
            if (statusEl) { statusEl.textContent = '云端榜已同步'; statusEl.className = 'rank-sync-pill'; }
            if (forceSync) showToast('战力榜已与小红书云端同步完成！');
          } else {
            if (statusEl) { statusEl.textContent = '云端已连接(暂无他人)'; statusEl.className = 'rank-sync-pill'; }
            if (forceSync) showToast('已上传最新战绩至云端战力榜！');
          }
        };
        var handleErr = function () {
          if (settled) return;
          settled = true;
          if (statusEl) { statusEl.textContent = '离线降级榜'; statusEl.className = 'rank-sync-pill offline'; }
          if (forceSync) showToast('云端暂不可达，已展示本地校准战力榜');
        };
        var ret = api.getRankingList({ success: handleRes, fail: handleErr });
        if (ret && typeof ret.then === 'function') ret.then(handleRes, handleErr);
      } catch (e) {
        if (statusEl) { statusEl.textContent = '离线降级榜'; statusEl.className = 'rank-sync-pill offline'; }
      }
    };

    if (forceSync) pushScoreToRankApi(myMetric, doFetch);
    else doFetch();
  }

  function drawRankRows(listEl, rows) {
    listEl.innerHTML = '';
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      var div = document.createElement('div');
      div.className = 'rank-row' + (r.me || r.isSelf ? ' me' : '');
      var pwrStr = r.power ? ('评' + r.power + ' · ') : '';
      div.innerHTML =
        '<span class="rank-pos">#' + (i + 1) + '</span>' +
        '<span class="rank-name">' + (r.name || r.nickname || '幸存者') + '</span>' +
        '<span class="rank-score">' + pwrStr + (r.score || 0) + ' 分</span>';
      listEl.appendChild(div);
    }
  }

  function syncSettingsUI() {
    var s = profile.settings;
    document.getElementById('set-master').value = s.master;
    document.getElementById('val-master').textContent = s.master + '%';
    document.getElementById('set-sfx').value = s.sfx;
    document.getElementById('val-sfx').textContent = s.sfx + '%';
    document.getElementById('set-music').value = s.music;
    document.getElementById('val-music').textContent = s.music + '%';

    var qBtns = document.querySelectorAll('#set-quality-group .seg-btn');
    for (var i = 0; i < qBtns.length; i += 1) qBtns[i].classList.toggle('active', qBtns[i].getAttribute('data-q') === s.quality);

    var fpsBtn = document.getElementById('btn-toggle-fps');
    fpsBtn.textContent = s.showFps ? '已开启' : '已关闭';
    fpsBtn.classList.toggle('active', !!s.showFps);
    HUD.fps.classList.toggle('hidden', !s.showFps);

    var vibBtn = document.getElementById('btn-toggle-vib');
    vibBtn.textContent = s.vibrate ? '已开启' : '已关闭';
    vibBtn.classList.toggle('active', !!s.vibrate);

    AUD.applySettings(s);
    resizeCanvas();
  }

  function openModal(id) {
    if (!game) {
      var ms = document.querySelectorAll('.modal');
      for (var i = 0; i < ms.length; i += 1) {
        if (ms[i].id !== id) ms[i].classList.add('hidden');
      }
    }
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }
  function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.add('hidden'); }
  function anyModalOpen() {
    var ms = document.querySelectorAll('.modal');
    for (var i = 0; i < ms.length; i += 1) if (!ms[i].classList.contains('hidden')) return true;
    return false;
  }

  function syncStoryOverlay() {
    var ov = document.getElementById('story-overlay');
    if (!game || game.status !== 'story' || !game.storyQueue || !game.storyQueue.length) {
      ov.classList.add('hidden');
      return;
    }
    var line = game.storyQueue[0];
    document.getElementById('story-portrait').src = 'assets/sheets/' + (line.portrait || 'p_chen') + '.webp';
    document.getElementById('story-speaker').textContent = line.speaker || '陈烬';
    document.getElementById('story-ep-tag').textContent = game.chapterEp + ' · ' + game.chapterName;
    document.getElementById('story-text').textContent = line.text || '';
    ov.classList.remove('hidden');
  }

  function advanceStory(skipAll) {
    if (!game || game.status !== 'story') return;
    AUD.playClick();
    if (skipAll) game.storyQueue = [];
    else game.storyQueue.shift();
    if (!game.storyQueue.length) game.status = 'running';
    syncStoryOverlay();
  }

  function startRun() {
    AUD.unlock(); AUD.playClick(); AUD.startBgm();
    game = ENG.createGame(profile);
    hudPrev = {};
    manualPaused = false;
    resultShown = false;
    skillModalShown = false;
    reviveModalShown = false;
    input.moveX = 0; input.fireHeld = false;

    screenTitle.classList.remove('active');
    screenGame.classList.add('active');
    layoutStage();
    updateBattleHud();
    syncStoryOverlay();
  }

  function returnToTitle() {
    AUD.playClick(); AUD.stopBgm();
    game = null;
    closeModal('modal-result');
    closeModal('modal-revive');
    closeModal('modal-skills');
    closeModal('modal-armory');
    document.getElementById('story-overlay').classList.add('hidden');
    screenGame.classList.remove('active');
    screenTitle.classList.add('active');
    layoutStage();
    renderTitle();
  }

  /* 零 DOM 抖动战斗 HUD 更新（全字段脏值检查） */
  function updateBattleHud() {
    if (!game) return;
    var h = game.hero;
    var w = ENG.getActiveWeapon(game);

    setSrcCached('avatar', HUD.avatar, 'assets/sheets/' + h.portrait + '.webp');
    setTextCached('lv', HUD.lv, 'Lv.' + game.lv);
    setTextCached('hName', HUD.heroName, h.short);
    setTextCached('diff', HUD.diffTag, game.diff.name);

    var hpPct = Math.max(0, Math.min(100, Math.round((h.hp / Math.max(1, h.maxHp)) * 100))) + '%';
    setWidthCached('hpW', HUD.hpFill, hpPct);
    setTextCached('hpT', HUD.hpText, Math.max(0, Math.round(h.hp)) + '/' + Math.round(h.maxHp));

    var shPct = Math.max(0, Math.min(100, Math.round((h.shield / Math.max(1, h.maxShield)) * 100))) + '%';
    setWidthCached('shW', HUD.shFill, shPct);
    setTextCached('shT', HUD.shText, '护盾 ' + Math.round(h.shield));

    setTextCached('wave', HUD.wave, game.chapterEp + ' · 第 ' + (game.waveIdx + 1) + ' 波');
    setTextCached('kills', HUD.kills, String(game.kills));
    setTextCached('stones', HUD.stones, String(game.runStones));

    var autoTxt = game.autoFire ? '自动瞄射' : '手动瞄射';
    if (hudPrev.auto !== autoTxt) {
      hudPrev.auto = autoTxt;
      HUD.autoBtn.classList.toggle('active', !!game.autoFire);
      HUD.autoBtn.textContent = autoTxt;
    }
    setTextCached('pause', HUD.pauseBtn, manualPaused ? '继续' : '暂停');

    /* 连杀徽章 */
    var showCombo = game.combo >= 3;
    setHiddenCached('comboH', HUD.comboBox, !showCombo);
    if (showCombo) setTextCached('comboN', HUD.comboNum, String(game.combo));

    /* 5 秒全图战利品自动吸取倒计时条 */
    var isVac = game.status === 'victory_loot';
    setHiddenCached('vacH', HUD.vacBar, !isVac);
    if (isVac) {
      var sec = Math.max(1, Math.ceil(game.victoryLootTicks / 60));
      setTextCached('vacT', HUD.vacText, '首领击溃！全图战利品自动飞回入库（' + sec + 's）');
    }

    /* Boss 顶栏血条 */
    var activeBoss = null;
    for (var i = 0; i < game.enemies.length; i += 1) {
      if (game.enemies[i].isBoss && game.enemies[i].hp > 0) { activeBoss = game.enemies[i]; break; }
    }
    setHiddenCached('bossH', HUD.bossBar, !activeBoss);
    if (activeBoss) {
      setTextCached('bName', HUD.bossName, activeBoss.name);
      setWidthCached('bW', HUD.bossHpFill, Math.max(0, Math.min(100, Math.round((activeBoss.hp / Math.max(1, activeBoss.maxHp)) * 100))) + '%');
      setTextCached('bT', HUD.bossHpText, Math.round(activeBoss.hp) + ' / ' + Math.round(activeBoss.maxHp));
      setHiddenCached('bRage', HUD.bossRage, activeBoss.hp >= activeBoss.maxHp * 0.5);
    }

    var showBan = !!(game.bannerText && game.bannerTicks > 0 && !isVac);
    setHiddenCached('banH', HUD.banner, !showBan);
    if (showBan) setTextCached('banT', HUD.banner, game.bannerText);

    /* 极品掉落队列对比弹窗（绝不覆盖上一把武器！） */
    var nw = ENG.getCurrentPendingLoot(game);
    var qLen = (game.pendingLootQueue ? game.pendingLootQueue.length : 0);
    var showLoot = !!nw;
    setHiddenCached('lootH', HUD.lootCard, !showLoot);
    if (showLoot) {
      var nr = DATA.RARITIES[nw.rarity] || DATA.RARITIES.white;
      var diffPwr = nw.power - (w ? w.power : 0);
      if (HUD.lootQueueBar) {
        setHiddenCached('lQH', HUD.lootQueueBar, qLen <= 0);
        setTextCached('lQT', HUD.lootQueueBar, '待处理神枪（1 / ' + qLen + '）' + (qLen > 1 ? ' · 处理后自动显示下一把' : ''));
      }
      if (hudPrev.lF !== nw.rarity) { hudPrev.lF = nw.rarity; HUD.lootFrame.className = 'loot-frame-box rar-' + nw.rarity; }
      setSrcCached('lG', HUD.lootGun, DATA.getWeaponImgSrc(nw));
      setTextCached('lN', HUD.lootName, nr.name + ' · ' + nw.name);
      HUD.lootName.style.color = nr.color;
      var nwGrade = DATA.getRatingGrade(nw.power || 10);
      setTextCached('lP', HUD.lootPower, '[' + nwGrade.grade + '] 评分 ' + nw.power + '（' + (diffPwr >= 0 ? '+' : '') + diffPwr + '）');
      setTextCached('lA', HUD.lootAffix, (nw.affixLabels && nw.affixLabels.length) ? nw.affixLabels.join(' · ') : '高阶制式神武');
    }

    var charge = Math.floor(game.warCarCharge);
    var carReady = charge >= 100 && !game.warCar;
    if (hudPrev.carR !== carReady) { hudPrev.carR = carReady; HUD.carBtn.classList.toggle('ready', carReady); }
    setTextCached('carT', HUD.carText, carReady ? '召唤战车!' : ('战车 ' + charge + '%'));

    if (w) {
      if (hudPrev.gF !== w.rarity) { hudPrev.gF = w.rarity; HUD.gunCard.className = 'weapon-card rar-' + w.rarity; }
      setSrcCached('gS', HUD.gunSvg, DATA.getWeaponImgSrc(w));
      var gnTxt = w.name + ' +' + w.enh + ' [' + (game.hero.activeSlot === 0 ? '主' : '副') + ']';
      if (hudPrev.gN !== gnTxt) {
        hudPrev.gN = gnTxt;
        HUD.gunName.textContent = gnTxt;
        HUD.gunName.style.color = (DATA.RARITIES[w.rarity] || DATA.RARITIES.white).color;
      }
      setTextCached('gA', HUD.gunAmmo, '弹匣 ' + w.ammo + '/' + w.mag + ' · 点击切枪');
      var hudEnhCost = (w.enh >= 15) ? '满级' : (DATA.ENH_TABLE[w.enh || 0].cost + '石');
      setTextCached('eC', HUD.enhCost, hudEnhCost);
    }

    updateSkillCd('cdC', HUD.cdCrazy, h.crazyCd);
    updateSkillCd('cdM', HUD.cdMissile, h.missileCd);
    updateSkillCd('cdH', HUD.cdHeal, h.healCd);
    updateSkillCd('cdN', HUD.cdNuke, h.nukeCd);
  }

  function updateSkillCd(key, el, ticks) {
    var hide = ticks <= 0;
    setHiddenCached(key + 'h', el, hide);
    if (!hide) setTextCached(key + 't', el, Math.ceil(ticks / 60) + 's');
  }

  function openSkillPickModal() {
    if (!game || !game.pendingSkills) return;
    var box = document.getElementById('skill-choices');
    box.innerHTML = '';
    for (var i = 0; i < game.pendingSkills.length; i += 1) {
      var sk = game.pendingSkills[i];
      var frameSvg = sk.rarity === 'gold' ? 'skill_frame_gold.svg' : 'skill_frame.svg';
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'skill-choice-card';
      card.setAttribute('data-pick', sk.id);
      card.innerHTML =
        '<div class="sc-icon-wrap">' +
          '<img class="skill-frame-img" src="assets/frames/' + frameSvg + '" alt="" />' +
          '<img class="skill-icon-img" src="assets/skills/' + sk.icon + '.webp" alt="" />' +
        '</div>' +
        '<div class="sc-name">' + sk.name + '</div>' +
        '<div class="sc-desc">' + sk.desc + '</div>';
      box.appendChild(card);
    }
    openModal('modal-skills');
  }

  function finalizeRun(isWin) {
    if (!game || resultShown) return;
    resultShown = true;
    AUD.stopBgm();
    if (isWin) AUD.playWin(); else AUD.playFail();

    /* 兜底确保队列中全部尚未处理的拾取神枪（无论通关/撤退/阵亡）都安全入库，绝不丢失！ */
    ENG.flushPendingLootToBag(profile, game);
    if (isWin && game.drops && game.drops.length) {
      ENG.finishVictoryLootSweep(profile, game);
    }

    settleRunCurrenciesToProfile();
    profile.totalKills = (profile.totalKills || 0) + (game.kills || 0);
    var accXpGain = Math.round((game.kills * 3.5) + (game.waveIdx + 1) * 28 + (isWin ? 95 : 25));
    var accRes = ENG.grantAccountXp(profile, accXpGain);
    if (game.score > (profile.bestScore || 0)) profile.bestScore = game.score;
    if (game.waveIdx + 1 > (profile.bestWave || 0)) profile.bestWave = game.waveIdx + 1;
    if (isWin && !game.endless) {
      var stars = game.reviveUsed ? 2 : 3;
      if (!profile.chapterStars) profile.chapterStars = {};
      if (stars > (profile.chapterStars[game.chapterId] || 0)) profile.chapterStars[game.chapterId] = stars;
    }
    ENG.checkTitleUnlocks(profile);
    saveProfile();

    pushScoreToRankApi(profile.bestScore || 0);

    document.getElementById('result-title').textContent = isWin ? '孤城突围 · 战捷凯旋' : '血战至终 · 英雄不朽';
    var w = ENG.getActiveWeapon(game);
    var lootHtml = '';
    var hasGuns = game.lootedGuns && game.lootedGuns.length;
    var hasGears = game.lootedGears && game.lootedGears.length;
    if (hasGuns || hasGears) {
      lootHtml += '<div class="result-loot-box"><div class="result-loot-title">本局已回收并入库的装备战利品：</div><div class="result-loot-chips">';
      if (hasGuns) {
        for (var li = 0; li < game.lootedGuns.length; li += 1) {
          var lg = game.lootedGuns[li];
          var lrar = DATA.RARITIES[lg.rarity] || DATA.RARITIES.white;
          lootHtml += '<span class="result-loot-chip" style="color:' + lrar.color + ';border-color:' + lrar.color + '">[' + lrar.name + '] ' + lg.name + '</span>';
        }
      }
      if (hasGears) {
        for (var gi = 0; gi < game.lootedGears.length; gi += 1) {
          var gg = game.lootedGears[gi];
          var grar = DATA.RARITIES[gg.rarity] || DATA.RARITIES.white;
          lootHtml += '<span class="result-loot-chip" style="color:' + grar.color + ';border-color:' + grar.color + '">[' + grar.name + '] ' + gg.name + '</span>';
        }
      }
      lootHtml += '</div></div>';
    }

    var accTip = '+' + accXpGain + ' 经验（账号 Lv.' + profile.accountLv + (accRes.leveled > 0 ? (' 升级+' + accRes.leveled + '!') : '') + '）';
    if (accRes.unlockedDrone) accTip += ' · 已解锁无人机！';
    if (accRes.unlockedPartner) accTip += ' · 已解锁伙伴！';

    document.getElementById('result-stats').innerHTML =
      '<div class="result-row"><span>章节与难度</span><b>' + game.chapterEp + '《' + game.chapterName + '》 · ' + game.diff.name + '</b></div>' +
      '<div class="result-row"><span>局外账号成长</span><b>' + accTip + '</b></div>' +
      '<div class="result-row"><span>击杀 / 最高连杀</span><b>' + game.kills + ' 只 · ' + (game.maxCombo || 0) + ' 连杀</b></div>' +
      '<div class="result-row"><span>主力配装武器</span><b>' + (w ? (w.name + ' +' + w.enh) : '制式小手枪') + '</b></div>' +
      '<div class="result-row"><span>战利品入库</span><b>强化石 +' + game.earnedStones + ' · 碎片 +' + game.earnedChips + ' · 战功 +' + (game.earnedMerit || 0) + '</b></div>' +
      lootHtml;
    openModal('modal-result');
  }

  function consumeAudioEvents() {
    if (!game || !game.events.length) return;
    for (var i = 0; i < game.events.length; i += 1) {
      var ev = game.events[i];
      if (ev.indexOf('shoot_') === 0) AUD.playShoot(ev.slice(6));
      else if (ev === 'hit') AUD.playHit();
      else if (ev === 'boom_big') { AUD.playBoom(true); vibrateShort(); }
      else if (ev === 'boom_small') AUD.playBoom(false);
      else if (ev === 'skill_crazy') AUD.playSkill('crazy');
      else if (ev === 'skill_missile') AUD.playSkill('missile');
      else if (ev === 'skill_heal') AUD.playSkill('heal');
      else if (ev === 'skill_nuke') { AUD.playSkill('nuke'); vibrateShort(); }
      else if (ev === 'drop_rare') AUD.playDropRare();
      else if (ev === 'upgrade') AUD.playUpgrade();
      else if (ev === 'levelup') AUD.playLevelup();
    }
    game.events.length = 0;
  }

  /* ==================== 60 FPS 固定步长主循环 ==================== */
  function tickLoop(now) {
    requestAnimationFrame(tickLoop);
    if (!lastRafMs) lastRafMs = now;
    var dt = Math.min(80, now - lastRafMs);
    lastRafMs = now;

    fpsFrames += 1;
    if (now - fpsLastMs >= 500) {
      var curFps = Math.round((fpsFrames * 1000) / Math.max(1, now - fpsLastMs));
      fpsFrames = 0;
      fpsLastMs = now;
      if (profile && profile.settings && profile.settings.showFps) {
        setTextCached('fpsT', HUD.fps, curFps + ' FPS');
      }
    }

    if (!game) {
      if (profile && screenTitle && screenTitle.classList.contains('active') && !document.hidden) {
        pdTick += 1;
        if (pdBurst && pdBurst.ticks > 0) pdBurst.ticks -= 1;
        resizePdCanvas();
        REND.renderPaperdollStage(pdCanvas, profile, pdTick, pdBurst);
      }
      return;
    }

    var keyMove = (keys.KeyD || keys.ArrowRight || padState.right ? 1 : 0) - (keys.KeyA || keys.ArrowLeft || padState.left ? 1 : 0);
    input.moveX = keyMove;
    input.fireHeld = !!padState.fire;

    var activePlay = (game.status === 'running' || game.status === 'victory_loot');
    if (!document.hidden && !manualPaused && !anyModalOpen() && activePlay) {
      accumMs += dt;
      var steps = 0;
      while (accumMs >= STEP_MS && steps < 3) {
        ENG.stepGame(profile, game, input);
        accumMs -= STEP_MS;
        steps += 1;
        if (game.status !== 'running' && game.status !== 'victory_loot') break;
      }
      consumeAudioEvents();

      if (game.status === 'story') {
        syncStoryOverlay();
      } else if (game.status === 'skill_pick' && !skillModalShown) {
        skillModalShown = true;
        openSkillPickModal();
      } else if (game.status === 'revive_prompt' && !reviveModalShown) {
        reviveModalShown = true;
        openModal('modal-revive');
      } else if (game.status === 'victory') {
        finalizeRun(true);
      } else if (game.status === 'defeat') {
        finalizeRun(false);
      }
    } else {
      accumMs = 0;
    }

    REND.renderGame(canvas, game, profile.settings.quality);
    if (game.tick % 3 === 0 || game.status !== 'running') updateBattleHud();
  }

  /* ==================== 简约手游方向/跳跃/攻击按键（按住下 + 跳跃 = 下台！） ==================== */
  function bindMobileControls() {
    function bindHoldKey(id, field) {
      var el = document.getElementById(id);
      if (!el) return;
      var activePid = null;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault(); AUD.unlock();
        activePid = e.pointerId;
        padState[field] = true;
        el.classList.add('pressed');
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      });
      function release(e) {
        if (activePid !== null && e.pointerId !== activePid) return;
        activePid = null;
        padState[field] = false;
        el.classList.remove('pressed');
      }
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    }

    bindHoldKey('btn-move-left', 'left');
    bindHoldKey('btn-move-right', 'right');
    bindHoldKey('btn-move-down', 'down');
    bindHoldKey('btn-attack', 'fire');

    var jumpBtn = document.getElementById('btn-jump');
    if (jumpBtn) {
      jumpBtn.addEventListener('pointerdown', function (e) {
        e.preventDefault(); AUD.unlock();
        jumpBtn.classList.add('pressed');
        if (game && (game.status === 'running' || game.status === 'victory_loot')) {
          if (padState.down || keys.KeyS || keys.ArrowDown) {
            ENG.triggerDropThrough(game);
          } else {
            ENG.triggerJump(game);
          }
        }
      });
      var clearJump = function () { jumpBtn.classList.remove('pressed'); };
      jumpBtn.addEventListener('pointerup', clearJump);
      jumpBtn.addEventListener('pointercancel', clearJump);
    }
  }

  function bindCanvasAim() {
    function setAimFromPointer(clientX, clientY) {
      if (!game || game.status !== 'running') return;
      var pt = clientToStage(clientX, clientY);
      var safeW = stageSafe.clientWidth || 840;
      var safeH = stageSafe.clientHeight || 480;
      var scaleY = safeH / ENG.WORLD_H;
      var logicViewW = safeW / scaleY;
      var camX = REND.getCamX(game, logicViewW);
      game.manualAim = { x: camX + pt.x / scaleY, y: pt.y / scaleY };
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!game || game.status !== 'running') return;
      AUD.unlock(); aimPid = e.pointerId; setAimFromPointer(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (aimPid !== e.pointerId) return; setAimFromPointer(e.clientX, e.clientY);
    });
    function endAim(e) { if (aimPid !== e.pointerId) return; aimPid = null; if (game) game.manualAim = null; }
    canvas.addEventListener('pointerup', endAim);
    canvas.addEventListener('pointercancel', endAim);
  }

  function bindRotatedScroll() {
    var scrollEl = null; var lastAxis = 0;
    document.addEventListener('pointerdown', function (e) {
      if (!isRotated) return;
      var target = e.target;
      while (target && target !== document.body) {
        if (target.classList && target.classList.contains('scroll-y')) { scrollEl = target; lastAxis = e.clientX; return; }
        target = target.parentNode;
      }
      scrollEl = null;
    });
    document.addEventListener('pointermove', function (e) {
      if (!isRotated || !scrollEl) return;
      var dx = e.clientX - lastAxis; lastAxis = e.clientX; scrollEl.scrollTop += dx;
    });
    document.addEventListener('pointerup', function () { scrollEl = null; });
    document.addEventListener('pointercancel', function () { scrollEl = null; });
  }

  /* ==================== 全事件绑定 ==================== */
  function bindEvents() {
    /* 个人装备栏 6 格交互：点击角标「卸/装」实时穿卸并同步舞台人物，点击本体换枪或强化！ */
    var SLOT_NAMES = { primary: '主战神枪', secondary: '背负副枪', armor: '凯夫拉重甲', helmet: '战术目镜盔', chip: '余烬火控芯', warcar: '支援浮游炮' };
    var eqSlots = document.querySelectorAll('.eq-slot');
    for (var qi = 0; qi < eqSlots.length; qi += 1) {
      eqSlots[qi].addEventListener('click', function (e) {
        AUD.unlock();
        var toggleBtn = e.target.closest('[data-toggle]');
        if (toggleBtn) {
          e.stopPropagation();
          var tSlot = toggleBtn.getAttribute('data-toggle');
          var isOn = ENG.toggleEquipSlot(profile, tSlot);
          saveProfile();
          if (isOn) AUD.playUpgrade(); else AUD.playClick();
          pdBurst = { slot: tSlot, ticks: 22, color: isOn ? '#ffe566' : '#7ec8ff' };
          showToast((isOn ? '已穿戴：' : '已卸下：') + (SLOT_NAMES[tSlot] || tSlot));
          renderTitle();
          return;
        }
        AUD.playClick();
        var eq = this.getAttribute('data-eq');
        if (eq === 'primary' || eq === 'secondary') {
          selectedArmoryUid = (eq === 'primary') ? profile.primaryUid : (profile.secondaryUid || profile.primaryUid);
          armoryTab = 'bag';
          renderArmoryModal();
          openModal('modal-armory');
        } else if (eq === 'warcar') {
          renderDronesModal();
          openModal('modal-drones');
        } else {
          var gItem = ENG.getEquippedGearItem(profile, eq);
          if (!gItem) {
            armoryTab = 'gear';
            renderArmoryModal();
            openModal('modal-armory');
            showToast('尚未穿戴该部位装备，可在防具背包穿戴或战斗掉落获取！');
            return;
          }
          var res = ENG.upgradeGear(profile, eq);
          if (res.ok) {
            saveProfile();
            if (res.success === false) {
              AUD.playClick();
              showToast(res.reason || '强化未成功（不掉级），祝福值已累计！');
            } else {
              AUD.playUpgrade();
              pdBurst = { slot: eq, ticks: 22, color: '#ffe566' };
              showToast(res.name + ' 等级强化成功！当前 +' + res.lv + '（品质保持不变）');
            }
            renderTitle();
          } else {
            showToast(res.reason);
          }
        }
      });
    }

    var stripAllBtn = document.getElementById('btn-pd-strip-toggle');
    if (stripAllBtn) {
      stripAllBtn.addEventListener('click', function () {
        AUD.unlock();
        var st = ENG.computeHeroStats(profile);
        var vg = st.visualGear;
        var anyOn = vg.primary || vg.secondary || vg.armor || vg.helmet || vg.chip || vg.warcar;
        ENG.setAllEquipped(profile, !anyOn);
        saveProfile();
        if (!anyOn) AUD.playUpgrade(); else AUD.playClick();
        pdBurst = { slot: 'armor', ticks: 22, color: !anyOn ? '#ffe566' : '#80c8ff' };
        showToast(!anyOn ? '已穿戴全部已拥有装备！' : '已一键脱装！可观察素体造型并逐件穿戴');
        renderTitle();
      });
    }

    /* 新用户四选一永久角色锁定交互 */
    var starterGrid = document.getElementById('starter-hero-grid');
    if (starterGrid) {
      starterGrid.addEventListener('click', function (e) {
        var card = e.target.closest('[data-starter]');
        if (!card) return;
        AUD.unlock(); AUD.playClick();
        pendingStarterHero = card.getAttribute('data-starter');
        renderStarterHeroSelect();
      });
    }
    var confirmStarterBtn = document.getElementById('btn-confirm-starter');
    if (confirmStarterBtn) {
      confirmStarterBtn.addEventListener('click', function () {
        AUD.unlock(); AUD.playUpgrade();
        profile.heroId = pendingStarterHero;
        profile.heroChosen = true;
        saveProfile();
        if (screenSelectHero) screenSelectHero.classList.remove('active');
        screenTitle.classList.add('active');
        renderTitle();
        layoutStage();
        showToast('已永久锁定初始角色！白手起家，开启孤城突围！');
      });
    }

    document.getElementById('btn-open-titles').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderTitlesModal(); openModal('modal-titles'); });
    document.getElementById('btn-open-drones').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderDronesModal(); openModal('modal-drones'); });
    document.getElementById('btn-open-partner').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderPartnerModal(); openModal('modal-partner'); });

    document.getElementById('titles-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-equip-title]');
      if (!btn) return;
      AUD.playClick();
      var tid = btn.getAttribute('data-equip-title');
      ENG.equipTitle(profile, tid || null);
      saveProfile(); renderTitlesModal(); renderTitle();
      showToast(tid ? '已佩戴荣誉称号！' : '已卸下当前称号');
    });

    document.getElementById('drones-list').addEventListener('click', function (e) {
      var modBtn = e.target.closest('[data-warcar-mod]');
      if (modBtn) {
        var mRes = ENG.buyWarcarMod(profile, modBtn.getAttribute('data-warcar-mod'));
        if (mRes.ok) {
          AUD.playDropRare(); saveProfile();
          renderDronesModal(); renderTitle();
          showToast('战车加装成功：' + mRes.mod.name + '！');
        } else showToast(mRes.reason);
        return;
      }
      var btn = e.target.closest('[data-drone]');
      if (!btn) return;
      var res = ENG.unlockOrEquipDrone(profile, btn.getAttribute('data-drone'));
      if (res.ok) {
        AUD.playUpgrade(); saveProfile();
        renderDronesModal(); renderTitle();
        showToast('已装配无人机：' + res.drone.name);
      } else showToast(res.reason);
    });

    document.getElementById('partner-body').addEventListener('click', function (e) {
      var recBtn = e.target.closest('[data-recruit]');
      if (recBtn) {
        var r = ENG.selectPartner(profile, recBtn.getAttribute('data-recruit'));
        if (r.ok) {
          AUD.playDropRare(); saveProfile();
          renderPartnerModal(); renderTitle();
          showToast('招募成功！' + r.heroDef.short + '（初始白板小手枪）已加入并肩作战！');
        } else showToast(r.reason);
        return;
      }
      if (e.target.closest('#btn-train-partner')) {
        var tr = ENG.cultivatePartner(profile);
        if (tr.ok) {
          AUD.playUpgrade(); saveProfile();
          renderPartnerModal(); renderTitle();
          showToast('伙伴特训升级成功！当前 Lv.' + tr.lv);
        } else showToast(tr.reason);
      }
    });

    document.getElementById('home-chapter-card').addEventListener('click', function () {
      AUD.unlock(); AUD.playClick();
      renderChaptersModal(); openModal('modal-chapters');
    });

    document.getElementById('btn-start').addEventListener('click', startRun);
    document.getElementById('btn-chapters').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderChaptersModal(); openModal('modal-chapters'); });
    document.getElementById('btn-armory').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); armoryTab = 'bag'; renderArmoryModal(); openModal('modal-armory'); });
    document.getElementById('btn-codex').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); armoryTab = 'codex'; renderArmoryModal(); openModal('modal-armory'); });
    document.getElementById('btn-talent').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderTalentModal(); openModal('modal-talent'); });
    var rankBtn = document.getElementById('btn-rank');
    if (rankBtn) {
      rankBtn.addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderRankModal(false); openModal('modal-rank'); });
    }
    var rankSyncBtn = document.getElementById('btn-rank-sync');
    if (rankSyncBtn) {
      rankSyncBtn.addEventListener('click', function () { AUD.unlock(); AUD.playClick(); renderRankModal(true); });
    }
    document.getElementById('btn-follow').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); openModal('modal-follow'); });
    document.getElementById('btn-title-settings').addEventListener('click', function () { AUD.unlock(); AUD.playClick(); syncSettingsUI(); openModal('modal-settings'); });

    var closeBtns = document.querySelectorAll('[data-close]');
    for (var i = 0; i < closeBtns.length; i += 1) {
      closeBtns[i].addEventListener('click', function () {
        AUD.playClick();
        var modalId = this.getAttribute('data-close');
        closeModal(modalId);
        if (game) {
          if (modalId === 'modal-armory') {
            ENG.syncHeroLoadout(profile, game);
            updateBattleHud();
          }
        } else {
          renderTitle();
        }
      });
    }

    document.getElementById('diff-bar').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-diff]');
      if (!btn) return;
      AUD.playClick(); profile.diffId = btn.getAttribute('data-diff');
      saveProfile(); renderChaptersModal(); renderTitle();
    });
    var mapNodesEl = document.getElementById('world-map-nodes');
    if (mapNodesEl) {
      mapNodesEl.addEventListener('click', function (e) {
        var node = e.target.closest('[data-ch]');
        if (!node) return;
        AUD.playClick(); profile.chapterId = node.getAttribute('data-ch');
        saveProfile(); renderChaptersModal(); renderTitle();
        showToast('已选中战区：' + DATA.findChapter(profile.chapterId).name);
      });
    }
    var mapBriefEl = document.getElementById('world-map-brief');
    if (mapBriefEl) {
      mapBriefEl.addEventListener('click', function (e) {
        if (e.target.closest('#btn-map-launch')) {
          closeModal('modal-chapters');
          startRun();
        }
      });
    }

    document.getElementById('tab-bag').addEventListener('click', function () { AUD.playClick(); armoryTab = 'bag'; renderArmoryModal(); });
    document.getElementById('tab-gear').addEventListener('click', function () { AUD.playClick(); armoryTab = 'gear'; renderArmoryModal(); });
    document.getElementById('tab-forge').addEventListener('click', function () { AUD.playClick(); armoryTab = 'forge'; renderArmoryModal(); });
    document.getElementById('tab-codex').addEventListener('click', function () { AUD.playClick(); armoryTab = 'codex'; renderArmoryModal(); });

    document.getElementById('armory-gear-view').addEventListener('click', function (e) {
      var eqBtn = e.target.closest('[data-gear-eq]');
      if (eqBtn) {
        AUD.playUpgrade();
        ENG.equipGearItem(profile, eqBtn.getAttribute('data-gear-eq'));
        showToast('已穿戴装备！外观与属性已即时生效');
        syncAfterArmoryChange();
        return;
      }
      var enhBtn = e.target.closest('[data-gear-enh]');
      if (enhBtn) {
        var er = ENG.enhanceGearItem(profile, enhBtn.getAttribute('data-gear-enh'));
        if (er.ok) {
          if (er.success === false) { AUD.playClick(); showToast(er.reason); }
          else { AUD.playUpgrade(); showToast(er.name + ' 等级强化 +' + er.lv + '（品质保持不变）'); }
          syncAfterArmoryChange();
        } else showToast(er.reason);
        return;
      }
      var lvBtn = e.target.closest('[data-gear-lv]');
      if (lvBtn) {
        var lr = ENG.upgradeGearItemLv(profile, lvBtn.getAttribute('data-gear-lv'));
        if (lr.ok) { AUD.playUpgrade(); showToast(lr.item.name + ' 等级同步至 Lv.' + lr.item.itemLv + '！'); syncAfterArmoryChange(); }
        else showToast(lr.reason);
        return;
      }
      var salvBtn = e.target.closest('[data-gear-salv]');
      if (salvBtn) {
        var sr = ENG.salvageGearItem(profile, salvBtn.getAttribute('data-gear-salv'));
        if (sr.ok) { AUD.playUpgrade(); showToast('已熔炼 ' + sr.name + '，获得 +' + sr.stones + ' 强化石'); syncAfterArmoryChange(); }
        else showToast(sr.reason);
      }
    });
    document.getElementById('btn-salvage-low').addEventListener('click', function () {
      AUD.playClick();
      var res = ENG.salvageLowBagGuns(profile);
      if (res.count > 0) {
        AUD.playUpgrade();
        showToast('已熔炼 ' + res.count + ' 把低阶枪，获得 +' + res.stones + ' 强化石');
        syncAfterArmoryChange();
      } else showToast('没有可熔炼的未装备白/绿/蓝枪');
    });

    document.getElementById('armory-gear-strip').addEventListener('click', function (e) {
      var item = e.target.closest('[data-ags]');
      if (!item) return;
      AUD.unlock(); AUD.playClick();
      var ags = item.getAttribute('data-ags');
      if (ags === 'primary' || ags === 'secondary') {
        armoryTab = 'bag';
        selectedArmoryUid = (ags === 'primary') ? profile.primaryUid : (profile.secondaryUid || profile.primaryUid);
        renderArmoryModal();
      } else {
        if (!ENG.getEquippedGearItem(profile, ags)) {
          armoryTab = 'gear';
          renderArmoryModal();
          showToast('尚未穿戴该部位防具，可在防具背包穿戴或战斗掉落获取');
          return;
        }
        var gres = ENG.upgradeGear(profile, ags);
        if (gres.ok) {
          if (gres.success === false) { AUD.playClick(); showToast(gres.reason); }
          else { AUD.playUpgrade(); showToast(gres.name + ' 等级强化成功！当前 +' + gres.lv + '（品质保持不变）'); }
          syncAfterArmoryChange();
        } else {
          showToast(gres.reason);
        }
      }
    });

    document.getElementById('armory-grid').addEventListener('click', function (e) {
      var slot = e.target.closest('.gun-slot');
      if (!slot) return;
      AUD.playClick(); selectedArmoryUid = slot.getAttribute('data-uid'); renderArmoryModal();
    });

    document.getElementById('armory-detail').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn || !selectedArmoryUid) return;
      var act = btn.getAttribute('data-act');
      if (act === 'setPrimary') {
        AUD.playClick();
        if (selectedArmoryUid === profile.secondaryUid) {
          profile.secondaryUid = profile.primaryUid;
        }
        profile.primaryUid = selectedArmoryUid;
        if (profile.equipped) profile.equipped.primary = true;
        if (game) game.hero.activeSlot = 0;
        showToast('已穿戴为主战神枪' + (game ? '（局内已切换）' : ''));
      } else if (act === 'setSecondary') {
        AUD.playClick();
        if (selectedArmoryUid === profile.primaryUid) {
          if (!profile.secondaryUid) {
            showToast('仅有一把武器时将默认作为主枪装备');
            return;
          }
          profile.primaryUid = profile.secondaryUid;
        }
        profile.secondaryUid = selectedArmoryUid;
        if (profile.equipped) profile.equipped.secondary = true;
        showToast('已穿戴为副手神枪');
      } else if (act === 'enhance') {
        var r1 = ENG.enhanceBagGun(profile, selectedArmoryUid);
        if (r1.ok) {
          if (r1.success === false) { AUD.playClick(); showToast(r1.reason); }
          else { AUD.playUpgrade(); showToast('强化成功！' + r1.weapon.name + ' +' + r1.weapon.enh + '（评分 ' + r1.weapon.power + '）'); }
        } else showToast(r1.reason);
      } else if (act === 'upgradeLv') {
        var rLv = ENG.upgradeWeaponItemLv(profile, selectedArmoryUid);
        if (rLv.ok) { AUD.playUpgrade(); showToast(rLv.weapon.name + ' 等级同步至 Lv.' + rLv.weapon.itemLv + '（评分 ' + rLv.weapon.power + '）'); }
        else showToast(rLv.reason);
      } else if (act === 'reforge') {
        var r2 = ENG.reforgeBagGun(profile, selectedArmoryUid);
        if (r2.ok) { AUD.playUpgrade(); showToast('词条洗练完成！战力更新为 ' + r2.weapon.power); }
        else showToast(r2.reason);
      } else if (act === 'salvageOne') {
        var r3 = ENG.salvageSingleBagGun(profile, selectedArmoryUid);
        if (r3.ok) {
          AUD.playUpgrade();
          selectedArmoryUid = profile.primaryUid;
          showToast('已熔炼 ' + r3.name + '，获得 +' + r3.stones + ' 强化石');
        } else {
          showToast(r3.reason);
        }
      }
      syncAfterArmoryChange();
    });

    document.getElementById('armory-forge-view').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-craft]');
      if (!btn) return;
      var bp = DATA.BLUEPRINTS[Number(btn.getAttribute('data-craft'))];
      if (!bp) return;
      var res = ENG.craftBlueprint(profile, bp.tplId, bp.rarity, bp.chips);
      if (res.ok) {
        AUD.playDropRare();
        selectedArmoryUid = res.weapon.uid; armoryTab = 'bag';
        showToast('锻造神武成功：' + res.weapon.name + ' +2！');
        syncAfterArmoryChange();
      } else showToast(res.reason);
    });

    document.getElementById('talent-tree').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-talent]');
      if (!btn) return;
      var tid = btn.getAttribute('data-talent');
      var targetNode = null;
      for (var b = 0; b < DATA.TALENT_BRANCHES.length; b += 1) {
        var ns = DATA.TALENT_BRANCHES[b].nodes;
        for (var n = 0; n < ns.length; n += 1) if (ns[n].id === tid) { targetNode = ns[n]; break; }
      }
      if (!targetNode) return;
      var lv = ENG.getTalentLv(profile, tid);
      if (lv >= targetNode.costs.length) { showToast('该天赋已满级'); return; }
      var cost = targetNode.costs[lv];
      if (profile.stones < cost) { showToast('强化石不足（需 ' + cost + '）'); return; }
      profile.stones -= cost;
      if (!profile.talents) profile.talents = {};
      profile.talents[tid] = lv + 1;
      saveProfile(); AUD.playUpgrade();
      showToast(targetNode.name + ' 已升至 Lv.' + (lv + 1));
      renderTalentModal(); renderTitle();
    });

    document.getElementById('btn-story-next').addEventListener('click', function () { advanceStory(false); });
    document.getElementById('btn-story-skip').addEventListener('click', function () { advanceStory(true); });

    document.getElementById('btn-finish-loot').addEventListener('click', function () {
      if (!game || game.status !== 'victory_loot') return;
      AUD.playClick();
      ENG.finishVictoryLootSweep(profile, game);
      finalizeRun(true);
    });

    document.getElementById('btn-game-bag').addEventListener('click', openInBattleArmory);
    HUD.autoBtn.addEventListener('click', function () { if (!game) return; AUD.playClick(); game.autoFire = !game.autoFire; updateBattleHud(); });
    HUD.pauseBtn.addEventListener('click', function () { if (!game) return; AUD.playClick(); manualPaused = !manualPaused; updateBattleHud(); });
    document.getElementById('btn-game-settings').addEventListener('click', function () { AUD.playClick(); syncSettingsUI(); openModal('modal-settings'); });
    document.getElementById('btn-retreat').addEventListener('click', function () { if (!game) return; finalizeRun(false); });

    HUD.carBtn.addEventListener('click', function () {
      if (!game || game.status !== 'running') return;
      if (ENG.callWarCar(profile, game)) updateBattleHud();
      else showToast('击杀僵尸攒满 100% 怒气即可召唤破晓重装战车！');
    });

    document.getElementById('btn-weapon-swap').addEventListener('click', function () {
      if (!game || game.status !== 'running') return;
      AUD.playClick(); ENG.swapWeapon(game); updateBattleHud();
    });
    document.getElementById('btn-run-enhance').addEventListener('click', function () {
      if (!game || game.status !== 'running') return;
      var res = ENG.enhanceRunWeapon(profile, game);
      if (res.ok) {
        saveProfile();
        if (res.success === false) showToast(res.reason);
        updateBattleHud();
      } else showToast(res.reason);
    });
    document.getElementById('btn-loot-equip').addEventListener('click', function () {
      if (!game) return;
      if (ENG.equipPendingLoot(profile, game)) { saveProfile(); updateBattleHud(); }
    });
    document.getElementById('btn-loot-stash').addEventListener('click', function () {
      if (!game) return;
      if (ENG.stashPendingLoot(profile, game)) { saveProfile(); updateBattleHud(); }
    });
    document.getElementById('btn-loot-salvage').addEventListener('click', function () {
      if (!game) return;
      if (ENG.salvagePendingLoot(game)) updateBattleHud();
    });

    var skBtns = document.querySelectorAll('.skill-btn');
    for (var s = 0; s < skBtns.length; s += 1) {
      skBtns[s].addEventListener('click', function () {
        if (!game || game.status !== 'running') return;
        AUD.unlock();
        if (ENG.triggerSkill(profile, game, this.getAttribute('data-skill'))) updateBattleHud();
      });
    }

    document.getElementById('skill-choices').addEventListener('click', function (e) {
      var card = e.target.closest('.skill-choice-card');
      if (!card || !game) return;
      AUD.playClick();
      ENG.pickRogueSkill(game, card.getAttribute('data-pick'));
      if (game.status === 'skill_pick' && game.pendingSkills) {
        openSkillPickModal();
      } else {
        skillModalShown = false;
        closeModal('modal-skills');
      }
      updateBattleHud();
    });

    document.getElementById('btn-revive-share').addEventListener('click', function () {
      AUD.playClick();
      var doRevive = function () {
        closeModal('modal-revive'); reviveModalShown = false;
        if (game) { ENG.executeNukeBlast(game, true); updateBattleHud(); }
      };
      var api = getXhsApi();
      if (api && typeof api.postNote === 'function') {
        try {
          api.postNote({ title: '我在《余烬弹匣：末日突围》杀疯了！', content: '七日孤城高密度尸潮肉鸽，绝境核爆满血翻盘！', success: doRevive, fail: doRevive });
          return;
        } catch (e) {}
      }
      doRevive();
    });
    document.getElementById('btn-revive-giveup').addEventListener('click', function () {
      AUD.playClick(); closeModal('modal-revive');
      if (game) game.status = 'defeat';
      finalizeRun(false);
    });

    document.getElementById('btn-save-poster').addEventListener('click', function () {
      if (!game) return;
      AUD.playClick();
      var dataUrl = REND.buildResultPosterDataUrl(game, profile, game.status === 'victory');
      var api = getXhsApi();
      if (api && typeof api.saveImageToPhotosAlbum === 'function') {
        try {
          api.saveImageToPhotosAlbum({
            filePath: dataUrl,
            success: function () { showToast('战报海报已保存至相册，快去发笔记炫耀！'); },
            fail: function () { showToast('海报已生成，请授权相册权限后重试'); }
          });
          return;
        } catch (e) {}
      }
      try { var a = document.createElement('a'); a.href = dataUrl; a.download = '余烬弹匣战报.png'; a.click(); showToast('战报海报已导出！'); }
      catch (err) { showToast('海报已生成完毕'); }
    });
    document.getElementById('btn-retry').addEventListener('click', function () { closeModal('modal-result'); startRun(); });
    document.getElementById('btn-back-title').addEventListener('click', returnToTitle);

    document.getElementById('btn-follow-go').addEventListener('click', function () {
      AUD.playClick();
      var grant = function () {
        if (!profile.followRewardClaimed) {
          profile.followRewardClaimed = true;
          profile.stones += 20;
          var rifle = DATA.rollWeapon('m4', 'white', 0);
          profile.bag.unshift(rifle);
          if (!profile.unlockedGuns) profile.unlockedGuns = {};
          profile.unlockedGuns.m4 = true;
          if (!profile.secondaryUid) {
            profile.secondaryUid = profile.primaryUid;
            profile.primaryUid = rifle.uid;
            if (profile.equipped) { profile.equipped.primary = true; profile.equipped.secondary = true; }
          }
          ENG.unlockTitle(profile, 'pioneer');
          ENG.equipTitle(profile, 'pioneer');
          saveProfile(); AUD.playDropRare();
          showToast('已领取：普通步枪【余烬步枪】+ 专属称号【开创者】+ 20强化石！');
          renderTitle();
        } else showToast('你已领取过「开创者」关注补给啦！');
        closeModal('modal-follow');
      };
      var api = getXhsApi();
      if (api && typeof api.followAuthor === 'function') {
        try { api.followAuthor({ success: grant, fail: grant }); return; } catch (e) {}
      }
      grant();
    });

    function bindRange(id, valId, field) {
      document.getElementById(id).addEventListener('input', function () {
        var v = Number(this.value);
        profile.settings[field] = v;
        document.getElementById(valId).textContent = v + '%';
        AUD.applySettings(profile.settings); saveProfile();
      });
    }
    bindRange('set-master', 'val-master', 'master');
    bindRange('set-sfx', 'val-sfx', 'sfx');
    bindRange('set-music', 'val-music', 'music');

    document.getElementById('set-quality-group').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-q]');
      if (!btn) return;
      AUD.playClick(); profile.settings.quality = btn.getAttribute('data-q'); saveProfile(); syncSettingsUI();
    });
    document.getElementById('btn-toggle-fps').addEventListener('click', function () {
      AUD.playClick(); profile.settings.showFps = !profile.settings.showFps; saveProfile(); syncSettingsUI();
    });
    document.getElementById('btn-toggle-vib').addEventListener('click', function () {
      AUD.playClick(); profile.settings.vibrate = !profile.settings.vibrate; saveProfile(); syncSettingsUI();
    });
    document.getElementById('btn-reset-save').addEventListener('click', function () {
      AUD.playClick(); profile = ENG.createProfile(); saveProfile();
      syncSettingsUI(); closeModal('modal-settings');
      if (game) returnToTitle();
      screenTitle.classList.remove('active');
      if (screenSelectHero) { screenSelectHero.classList.add('active'); renderStarterHeroSelect(); }
      showToast('本地存档已重置，请重新选择你的初始角色');
    });

    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (!game) return;
      if (game.status === 'story' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); advanceStory(false); return; }
      if ((game.status !== 'running' && game.status !== 'victory_loot') || anyModalOpen()) return;
      if (e.code === 'KeyB') { e.preventDefault(); openInBattleArmory(); return; }
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (keys.KeyS || keys.ArrowDown || padState.down) ENG.triggerDropThrough(game);
        else ENG.triggerJump(game);
      }
      else if (game.status === 'running') {
        if (e.code === 'KeyQ') { ENG.swapWeapon(game); updateBattleHud(); }
        else if (e.code === 'KeyE') { ENG.callWarCar(profile, game); updateBattleHud(); }
        else if (e.code === 'KeyF') { var r = ENG.enhanceRunWeapon(profile, game); if (r.ok) saveProfile(); updateBattleHud(); }
        else if (e.code === 'Digit1') ENG.triggerSkill(profile, game, 'crazy');
        else if (e.code === 'Digit2') ENG.triggerSkill(profile, game, 'missile');
        else if (e.code === 'Digit3') ENG.triggerSkill(profile, game, 'heal');
        else if (e.code === 'Digit4') ENG.triggerSkill(profile, game, 'nuke');
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });

    window.addEventListener('resize', layoutStage);
    window.addEventListener('orientationchange', function () { setTimeout(layoutStage, 80); });
  }

  function bootWithPreload() {
    /* 轮换选择精致高清加载封面（每次启动自动轮换，加载期间定时切换贴士） */
    var coverIdx = (profile.lastCoverIdx !== undefined) ? ((profile.lastCoverIdx + 1) % PRELOAD_COVERS.length) : Math.floor(Math.random() * PRELOAD_COVERS.length);
    profile.lastCoverIdx = coverIdx;
    saveProfile();

    var coverEl = document.getElementById('preload-cover');
    var tagEl = document.getElementById('preload-cover-tag');
    var statusEl = document.getElementById('preload-status');
    var pctEl = document.getElementById('preload-pct');
    var fillEl = document.getElementById('preload-fill');
    var tipEl = document.getElementById('preload-tip');

    function applyCover(idx) {
      var c = PRELOAD_COVERS[idx % PRELOAD_COVERS.length];
      if (coverEl) coverEl.style.backgroundImage = 'url("' + c.file + '")';
      if (tagEl) tagEl.textContent = c.tag;
    }
    applyCover(coverIdx);
    if (tipEl) tipEl.textContent = PRELOAD_TIPS[coverIdx % PRELOAD_TIPS.length];

    var startMs = Date.now();
    var tipTick = 0;
    var rotTimer = setInterval(function () {
      tipTick += 1;
      applyCover(coverIdx + tipTick);
      if (tipEl) tipEl.textContent = PRELOAD_TIPS[(coverIdx + tipTick) % PRELOAD_TIPS.length];
    }, 2400);

    REND.preloadAllWithProgress(
      function (done, total) {
        var pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
        if (pctEl) pctEl.textContent = pct + '%';
        if (fillEl) fillEl.style.width = pct + '%';
        if (statusEl) statusEl.textContent = '正在强制预加载全量高清资源（' + done + ' / ' + total + '）';
      },
      function () {
        var elapsed = Date.now() - startMs;
        var wait = Math.max(0, 700 - elapsed);
        setTimeout(function () {
          clearInterval(rotTimer);
          if (screenPreload) screenPreload.classList.remove('active');
          if (!profile.heroChosen && screenSelectHero) {
            pendingStarterHero = profile.heroId || 'chen';
            screenSelectHero.classList.add('active');
            renderStarterHeroSelect();
          } else {
            screenTitle.classList.add('active');
            renderTitle();
          }
          layoutStage();
        }, wait);
      }
    );
  }

  profile = loadProfile();
  bindEvents();
  bindMobileControls();
  bindCanvasAim();
  bindRotatedScroll();
  syncSettingsUI();
  layoutStage();
  bootWithPreload();
  requestAnimationFrame(tickLoop);
})(window);
