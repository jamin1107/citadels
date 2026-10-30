/* 富饶之城 · 界面与交互 */
(function () {
  var CIT = window.CIT;
  var E = CIT.Engine;
  var T = CIT.TYPES;

  var COIN = '<svg class="coin-ico" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9.2" fill="#f0d79b" stroke="#8a6a2c" stroke-width="1.2"/>' +
    '<path d="M12 6.6l1.7 3.5 3.9.6-2.8 2.7.7 3.9-3.5-1.9-3.5 1.9.7-3.9-2.8-2.7 3.9-.6L12 6.6z" fill="#a67c33" opacity=".72"/></svg>';

  var POWER_LABEL = { 1: '暗杀', 2: '行窃', 3: '施法', 8: '摧毁' };

  var UI = {
    g: null,
    count: 4,
    mode: 'solo',
    viewId: 0,
    pass: null,
    unlockedKey: null,
    lastActive: null,
    timer: null,
    toastTimer: null,
    sheetOpen: false,
    sheetDismissible: false,
    resultsShown: false,
    selectedUid: null,
    netBusy: 0
  };
  CIT.UI = UI;

  var el = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function roleIcon(id) {
    var d = E.charDef(id);
    return d ? CIT.ICONS[d.key] : '';
  }

  function typeColor(card) {
    var t = T[card.type] || T.special;
    return t.color;
  }

  var ROLE_COLOR = {
    1: '#a33f39', 2: '#3f6f74', 3: '#6f4f9c', 4: '#c9a24a',
    5: '#3f6fa8', 6: '#4c7d5d', 7: '#9a6a3f', 8: '#8d3b33'
  };

  function roleColor(id) { return ROLE_COLOR[id] || '#c9a24a'; }

  function hexA(hex, a) {
    var h = String(hex).replace('#', '');
    var r = parseInt(h.substr(0, 2), 16);
    var g = parseInt(h.substr(2, 2), 16);
    var b = parseInt(h.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function cardHTML(d, o) {
    o = o || {};
    var t = T[d.type] || T.special;
    var cls = 'dcard' + (o.mini ? ' mini' : '') + (d.art ? ' has-art' : '') + (o.cls ? ' ' + o.cls : '');
    var attrs = (o.attr ? ' ' + o.attr : '') +
      (o.uid === false ? '' : ' data-uid="' + d.uid + '" data-zone="' + (o.zone || 'hand') + '"');
    var art = d.art
      ? '<img class="dc-art-img" src="' + d.art + '"' +
        (d.art2x ? ' srcset="' + d.art2x + ' 2x"' : '') +
        ' alt="" loading="lazy" decoding="async" onerror="this.classList.add(\'is-broken\')">'
      : '';
    return '<div class="' + cls + '" style="--c:' + t.color + ';--cd:' + t.deep +
      ';--cs:' + hexA(t.color, .2) + '"' + attrs + '>' +
      '<div class="dc-art">' +
      '<span class="dc-type">' + t.name + '</span>' +
      '<span class="dc-cost">' + d.cost + '</span>' +
      '<span class="dc-stars"></span>' +
      '<span class="dc-horizon"></span>' +
      (CIT.BUILDINGS[d.type] || '') + art +
      '</div>' +
      '<div class="dc-name">' + esc(d.name) + '</div>' +
      '</div>';
  }

  function charCardHTML(id, o) {
    o = o || {};
    var c = E.charDef(id);
    var col = roleColor(id);
    var cls = 'char-card' + (c.art ? ' has-art' : '') +
      (o.disabled ? ' disabled' : '') + (o.selected ? ' selected' : '');
    var bg = c.art
      ? '<span class="cc-bg"><img src="' + c.art + '"' +
        (c.art2x ? ' srcset="' + c.art2x + ' 2x"' : '') +
        ' alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'"></span>'
      : '';
    return '<button type="button" class="' + cls + '" data-char="' + id +
      '" style="--rc:' + col + ';--rcs:' + hexA(col, .34) + '">' + bg +
      '<span class="cc-rank">' + id + '</span>' +
      '<span class="cc-medal">' + CIT.ICONS[c.key] + '</span>' +
      '<span class="cc-name">' + c.name + '</span>' +
      '<span class="cc-title">' + c.title + '</span>' +
      '<span class="cc-power">' + c.short + '</span>' +
      '<span class="cc-ribbon">已排除</span>' +
      '</button>';
  }

  function exCardHTML(id) {
    var c = E.charDef(id);
    var col = roleColor(id);
    return '<div class="ex-card" style="--rc:' + col + ';--rcs:' + hexA(col, .3) + '">' +
      '<span class="ex-ico">' + CIT.ICONS[c.key] + '</span>' +
      '<span class="ex-name">' + c.name + '</span>' +
      '<span class="ex-stamp">排除</span>' +
      '</div>';
  }

  /* ---------------- 初始化 ---------------- */

  UI.init = function () {
    el.start = $('start');
    el.overlay = $('overlay');
    el.round = $('hud-round');
    el.phase = $('hud-phase');
    el.crown = $('hud-crown');
    el.opponents = $('opponents');
    el.status = $('statusbar');
    el.meta = $('board-meta');
    el.title = $('board-title');
    el.viewTabs = $('view-tabs');
    el.city = $('city');
    el.hint = $('hint-line');
    el.roleChip = $('role-chip');
    el.handTitle = $('hand-title');
    el.goldChip = $('gold-chip');
    el.hand = $('hand');
    el.actionbar = $('actionbar');
    el.eventLayer = $('event-layer');
    el.toast = $('toast');
    el.pass = $('pass');
    el.modeNote = $('mode-note');

    $('btn-start').addEventListener('click', function () {
      if (UI.mode === 'net') { CIT.Net.openLobby(UI.count); return; }
      UI.startGame(UI.count, UI.mode);
    });
    $('btn-rules').addEventListener('click', function () { UI.showHelp(); });

    var modeSeg = $('mode-seg');
    modeSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      UI.mode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(modeSeg.querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      UI.updateModeNote();
    });

    var seg = $('count-seg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-count]');
      if (!b) return;
      UI.count = parseInt(b.getAttribute('data-count'), 10);
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      UI.updateModeNote();
    });

    document.addEventListener('click', function (e) {
      var viewBtn = e.target.closest('[data-view]');
      if (viewBtn && UI.g && !UI.sheetOpen && !UI.pass) {
        UI.viewId = parseInt(viewBtn.getAttribute('data-view'), 10);
        UI.render();
        return;
      }
      var act = e.target.closest('[data-act]');
      if (act && UI.g) {
        UI.onAct(act.getAttribute('data-act'));
        return;
      }
      var card = e.target.closest('[data-uid]');
      if (card && !UI.sheetOpen) {
        var uid = parseInt(card.getAttribute('data-uid'), 10);
        var zone = card.getAttribute('data-zone');
        if (zone === 'hand') UI.onHandCard(uid);
        else UI.showCardInfo(uid);
        return;
      }
      var opp = e.target.closest('[data-opp]');
      if (opp && !UI.sheetOpen) UI.showOpponent(parseInt(opp.getAttribute('data-opp'), 10));
    });

    document.addEventListener('click', function (e) {
      if (e.target === el.overlay && UI.sheetDismissible) UI.closeSheet();
    });

    UI.updateModeNote();
    if (CIT.Net) CIT.Net.handleHash();
  };

  UI.updateModeNote = function () {
    if (!el.modeNote) return;
    var btn = $('btn-start');
    if (btn) btn.textContent = UI.mode === 'net' ? '进入局域网联机' : '开始游戏';
    if (UI.mode === 'net') {
      el.modeNote.textContent = '同一 WiFi：房主出示邀请码 → 客人扫码生成应答码 → 房主再扫应答码即连接 · AI 补位';
    } else if (UI.mode === 'duo') {
      el.modeNote.textContent = '2 位玩家轮流持机 + ' + (UI.count - 2) + ' 位 AI 城主 · 手牌与未公开角色会隐藏';
    } else {
      el.modeNote.textContent = '你 + ' + (UI.count - 1) + ' 位 AI 城主';
    }
  };

  /* ---------------- 开局 ---------------- */

  UI.startGame = function (count, mode) {
    UI.mode = mode || UI.mode || 'solo';
    UI.count = count;
    UI.restoreNetShims();
    UI.net = null;
    UI.netBusy = 0;
    var duo = UI.mode === 'duo';
    var names = ['玩家1', '玩家2', '玩家3', '玩家4'];
    var humanIds = duo ? [0, 1] : [0];
    UI.g = E.createGame({ playerCount: count, humanIds: humanIds, names: names });
    UI.resultsShown = false;
    UI.sheetOpen = false;
    UI.sheetDismissible = false;
    UI.viewId = 0;
    UI.pass = null;
    UI.unlockedKey = null;
    UI.lastActive = null;
    el.overlay.classList.add('hidden');
    el.overlay.innerHTML = '';
    el.pass.classList.add('hidden');
    el.pass.innerHTML = '';
    el.start.classList.add('hidden');
    el.toast.textContent = '';
    el.toast.classList.remove('show');
    if (el.eventLayer) el.eventLayer.innerHTML = '';
    UI.render();
    UI.pump();
  };

  UI.backHome = function () {
    UI.closeSheet(false);
    UI.restoreNetShims();
    UI.net = null;
    UI.netBusy = 0;
    UI.g = null;
    UI.pass = null;
    UI.unlockedKey = null;
    UI.lastActive = null;
    el.pass.classList.add('hidden');
    el.pass.innerHTML = '';
    clearTimeout(UI.timer);
    el.start.classList.remove('hidden');
  };

  /* ---------------- 主驱动 ---------------- */

  UI.syncView = function (g) {
    var active = g.humanTurn ? g.humanTurn.playerId : (g.pending ? g.pending.playerId : -1);
    if (active >= 0) {
      if (UI.lastActive !== active) {
        UI.viewId = active;
        UI.lastActive = active;
      }
    } else {
      UI.lastActive = -1;
    }
  };

  UI.showPass = function (g, kind, playerId, key) {
    var p = g.players[playerId];
    UI.pass = { kind: kind, playerId: playerId, key: key };
    var kicker = kind === 'draft' ? '第 ' + g.round + ' 回合 · 秘密选角' : '轮到你行动';
    var roleLine = (kind === 'turn' && g.humanTurn) ? '本轮角色：' + E.charName(g.humanTurn.charId) : '';
    el.pass.innerHTML = '<div class="pass-card">' +
      '<div class="pass-eyebrow">' + kicker + '</div>' +
      '<div class="pass-avatar">' + (playerId + 1) + '</div>' +
      '<h2>请交给 ' + esc(p.name) + '</h2>' +
      (roleLine ? '<div class="pass-role">' + roleLine + '</div>' : '') +
      '<p>其他玩家请暂时移开视线。<br>点击下方按钮后，只有 ' + esc(p.name) + ' 能看到手牌与秘密角色。</p>' +
      '<button class="btn primary" id="pass-go">我是 ' + esc(p.name) + ' · 开始</button>' +
      '</div>';
    el.pass.classList.remove('hidden');
    var btn = el.pass.querySelector('#pass-go');
    btn.addEventListener('click', function () {
      UI.unlockedKey = key;
      UI.pass = null;
      el.pass.classList.add('hidden');
      el.pass.innerHTML = '';
      UI.pump();
    });
  };

  UI.pump = function () {
    clearTimeout(UI.timer);
    var g = UI.g;
    if (!g) return;
    if (UI.net && UI.net.role === 'guest') {
      UI.render();
      UI.netGuestCheck();
      return;
    }
    if (UI.pass || UI.sheetOpen) return;
    if (g.over) { UI.render(); UI.showResults(true); return; }

    if (g.pending && g.pending.type === 'draft') {
      UI.syncView(g);
      UI.render();
      if (UI.mode === 'net' && UI.net && g.pending.playerId !== UI.net.seat) return;
      var dkey = 'draft:' + g.pending.playerId + ':' + g.round;
      if (UI.mode === 'duo' && UI.unlockedKey !== dkey) {
        UI.showPass(g, 'draft', g.pending.playerId, dkey);
        return;
      }
      UI.showDraft();
      return;
    }

    if (g.humanTurn) {
      UI.syncView(g);
      UI.render();
      if (UI.mode === 'net' && UI.net && g.humanTurn.playerId !== UI.net.seat) return;
      var tkey = 'turn:' + g.humanTurn.playerId + ':' + g.round + ':' + g.humanTurn.charId;
      if (UI.mode === 'duo' && UI.unlockedKey !== tkey) {
        UI.showPass(g, 'turn', g.humanTurn.playerId, tkey);
        return;
      }
      return;
    }

    var mark = g.log.length;
    var r = E.step(g);
    UI.syncView(g);
    UI.render();
    UI.flash(mark);

    if (g.over) { UI.showResults(true); return; }

    // 人类回合要立即盖住屏幕，避免另一位玩家看到手牌
    if (g.humanTurn) {
      var tkey2 = 'turn:' + g.humanTurn.playerId + ':' + g.round + ':' + g.humanTurn.charId;
      if (UI.mode === 'duo' && UI.unlockedKey !== tkey2) {
        UI.showPass(g, 'turn', g.humanTurn.playerId, tkey2);
      }
      return;
    }

    if (g.pending) {
      UI.timer = setTimeout(UI.pump, 520);
      return;
    }

    var delay = 820;
    if (r === 'reveal') delay = 1000;
    else if (r === 'aiTurn') delay = 1050;
    else if (r === 'draftPick') delay = 480;
    else if (r === 'roundStart') delay = 900;
    UI.timer = setTimeout(UI.pump, delay);
  };

  UI.flash = function (fromIndex) {
    var g = UI.g;
    if (!g || !g.log || !g.log.length) return;
    var logs = g.log;
    if (typeof fromIndex === 'number' && logs.length <= fromIndex) return;
    var start = typeof fromIndex === 'number' ? fromIndex : logs.length - 1;
    var ev = null;
    for (var i = logs.length - 1; i >= start; i--) {
      if (logs[i].meta) { ev = logs[i]; break; }
    }
    if (!ev) ev = logs[logs.length - 1];
    var meta = ev.meta;
    var me = g.humanIds.length === 1 ? g.players[g.humanId] : null;

    if (meta) {
      var who = function (id) {
        var p = E.playerById(g, id);
        return p ? p.name : '某位城主';
      };
      if (meta.type === 'assassinate') {
        var byMe = me && meta.byPlayer === me.id;
        UI.showEvent(byMe ? '暗杀令已发出' : '有人发出暗杀令',
          (byMe ? '目标：' : '目标【') + E.charName(meta.charId) + (byMe ? '' : '】'),
          CIT.ICONS.assassin, 'danger');
        return;
      }
      if (meta.type === 'thiefAnnounce') {
        var thiefMe = me && meta.byPlayer === me.id;
        UI.showEvent(thiefMe ? '行窃目标已锁定' : '盗贼出手了',
          '钱袋：' + E.charName(meta.charId), CIT.ICONS.thief, 'gold');
        return;
      }
      if (meta.type === 'steal') {
        var asThief = me && meta.thiefId === me.id;
        var asVictim = me && meta.victimId === me.id;
        if (asThief) {
          UI.showEvent('行窃得手', '从 ' + who(meta.victimId) + ' 处获得 ' + meta.amount + ' 金币',
            CIT.ICONS.thief, 'gain');
        } else if (asVictim) {
          UI.showEvent('钱袋被偷', who(meta.thiefId) + ' 偷走了 ' + meta.amount + ' 金币',
            CIT.ICONS.thief, 'danger');
        } else {
          UI.showEvent('盗贼得手', who(meta.victimId) + ' 失去 ' + meta.amount + ' 金币',
            CIT.ICONS.thief, 'danger');
        }
        return;
      }
      if (meta.type === 'stealMiss') {
        UI.showEvent('行窃落空',
          meta.reason === 'absent' ? '目标角色本轮未登场' : '目标身上没有金币',
          CIT.ICONS.thief, 'muted');
        return;
      }
      if (meta.type === 'killedSkip') {
        var killedMe = me && me.role === meta.charId;
        UI.showEvent(killedMe ? '你被暗杀' : '暗杀生效',
          killedMe ? '本轮跳过你的行动' : '【' + E.charName(meta.charId) + '】本轮跳过',
          CIT.ICONS.assassin, 'danger');
        return;
      }
      if (meta.type === 'killReveal') {
        UI.showEvent('身份揭晓', who(meta.playerId) + ' 的【' + E.charName(meta.charId) + '】被暗杀',
          CIT.ICONS.assassin, 'danger');
        return;
      }
      if (meta.type === 'killMiss') {
        UI.showEvent('刺杀落空', '目标角色本轮未登场', CIT.ICONS.assassin, 'muted');
        return;
      }
      if (meta.type === 'destroy') {
        UI.showEvent('王城被摧毁', who(meta.byId) + ' 拆毁了 ' + who(meta.ownerId) + ' 的【' + meta.cardName + '】',
          CIT.ICONS.warlord, 'danger');
        return;
      }
    }

    UI.toastMsg(ev.text);
  };

  UI.showEvent = function (title, sub, icon, tone) {
    if (!el.eventLayer) return;
    UI.eventUntil = Date.now() + 2600;
    el.eventLayer.innerHTML = '<div class="event-banner tone-' + (tone || 'gold') + '">' +
      '<span class="eb-ico">' + icon + '</span>' +
      '<span class="eb-body"><b>' + esc(title) + '</b><em>' + esc(sub) + '</em></span>' +
      '</div>';
    var banner = el.eventLayer.firstChild;
    if (!banner) return;
    void banner.offsetWidth;
    banner.classList.add('show');
    clearTimeout(UI.eventTimer);
    UI.eventTimer = setTimeout(function () {
      banner.classList.remove('show');
      setTimeout(function () {
        if (el.eventLayer && el.eventLayer.firstChild === banner) el.eventLayer.innerHTML = '';
      }, 320);
    }, 2600);
  };

  UI.toastMsg = function (text) {
    if (!text) return;
    if (Date.now() < (UI.eventUntil || 0)) return;
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2800);
  };

  /* ---------------- 渲染 ---------------- */

  UI.render = function () {
    var g = UI.g;
    if (!g) return;
    renderHud(g);
    renderOpponents(g);
    renderStatus(g);
    renderBoard(g);
    renderHand(g);
    renderAction(g);
    if (UI.net && UI.net.role === 'host' && CIT.Net) CIT.Net.sync();
  };

  function renderStatus(g) {
    var chips = '';
    if (!g.over && g.phase === 'play') {
      var net = UI.mode === 'net' && UI.net;
      var me = net ? g.players[UI.net.seat]
        : (g.humanIds.length === 1 ? g.players[g.humanId] : null);
      if (g.killed) {
        var mine = me && me.role === g.killed;
        var label = mine ? '你被暗杀' : (g.killedSkipped ? '已跳过' : '暗杀目标');
        var tail = mine ? '本轮跳过' : E.charName(g.killed);
        chips += '<span class="st-chip st-danger' + (mine ? ' st-mine' : '') + '">' +
          CIT.ICONS.assassin + '<b>' + label + '</b>' + tail + '</span>';
      }
      if (g.thiefTarget && !g.thiefDone) {
        chips += '<span class="st-chip st-gold">' + CIT.ICONS.thief +
          '<b>行窃目标</b>' + E.charName(g.thiefTarget) + '</span>';
      }
      if (g.bishopProtection) {
        chips += '<span class="st-chip st-blue">' + CIT.ICONS.bishop + '<b>主教庇护</b></span>';
      }
    }
    el.status.innerHTML = chips;
  }

  function renderHud(g) {
    el.round.textContent = '第 ' + Math.max(1, g.round) + ' 回合';

    var text = '准备中';
    if (g.phase === 'draft') text = '秘密选角';
    else if (g.phase === 'play') {
      if (g.humanTurn) text = g.humanIds.length > 1
        ? g.players[g.humanTurn.playerId].name + ' 的回合'
        : '你的回合';
      else text = '角色 ' + g.playPtr + ' / 8';
    } else if (g.over) text = '对局结算';
    if (g.firstTo8 != null && !g.over) text = '最后一轮 · ' + text;
    el.phase.textContent = text;
    el.phase.classList.toggle('live', !!g.humanTurn);

    var c = g.players[g.crown];
    el.crown.innerHTML = CIT.ICONS.king + '<span>皇冠 · ' + esc(c.name) + '</span>';
  }

  function renderOpponents(g) {
    var html = '';
    var net = UI.mode === 'net' && UI.net;
    var viewPid = net ? UI.net.seat : (g.humanIds.length > 1 ? UI.viewId : g.humanId);
    g.players.forEach(function (p) {
      if (p.id === viewPid) return;
      var cur = g.phase === 'play' && !g.over && g.holders[g.playPtr] === p.id;
      var role;
      if (p.roleRevealed && p.role) {
        var def = E.charDef(p.role);
        var col = roleColor(p.role);
        var faceArt = def.art
          ? '<div class="opp-role role-face has-art" style="--rc:' + col + ';--rcs:' +
            hexA(col, .32) + ';--art:url(' + def.art + ')"><b>' + def.name + '</b></div>'
          : '<div class="opp-role role-face" style="--rc:' + col + ';--rcs:' + hexA(col, .32) + '">' +
            CIT.ICONS[def.key] + '<b>' + def.name + '</b></div>';
        role = faceArt;
      } else {
        role = '<div class="role-back">?</div>';
      }
      var pct = Math.min(100, p.city.length / 8 * 100);
      html += '<div class="opp' + (cur ? ' is-current' : '') + '" data-opp="' + p.id + '">' +
        role +
        '<div class="opp-body">' +
        '<div class="opp-name">' + esc(p.name) + '</div>' +
        '<div class="opp-stats">' +
        '<span class="g">' + COIN + p.gold + '</span>' +
        '<span>牌 ' + p.hand.length + '</span>' +
        '<span>城 ' + p.city.length + '</span>' +
        '</div>' +
        '<div class="opp-bar"><i style="width:' + pct + '%"></i></div>' +
        '</div></div>';
    });
    el.opponents.innerHTML = html;
  }

  function renderBoard(g) {
    var net = UI.mode === 'net' && UI.net;
    var duo = g.humanIds.length > 1;
    var p = g.players[net ? UI.net.seat : (duo ? UI.viewId : g.humanId)];
    if (!p) return;
    var base = 0;
    p.city.forEach(function (d) { base += (d.value || d.cost); });
    el.meta.textContent = p.city.length + ' / 8 座 · ' + base + ' 分' + (duo ? ' · ' + p.gold + ' 金币' : '');

    if (el.title && el.viewTabs) {
      if (net) {
        el.title.classList.remove('hidden');
        el.viewTabs.classList.add('hidden');
        el.viewTabs.innerHTML = '';
      } else if (duo) {
        el.title.classList.add('hidden');
        el.viewTabs.classList.remove('hidden');
        el.viewTabs.innerHTML = g.humanIds.map(function (id) {
          return '<button type="button" class="view-tab' + (id === UI.viewId ? ' on' : '') +
            '" data-view="' + id + '">' + esc(g.players[id].name) + '</button>';
        }).join('');
      } else {
        el.title.classList.remove('hidden');
        el.viewTabs.classList.add('hidden');
        el.viewTabs.innerHTML = '';
      }
    }

    var html = '';
    p.city.forEach(function (d) { html += cardHTML(d, { mini: true, zone: 'city' }); });
    for (var i = p.city.length; i < 8; i++) html += '<div class="slot-empty">＋</div>';
    el.city.innerHTML = html;

    var hint = '';
    if (g.over) hint = '对局结束，点击「查看结算」查看本局得分。';
    else if (g.phase === 'draft') {
      if (net) {
        hint = g.pending
          ? (g.pending.playerId === UI.net.seat ? '从剩余角色中秘密选择一位。'
            : '正在由 ' + g.players[g.pending.playerId].name + ' 秘密选角…')
          : '等待其他玩家选角…';
      } else if (duo && g.pending) {
        hint = '正在由 ' + g.players[g.pending.playerId].name + ' 秘密选角…';
      } else {
        hint = '从剩余角色中秘密选择一位，其余角色会被后续城主取走。';
      }
    } else if (g.humanTurn) {
      if (net) {
        if (g.humanTurn.playerId === UI.net.seat) {
          if (!g.humanTurn.actionDone) hint = '先执行行动：拿 2 金币，或抽 2 张保留 1 张。';
          else if (g.humanTurn.buildsLeft > 0) hint = '点击下方手牌即可建造，本回合还可建造 ' + g.humanTurn.buildsLeft + ' 座。';
          else hint = '本回合建造次数已用完。你仍可使用角色能力，然后结束回合。';
        } else {
          hint = '正在等待 ' + g.players[g.humanTurn.playerId].name + ' 行动…';
        }
      } else if (!duo || g.humanTurn.playerId === p.id) {
        if (!g.humanTurn.actionDone) hint = '先执行行动：拿 2 金币，或抽 2 张保留 1 张。';
        else if (g.humanTurn.buildsLeft > 0) hint = '点击下方手牌即可建造，本回合还可建造 ' + g.humanTurn.buildsLeft + ' 座。';
        else hint = '本回合建造次数已用完。你仍可使用角色能力，然后结束回合。';
      } else {
        hint = '正在等待 ' + g.players[g.humanTurn.playerId].name + ' 行动…';
      }
    } else hint = '等待其他城主行动……';
    el.hint.textContent = hint;
  }

  function renderHand(g) {
    var net = UI.mode === 'net' && UI.net;
    var duo = g.humanIds.length > 1;
    var ht = g.humanTurn;
    var active = ht ? g.players[ht.playerId] : null;
    var viewed = g.players[net ? UI.net.seat : (duo ? UI.viewId : g.humanId)];
    if (!viewed) return;

    var mineTurn = net ? !!(ht && ht.playerId === UI.net.seat) : true;
    var canBuild = !!(ht && mineTurn && ht.actionDone && ht.buildsLeft > 0);
    var goldP = net ? viewed : (active || viewed);
    el.goldChip.innerHTML = COIN + '<span>' + goldP.gold + '</span>';
    if (el.handTitle) {
      el.handTitle.textContent = net ? '手牌'
        : (duo ? (active ? active.name + ' 的手牌' : '手牌已隐藏') : '手牌');
    }

    var rp = net ? viewed : (duo ? (active || viewed) : viewed);
    var roleVisible = net ? !!rp.role : (duo ? !!(rp.role && rp.roleRevealed) : !!rp.role);
    if (roleVisible) {
      var def = E.charDef(rp.role);
      var dead = g.killed === rp.role && (net || !duo);
      el.roleChip.className = 'role-chip' + (dead ? ' is-killed' : '');
      el.roleChip.innerHTML = CIT.ICONS[def.key] + '<span>' + def.name + '</span>' +
        (dead ? '<i class="dead-ico">' + CIT.ICONS.assassin + '</i>' : '');
    } else {
      el.roleChip.className = 'role-chip';
      el.roleChip.innerHTML = '<span>' + (duo && !net ? '角色隐藏' : '待选角') + '</span>';
    }

    if (duo && !net && !active) {
      var counts = g.humanIds.map(function (id) {
        return '<span>' + esc(g.players[id].name) + ' · ' + g.players[id].hand.length + ' 张</span>';
      }).join('');
      el.hand.innerHTML = '<div class="hand-locked">' + counts +
        '<em>轮到持机玩家时才会显示手牌</em></div>';
      return;
    }

    var p = net ? viewed : (duo ? active : viewed);
    if (!p) return;
    var cards = p.hand.slice().sort(function (a, b) { return a.cost - b.cost || a.name.localeCompare(b.name); });
    if (!cards.length) {
      el.hand.innerHTML = '<div class="hand-empty">暂无手牌</div>';
      return;
    }
    el.hand.innerHTML = cards.map(function (c) {
      var cls = '';
      if (canBuild) cls = E.buildIssue(p, c) ? 'unaffordable' : 'buildable';
      return cardHTML(c, { cls: cls });
    }).join('');
  }

  function renderAction(g) {
    if (g.over) {
      el.actionbar.innerHTML = '<div class="ab-top"><span class="role-tag">对局结束</span>' +
        '<span class="ab-hint">' + (g.firstTo8 != null ? '最后一轮已完成' : '') + '</span></div>' +
        '<div class="ab-btns"><button class="btn primary" data-act="results">查看结算</button></div>';
      return;
    }

    if (g.pending && g.pending.type === 'draft') {
      var dwait = g.humanIds.length > 1 && g.pending
        ? '等待 ' + g.players[g.pending.playerId].name + ' 选角…'
        : '正在秘密选择角色…';
      el.actionbar.innerHTML = '<div class="wait-row"><span class="pulse-dot"></span>' + dwait + '</div>';
      return;
    }

    if (!g.humanTurn) {
      var netMode = UI.mode === 'net' && UI.net;
      var me = netMode ? g.players[UI.net.seat]
        : (g.humanIds.length === 1 ? g.players[g.humanId] : null);
      if (g.phase === 'play' && me && me.role && me.role === g.killed) {
        el.actionbar.innerHTML = '<div class="wait-row is-dead">' + CIT.ICONS.assassin +
          '<span>你的【' + E.charName(me.role) + '】被暗杀，本轮跳过</span></div>';
        return;
      }
      var wait = '等待其他城主行动…';
      if (g.phase === 'play') {
        var holder = g.holders[g.playPtr];
        if (holder != null && g.revealed[g.playPtr]) {
          wait = '【' + E.charName(g.playPtr) + '】' + g.players[holder].name + ' 行动中…';
        } else {
          wait = '等待第 ' + g.playPtr + ' 顺位角色登场…';
        }
      }
      el.actionbar.innerHTML = '<div class="wait-row"><span class="pulse-dot"></span>' + wait + '</div>';
      return;
    }

    var ht = g.humanTurn;
    var net = UI.mode === 'net' && UI.net;
    if (net && ht.playerId !== UI.net.seat) {
      el.actionbar.innerHTML = '<div class="wait-row"><span class="pulse-dot"></span>等待 ' +
        esc(g.players[ht.playerId].name) + ' 行动…</div>';
      return;
    }
    var p = g.players[ht.playerId];
    var def = E.charDef(ht.charId);
    var top = '<div class="ab-top"><span class="role-tag">' + CIT.ICONS[def.key] + def.name + '</span>' +
      '<span class="ab-hint">' + (ht.actionDone ? '剩余建造 ' + ht.buildsLeft + ' 次' : '选择行动') + '</span></div>';

    var btns = '';
    if (!ht.actionDone) {
      btns += '<button class="btn primary" data-act="gold"><span class="act-k">行动一</span>拿 2 金币</button>';
      btns += '<button class="btn" data-act="cards"><span class="act-k">行动二</span>抽 2 选 1</button>';
      if (POWER_LABEL[ht.charId] && !ht.powerUsed) {
        btns += '<button class="btn" data-act="power" style="flex:0 0 76px">' + POWER_LABEL[ht.charId] + '</button>';
      }
    } else {
      if (POWER_LABEL[ht.charId] && !ht.powerUsed) {
        btns += '<button class="btn" data-act="power" style="flex:0 1 92px">' + POWER_LABEL[ht.charId] + '</button>';
      }
      if (E.has(p, 'lab') && !ht.labUsed) {
        btns += '<button class="btn" data-act="lab" style="flex:0 1 84px">实验室</button>';
      }
      if (E.has(p, 'smithy') && !ht.smithyUsed && p.gold >= 2) {
        btns += '<button class="btn" data-act="smithy" style="flex:0 1 84px">铁匠铺</button>';
      }
      btns += '<button class="btn primary" data-act="end" style="flex:1 1 120px">结束回合</button>';
    }

    el.actionbar.innerHTML = top + '<div class="ab-btns">' + btns + '</div>';
  }

  /* ---------------- 主界面交互 ---------------- */

  UI.onAct = function (act) {
    var g = UI.g;
    if (!g) return;

    if (act === 'help') { UI.showHelp(); return; }
    if (act === 'log') { UI.showLog(); return; }
    if (act === 'results') { UI.resultsShown = false; UI.showResults(true); return; }

    var ht = g.humanTurn;
    var p = ht ? g.players[ht.playerId] : E.humanPlayer(g);
    if (UI.mode === 'net' && UI.net && (!ht || ht.playerId !== UI.net.seat)) return;

    if (act === 'gold') {
      if (!ht) return;
      if (E.humanTakeGold(g)) { UI.render(); UI.flash(); }
      return;
    }
    if (act === 'cards') {
      if (!ht) return;
      var res = E.humanTakeCards(g);
      UI.render();
      UI.flash();
      if (res && res.cards && res.cards.length && ht.drawn) UI.showDrawPick(res.cards, res.keep);
      return;
    }
    if (act === 'power') { UI.openPower(); return; }
    if (act === 'end') {
      if (!ht) return;
      if (E.endHumanTurn(g)) {
        UI.unlockedKey = null;
        UI.render();
        UI.pump();
      }
      return;
    }
    if (act === 'lab') { UI.showLabPicker(); return; }
    if (act === 'smithy') {
      var r = E.humanSmithy(g);
      UI.render();
      UI.flash();
      if (!r.ok) UI.toastMsg(r.msg);
      return;
    }
  };

  UI.onHandCard = function (uid) {
    var g = UI.g;
    if (!g) return;
    var ht = g.humanTurn;
    if (UI.mode === 'net' && UI.net && (!ht || ht.playerId !== UI.net.seat)) {
      UI.showCardInfo(uid);
      return;
    }
    if (ht && !ht.actionDone) {
      UI.toastMsg('请先执行行动：拿金币或抽卡');
      return;
    }
    if (ht && ht.actionDone && ht.buildsLeft > 0) {
      UI.showBuildConfirm(uid);
      return;
    }
    UI.showCardInfo(uid);
  };

  /* ---------------- 弹层基础 ---------------- */

  UI.openSheet = function (o) {
    clearTimeout(UI.timer);
    UI.sheetOpen = true;
    UI.sheetDismissible = !!o.dismissible;
    el.overlay.innerHTML = '<div class="sheet">' +
      '<div class="sheet-grab"></div>' +
      '<div class="sheet-head"><h2>' + o.title + '</h2>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div>' +
      '<div class="sheet-body">' + o.body + '</div>' +
      (o.footer ? '<div class="sheet-foot">' + o.footer + '</div>' : '') +
      '</div>';
    el.overlay.classList.remove('hidden');
    if (o.onMount) o.onMount(el.overlay.querySelector('.sheet'));
  };

  UI.closeSheet = function (resume) {
    UI.sheetOpen = false;
    UI.sheetDismissible = false;
    el.overlay.classList.add('hidden');
    el.overlay.innerHTML = '';
    if (resume !== false && UI.g) UI.pump();
  };

  /* ---------------- 选角 ---------------- */

  UI.showDraft = function () {
    var g = UI.g;
    if (!g || !g.pending || g.pending.type !== 'draft') return;
    var options = g.pending.options.slice().sort(function (a, b) { return a - b; });
    var excluded = g.excludedKnown.slice();

    var body = '<div class="ex-block">' +
      '<div class="ex-head"><span>本回合排除的角色</span><em>这 3 位不会登场</em></div>' +
      '<div class="ex-row">' +
      '<div class="ex-card ex-back"><span class="ex-q">?</span><span class="ex-name">未知</span></div>' +
      excluded.map(function (id) { return exCardHTML(id); }).join('') +
      '</div></div>' +
      '<div class="char-grid">' + options.map(function (id) { return charCardHTML(id); }).join('') + '</div>' +
      '<div class="char-note" id="char-note">点击角色查看能力。选中的角色只有你自己知道。</div>';

    var duo = g.humanIds.length > 1;
    var picker = g.players[g.pending.playerId];

    UI.openSheet({
      title: duo ? picker.name + ' · 秘密选角' : '秘密选择角色',
      sub: '可用 ' + options.length + ' 位 · 排除 3 位。点选后其余角色会传给下一位城主。' +
        (UI.mode === 'duo' ? '请确认只有 ' + picker.name + ' 在看屏幕。' : ''),
      body: body,
      footer: '<button class="btn primary" id="draft-confirm" disabled>确认选择</button>',
      onMount: function (root) {
        var sel = null;
        var note = root.querySelector('#char-note');
        var confirm = root.querySelector('#draft-confirm');
        root.querySelectorAll('[data-char]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            sel = parseInt(btn.getAttribute('data-char'), 10);
            root.querySelectorAll('[data-char]').forEach(function (x) { x.classList.remove('selected'); });
            btn.classList.add('selected');
            var c = E.charDef(sel);
            note.innerHTML = '<b style="color:#f2dfae">' + c.name + ' · ' + c.title + '</b><br>' + c.detail;
            confirm.disabled = false;
          });
        });
        confirm.addEventListener('click', function () {
          if (sel == null) return;
          if (!E.pickCharacter(g, sel)) return;
          UI.unlockedKey = null;
          UI.closeSheet(false);
          UI.render();
          UI.pump();
        });
      }
    });
  };

  /* ---------------- 行动：抽牌保留 ---------------- */

  UI.showDrawPick = function (cards, keep) {
    var picked = [];
    var body = '<div class="hand-picks" id="draw-picks">' +
      cards.map(function (c) { return cardHTML(c, { uid: false, cls: '', attr: 'data-draw="' + c.uid + '"' }); }).join('') +
      '</div><p class="muted-note">从抽到的 ' + cards.length + ' 张中保留 ' + keep + ' 张，其余放回牌堆底部。</p>';

    UI.openSheet({
      title: '抽牌行动',
      sub: '点击选择要保留的地区卡。',
      body: body,
      footer: '<button class="btn primary" id="draw-confirm" disabled>保留 ' + keep + ' 张</button>',
      onMount: function (root) {
        var btn = root.querySelector('#draw-confirm');
        root.querySelectorAll('[data-draw]').forEach(function (elCard) {
          elCard.addEventListener('click', function () {
            var uid = parseInt(elCard.getAttribute('data-draw'), 10);
            var idx = picked.indexOf(uid);
            if (idx >= 0) { picked.splice(idx, 1); elCard.classList.remove('selected'); }
            else if (picked.length < keep) { picked.push(uid); elCard.classList.add('selected'); }
            btn.disabled = picked.length !== keep;
            btn.textContent = '保留 ' + picked.length + ' / ' + keep + ' 张';
          });
        });
        btn.addEventListener('click', function () {
          if (picked.length !== keep) return;
          if (!E.humanChooseDrawn(UI.g, picked)) return;
          UI.closeSheet(false);
          UI.render();
          UI.flash();
        });
      }
    });
  };

  /* ---------------- 角色能力 ---------------- */

  UI.openPower = function () {
    var g = UI.g;
    var ht = g && g.humanTurn;
    if (!ht) return;
    if (ht.charId === 1) return assassinPicker(g, ht);
    if (ht.charId === 2) return thiefPicker(g, ht);
    if (ht.charId === 3) return magicianPicker(g, ht);
    if (ht.charId === 8) return warlordPicker(g, ht);
    UI.toastMsg('这个角色没有主动技能');
  };

  function assassinPicker(g, ht) {
    var ids = [1, 2, 3, 4, 5, 6, 7, 8].filter(function (id) { return id !== ht.charId; });
    var body = '<p class="muted-note">被选中的角色本轮直接跳过，不会获得金币也不会建造。灰色角色已知不在场。</p>' +
      '<div class="char-grid">' + ids.map(function (id) {
        return charCardHTML(id, { disabled: g.excludedKnown.indexOf(id) >= 0 });
      }).join('') + '</div>';
    charPicker({
      title: '暗杀',
      sub: '选择一位角色。刺客不能刺杀自己。',
      body: body,
      ids: ids,
      canPick: function (id) { return g.excludedKnown.indexOf(id) < 0; },
      onConfirm: function (id) {
        if (!E.humanAssassinate(g, id)) { UI.toastMsg('无法选择该角色'); return; }
        UI.closeSheet(false); UI.render(); UI.flash();
      }
    });
  }

  function thiefPicker(g, ht) {
    var ids = [1, 2, 3, 4, 5, 6, 7, 8].filter(function (id) {
      return id !== 1 && id !== g.killed && id !== ht.charId && g.excludedKnown.indexOf(id) < 0;
    });
    var body = '<p class="muted-note">不能选择刺客、刺客的目标，或自己持有的角色。对方行动开始前，其金币全部归你。</p>' +
      '<div class="char-grid">' + ids.map(function (id) { return charCardHTML(id); }).join('') + '</div>';
    charPicker({
      title: '行窃',
      sub: '选择一位角色的钱袋。',
      body: body,
      ids: ids,
      canPick: function () { return true; },
      onConfirm: function (id) {
        if (!E.humanSteal(g, id)) { UI.toastMsg('无法选择该角色'); return; }
        UI.closeSheet(false); UI.render(); UI.flash();
      }
    });
  }

  function charPicker(o) {
    UI.openSheet({
      title: o.title,
      sub: o.sub,
      body: o.body,
      footer: '<button class="btn ghost" id="pick-cancel">放弃</button>' +
        '<button class="btn primary" id="pick-ok" disabled style="flex:2 1 0">确认</button>',
      dismissible: true,
      onMount: function (root) {
        var sel = null;
        var ok = root.querySelector('#pick-ok');
        root.querySelectorAll('[data-char]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-char'), 10);
            if (!o.canPick(id)) { UI.toastMsg('该角色已知不在场'); return; }
            sel = id;
            root.querySelectorAll('[data-char]').forEach(function (x) { x.classList.remove('selected'); });
            btn.classList.add('selected');
            ok.disabled = false;
          });
        });
        ok.addEventListener('click', function () { if (sel != null) o.onConfirm(sel); });
        root.querySelector('#pick-cancel').addEventListener('click', function () { UI.closeSheet(); });
      }
    });
  }

  function magicianPicker(g, ht) {
    var p = E.humanPlayer(g);
    var others = g.players.filter(function (o) { return o.id !== p.id; });
    var body = '<div class="group-label"><span>交换全部手牌</span><span>对方手牌数公开</span></div>' +
      '<div class="pick-list">' + others.map(function (o) {
        return '<button type="button" class="pick-row" data-swap="' + o.id + '">' +
          '<span class="pr-ico">' + CIT.ICONS.magician + '</span>' +
          '<span class="pr-main"><span class="pr-title">' + esc(o.name) + '</span>' +
          '<span class="pr-sub">手牌 ' + o.hand.length + ' 张 · 金币 ' + o.gold + '</span></span></button>';
      }).join('') + '</div>' +
      '<div class="group-label"><span>弃牌重抽</span><span>可多选</span></div>' +
      '<div class="hand-picks">' + p.hand.map(function (c) {
        return cardHTML(c, { uid: false, attr: 'data-mag="' + c.uid + '"' });
      }).join('') + '</div>' +
      '<p class="muted-note">选择一名玩家交换整手牌；或选择若干手牌弃掉，再抽等量的新牌。点空白处关闭 = 放弃能力。</p>';

    UI.openSheet({
      title: '施法',
      sub: '魔术师可以交换手牌，或弃牌换取新牌。',
      body: body,
      footer: '<button class="btn" id="mag-swap" disabled>交换手牌</button>' +
        '<button class="btn primary" id="mag-discard" disabled>重抽 0 张</button>',
      dismissible: true,
      onMount: function (root) {
        var swapId = null;
        var picked = [];
        var swapBtn = root.querySelector('#mag-swap');
        var discBtn = root.querySelector('#mag-discard');

        root.querySelectorAll('[data-swap]').forEach(function (row) {
          row.addEventListener('click', function () {
            swapId = parseInt(row.getAttribute('data-swap'), 10);
            root.querySelectorAll('[data-swap]').forEach(function (x) { x.classList.remove('selected'); });
            row.classList.add('selected');
            swapBtn.disabled = false;
            // 交换与弃牌互斥
            picked = [];
            root.querySelectorAll('[data-mag]').forEach(function (x) { x.classList.remove('selected'); });
            discBtn.disabled = true;
            discBtn.textContent = '重抽 0 张';
          });
        });

        root.querySelectorAll('[data-mag]').forEach(function (card) {
          card.addEventListener('click', function () {
            var uid = parseInt(card.getAttribute('data-mag'), 10);
            var idx = picked.indexOf(uid);
            if (idx >= 0) { picked.splice(idx, 1); card.classList.remove('selected'); }
            else { picked.push(uid); card.classList.add('selected'); }
            discBtn.disabled = picked.length === 0;
            discBtn.textContent = '重抽 ' + picked.length + ' 张';
            if (picked.length) {
              swapId = null;
              root.querySelectorAll('[data-swap]').forEach(function (x) { x.classList.remove('selected'); });
              swapBtn.disabled = true;
            }
          });
        });

        swapBtn.addEventListener('click', function () {
          if (swapId == null) return;
          if (!E.humanMagicianSwap(g, swapId)) { UI.toastMsg('交换失败'); return; }
          UI.closeSheet(false); UI.render(); UI.flash();
        });

        discBtn.addEventListener('click', function () {
          if (!picked.length) return;
          if (!E.humanMagicianDiscard(g, picked)) { UI.toastMsg('弃牌失败'); return; }
          UI.closeSheet(false); UI.render(); UI.flash();
        });
      }
    });
  }

  function warlordPicker(g, ht) {
    var p = E.humanPlayer(g);
    var targets = E.humanWarlordTargets(g).filter(function (t) { return t.ownerId !== p.id; });
    if (!targets.length) {
      UI.toastMsg('没有可以摧毁的地区');
      return;
    }
    var byOwner = {};
    targets.forEach(function (t) {
      (byOwner[t.ownerId] = byOwner[t.ownerId] || []).push(t);
    });

    var body = '';
    Object.keys(byOwner).forEach(function (pid) {
      var owner = E.playerById(g, Number(pid));
      body += '<div class="group-label"><span>' + esc(owner.name) + '</span><span>' + owner.city.length + ' 座地区</span></div>' +
        '<div class="pick-list">' + byOwner[pid].map(function (t) {
          var can = p.gold >= t.cost;
          return '<button type="button" class="pick-row' + (can ? '' : ' disabled') + '" data-dist="' + t.district.uid + '" data-owner="' + t.ownerId + '">' +
            '<span class="pr-ico" style="color:' + typeColor(t.district) + '">' + CIT.BUILDINGS[t.district.type] + '</span>' +
            '<span class="pr-main"><span class="pr-title">' + esc(t.district.name) + '</span>' +
            '<span class="pr-sub">造价 ' + t.district.cost + ' · ' + T[t.district.type].name + '</span></span>' +
            '<span class="pr-cost' + (can ? '' : ' warn') + '">' + t.cost + ' 金币</span></button>';
        }).join('') + '</div>';
    });
    body += '<p class="muted-note">摧毁费用 = 造价 - 1。主教所在城市、已建成 8 座的城市与堡垒不可摧毁；长城会让费用 +1。</p>';

    UI.openSheet({
      title: '摧毁地区',
      sub: '选择要付钱拆毁的地区。',
      body: body,
      footer: '<button class="btn ghost" id="w-cancel">放弃</button>' +
        '<button class="btn primary" id="w-ok" disabled style="flex:2 1 0">确认摧毁</button>',
      dismissible: true,
      onMount: function (root) {
        var sel = null;
        var ok = root.querySelector('#w-ok');
        root.querySelectorAll('[data-dist]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            sel = { owner: parseInt(btn.getAttribute('data-owner'), 10), uid: parseInt(btn.getAttribute('data-dist'), 10) };
            root.querySelectorAll('[data-dist]').forEach(function (x) { x.classList.remove('selected'); });
            btn.classList.add('selected');
            var cost = root.querySelectorAll('[data-dist]').length ? btn.querySelector('.pr-cost').textContent : '';
            ok.textContent = '确认吞并（' + cost + '）';
            ok.disabled = false;
          });
        });
        ok.addEventListener('click', function () {
          if (!sel) return;
          var r = E.humanWarlordDestroy(g, sel.owner, sel.uid);
          if (!r.ok) { UI.toastMsg(r.msg); return; }
          UI.closeSheet(false); UI.render(); UI.flash();
        });
        root.querySelector('#w-cancel').addEventListener('click', function () { UI.closeSheet(); });
      }
    });
  }

  /* ---------------- 实验室 ---------------- */

  UI.showLabPicker = function () {
    var g = UI.g;
    var p = E.humanPlayer(g);
    if (!p || !p.hand.length) { UI.toastMsg('没有手牌可弃'); return; }
    var body = '<div class="hand-picks">' + p.hand.map(function (c) {
      return cardHTML(c, { uid: false, attr: 'data-lab="' + c.uid + '"' });
    }).join('') + '</div><p class="muted-note">丢弃 1 张手牌，获得 1 金币。每回合一次。</p>';

    UI.openSheet({
      title: '实验室',
      sub: '弃 1 张手牌换 1 金币。',
      body: body,
      footer: '<button class="btn ghost" id="lab-cancel">取消</button>',
      dismissible: true,
      onMount: function (root) {
        root.querySelectorAll('[data-lab]').forEach(function (card) {
          card.addEventListener('click', function () {
            var uid = parseInt(card.getAttribute('data-lab'), 10);
            var r = E.humanLab(g, uid);
            if (!r.ok) { UI.toastMsg(r.msg); return; }
            UI.closeSheet(false); UI.render(); UI.flash();
          });
        });
        root.querySelector('#lab-cancel').addEventListener('click', function () { UI.closeSheet(); });
      }
    });
  };

  /* ---------------- 建造确认 ---------------- */

  UI.showBuildConfirm = function (uid) {
    var g = UI.g;
    var p = E.humanPlayer(g);
    var card = null;
    p.hand.forEach(function (c) { if (c.uid === uid) card = c; });
    if (!card) return;

    var issue = E.buildIssue(p, card);
    var t = T[card.type];
    var note = card.type === 'special' ? (CIT.SPECIAL_NOTES[card.key] || '') : '';
    var body = '<div style="display:flex;gap:14px;align-items:flex-start">' +
      '<div style="flex:0 0 96px">' + cardHTML(card, { uid: false }) + '</div>' +
      '<div style="flex:1 1 auto;min-width:0;font-size:11px;line-height:1.7;color:#9ba5b7">' +
      '<b style="font-family:' + "'Songti SC',serif" + ';font-size:15px;color:#f2dfae;letter-spacing:.08em">' + esc(card.name) + '</b><br>' +
      t.name + '地区 · 造价 ' + card.cost + ' 金币<br>终局计分 ' + (card.value || card.cost) + ' 分' +
      (note ? '<br><span style="color:#d8b166">' + note + '</span>' : '') +
      (issue ? '<br><span style="color:#c25a50">' + issue + '</span>' : '') +
      '</div></div>';

    UI.openSheet({
      title: '建造地区',
      sub: '支付造价后放入你的王城。',
      body: body,
      footer: '<button class="btn ghost" id="build-cancel">取消</button>' +
        '<button class="btn primary" id="build-ok" ' + (issue ? 'disabled' : '') + ' style="flex:2 1 0">建造（-' + card.cost + ' 金币）</button>',
      dismissible: true,
      onMount: function (root) {
        root.querySelector('#build-cancel').addEventListener('click', function () { UI.closeSheet(); });
        var ok = root.querySelector('#build-ok');
        ok.addEventListener('click', function () {
          var r = E.humanBuild(g, uid);
          if (!r.ok) { UI.toastMsg(r.msg); return; }
          UI.closeSheet(false);
          UI.render();
          UI.flash();
        });
      }
    });
  };

  /* ---------------- 信息面板 ---------------- */

  UI.showCardInfo = function (uid) {
    var g = UI.g;
    var card = null;
    var owner = null;
    g.players.forEach(function (p) {
      p.hand.forEach(function (c) { if (c.uid === uid) { card = c; owner = p; } });
    });
    if (!card) return;
    var t = T[card.type];
    var note = card.type === 'special' ? (CIT.SPECIAL_NOTES[card.key] || '') : '';
    var body = '<div style="display:flex;gap:14px">' +
      '<div style="flex:0 0 96px">' + cardHTML(card, { uid: false }) + '</div>' +
      '<div style="flex:1 1 auto;font-size:11px;line-height:1.7;color:#9ba5b7">' +
      '<b style="font-family:' + "'Songti SC',serif" + ';font-size:15px;color:#f2dfae;letter-spacing:.08em">' + esc(card.name) + '</b><br>' +
      t.name + '地区 · 造价 ' + card.cost + ' 金币<br>终局计分 ' + (card.value || card.cost) + ' 分' +
      (note ? '<br><span style="color:#d8b166">' + note + '</span>' : '') +
      '</div></div>';
    UI.openSheet({
      title: '地区卡',
      sub: owner && owner.isHuman ? '这张牌在你的手中。' : '来自你的手牌。',
      body: body,
      footer: '<button class="btn ghost" id="info-close">关闭</button>',
      dismissible: true,
      onMount: function (root) {
        root.querySelector('#info-close').addEventListener('click', function () { UI.closeSheet(); });
      }
    });
  };

  UI.showOpponent = function (pid) {
    var g = UI.g;
    var p = E.playerById(g, pid);
    if (!p) return;
    var role = p.roleRevealed && p.role
      ? E.charDef(p.role).name
      : '未知（尚未登场）';
    var body = '<div class="group-label"><span>' + esc(p.name) + ' 的王城</span>' +
      '<span>' + p.city.length + ' 座 · 金币 ' + p.gold + ' · 手牌 ' + p.hand.length + '</span></div>' +
      (p.city.length
        ? '<div class="city">' + p.city.map(function (d) { return cardHTML(d, { mini: true, uid: false }); }).join('') + '</div>'
        : '<p class="muted-note">这座城市还空空如也。</p>') +
      '<p class="muted-note">本回合角色：' + role + '</p>';

    UI.openSheet({
      title: '查看城主',
      sub: '城市与资源都是公开信息，角色则可能仍在暗处。',
      body: body,
      footer: '<button class="btn ghost" id="opp-close">关闭</button>',
      dismissible: true,
      onMount: function (root) {
        root.querySelector('#opp-close').addEventListener('click', function () { UI.closeSheet(); });
      }
    });
  };

  /* ---------------- 联机（客人侧） ---------------- */

  UI.netWelcome = function () {};

  UI.netState = function (view) {
    if (!view) return;
    var first = !(UI.net && UI.net.role === 'guest');
    UI.g = view;
    UI.mode = 'net';
    if (first) {
      UI.net = { role: 'guest', seat: view.mySeat, room: view.room };
      UI.installNetShims();
      UI.resultsShown = false;
      UI.sheetOpen = false;
      UI.pass = null;
      UI.unlockedKey = null;
      UI.lastActive = view.mySeat;
      var s = $('start'); if (s) s.classList.add('hidden');
      var nr = $('netroom'); if (nr) { nr.classList.add('hidden'); nr.innerHTML = ''; }
      var ov = $('overlay'); if (ov) { ov.classList.add('hidden'); ov.innerHTML = ''; }
      var ps = $('pass'); if (ps) { ps.classList.add('hidden'); ps.innerHTML = ''; }
    }
    UI.netBusy = 0;
    UI.viewId = view.mySeat;
    UI.render();
    UI.flash();
    UI.netGuestCheck();
  };

  UI.netGuestCheck = function () {
    var g = UI.g;
    if (!g || !UI.net || UI.net.role !== 'guest') return;
    if (g.over) { UI.showResults(); return; }
    if (UI.sheetOpen) return;
    if (UI.netBusy && Date.now() - UI.netBusy < 4000) return;
    if (g.pending && g.pending.playerId === UI.net.seat) { UI.showDraft(); return; }
    if (g.humanTurn && g.humanTurn.playerId === UI.net.seat && g.humanTurn.drawn) {
      UI.showDrawPick(g.humanTurn.drawn.cards, g.humanTurn.drawn.keep);
    }
  };

  UI.installNetShims = function () {
    if (!UI.netOrig) {
      UI.netOrig = {};
      ['humanTakeGold', 'humanTakeCards', 'humanChooseDrawn', 'humanBuild', 'endHumanTurn',
        'pickCharacter', 'humanAssassinate', 'humanSteal', 'humanMagicianSwap',
        'humanMagicianDiscard', 'humanWarlordDestroy', 'humanLab', 'humanSmithy'
      ].forEach(function (k) { UI.netOrig[k] = E[k]; });
    }
    var send = function (msg) {
      UI.netBusy = Date.now();
      if (CIT.Net) CIT.Net.sendAction(msg);
    };
    E.humanTakeGold = function () { send({ a: 'gold' }); return true; };
    E.humanTakeCards = function () { send({ a: 'cards' }); return null; };
    E.humanChooseDrawn = function (g, uids) { send({ a: 'choose', uids: uids }); return true; };
    E.humanBuild = function (g, uid) { send({ a: 'build', uid: uid }); return { ok: true }; };
    E.endHumanTurn = function () { send({ a: 'end' }); return true; };
    E.pickCharacter = function (g, id) { send({ a: 'pick', charId: id }); return true; };
    E.humanAssassinate = function (g, id) { send({ a: 'assassin', charId: id }); return true; };
    E.humanSteal = function (g, id) { send({ a: 'steal', charId: id }); return true; };
    E.humanMagicianSwap = function (g, pid) { send({ a: 'magswap', target: pid }); return true; };
    E.humanMagicianDiscard = function (g, uids) { send({ a: 'magdiscard', uids: uids }); return true; };
    E.humanWarlordDestroy = function (g, owner, uid) { send({ a: 'warlord', owner: owner, uid: uid }); return { ok: true }; };
    E.humanLab = function (g, uid) { send({ a: 'lab', uid: uid }); return { ok: true }; };
    E.humanSmithy = function () { send({ a: 'smithy' }); return { ok: true }; };
  };

  UI.restoreNetShims = function () {
    if (!UI.netOrig) return;
    Object.keys(UI.netOrig).forEach(function (k) { E[k] = UI.netOrig[k]; });
    UI.netOrig = null;
  };

  /* ---------------- 结算 ---------------- */

  UI.showResults = function (force) {
    var g = UI.g;
    if (!g || !g.results) return;
    if (UI.resultsShown && !force) return;
    if (g.results && g.results.length && UI.sheetOpen && !force) return;
    UI.resultsShown = true;

    var duo = g.humanIds.length > 1;
    var net = UI.mode === 'net' && UI.net;
    var rows = g.results.map(function (r, i) {
      var isMe = net ? (r.id === UI.net.seat) : (r.isHuman && !duo);
      return '<div class="score-row' + (r.winner ? ' win' : '') + '">' +
        '<div class="score-rank">' + (r.winner ? '♛' : (i + 1)) + '</div>' +
        '<div class="score-main"><div class="score-name' + (isMe ? ' you' : '') + '">' +
        esc(r.name) + (isMe ? '（你）' : '') + '</div>' +
        '<div class="score-sub">' + r.districts + ' 座地区 · 基础 ' + r.base +
        ' + 五色 ' + r.colorBonus + ' + 八座 ' + r.firstBonus + '</div></div>' +
        '<div class="score-total">' + r.total + '</div></div>';
    }).join('');

    var winLine = '得分最高的城主获得胜利。';
    if (net) {
      if (g.results[0].winner && g.results[0].id === UI.net.seat) winLine = '你的王城赢得了本局荣耀。';
    } else if (!duo && g.results[0].winner && g.results[0].isHuman) {
      winLine = '你的王城赢得了本局荣耀。';
    }

    UI.openSheet({
      title: '王城结算',
      sub: winLine,
      body: rows + '<p class="muted-note">计分规则：全部地区造价之和；集齐五色 +3；首位建成 8 座 +4，其余达成 8 座 +2。同分并列。</p>',
      footer: net
        ? '<button class="btn primary" id="res-home">返回首页</button>'
        : '<button class="btn ghost" id="res-home">回到首页</button>' +
          '<button class="btn primary" id="res-again" style="flex:2 1 0">再来一局</button>',
      onMount: function (root) {
        root.querySelector('#res-home').addEventListener('click', function () {
          UI.closeSheet(false);
          UI.backHome();
        });
        var again = root.querySelector('#res-again');
        if (again) {
          again.addEventListener('click', function () {
            UI.closeSheet(false);
            UI.startGame(UI.count, UI.mode);
          });
        }
      }
    });
  };

  /* ---------------- 日志 / 规则 ---------------- */

  UI.showLog = function () {
    var g = UI.g;
    if (!g) return;
    var html = '<div class="log-list">';
    var last = 0;
    g.log.forEach(function (l) {
      if (l.round !== last) {
        last = l.round;
        html += '<div class="log-round">第 ' + last + ' 回合</div>';
      }
      html += '<div class="log-item ' + l.kind + '">' + esc(l.text) + '</div>';
    });
    html += '</div>';

    UI.openSheet({
      title: '对局日志',
      sub: '完整的公开信息记录。',
      body: html,
      footer: '<button class="btn ghost" id="log-close">关闭</button>',
      dismissible: true,
      onMount: function (root) {
        root.querySelector('#log-close').addEventListener('click', function () { UI.closeSheet(); });
        var body = root.querySelector('.sheet-body');
        body.scrollTop = body.scrollHeight;
      }
    });
  };

  UI.showHelp = function () {
    var flow = CIT.copy.rules.filter(function (r) { return r.indexOf('计分') !== 0; }).map(function (r, i) {
      return '<div class="rule-item"><span>' + (i + 1) + '</span><span>' + esc(r) + '</span></div>';
    }).join('');

    var roles = CIT.CHARACTERS.map(function (c) {
      return '<div class="help-role">' +
        '<img src="' + c.art + '"' +
        (c.art2x ? ' srcset="' + c.art2x + ' 2x"' : '') +
        ' alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
        '<div class="hr-body"><div class="hr-rank">No.' + c.id + '</div>' +
        '<div class="hr-name">' + esc(c.name) + '</div>' +
        '<div class="hr-power">' + esc(c.short) + '</div></div></div>';
    }).join('');

    var colors = ['noble', 'religious', 'trade', 'military', 'special'].map(function (t) {
      var ty = CIT.TYPES[t];
      return '<span class="help-color"><i style="background:' + ty.color + '"></i>' + ty.name + '</span>';
    }).join('');

    var dists = CIT.DISTRICTS.filter(function (d) { return d.type === 'special'; }).map(function (d) {
      return '<div class="help-dist">' +
        '<img src="' + d.art + '"' +
        (d.art2x ? ' srcset="' + d.art2x + ' 2x"' : '') +
        ' alt="" loading="lazy" decoding="async" onerror="this.classList.add(\'is-broken\')">' +
        '<div class="hd-body"><div class="hd-name">' + esc(d.name) +
        (d.value >= 8 ? ' <b class="hd-pts">+8</b>' : '') + '</div>' +
        '<div class="hd-note">' + esc(d.note || '') + '</div></div></div>';
    }).join('');

    UI.openSheet({
      title: '规则速览',
      sub: '复刻经典桌游《富饶之城》，建成最富饶的王城。',
      body:
        '<div class="group-label"><span>基本流程</span></div>' + flow +
        '<div class="group-label"><span>五色城区</span></div>' +
        '<div class="help-colors">' + colors + '</div>' +
        '<p class="muted-note" style="padding-top:6px">国王-贵族 · 主教-宗教 · 商人-商业 · 军阀-军事：城里每有 1 座对应颜色地区，收工资时多拿 1 金币。</p>' +
        '<div class="group-label"><span>八位角色（按 1→8 顺序行动）</span></div>' +
        '<div class="help-roles">' + roles + '</div>' +
        '<div class="group-label"><span>特殊建筑（紫卡）</span></div>' +
        '<div class="help-dists">' + dists + '</div>' +
        '<div class="group-label"><span>计分</span></div>' +
        '<div class="rule-item"><span>①</span><span>建筑分：每座城计卡面造价；巨龙门 / 大学建造需 6 金币，终局计 8 分。</span></div>' +
        '<div class="rule-item"><span>②</span><span>集齐五色 +3 分，鬼城可顶替任意缺失颜色。</span></div>' +
        '<div class="rule-item"><span>③</span><span>首位建成 8 座 +4 分，其余建成 8 座 +2 分；本轮结束即结算。</span></div>' +
        '<p class="muted-note">暗杀与行窃目标会显示在棋盘上方状态条；被暗杀者的身份在本轮结束时揭晓。被暗杀时你的角色标签与行动栏会变红。<br><br>双人同屏：每回合两位玩家各自秘密选角；轮到谁行动时把手机交给谁。未到回合的一方手牌、未公开角色会被隐藏，但仍建议另一位玩家自觉不看屏幕。<br><br>3 人桌同样以 8 座地区结束；官方 2 人双角色模式未包含。</p>',
      footer: '<button class="btn ghost" id="help-close">关闭</button>',
      dismissible: true,
      onMount: function (root) {
        root.querySelector('#help-close').addEventListener('click', function () { UI.closeSheet(); });
      }
    });
  };

  document.addEventListener('DOMContentLoaded', UI.init);
})();
