/* 《余烬弹匣：末日突围》多通道本地音频引擎（全端兼容，ES2017） */
(function (global) {
  'use strict';

  var settings = { master: 80, sfx: 80, music: 55 };
  var unlocked = false;
  var bgmPlaying = false;
  var bgmAudio = null;
  var pools = {};
  var lastPlayMs = {};

  var SFX_FILES = {
    click: 'assets/audio/click.mp3',
    gun: 'assets/audio/shoot_gun.mp3',
    rocket: 'assets/audio/shoot_rocket.mp3',
    laser: 'assets/audio/shoot_laser.mp3',
    lightning: 'assets/audio/shoot_lightning.mp3',
    hit: 'assets/audio/hit.mp3',
    boom: 'assets/audio/boom.mp3',
    smallBoom: 'assets/audio/small_boom.mp3',
    crazy: 'assets/audio/skill_crazy.mp3',
    missile: 'assets/audio/skill_missile.mp3',
    bomb: 'assets/audio/skill_bomb.mp3',
    heal: 'assets/audio/skill_heal.mp3',
    dropRare: 'assets/audio/drop_rare.mp3',
    upgrade: 'assets/audio/upgrade.mp3',
    levelup: 'assets/audio/levelup.mp3',
    win: 'assets/audio/win.mp3',
    fail: 'assets/audio/fail.mp3'
  };

  function vol(ch) {
    return (Math.max(0, Math.min(100, settings.master)) / 100) * (Math.max(0, Math.min(100, settings[ch])) / 100);
  }

  function ensurePool(key) {
    if (pools[key]) return pools[key];
    var src = SFX_FILES[key];
    if (!src) return null;
    var count = (key === 'gun' || key === 'hit' || key === 'smallBoom') ? 3 : 2;
    var arr = [];
    for (var c = 0; c < count; c += 1) {
      try {
        var a = new Audio();
        a.preload = 'none';
        a.src = src;
        arr.push(a);
      } catch (e) { /* 忽略 */ }
    }
    pools[key] = { list: arr, idx: 0 };
    return pools[key];
  }

  function syncBgm() {
    var v = vol('music');
    if (!bgmAudio) {
      try {
        bgmAudio = new Audio('assets/audio/bgm_main.mp3');
        bgmAudio.loop = true;
        bgmAudio.preload = 'none';
      } catch (e) { bgmAudio = null; }
    }
    if (!bgmAudio) return;
    try {
      bgmAudio.volume = Math.min(1, v * 0.62);
      if (v <= 0.01 || document.hidden || !bgmPlaying) bgmAudio.pause();
      else if (unlocked) {
        var p = bgmAudio.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) { /* 忽略 */ }
  }

  function unlock() { unlocked = true; if (bgmPlaying) syncBgm(); }

  function applySettings(next) {
    if (!next) return;
    if (typeof next.master === 'number') settings.master = next.master;
    if (typeof next.sfx === 'number') settings.sfx = next.sfx;
    if (typeof next.music === 'number') settings.music = next.music;
    syncBgm();
  }

  function play(key, minGapMs, gain) {
    var v = vol('sfx') * (gain || 1);
    if (v <= 0.01 || document.hidden || !unlocked) return;
    var now = Date.now();
    if (lastPlayMs[key] && (now - lastPlayMs[key]) < (minGapMs || 55)) return;
    lastPlayMs[key] = now;
    var pool = ensurePool(key);
    if (!pool || !pool.list.length) return;
    var a = pool.list[pool.idx % pool.list.length];
    pool.idx += 1;
    try {
      a.volume = Math.min(1, v);
      a.currentTime = 0;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* 忽略 */ }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && bgmAudio) { try { bgmAudio.pause(); } catch (e) {} }
    else if (!document.hidden && bgmPlaying) syncBgm();
  });

  global.EM_AUDIO = {
    unlock: unlock,
    applySettings: applySettings,
    startBgm: function () { bgmPlaying = true; syncBgm(); },
    stopBgm: function () { bgmPlaying = false; syncBgm(); },
    playClick: function () { play('click', 40, 0.7); },
    playShoot: function (wType) {
      if (wType === 'rocket' || wType === 'grenade') play('rocket', 110, 0.65);
      else if (wType === 'laser' || wType === 'sniper') play('laser', 95, 0.6);
      else if (wType === 'lightning') play('lightning', 110, 0.65);
      else play('gun', 65, 0.44);
    },
    playHit: function () { play('hit', 75, 0.42); },
    playBoom: function (big) { play(big ? 'boom' : 'smallBoom', big ? 140 : 85, big ? 0.86 : 0.58); },
    playSkill: function (id) {
      if (id === 'crazy') play('crazy', 200, 0.88);
      else if (id === 'missile') play('missile', 200, 0.88);
      else if (id === 'nuke') play('bomb', 250, 0.95);
      else play('heal', 200, 0.85);
    },
    playDropRare: function () { play('dropRare', 180, 0.88); },
    playUpgrade: function () { play('upgrade', 120, 0.82); },
    playLevelup: function () { play('levelup', 220, 0.88); },
    playWin: function () { play('win', 300, 0.9); },
    playFail: function () { play('fail', 300, 0.9); }
  };
})(window);
