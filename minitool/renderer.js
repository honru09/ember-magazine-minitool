/* 《余烬弹匣：末日突围》60 FPS 多帧渲染引擎（限流重试全量预加载 + 离线静态地图缓存 + 双手分体可动持枪，ES2017） */
(function (global) {
  'use strict';

  var DATA = global.EM_DATA;
  var ENG = global.EM_ENGINE;

  var IMG = {};
  var RASTER = {};
  var bgCacheCanvas = null;
  var bgCacheKey = '';
  var ctxCache = null;

  var WEATHER_SEEDS = [];
  for (var wi = 0; wi < 64; wi += 1) {
    WEATHER_SEEDS.push({
      x: Math.random(),
      y: Math.random(),
      s: 0.65 + Math.random() * 0.85,
      p: Math.random() * 6.28
    });
  }

  function buildAssetManifest() {
    var list = [];
    var maps = ['ch1_bridge', 'ch2_subway', 'ch3_lab', 'ch4_neon', 'ch5_airport', 'ch6_citadel', 'world_campaign_map'];
    for (var m = 0; m < maps.length; m += 1) list.push({ k: maps[m], s: 'assets/map/' + maps[m] + '.webp' });

    var heroSheets = [
      'h_chen_run', 'h_chen_shoot', 'p_chen',
      'h_lin_run',  'h_lin_shoot',  'p_lin',
      'h_lu_run',   'h_lu_shoot',   'p_lu',
      'h_shen_run', 'h_shen_shoot', 'p_shen',
      'gear_layers', 'drone_weapons'
    ];
    for (var h = 0; h < heroSheets.length; h += 1) list.push({ k: heroSheets[h], s: 'assets/sheets/' + heroSheets[h] + '.webp' });

    var enemySheets = [
      'z_walker', 'z_toxic', 'z_skel', 'z_vamp', 'z_shield', 'z_crimson', 'z_bomber',
      'boss_golem', 'boss_volt', 'boss_venom', 'boss_cannon', 'boss_falcon', 'boss_emperor',
      'war_car_sheet'
    ];
    for (var e = 0; e < enemySheets.length; e += 1) list.push({ k: enemySheets[e], s: 'assets/sheets/' + enemySheets[e] + '.webp' });

    list.push({ k: 'fx_explosion', s: 'assets/vfx/fx_explosion.webp' });
    list.push({ k: 'fx_muzzle', s: 'assets/vfx/fx_muzzle.webp' });
    list.push({ k: 'fx_blood', s: 'assets/vfx/fx_blood.webp' });
    list.push({ k: 'fx_fire', s: 'assets/vfx/fx_fire.webp' });

    list.push({ k: 'logo_ember', s: 'assets/ui/logo_ember.webp' });
    list.push({ k: 'load_cover_1', s: 'assets/ui/load_cover_1.webp' });
    list.push({ k: 'load_cover_2', s: 'assets/ui/load_cover_2.webp' });
    list.push({ k: 'load_cover_3', s: 'assets/ui/load_cover_3.webp' });

    for (var g = 0; g < DATA.WEAPON_TEMPLATES.length; g += 1) {
      var gk = DATA.WEAPON_TEMPLATES[g].img;
      list.push({ k: gk, s: 'assets/guns/' + gk + '.webp' });
    }

    var skillFiles = [
      'sk_crazy', 'sk_missile', 'sk_heal', 'sk_nuke',
      'sk_through', 'sk_splash', 'sk_hitMissile', 'sk_feedback',
      'sk_accurate', 'sk_bloodShield', 'sk_poisonFog', 'sk_devour',
      'sk_rapidMag', 'sk_crazyPlus', 'sk_missilePlus', 'sk_nukeCharge'
    ];
    for (var sk = 0; sk < skillFiles.length; sk += 1) list.push({ k: skillFiles[sk], s: 'assets/skills/' + skillFiles[sk] + '.webp' });

    var frames = ['select_box', 'skill_frame', 'skill_frame_gold'];
    for (var f = 0; f < frames.length; f += 1) list.push({ k: frames[f], s: 'assets/frames/' + frames[f] + '.svg' });

    var icons = ['ic_stone', 'ic_chip', 'ic_star', 'ic_star_off', 'ic_skull', 'ic_tank', 'eq_armor', 'eq_helmet', 'eq_chip', 'ctrl_left', 'ctrl_right', 'ctrl_down', 'ctrl_jump', 'ctrl_fire'];
    for (var ic = 0; ic < icons.length; ic += 1) list.push({ k: icons[ic], s: 'assets/icons/' + icons[ic] + '.svg' });

    return list;
  }

  /* 限流并发队列 + 自动重试 3 次全量资源预加载（彻底避免高并发压垮本地容器代理或移动端弱网连接！） */
  function preloadAllWithProgress(onProgress, onDone) {
    var list = buildAssetManifest();
    var total = list.length;
    var loaded = 0;
    var cursor = 0;
    var active = 0;
    var MAX_CONCURRENT = 6;
    var finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      if (onProgress) onProgress(total, total);
      if (onDone) onDone();
    }

    function markOne() {
      loaded += 1;
      active = Math.max(0, active - 1);
      if (onProgress) onProgress(loaded, total);
      if (loaded >= total) { finish(); return; }
      pump();
    }

    function loadWithRetry(item, attempt) {
      if (IMG[item.k] && IMG[item.k].complete && IMG[item.k].naturalWidth > 0) {
        markOne();
        return;
      }
      var img = new Image();
      img.onload = function () {
        IMG[item.k] = img;
        if (item.k.indexOf('ch') === 0 && item.k === bgCacheKey) bgCacheKey = '';
        markOne();
      };
      img.onerror = function () {
        if (attempt < 3) {
          setTimeout(function () { loadWithRetry(item, attempt + 1); }, 180 * attempt);
        } else {
          markOne();
        }
      };
      img.src = item.s;
    }

    function pump() {
      while (!finished && active < MAX_CONCURRENT && cursor < total) {
        var item = list[cursor];
        cursor += 1;
        active += 1;
        loadWithRetry(item, 1);
      }
    }

    pump();
    setTimeout(finish, 14000);
  }

  /* 离线静态整图预烘焙（背景 + 电影暗角 + 柏油路面 + 3座钢铁高台一次性绘制，战斗每帧仅 1 次极速 Blit！） */
  function ensureBgCache(mapKey) {
    if (bgCacheCanvas && bgCacheKey === mapKey) return bgCacheCanvas;
    if (!bgCacheCanvas) {
      bgCacheCanvas = document.createElement('canvas');
      bgCacheCanvas.width = ENG.WORLD_W;
      bgCacheCanvas.height = ENG.WORLD_H;
    }
    var bctx = bgCacheCanvas.getContext('2d');
    var W = ENG.WORLD_W;
    var H = ENG.WORLD_H;
    var mapImg = IMG[mapKey] || IMG.ch1_bridge;

    if (mapImg) {
      bctx.drawImage(mapImg, 0, 0, W, H);
      bgCacheKey = mapKey;
    } else {
      var bgG = bctx.createLinearGradient(0, 0, 0, H);
      bgG.addColorStop(0, '#121826');
      bgG.addColorStop(1, '#1d2434');
      bctx.fillStyle = bgG;
      bctx.fillRect(0, 0, W, H);
      bgCacheKey = '';
    }

    var dimG = bctx.createLinearGradient(0, 0, 0, H);
    dimG.addColorStop(0, 'rgba(6, 9, 15, 0.36)');
    dimG.addColorStop(0.55, 'rgba(8, 11, 18, 0.14)');
    dimG.addColorStop(0.84, 'rgba(8, 10, 16, 0.42)');
    dimG.addColorStop(1, 'rgba(5, 7, 11, 0.78)');
    bctx.fillStyle = dimG;
    bctx.fillRect(0, 0, W, H);

    /* 柏油路面与琥珀标线 */
    bctx.fillStyle = '#171b24';
    bctx.fillRect(0, ENG.GROUND_Y, W, H - ENG.GROUND_Y);
    bctx.fillStyle = 'rgba(245, 166, 61, 0.62)';
    bctx.fillRect(0, ENG.GROUND_Y, W, 3);
    bctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    for (var mx = 24; mx < W; mx += 96) {
      bctx.fillRect(mx, ENG.GROUND_Y + 20, 44, 5);
    }

    /* 预烘焙 3 座工业钢铁战术跳台 */
    for (var i = 0; i < ENG.PLATFORMS.length; i += 1) {
      var pl = ENG.PLATFORMS[i];
      bctx.fillStyle = 'rgba(0, 0, 0, 0.44)';
      bctx.fillRect(pl.x + 6, pl.y + 15, pl.w - 12, 8);
      var pg = bctx.createLinearGradient(0, pl.y, 0, pl.y + 16);
      pg.addColorStop(0, '#5a6a80');
      pg.addColorStop(0.5, '#2d3645');
      pg.addColorStop(1, '#181e28');
      bctx.fillStyle = pg;
      bctx.fillRect(pl.x, pl.y, pl.w, 16);
      bctx.fillStyle = '#f5a63d';
      bctx.fillRect(pl.x, pl.y, pl.w, 3);
      bctx.fillStyle = 'rgba(255, 198, 82, 0.52)';
      for (var k = 12; k < pl.w - 14; k += 26) {
        bctx.fillRect(pl.x + k, pl.y + 6, 11, 4);
      }
      bctx.fillStyle = '#202632';
      bctx.fillRect(pl.x + 10, pl.y + 16, 8, 12);
      bctx.fillRect(pl.x + pl.w - 18, pl.y + 16, 8, 12);
    }
    return bgCacheCanvas;
  }

  function getCamX(game, viewW) {
    var target = game.hero.x - viewW * 0.5;
    if (target < 0) target = 0;
    if (target > ENG.WORLD_W - viewW) target = Math.max(0, ENG.WORLD_W - viewW);
    return target;
  }

  function drawDecalsAndPools(ctx, game, camX) {
    /* 爆炸焦痕与击杀残渍 */
    for (var d = 0; d < game.decals.length; d += 1) {
      var dc = game.decals[d];
      var dx = dc.x - camX;
      var al = Math.min(0.55, (dc.life / dc.maxLife) * 0.7);
      ctx.fillStyle = dc.kind === 'scorch' ? ('rgba(8, 10, 14, ' + al + ')') : ('rgba(46, 140, 56, ' + (al * 0.85) + ')');
      ctx.beginPath();
      ctx.ellipse(dx, ENG.GROUND_Y + 4, dc.r, dc.r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 毒雾腐蚀区域 */
    for (var i = 0; i < game.poisonPools.length; i += 1) {
      var pp = game.poisonPools[i];
      var sx = pp.x - camX;
      var alpha = Math.min(0.55, pp.life / 100);
      ctx.fillStyle = 'rgba(72, 232, 86, ' + alpha + ')';
      ctx.beginPath();
      ctx.ellipse(sx, pp.y - 1, pp.r, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(165, 255, 130, ' + (alpha * 0.85) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawDrops(ctx, game, camX) {
    var t = game.tick * 0.09;
    var isVacuum = game.status === 'victory_loot';
    var hx = game.hero.x - camX;
    var hy = game.hero.y - 38;

    for (var i = 0; i < game.drops.length; i += 1) {
      var dr = game.drops[i];
      var sx = dr.x - camX;
      var bob = isVacuum ? 0 : Math.sin(t + dr.id) * 4;
      var sy = dr.y - 16 + bob;

      /* 5 秒战利品自动吸取阶段：金光引力流线直连主角！ */
      if (isVacuum) {
        ctx.strokeStyle = 'rgba(255, 224, 96, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(hx, hy);
        ctx.stroke();
      }

      if (dr.kind === 'gun' && dr.weapon) {
        var rar = DATA.RARITIES[dr.weapon.rarity] || DATA.RARITIES.white;
        var isHigh = (dr.weapon.rarity === 'purple' || dr.weapon.rarity === 'orange' || dr.weapon.rarity === 'red' || dr.weapon.rarity === 'darkgold');
        if (!isVacuum) {
          ctx.fillStyle = rar.glow;
          ctx.globalAlpha = isHigh ? 0.34 : 0.20;
          ctx.fillRect(sx - (isHigh ? 13 : 8), dr.y - (isHigh ? 142 : 76), isHigh ? 26 : 16, isHigh ? 142 : 76);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = rar.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sx, dr.y - 2, 18, 6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        var gunImg = IMG[DATA.getWeaponImgKey(dr.weapon)];
        if (gunImg) ctx.drawImage(gunImg, sx - 30, sy - 14, 60, 24);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#090c12';
        ctx.fillText(dr.weapon.name, sx + 1, sy - 17);
        ctx.fillStyle = rar.color;
        ctx.fillText(dr.weapon.name, sx, sy - 18);
      } else if (dr.kind === 'gear' && dr.gear) {
        var grar = DATA.RARITIES[dr.gear.rarity] || DATA.RARITIES.white;
        if (!isVacuum) {
          ctx.fillStyle = grar.glow;
          ctx.globalAlpha = 0.28;
          ctx.fillRect(sx - 10, dr.y - 102, 20, 102);
          ctx.globalAlpha = 1;
        }
        var gIc = IMG['eq_' + dr.gear.slot];
        if (gIc) ctx.drawImage(gIc, sx - 14, sy - 14, 28, 28);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#090c12';
        ctx.fillText(dr.gear.name, sx + 1, sy - 17);
        ctx.fillStyle = grar.color;
        ctx.fillText(dr.gear.name, sx, sy - 18);
      } else if (dr.kind === 'chip') {
        ctx.fillStyle = '#ffe566';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 11); ctx.lineTo(sx + 10, sy); ctx.lineTo(sx, sy + 11); ctx.lineTo(sx - 10, sy);
        ctx.closePath();
        ctx.fill();
      } else if (dr.kind === 'stone') {
        ctx.fillStyle = '#5ee8a0';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 7, sy); ctx.lineTo(sx, sy + 8); ctx.lineTo(sx - 7, sy);
        ctx.closePath();
        ctx.fill();
      } else if (dr.kind === 'med') {
        ctx.fillStyle = '#f5f9fc';
        ctx.fillRect(sx - 9, sy - 8, 18, 16);
        ctx.fillStyle = '#ff4b55';
        ctx.fillRect(sx - 2, sy - 5, 4, 10);
        ctx.fillRect(sx - 5, sy - 2, 10, 4);
      }
    }
  }

  function drawFireAura(ctx, x, y, size, tick, alpha) {
    var sheet = IMG.fx_fire;
    if (!sheet) return;
    var f = Math.floor(tick / 3) % 16;
    var cs = Math.max(64, Math.round((sheet.naturalWidth || sheet.width || 384) / 4));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sheet, (f % 4) * cs, Math.floor(f / 4) * cs, cs, cs, x - size * 0.5, y - size * 0.85, size, size);
    ctx.restore();
  }

  function drawEnemies(ctx, game, camX, logicViewW) {
    for (var i = 0; i < game.enemies.length; i += 1) {
      var z = game.enemies[i];
      if (z.hp <= 0) continue;
      var sx = z.x - camX;
      if (sx < -160 || sx > logicViewW + 160) continue;
      var sy = z.y;

      /* 脚底投影 */
      ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
      ctx.beginPath();
      ctx.ellipse(sx, z.flying ? ENG.GROUND_Y - 2 : sy - 2, z.w * 0.48, z.isBoss ? 12 : 6, 0, 0, Math.PI * 2);
      ctx.fill();

      var isRage = z.isBoss && z.hp < z.maxHp * 0.5;
      if (isRage) {
        drawFireAura(ctx, sx, sy + 8, z.w * 1.48, game.tick + i * 5, 0.68);
        ctx.strokeStyle = 'rgba(255, 58, 72, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 2, z.w * 0.64, 14, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.isElite) {
        ctx.strokeStyle = 'rgba(255, 206, 68, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy - 2, z.w * 0.58, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      var sheet = IMG[z.sheet];
      if (sheet) {
        var frameIdx = Math.floor(z.animTick / (z.isBoss ? 7 : 6)) % Math.max(1, z.frames);
        var scale = z.isElite ? 1.02 : (z.isBoss ? 0.94 : 0.82);
        var drawW = z.fw * scale;
        var drawH = z.fh * scale;

        ctx.save();
        ctx.translate(sx, sy);
        if (z.facing < 0) ctx.scale(-1, 1);
        /* 零 ctx.filter！纯 GPU 极速贴图 */
        ctx.drawImage(sheet, frameIdx * z.fw, 0, z.fw, z.fh, -drawW * 0.5, -drawH + 6, drawW, drawH);
        /* 受击白闪：使用轻量级叠加态二次贴图（比 ctx.filter 快 10 倍！） */
        if (z.hitFlash > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.65;
          ctx.drawImage(sheet, frameIdx * z.fw, 0, z.fw, z.fh, -drawW * 0.5, -drawH + 6, drawW, drawH);
        }
        ctx.restore();
      }

      if (z.slowTicks > 0) {
        ctx.strokeStyle = 'rgba(96, 232, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy - z.h * 0.45, z.w * 0.45, z.h * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (z.burnTicks > 0 && !isRage) {
        drawFireAura(ctx, sx, sy + 2, z.w * 0.9, game.tick + i * 3, 0.40);
      }

      /* 血条 + 护甲标 + 精英/狂暴标 */
      var bw = z.isBoss ? 124 : (z.isElite ? 62 : 46);
      var bh = z.isBoss ? 7 : 5;
      var bx = sx - bw * 0.5;
      var by = sy - z.h - (z.isBoss ? 24 : 12);
      ctx.fillStyle = 'rgba(6, 9, 14, 0.84)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      var pct = Math.max(0, Math.min(1, z.hp / Math.max(1, z.maxHp)));
      ctx.fillStyle = z.isBoss ? (isRage ? '#ff2a48' : '#ff8c38') : (z.isElite ? '#ffbe3b' : '#eb4b55');
      ctx.fillRect(bx, by, bw * pct, bh);
      if (z.armor >= 0.35) {
        ctx.fillStyle = '#58c8ff';
        ctx.fillRect(bx - 7, by - 1, 5, bh + 2);
      }
      if (isRage) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff5268';
        ctx.fillText('狂暴二阶段!', sx, by - 5);
      } else if (z.isElite) {
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe566';
        ctx.fillText('精英', sx, by - 4);
      }
    }
  }

  function drawWarCar(ctx, game, camX) {
    if (!game.warCar) return;
    var wc = game.warCar;
    var sx = wc.x - camX;
    var sy = wc.y;

    /* 强光车灯锥 */
    ctx.fillStyle = 'rgba(255, 236, 138, 0.22)';
    ctx.beginPath();
    ctx.moveTo(sx + 102, sy - 54);
    ctx.lineTo(sx + 290, sy - 96);
    ctx.lineTo(sx + 290, sy);
    ctx.lineTo(sx + 102, sy - 20);
    ctx.closePath();
    ctx.fill();

    var sheet = IMG.war_car_sheet;
    if (sheet) {
      var f = Math.floor(game.tick / 4) % 4;
      ctx.drawImage(sheet, f * 260, 0, 260, 136, sx - 130, sy - 130, 260, 136);
    }
  }

  var TIER_SLEEVE_COLORS = ['#8894a4', '#46763e', '#2e629e', '#68369a', '#c6581a', '#2e2a3a'];
  var TIER_GLOW_COLORS = ['#a8d2ff', '#5ce68a', '#58c8ff', '#c875ff', '#ffa93b', '#ffe566'];

  /* 通用魔兽世界式多层穿卸角色渲染器（首页中心全身舞台 + 局内 60FPS 实战完全同源渲染！） */
  function drawModularGearAndBody(ctx, opts) {
    var sheet = IMG[opts.sheetKey];
    var atlas = IMG.gear_layers;
    var fw = opts.fw || 112;
    var fh = opts.fh || 120;
    var sc = opts.scale || 0.84;
    var drawW = fw * sc;
    var drawH = fh * sc;
    var vg = opts.visualGear || { primary: true, secondary: true, armor: true, armorTier: 0, helmet: true, helmetTier: 0, chip: true, chipTier: 0 };
    var bobY = opts.gearBobY || 0;
    var leanX = opts.gearLeanX || 0;

    /* 1. 背部火控核心 + 全息能量光翼（穿戴核心才显示，卸下即消失！） */
    if (vg.chip && atlas) {
      var cTier = Math.max(0, Math.min(5, vg.chipTier || 0));
      var wingPulse = Math.sin((opts.tick || 0) * 0.1) * 1.4 * sc;
      ctx.drawImage(atlas, cTier * 112, 240, 112, 120, -drawW * 0.5 + leanX * 0.4, -drawH + 6 * sc + bobY + wingPulse, drawW, drawH);
    }

    /* 2. 斜背副枪（穿戴副枪才显示，枪管与瞄具斜露出肩头，卸下即消失！） */
    if (vg.secondary && opts.backGunImg) {
      ctx.save();
      ctx.translate(-5 * sc + leanX * 0.4, -56 * sc + bobY);
      ctx.rotate(-0.92);
      ctx.drawImage(opts.backGunImg, -36 * sc, -13 * sc, 72 * sc, 26 * sc);
      ctx.restore();
    }

    /* 3. 素体无头盔无手臂角色全身帧（裸头、发型、脸庞、素体战术服与双腿战靴） */
    if (sheet) {
      ctx.drawImage(sheet, (opts.frameIdx || 0) * fw, 0, fw, fh, -drawW * 0.5, -drawH + 6 * sc, drawW, drawH);
    }

    /* 4. 凯夫拉重甲与护肩层（穿戴防具才显示，随品质自动进化造型与光泽！） */
    if (vg.armor && atlas) {
      var aTier = Math.max(0, Math.min(5, vg.armorTier || 0));
      ctx.drawImage(atlas, aTier * 112, 120, 112, 120, -drawW * 0.5 + leanX * 0.5, -drawH + 6 * sc + bobY, drawW, drawH);
    }

    /* 5. 战术目镜盔层（穿戴头盔才显示，卸下立即露出完整发型与面庞！） */
    if (vg.helmet && atlas) {
      var hTier = Math.max(0, Math.min(5, vg.helmetTier || 0));
      ctx.drawImage(atlas, hTier * 112, 0, 112, 120, -drawW * 0.5 + leanX, -drawH + 6 * sc + bobY, drawW, drawH);
    }
  }

  function drawHero(ctx, game, camX) {
    var h = game.hero;
    var sx = h.x - camX;
    var sy = h.y;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.ellipse(sx, ENG.GROUND_Y - 2, Math.max(12, 28 - (ENG.GROUND_Y - sy) * 0.08), 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (h.crazyTicks > 0) drawFireAura(ctx, sx, sy + 6, 126, game.tick, 0.65);

    var isMoving = Math.abs(h.vx) > 0.35 || !h.onGround;
    var shooting = h.shootAnim > 0 && !isMoving;
    var sheetKey = isMoving ? h.runSheet : h.shootSheet;
    var runMax = h.runFrames || 10;
    var shMax = h.shootFrames || 6;
    var frameIdx = isMoving ? (Math.floor(h.animTick / 3.2) % runMax) : (Math.floor(game.tick / 10) % shMax);
    var phase = isMoving ? (frameIdx / runMax) : (frameIdx / shMax);
    var sc = 0.80;
    var gearBobY = isMoving ? (-Math.abs(Math.sin(phase * Math.PI * 2)) * 5.5 * sc) : (Math.sin(phase * Math.PI * 2) * 1.5 * sc);
    var gearLeanX = isMoving ? (2.0 * sc) : 0;

    var sqX = 1 + h.squash * 0.025;
    var sqY = 1 - h.squash * 0.025;
    var vg = h.visualGear || { primary: true, secondary: true, armor: true, armorTier: 0, helmet: true, helmetTier: 0, chip: true, chipTier: 0 };
    var backW = h.weapons[h.activeSlot === 0 ? 1 : 0];
    var backGunImg = (backW && vg.secondary) ? IMG[DATA.getWeaponImgKey(backW)] : null;

    ctx.save();
    ctx.translate(sx, sy);
    if (h.invuln > 0 && Math.floor(h.invuln / 4) % 2 === 1) ctx.globalAlpha = 0.55;
    ctx.scale(h.facing * sqX, sqY);
    drawModularGearAndBody(ctx, {
      sheetKey: sheetKey, fw: h.fw, fh: h.fh, scale: sc,
      frameIdx: frameIdx, tick: game.tick,
      visualGear: vg, backGunImg: backGunImg,
      gearBobY: gearBobY, gearLeanX: gearLeanX
    });
    ctx.restore();

    /* 分体拼接双臂持枪系统（穿甲时自动切换装甲袖色，脱甲时还原素体袖色！） */
    var w = ENG.getActiveWeapon(game);
    var gunImg = w ? IMG[DATA.getWeaponImgKey(w)] : null;
    if (gunImg) {
      var aimSway = isMoving ? Math.sin(h.animTick * 0.26) * 0.045 : 0;
      var shY = sy - (h.shoulderY || 40) + gearBobY;
      var aim = h.aimAngle + aimSway;
      var kick = h.recoil * 0.9;
      var sleeveCol = vg.armor ? TIER_SLEEVE_COLORS[Math.max(0, Math.min(5, vg.armorTier || 0))] : (h.sleeve || '#546848');
      var gloveCol = h.glove || '#f4d2b4';

      ctx.save();
      ctx.translate(sx, shY);
      ctx.rotate(aim);
      if (Math.cos(aim) < 0) ctx.scale(1, -1);

      /* 1. 后侧托枪手臂 + 托枪前手（抓握枪身护木，屈肘自然发力） */
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#141822';
      ctx.lineWidth = 9.5;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(13 - kick * 0.6, 6.5);
      ctx.lineTo(24 - kick, 4.5);
      ctx.stroke();
      ctx.strokeStyle = sleeveCol;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(13 - kick * 0.6, 6.5);
      ctx.lineTo(22 - kick, 4.8);
      ctx.stroke();

      ctx.fillStyle = gloveCol;
      ctx.strokeStyle = '#141822';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(24.5 - kick, 4.5, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      /* 2. 手中动态高清枪械本体（握把精准贴合双手之间） */
      ctx.drawImage(gunImg, -14 - kick, -17, 72, 29);

      /* 3. 前侧主控手臂 + 扳机手（肩膀 -> 肘部微曲 -> 紧握枪把） */
      ctx.strokeStyle = '#141822';
      ctx.lineWidth = 10.5;
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.lineTo(1 - kick * 0.45, 7);
      ctx.lineTo(9 - kick * 0.9, 5.5);
      ctx.stroke();

      ctx.strokeStyle = sleeveCol;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.lineTo(1 - kick * 0.45, 7);
      ctx.lineTo(7.5 - kick * 0.9, 5.6);
      ctx.stroke();

      ctx.fillStyle = gloveCol;
      ctx.strokeStyle = '#141822';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(9.5 - kick * 0.9, 5.4, 5.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    /* 升级版全息六边形能量护盾罩（带旋转扫描流光与受击波纹闪光！） */
    if (h.shield > 0) {
      var shFlash = h.shieldFlash > 0 ? (h.shieldFlash / 16) : 0;
      ctx.save();
      ctx.translate(sx, sy - 44);
      var shGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 48);
      shGrad.addColorStop(0, 'rgba(82, 224, 255, ' + (0.04 + shFlash * 0.22) + ')');
      shGrad.addColorStop(0.75, 'rgba(72, 210, 255, ' + (0.14 + shFlash * 0.28) + ')');
      shGrad.addColorStop(1, 'rgba(142, 246, 255, ' + (0.48 + shFlash * 0.45) + ')');
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      /* 六边形科技力场外框 */
      ctx.strokeStyle = shFlash > 0 ? '#ffffff' : 'rgba(104, 236, 255, 0.85)';
      ctx.lineWidth = shFlash > 0 ? 3.2 : 2.1;
      ctx.beginPath();
      for (var hx = 0; hx < 6; hx += 1) {
        var ha = (hx * Math.PI / 3) + game.tick * 0.015;
        var px = Math.cos(ha) * 35;
        var py = Math.sin(ha) * 47;
        if (hx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    /* 10 级解锁无人机实战渲染 */
    if (game.drone && game.drone.def && IMG.drone_weapons) {
      var drn = game.drone;
      var dsx = drn.x - camX;
      var dsy = drn.y;
      var df = Math.floor(game.tick / 10) % 2;
      ctx.save();
      ctx.translate(dsx, dsy);
      if (h.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(IMG.drone_weapons, drn.def.col * 96, df * 72, 96, 72, -32, -24, 64, 48);
      ctx.restore();
    }

    /* 20 级解锁专属伙伴实战渲染 */
    if (game.partner) {
      var pt = game.partner;
      var psx = pt.x - camX;
      var psy = pt.y;
      var pMov = Math.abs(pt.vx) > 0.25;
      var pSheet = IMG[pMov ? pt.runSheet : pt.shootSheet];
      var pF = pMov ? (Math.floor(pt.animTick / 3.5) % pt.runFrames) : (Math.floor(game.tick / 12) % pt.shootFrames);
      ctx.save();
      ctx.translate(psx, psy);
      if (pt.facing < 0) ctx.scale(-1, 1);
      if (pSheet) ctx.drawImage(pSheet, pF * pt.fw, 0, pt.fw, pt.fh, -41, -84, 82, 88);
      ctx.restore();
      var pGunImg = pt.weapon ? IMG[DATA.getWeaponImgKey(pt.weapon)] : null;
      if (pGunImg) {
        ctx.save();
        ctx.translate(psx, psy - 36);
        ctx.rotate(pt.aimAngle);
        if (Math.cos(pt.aimAngle) < 0) ctx.scale(1, -1);
        ctx.drawImage(pGunImg, -10 - pt.recoil * 0.7, -13, 56, 22);
        ctx.restore();
      }
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#84ffac';
      ctx.fillText('伙伴·' + pt.name + ' Lv.' + pt.lv, psx, psy - 88);
    }

    if (h.reloadTicks > 0) {
      var rp = 1 - h.reloadTicks / 38;
      ctx.fillStyle = 'rgba(8, 11, 18, 0.88)';
      ctx.fillRect(sx - 24, sy - 96, 48, 6);
      ctx.fillStyle = '#58d8ff';
      ctx.fillRect(sx - 23, sy - 95, 46 * Math.max(0, Math.min(1, rp)), 4);
    }
  }

  function drawBullets(ctx, game, camX) {
    for (var i = 0; i < game.bullets.length; i += 1) {
      var b = game.bullets[i];
      var sx = b.x - camX;
      var sy = b.y;
      var ang = Math.atan2(b.vy, b.vx);

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      if (b.kind === 'laser') {
        ctx.fillStyle = '#88ffff';
        ctx.fillRect(-30, -3.5, 38, 7);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-26, -1.5, 34, 3);
      } else if (b.kind === 'rocket' || b.kind === 'missile') {
        ctx.fillStyle = '#ff6a2e';
        ctx.fillRect(-15, -4.5, 20, 9);
        ctx.fillStyle = '#ffe566';
        ctx.beginPath();
        ctx.arc(-15, 0, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'grenade') {
        ctx.fillStyle = '#e89834';
        ctx.strokeStyle = '#121620';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe57a';
        ctx.fillRect(-2, -2, 4, 4);
      } else if (b.kind === 'flamer') {
        ctx.fillStyle = b.elem === 'ice' ? 'rgba(116, 238, 255, 0.78)' : 'rgba(255, 142, 46, 0.78)';
        ctx.beginPath();
        ctx.arc(0, 0, 7 + (38 - b.life) * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'sniper' || b.kind === 'crossbow') {
        ctx.fillStyle = b.color || '#ffe566';
        ctx.fillRect(-24, -2.8, 30, 5.6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-16, -1.2, 20, 2.4);
      } else {
        ctx.fillStyle = b.color || '#ffd97a';
        ctx.fillRect(-14, -2.4, 20, 4.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-7, -1, 12, 2);
      }
      ctx.restore();
    }

    for (var j = 0; j < game.eBullets.length; j += 1) {
      var eb = game.eBullets[j];
      var ex = eb.x - camX;
      var ey = eb.y;
      var col = '#ff4c5b';
      if (eb.kind === 'acid') col = '#7aff59';
      else if (eb.kind === 'shock' || eb.kind === 'laser') col = '#5ee8ff';
      else if (eb.kind === 'flame' || eb.kind === 'rocket') col = '#ff9436';

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(ex, ey, 6.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEffects(ctx, game, camX) {
    ctx.fillStyle = '#e8c468';
    for (var s = 0; s < game.shells.length; s += 1) {
      var sh = game.shells[s];
      ctx.fillRect(sh.x - camX, sh.y, 4.5, 2.2);
    }

    for (var p = 0; p < game.particles.length; p += 1) {
      var pt = game.particles[p];
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - camX - pt.r * 0.5, pt.y - pt.r * 0.5, pt.r, pt.r);
    }
    ctx.globalAlpha = 1;

    for (var i = 0; i < game.effects.length; i += 1) {
      var ef = game.effects[i];
      var prog = 1 - (ef.life / Math.max(1, ef.maxLife));
      var sx = ef.x - camX;
      var sy = ef.y;

      if (ef.type === 'expl') {
        var exImg = IMG.fx_explosion;
        if (exImg) {
          var fi = Math.min(7, Math.floor(prog * 8));
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(exImg, fi * 96, 0, 96, 96, sx - ef.size * 0.5, sy - ef.size * 0.5, ef.size, ef.size);
          ctx.restore();
        }
      } else if (ef.type === 'muzzle') {
        var mzImg = IMG.fx_muzzle;
        if (mzImg) {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(ef.ang || 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(mzImg, (ef.frame % 4) * 80, 0, 80, 80, -18, -28, 56, 56);
          ctx.restore();
        }
      } else if (ef.type === 'blood') {
        var blImg = IMG.fx_blood;
        if (blImg) {
          var bf = Math.min(11, Math.floor(prog * 12));
          ctx.drawImage(blImg, (bf % 4) * 96, Math.floor(bf / 4) * 96, 96, 96, sx - ef.size * 0.5, sy - ef.size * 0.5, ef.size, ef.size);
        }
      } else if (ef.type === 'beam') {
        var tx = ef.tx - camX;
        var ty = ef.ty;
        ctx.strokeStyle = ef.color || '#78f5ff';
        ctx.lineWidth = 3 * (1 - prog) + 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (tx - sx) * 0.35 + (Math.random() - 0.5) * 18, sy + (ty - sy) * 0.35 + (Math.random() - 0.5) * 18);
        ctx.lineTo(sx + (tx - sx) * 0.70 + (Math.random() - 0.5) * 18, sy + (ty - sy) * 0.70 + (Math.random() - 0.5) * 18);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      } else if (ef.type === 'emp' || ef.type === 'ring') {
        var curR = ef.r + (ef.maxR - ef.r) * prog;
        ctx.globalAlpha = Math.max(0, 1 - prog);
        ctx.strokeStyle = ef.color || '#ffe566';
        ctx.lineWidth = ef.type === 'emp' ? 7 : 4;
        ctx.beginPath();
        ctx.arc(sx, sy, curR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.textAlign = 'center';
    for (var f = 0; f < game.floats.length; f += 1) {
      var fl = game.floats[f];
      ctx.globalAlpha = Math.min(1, fl.life / 14);
      var pop = (fl.big && fl.life > fl.maxLife - 8) ? 20 : (fl.big ? 17 : 13);
      ctx.font = 'bold ' + pop + 'px sans-serif';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(6, 9, 14, 0.92)';
      ctx.strokeText(fl.text, fl.x - camX, fl.y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x - camX, fl.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawWeather(ctx, game, viewW, viewH, quality) {
    var count = quality === 'low' ? 14 : (quality === 'medium' ? 32 : 56);
    var t = game.tick;
    if (game.weather === 'rain') {
      ctx.strokeStyle = 'rgba(182, 214, 255, 0.32)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (var r = 0; r < count; r += 1) {
        var sd = WEATHER_SEEDS[r];
        var rx = ((sd.x * viewW - t * 4.4 * sd.s) % viewW + viewW) % viewW;
        var ry = ((sd.y * viewH + t * 13 * sd.s) % viewH + viewH) % viewH;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + 15 * sd.s);
      }
      ctx.stroke();
    } else if (game.weather === 'spores') {
      ctx.fillStyle = 'rgba(124, 255, 112, 0.38)';
      for (var sp = 0; sp < count; sp += 1) {
        var s2 = WEATHER_SEEDS[sp];
        var sx = ((s2.x * viewW + Math.sin(t * 0.02 + s2.p) * 30) % viewW + viewW) % viewW;
        var sy = ((s2.y * viewH - t * 0.65 * s2.s) % viewH + viewH) % viewH;
        ctx.fillRect(sx, sy, 3.5, 3.5);
      }
    } else if (game.weather === 'embers') {
      for (var em = 0; em < count; em += 1) {
        var s3 = WEATHER_SEEDS[em];
        var ex = ((s3.x * viewW + Math.sin(t * 0.04 + s3.p) * 40) % viewW + viewW) % viewW;
        var ey = ((s3.y * viewH - t * 1.45 * s3.s) % viewH + viewH) % viewH;
        ctx.fillStyle = (em % 2 === 0) ? 'rgba(255, 146, 48, 0.72)' : 'rgba(255, 224, 96, 0.68)';
        ctx.fillRect(ex, ey, 3 * s3.s, 3 * s3.s);
      }
    } else {
      ctx.fillStyle = 'rgba(215, 222, 232, 0.24)';
      for (var d = 0; d < count; d += 1) {
        var s4 = WEATHER_SEEDS[d];
        var dx = ((s4.x * viewW - t * 0.9 * s4.s) % viewW + viewW) % viewW;
        var dy = ((s4.y * viewH + Math.sin(t * 0.02 + s4.p) * 14) % viewH + viewH) % viewH;
        ctx.fillRect(dx, dy, 2.5, 2.5);
      }
    }
  }

  function renderGame(canvas, game, quality) {
    if (!canvas || !game) return;
    if (!ctxCache || ctxCache.canvas !== canvas) {
      ctxCache = canvas.getContext('2d', { alpha: false });
    }
    var ctx = ctxCache;
    var viewW = canvas.width;
    var viewH = canvas.height;
    var scaleY = viewH / ENG.WORLD_H;
    var logicViewW = viewW / scaleY;
    var camX = getCamX(game, logicViewW);

    ctx.save();
    ctx.scale(scaleY, scaleY);

    if (game.shakeTicks > 0) {
      var amp = Math.min(10, (game.shakeAmp || 5) * (game.shakeTicks / 16 + 0.35));
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    /* 1 次极速 Blit 绘制离线预烘焙高清地图与高台！ */
    var bg = ensureBgCache(game.mapKey);
    var srcW = Math.min(ENG.WORLD_W - camX, logicViewW + 2);
    ctx.drawImage(bg, camX, 0, srcW, ENG.WORLD_H, 0, 0, srcW, ENG.WORLD_H);

    drawDecalsAndPools(ctx, game, camX);
    drawDrops(ctx, game, camX);
    drawEnemies(ctx, game, camX, logicViewW);
    drawWarCar(ctx, game, camX);
    drawHero(ctx, game, camX);
    drawBullets(ctx, game, camX);
    drawEffects(ctx, game, camX);
    drawWeather(ctx, game, logicViewW, ENG.WORLD_H, quality || 'high');

    if (game.nukeFlash > 0) {
      ctx.fillStyle = 'rgba(255, 248, 210, ' + Math.min(0.85, game.nukeFlash / 30) + ')';
      ctx.fillRect(0, 0, logicViewW, ENG.WORLD_H);
    }

    ctx.restore();
  }

  function buildResultPosterDataUrl(game, profile, isWin) {
    var pc = document.createElement('canvas');
    pc.width = 900;
    pc.height = 1200;
    var ctx = pc.getContext('2d');

    var bg = ctx.createLinearGradient(0, 0, 0, 1200);
    bg.addColorStop(0, '#101520');
    bg.addColorStop(0.5, '#191e2b');
    bg.addColorStop(1, '#0b0e14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 900, 1200);

    var mapImg = IMG[game.mapKey] || IMG.ch1_bridge;
    if (mapImg) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(mapImg, 0, 0, 900, 520);
      ctx.restore();
    }

    ctx.strokeStyle = '#f5a63d';
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 26, 848, 1148);
    ctx.strokeStyle = 'rgba(255, 229, 102, 0.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(38, 38, 824, 1124);

    if (IMG.title_hero) ctx.drawImage(IMG.title_hero, 42, 175, 260, 280);
    if (IMG.title_boss) ctx.drawImage(IMG.title_boss, 598, 175, 260, 280);

    var logo = RASTER.logo_ember || IMG.logo_ember;
    if (logo) ctx.drawImage(logo, 200, 48, 500, 148);

    ctx.textAlign = 'center';
    ctx.fillStyle = isWin ? '#ffe566' : '#ff6b72';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(isWin ? '孤城突围 · 战捷凯旋' : '血战至终 · 英雄不朽', 450, 515);

    ctx.fillStyle = '#cfd9e8';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(game.chapterEp + '《' + game.chapterName + '》 · ' + game.diff.name, 450, 568);

    var w = ENG.getActiveWeapon(game);
    var rar = w ? DATA.RARITIES[w.rarity] : DATA.RARITIES.white;
    var rows = [
      ['出战幸存者', game.hero.name],
      ['最终战绩分', String(game.score)],
      ['击杀 / 最高连杀', game.kills + ' 只  |  ' + (game.maxCombo || 0) + ' 连杀'],
      ['本局主力神枪', w ? ('[' + rar.name + '] ' + w.name + ' +' + w.enh) : '余烬步枪'],
      ['全图回收战利品', '神枪 ×' + (game.lootedGuns ? game.lootedGuns.length : 0) + '  |  强化石 +' + game.earnedStones + '  |  碎片 +' + game.earnedChips],
      ['生涯最高纪录', String(Math.max(profile.bestScore || 0, game.score))]
    ];

    ctx.textAlign = 'left';
    for (var i = 0; i < rows.length; i += 1) {
      var ry = 635 + i * 74;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(88, ry - 40, 724, 58);
      ctx.fillStyle = '#9aa8bd';
      ctx.font = '24px sans-serif';
      ctx.fillText(rows[i][0], 116, ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = (i === 1 || i === 3) ? '#ffe566' : '#f4f8ff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(rows[i][1], 784, ry);
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5a63d';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('小红书小工具 · 《余烬弹匣：末日突围》七日孤城尸潮肉鸽', 450, 1126);

    return pc.toDataURL('image/png');
  }

  /* 首页魔兽世界式全身纸娃娃实时展示舞台（60FPS 动态呼吸 + 全装备实时穿卸 + 换装光环爆闪！） */
  function renderPaperdollStage(canvas, profile, tick, burstFx) {
    if (!canvas || !profile) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;
    if (W < 20 || H < 20) return;

    var st = ENG.computeHeroStats(profile);
    var heroDef = st.heroDef;
    var vg = st.visualGear;
    var maxTier = 0;
    if (vg.armor) maxTier = Math.max(maxTier, vg.armorTier);
    if (vg.helmet) maxTier = Math.max(maxTier, vg.helmetTier);
    if (vg.chip) maxTier = Math.max(maxTier, vg.chipTier);
    var glowCol = TIER_GLOW_COLORS[maxTier] || '#f5a63d';

    ctx.clearRect(0, 0, W, H);

    /* 1. 电影级战术展示舱背景（聚光光柱 + 微弱网格线） */
    var spot = ctx.createRadialGradient(W * 0.5, H * 0.48, 8, W * 0.5, H * 0.52, Math.max(W, H) * 0.68);
    spot.addColorStop(0, 'rgba(245, 166, 61, 0.22)');
    spot.addColorStop(0.55, 'rgba(28, 42, 68, 0.25)');
    spot.addColorStop(1, 'rgba(8, 12, 20, 0.05)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(154, 186, 224, 0.08)';
    ctx.lineWidth = 1;
    var gridStep = Math.max(18, Math.round(W / 8));
    for (var gx = gridStep; gx < W; gx += gridStep) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }

    var cx = W * 0.48;
    var footY = H * 0.85;
    var sc = Math.min((H * 0.72) / 120, (W * 0.72) / 112);

    /* 2. 全息科技底座光环（随装备品质变色 + 旋转虚线刻度环） */
    ctx.save();
    ctx.translate(cx, footY + 2 * sc);
    var pedG = ctx.createRadialGradient(0, 0, 2, 0, 0, 56 * sc);
    pedG.addColorStop(0, glowCol);
    pedG.addColorStop(0.5, 'rgba(245, 166, 61, 0.22)');
    pedG.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pedG;
    ctx.beginPath();
    ctx.ellipse(0, 0, 56 * sc, 15 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = glowCol;
    ctx.lineWidth = Math.max(1.5, 1.8 * sc);
    ctx.beginPath();
    ctx.ellipse(0, 0, 44 * sc, 11 * sc, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -tick * 0.35;
    ctx.beginPath();
    ctx.ellipse(0, 0, 52 * sc, 14 * sc, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* 3. 漂浮余烬粒子 */
    for (var ei = 0; ei < 10; ei += 1) {
      var ep = (tick * 0.008 + ei * 0.13) % 1;
      var ex = W * (0.18 + ((ei * 37) % 64) / 100) + Math.sin(tick * 0.04 + ei) * 6;
      var ey = footY - ep * H * 0.72;
      ctx.fillStyle = glowCol;
      ctx.globalAlpha = (1 - ep) * 0.55;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.2, 1.8 * sc * (1 - ep * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* 4. 10 级解锁无人机浮游炮（未满 10 级或卸下时不显示！） */
    if (vg.warcar && vg.droneCol >= 0 && IMG.drone_weapons) {
      var drHover = Math.sin(tick * 0.065) * 6 * sc;
      var drFrame = Math.floor(tick / 14) % 2;
      var drW = 48 * sc;
      var drH = 36 * sc;
      ctx.drawImage(IMG.drone_weapons, vg.droneCol * 96, drFrame * 72, 96, 72, cx - 58 * sc, footY - 104 * sc + drHover, drW, drH);
    }

    /* 5. 完整站立的全身主角（完整头到脚 + 真实装备图层穿卸！） */
    var shMax = heroDef.shootFrames || 6;
    var frameIdx = Math.floor(tick / 11) % shMax;
    var phase = frameIdx / shMax;
    var bobY = Math.sin(phase * Math.PI * 2) * 1.5 * sc;
    var pGunImg = (vg.primary && st.primaryGun) ? IMG[DATA.getWeaponImgKey(st.primaryGun)] : null;
    var sGunImg = (vg.secondary && st.secondaryGun) ? IMG[DATA.getWeaponImgKey(st.secondaryGun)] : null;

    ctx.save();
    ctx.translate(cx, footY);
    drawModularGearAndBody(ctx, {
      sheetKey: heroDef.shootSheet, fw: heroDef.fw, fh: heroDef.fh, scale: sc,
      frameIdx: frameIdx, tick: tick,
      visualGear: vg, backGunImg: sGunImg,
      gearBobY: bobY, gearLeanX: 0
    });

    /* 6. 双手与主战枪械（穿戴主枪：英姿手持对应漫画神枪；卸下主枪：双臂自由垂放空手格斗待命姿！） */
    var sleeveCol = vg.armor ? TIER_SLEEVE_COLORS[Math.max(0, Math.min(5, vg.armorTier || 0))] : (heroDef.sleeve || '#546848');
    var gloveCol = heroDef.glove || '#f4d2b4';
    var shY = -51 * sc + bobY;

    if (pGunImg) {
      var aim = -0.05 + Math.sin(tick * 0.045) * 0.035;
      ctx.save();
      ctx.translate(0, shY);
      ctx.rotate(aim);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      /* 后手托护木 */
      ctx.strokeStyle = '#141822'; ctx.lineWidth = 10.5 * sc;
      ctx.beginPath(); ctx.moveTo(2 * sc, 0); ctx.lineTo(14 * sc, 7 * sc); ctx.lineTo(25 * sc, 4.5 * sc); ctx.stroke();
      ctx.strokeStyle = sleeveCol; ctx.lineWidth = 6 * sc;
      ctx.beginPath(); ctx.moveTo(2 * sc, 0); ctx.lineTo(14 * sc, 7 * sc); ctx.lineTo(23 * sc, 4.8 * sc); ctx.stroke();
      ctx.fillStyle = gloveCol; ctx.strokeStyle = '#141822'; ctx.lineWidth = 2.2 * sc;
      ctx.beginPath(); ctx.arc(25.5 * sc, 4.5 * sc, 5 * sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      /* 真实当前主枪高清贴图 */
      ctx.drawImage(pGunImg, -16 * sc, -19 * sc, 80 * sc, 32 * sc);

      /* 前手握扳机 */
      ctx.strokeStyle = '#141822'; ctx.lineWidth = 11.5 * sc;
      ctx.beginPath(); ctx.moveTo(-6 * sc, -1 * sc); ctx.lineTo(1 * sc, 7.5 * sc); ctx.lineTo(9.5 * sc, 6 * sc); ctx.stroke();
      ctx.strokeStyle = sleeveCol; ctx.lineWidth = 7 * sc;
      ctx.beginPath(); ctx.moveTo(-6 * sc, -1 * sc); ctx.lineTo(1 * sc, 7.5 * sc); ctx.lineTo(8 * sc, 6 * sc); ctx.stroke();
      ctx.fillStyle = gloveCol; ctx.strokeStyle = '#141822'; ctx.lineWidth = 2.2 * sc;
      ctx.beginPath(); ctx.arc(9.5 * sc, 5.5 * sc, 5 * sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      /* 卸下主枪后的真实空手备战姿势（双臂自然下垂微曲，直观展示裸手素体！） */
      var swing = Math.sin(tick * 0.05) * 2.2 * sc;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      /* 后臂 */
      ctx.strokeStyle = '#141822'; ctx.lineWidth = 10.5 * sc;
      ctx.beginPath(); ctx.moveTo(13 * sc, shY); ctx.lineTo(18 * sc, shY + 11 * sc); ctx.lineTo(16 * sc + swing, shY + 21 * sc); ctx.stroke();
      ctx.strokeStyle = sleeveCol; ctx.lineWidth = 6 * sc;
      ctx.beginPath(); ctx.moveTo(13 * sc, shY); ctx.lineTo(18 * sc, shY + 11 * sc); ctx.lineTo(16 * sc + swing, shY + 20 * sc); ctx.stroke();
      ctx.fillStyle = gloveCol; ctx.strokeStyle = '#141822'; ctx.lineWidth = 2.2 * sc;
      ctx.beginPath(); ctx.arc(16 * sc + swing, shY + 22 * sc, 4.8 * sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      /* 前臂 */
      ctx.strokeStyle = '#141822'; ctx.lineWidth = 11 * sc;
      ctx.beginPath(); ctx.moveTo(-13 * sc, shY); ctx.lineTo(-18 * sc, shY + 12 * sc); ctx.lineTo(-15 * sc - swing, shY + 22 * sc); ctx.stroke();
      ctx.strokeStyle = sleeveCol; ctx.lineWidth = 6.5 * sc;
      ctx.beginPath(); ctx.moveTo(-13 * sc, shY); ctx.lineTo(-18 * sc, shY + 12 * sc); ctx.lineTo(-15 * sc - swing, shY + 21 * sc); ctx.stroke();
      ctx.fillStyle = gloveCol; ctx.strokeStyle = '#141822'; ctx.lineWidth = 2.2 * sc;
      ctx.beginPath(); ctx.arc(-15 * sc - swing, shY + 23 * sc, 5 * sc, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    /* 7. 实时穿卸/强化反馈光波特效 */
    if (burstFx && burstFx.ticks > 0) {
      var p = 1 - burstFx.ticks / 22;
      var by = burstFx.slot === 'helmet' ? (footY - 82 * sc) : (burstFx.slot === 'armor' || burstFx.slot === 'chip' ? (footY - 52 * sc) : (footY - 54 * sc));
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = burstFx.color || '#ffe566';
      ctx.lineWidth = Math.max(2, (5 - p * 3.5) * sc);
      ctx.beginPath();
      ctx.arc(cx, by, (14 + p * 54) * sc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  global.EM_RENDER = {
    getCamX: getCamX,
    preloadAllWithProgress: preloadAllWithProgress,
    renderGame: renderGame,
    renderPaperdollStage: renderPaperdollStage,
    buildResultPosterDataUrl: buildResultPosterDataUrl
  };
})(window);
