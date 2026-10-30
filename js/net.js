/* 富饶之城 · 在线联机（房间服务 + WebSocket）
 *
 * 房主建房 → 得到一个 4 位房号与分享链接 → 朋友点链接/输入房号即进房。
 * 对局逻辑仍在房主浏览器里运算，服务端只做座位管理与消息转发。
 * 服务地址在 index.html 中通过 window.CIT_NET_SERVER 配置。
 */
(function () {
  var CIT = (window.CIT = window.CIT || {});
  var E = CIT.Engine;
  var Net = (CIT.Net = {});

  var SEAT_KEY = 'cit_seat_';

  var sm = {
    role: null,        // host | guest
    room: '',
    count: 4,
    seat: -1,
    ws: null,
    open: false,
    seats: [],         // 当前在线座位
    err: '',
    started: false,
    closing: false,
    retry: 0,
    retryTimer: null,
    pulseTimer: null,
    syncSig: '',
    syncTimer: null
  };

  function $id(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function httpBase() {
    var v = String(window.CIT_NET_SERVER || '').trim().replace(/\/+$/, '');
    if (v) return v;
    // 未显式配置时默认同源：前端与房间服务合一部署在同一域名下直接可用
    if (/^https?:$/.test(location.protocol)) return location.origin;
    return '';
  }
  function wsBase() {
    return httpBase().replace(/^http/, 'ws');
  }
  function configured() {
    return /^https?:\/\//.test(httpBase());
  }
  function shareLink() {
    var base = location.origin + location.pathname + '?room=' + sm.room;
    // 本地调试时把服务地址一起带给被邀请的人，线上不生效
    var net = new URLSearchParams(location.search).get('net');
    return net ? base + '&net=' + encodeURIComponent(net) : base;
  }
  function readSeat(room) {
    try {
      var v = localStorage.getItem(SEAT_KEY + room);
      return v == null ? null : Number(v);
    } catch (e) { return null; }
  }
  function saveSeat(room, seat) {
    try { localStorage.setItem(SEAT_KEY + room, String(seat)); } catch (e) { /* ignore */ }
  }

  function qrSVG(text) {
    try {
      if (typeof qrcode !== 'function') return '';
      var qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    } catch (e) {
      return '';
    }
  }
  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  /* ---------------- 房间界面 ---------------- */

  function showRoom(html) {
    var el = $id('netroom');
    if (!el) return;
    el.innerHTML = '<div class="net-card">' + html + '</div>';
    el.classList.remove('hidden');
    var start = $id('start');
    if (start) start.classList.add('hidden');
  }
  function hideRoom() {
    var el = $id('netroom');
    if (!el) return;
    el.classList.add('hidden');
    el.innerHTML = '';
  }
  function netErr(msg) {
    sm.err = msg || '';
    var box = $id('net-room-err');
    if (box) { box.textContent = sm.err; box.classList.toggle('hidden', !sm.err); }
  }
  function backToStart() {
    sm.closing = true;
    sm.role = null;
    stopPulse();
    if (sm.ws) { try { sm.ws.close(1000, 'leave'); } catch (e) {} sm.ws = null; }
    clearTimeout(sm.retryTimer);
    hideRoom();
    var s = $id('start');
    if (s) s.classList.remove('hidden');
  }
  function bindBack() {
    var b = $id('net-back');
    if (b) b.addEventListener('click', backToStart);
  }

  Net.openLobby = function (count) {
    sm.count = count || 4;
    sm.err = '';
    sm.role = null;
    sm.started = false;
    showRoom(
      '<div class="net-head"><span class="net-kicker">在线联机</span>' +
      '<button class="net-close" id="net-back">返回</button></div>' +
      '<h2>建房间，发链接</h2>' +
      '<p class="net-sub">房主创建房间后把链接发到群里，朋友点开就进房。真人 1–3 位，剩余座位由 AI 补全。</p>' +
      '<div class="net-choice">' +
      '<button class="btn primary" id="net-host">创建房间（我是房主）</button>' +
      '<button class="btn" id="net-join">输入房号加入</button>' +
      '</div>' +
      '<p class="net-tip" id="net-room-err"></p>'
    );
    bindBack();
    $id('net-host').addEventListener('click', function () { Net.createRoom(); });
    $id('net-join').addEventListener('click', function () { Net.showJoin(); });
    if (!configured()) {
      netErr('联机服务地址未配置（index.html 里的 CIT_NET_SERVER）');
    }
  };

  Net.showJoin = function () {
    showRoom(
      '<div class="net-head"><span class="net-kicker">加入房间</span>' +
      '<button class="net-close" id="net-back">返回</button></div>' +
      '<h2>输入 4 位房号</h2>' +
      '<p class="net-sub">有分享链接的话直接点链接进来更快。</p>' +
      '<input class="net-textarea" id="net-code-input" maxlength="4" autocapitalize="characters" ' +
      'autocomplete="off" placeholder="例如 A3KD" style="height:44px;text-align:center;' +
      'font-size:18px;letter-spacing:.2em;color:#f2dfae">' +
      '<div class="net-error hidden" id="net-room-err"></div>' +
      '<button class="btn primary" id="net-join-go">进入房间</button>'
    );
    bindBack();
    var input = $id('net-code-input');
    function go() {
      var code = (input.value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{3,8}$/.test(code)) return netErr('房号格式不对');
      netErr('');
      Net.joinRoom(code);
    }
    $id('net-join-go').addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
  };

  /* ---------------- 建房 / 进房 ---------------- */

  Net.createRoom = async function () {
    sm.role = 'host';
    sm.started = false;
    sm.seat = 0;
    sm.seats = [];
    sm.retry = 0;
    if (!configured()) {
      netErr('联机服务地址未配置（index.html 里的 CIT_NET_SERVER）');
      return;
    }
    showRoom('<h2>创建房间…</h2><p class="net-sub">正在分配房号</p>');
    try {
      var res = await fetch(httpBase() + '/api/room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: sm.count })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data || !data.code) throw new Error((data && data.error) || '创建失败，请重试');
      sm.room = data.code;
      connect(0, true);
    } catch (e) {
      showRoom(
        '<div class="net-head"><button class="net-close" id="net-back">返回</button></div>' +
        '<h2>创建失败</h2><p class="net-sub">' + esc(e.message) + '</p>'
      );
      bindBack();
    }
  };

  Net.joinRoom = function (code) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,8}$/.test(code)) {
      showRoom(
        '<div class="net-head"><button class="net-close" id="net-back">返回</button></div>' +
        '<h2>房号无效</h2><p class="net-sub">请向房主要 4 位房号。</p>'
      );
      bindBack();
      return;
    }
    sm.role = 'guest';
    sm.room = code;
    sm.seat = -1;
    sm.seats = [];
    sm.started = false;
    sm.retry = 0;
    showGuestWait('正在进入房间…');
    connect(null, false);
  };

  function connect(seat, host) {
    if (!configured()) {
      showGuestWait('联机服务地址未配置');
      return;
    }
    var url = wsBase() + '/ws?room=' + encodeURIComponent(sm.room);
    if (host) {
      url += '&host=1&count=' + sm.count;
    } else if (seat != null) {
      url += '&seat=' + seat;
    } else {
      var rs = readSeat(sm.room);
      if (rs != null) url += '&resume=' + rs;
    }

    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      onClosed();
      return;
    }
    sm.ws = ws;
    sm.open = false;
    sm.closing = false;

    ws.onopen = function () {
      sm.open = true;
      sm.retry = 0;
      startPulse();
    };
    ws.onmessage = function (ev) { handle(ev.data); };
    ws.onclose = function () {
      sm.open = false;
      stopPulse();
      if (sm.ws === ws) sm.ws = null;
      onClosed();
    };
    ws.onerror = function () { /* onclose 会跟着来 */ };
  }

  function send(obj) {
    if (!sm.ws || sm.ws.readyState !== 1) return false;
    try { sm.ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function sendTo(seat, payload) {
    return send({ t: 'relay', to: seat, payload: payload });
  }

  function handle(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.t) return;

    switch (msg.t) {
      case 'room':
        sm.room = msg.room || sm.room;
        sm.seat = msg.seat;
        sm.count = msg.count || sm.count;
        sm.seats = msg.seats || [msg.seat];
        if (sm.role === 'guest') saveSeat(sm.room, sm.seat);
        renderByRole();
        break;
      case 'seats':
        sm.seats = msg.seats || [];
        renderByRole();
        break;
      case 'peer':
        if (msg.seats) sm.seats = msg.seats;
        if (sm.role === 'guest') {
          if (msg.event === 'leave' && msg.seat === 0) {
            sm.closing = true;
            showGuestWait('房主已离开房间');
          }
          break;
        }
        if (msg.event === 'join') {
          renderHostRoom();
          if (!sm.started) CIT.UI.toastMsg('玩家' + (msg.seat + 1) + ' 已进房');
          else broadcast();
        } else if (msg.event === 'leave') {
          var g = CIT.UI && CIT.UI.g;
          if (sm.started && g && !g.over) takeover(msg.seat, g);
          else renderHostRoom();
        }
        break;
      case 'payload':
        applyPayload(msg.from, msg.payload);
        break;
      case 'error':
        sm.err = msg.message || '联机出错';
        if (sm.role === 'host' && !sm.started) renderHostRoom();
        else netErr(sm.err);
        break;
      case 'closed':
        if (sm.role === 'guest' && !sm.started) {
          showGuestWait(msg.message || '房主已离开房间');
        }
        sm.closing = true;
        break;
      case 'pulse':
        break;
    }
  }

  function applyPayload(from, p) {
    if (!p || !p.t) return;
    var UI = CIT.UI;
    if (sm.role === 'host') {
      if (p.t === 'action') Net.applyAction(from, p);
      return;
    }
    if (p.t === 'state' && p.view) {
      sm.started = true;
      UI.netWelcome();
      UI.netState(p.view);
    }
  }

  function onClosed() {
    if (sm.closing || !sm.role) return;
    if (sm.retry >= 5) {
      sm.role === 'guest' ? showGuestWait('连接断开，点返回重新进房') : showHostBroken();
      return;
    }
    sm.retry++;
    var delay = Math.min(4000, 600 * sm.retry);
    if (sm.role === 'guest') showGuestWait('连接中断，正在重连…');
    else if (!sm.started) renderHostRoom();
    clearTimeout(sm.retryTimer);
    sm.retryTimer = setTimeout(function () {
      if (sm.role === 'host') connect(0, true);
      else connect(sm.seat >= 1 ? sm.seat : null, false);
    }, delay);
  }

  function showHostBroken() {
    showRoom(
      '<div class="net-head"><span class="net-kicker">房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">关闭</button></div>' +
      '<h2>与服务器的连接断开了</h2>' +
      '<p class="net-sub">刷新页面可以重新建房；对局进度无法恢复。</p>'
    );
    bindBack();
  }

  function startPulse() {
    stopPulse();
    sm.pulseTimer = setInterval(function () {
      if (sm.open) send({ t: 'pulse' });
    }, 25000);
  }
  function stopPulse() {
    clearInterval(sm.pulseTimer);
    sm.pulseTimer = null;
  }

  /* ---------------- 房主房间界面 ---------------- */

  function renderByRole() {
    if (sm.role === 'host') renderHostRoom();
    else if (sm.role === 'guest') showGuestWait(sm.started ? '' : '等待房主开始游戏…');
  }

  function seatChips() {
    return sm.seats.map(function (s) {
      return '<span>' + (s === 0 ? '房主(我)' : '玩家' + (s + 1)) + '</span>';
    }).join('');
  }

  function renderHostRoom() {
    if (sm.role !== 'host') return;
    var link = shareLink();
    var guests = sm.seats.filter(function (s) { return s !== 0; });
    var qr = qrSVG(link);
    var status = sm.open
      ? (guests.length ? '已进房 ' + guests.length + ' 位。可以开始了，空位由 AI 补上。' : '还没人进房，把链接发出去吧。')
      : '连接中断，正在重连…';

    var html =
      '<div class="net-head"><span class="net-kicker">房主 · 房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">关闭</button></div>' +
      '<h2>' + sm.count + ' 人桌 · ' + (guests.length + 1) + ' 位真人</h2>' +
      '<p class="net-sub">' + esc(status) + '</p>' +
      (qr ? '<div class="net-qr">' + qr + '</div>' : '') +
      '<div class="net-label">分享链接（发到微信即可，点开自动进房）</div>' +
      '<textarea class="net-code" id="net-link" readonly>' + esc(link) + '</textarea>' +
      '<button class="btn mini" id="net-copy-link">复制链接</button>' +
      '<button class="btn mini" id="net-copy-code">复制房号</button>' +
      '<div class="net-label">房号</div>' +
      '<p class="net-sub" style="font-size:22px;letter-spacing:.24em;color:#f2dfae;margin:0 0 4px">' +
      esc(sm.room) + '</p>' +
      '<div class="net-connected"><b>已入座</b>' + seatChips() + '</div>' +
      '<div class="net-error' + (sm.err ? '' : ' hidden') + '" id="net-room-err">' + esc(sm.err) + '</div>' +
      '<div class="net-actions">' +
      '<button class="btn' + (guests.length ? ' primary' : '') + '" id="net-start"' +
      (guests.length && sm.open ? '' : ' disabled') + '>开始游戏</button>' +
      '</div>' +
      '<p class="net-tip">开始后不能再进人；掉线的座位会自动交给 AI。</p>';

    showRoom(html);
    bindBack();
    if ($id('net-copy-link')) {
      $id('net-copy-link').addEventListener('click', function () {
        copyText(link);
        CIT.UI.toastMsg('链接已复制，去微信粘贴');
      });
    }
    if ($id('net-copy-code')) {
      $id('net-copy-code').addEventListener('click', function () {
        copyText(sm.room);
        CIT.UI.toastMsg('房号已复制');
      });
    }
    if ($id('net-start')) {
      $id('net-start').addEventListener('click', function () { Net.startGame(); });
    }
  }

  function showGuestWait(status) {
    if (sm.role !== 'guest') return;
    var code = sm.seat >= 0 ? '座位 ' + (sm.seat + 1) : '分配座位中';
    var body = status || (sm.open ? '等待房主开始游戏…' : '连接中…');
    showRoom(
      '<div class="net-head"><span class="net-kicker">房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">退出</button></div>' +
      '<h2>' + esc(code) + '</h2>' +
      '<p class="net-sub">' + esc(body) + '</p>' +
      '<div class="net-connected"><b>已入座</b>' + seatChips() + '</div>' +
      '<p class="net-tip">房主开始后会自动进入对局，这一页不用关。</p>'
    );
    bindBack();
  }

  /* ---------------- 开局与同步 ---------------- */

  Net.startGame = function () {
    var guests = sm.seats.filter(function (s) { return s !== 0; });
    if (!guests.length) { netErr('至少需要一位玩家'); return; }
    sm.started = true;
    sm.err = '';
    var count = sm.count;
    var humanIds = [0].concat(guests);
    var names = ['玩家1', '玩家2', '玩家3', '玩家4'];
    var g = E.createGame({ playerCount: count, humanIds: humanIds, names: names });
    var UI = CIT.UI;
    UI.g = g;
    UI.mode = 'net';
    UI.net = { role: 'host', seat: 0, room: sm.room };
    UI.viewId = 0;
    UI.resultsShown = false;
    UI.sheetOpen = false;
    UI.pass = null;
    UI.unlockedKey = null;
    UI.lastActive = 0;
    sm.syncSig = '';
    hideRoom();
    var s = $id('start'); if (s) s.classList.add('hidden');
    var ov = $id('overlay'); if (ov) { ov.classList.add('hidden'); ov.innerHTML = ''; }
    var ps = $id('pass'); if (ps) { ps.classList.add('hidden'); ps.innerHTML = ''; }
    UI.render();
    broadcast();
    UI.pump();
  };

  Net.applyAction = function (seat, msg) {
    var UI = CIT.UI;
    var g = UI.g;
    if (!g || g.over || !UI.net || UI.net.role !== 'host') return;
    var expected = g.pending ? g.pending.playerId : (g.humanTurn ? g.humanTurn.playerId : -1);
    if (expected !== seat) return;
    var ok = false;
    switch (msg.a) {
      case 'pick': ok = E.pickCharacter(g, msg.charId); break;
      case 'gold': ok = E.humanTakeGold(g); break;
      case 'cards': E.humanTakeCards(g); ok = true; break;
      case 'choose': ok = E.humanChooseDrawn(g, msg.uids || []); break;
      case 'build': var r = E.humanBuild(g, msg.uid); ok = !!(r && r.ok); break;
      case 'assassin': ok = E.humanAssassinate(g, msg.charId); break;
      case 'steal': ok = E.humanSteal(g, msg.charId); break;
      case 'magswap': ok = E.humanMagicianSwap(g, msg.target); break;
      case 'magdiscard': ok = E.humanMagicianDiscard(g, msg.uids || []); break;
      case 'warlord': var w = E.humanWarlordDestroy(g, msg.owner, msg.uid); ok = !!(w && w.ok); break;
      case 'lab': var l = E.humanLab(g, msg.uid); ok = !!(l && l.ok); break;
      case 'smithy': var s2 = E.humanSmithy(g); ok = !!(s2 && s2.ok); break;
      case 'end': ok = E.endHumanTurn(g); break;
    }
    UI.render();
    UI.flash();
    if (msg.a === 'pick' || msg.a === 'end') UI.pump();
    if (!ok) broadcast();
  };

  Net.sendAction = function (msg) {
    if (sm.role !== 'guest') return;
    var out = { t: 'action' };
    Object.keys(msg || {}).forEach(function (k) { out[k] = msg[k]; });
    sendTo(0, out);
  };

  /* 掉线后自动托管该座位，避免整局卡死 */
  function takeover(seat, g) {
    var p = g.players[seat];
    if (!p) return;
    if (g.pending && g.pending.playerId === seat) {
      var pick = (CIT.aiPickCharacter && CIT.aiPickCharacter(g, p)) || g.pool[0];
      E.pickCharacter(g, pick);
    } else if (g.humanTurn && g.humanTurn.playerId === seat) {
      if (!g.humanTurn.actionDone) E.humanTakeGold(g);
      var tries = 0;
      while (g.humanTurn && g.humanTurn.buildsLeft > 0 && tries++ < 4) {
        var opts = p.hand.filter(function (c) { return !E.buildIssue(p, c); });
        if (!opts.length) break;
        E.humanBuild(g, opts[0].uid);
      }
      E.endHumanTurn(g);
    }
    p.isHuman = false;
    g.humanIds = g.humanIds.filter(function (id) { return id !== seat; });
    CIT.UI.toastMsg(p.name + ' 掉线，已改由 AI 接管');
    CIT.UI.render();
    CIT.UI.pump();
    broadcast();
  }

  Net.sync = function () {
    var UI = CIT.UI;
    var g = UI.g;
    if (!g || !UI.net || UI.net.role !== 'host') return;
    var sig = [
      g.round, g.phase, g.playPtr, g.log.length, g.over, g.firstTo8, g.activeHumanId,
      g.pending ? g.pending.playerId : '',
      g.humanTurn ? (g.humanTurn.playerId + ':' + g.humanTurn.actionDone + ':' +
        g.humanTurn.buildsLeft + ':' + (g.humanTurn.drawn ? 1 : 0) + ':' +
        g.humanTurn.powerUsed + ':' + g.humanTurn.labUsed + ':' + g.humanTurn.smithyUsed) : ''
    ].join('|');
    if (sig === sm.syncSig) return;
    sm.syncSig = sig;
    clearTimeout(sm.syncTimer);
    sm.syncTimer = setTimeout(broadcast, 60);
  };

  function broadcast() {
    var UI = CIT.UI;
    var g = UI.g;
    if (!g || !UI.net || UI.net.role !== 'host') return;
    sm.seats.forEach(function (seat) {
      if (seat === 0) return;
      sendTo(seat, { t: 'state', view: buildView(g, seat) });
    });
  }
  Net.broadcast = broadcast;

  function buildView(g, seat) {
    var v = JSON.parse(JSON.stringify(g)); // rng 自动丢弃
    v.deck = [];
    v.discard = [];
    v.excludedHidden = 1;
    v.mySeat = seat;
    v.room = sm.room;
    v.humanId = seat;
    v.players.forEach(function (p) {
      delete p.style;
      if (p.id !== seat) {
        p.hand = p.hand.map(function () {
          return { uid: -1, key: '', name: '', cost: 0, type: 'special', value: 0 };
        });
        if (!p.roleRevealed) p.role = null;
      }
    });
    var ownPending = v.pending && v.pending.playerId === seat;
    if (!ownPending) { v.pending = null; v.pool = []; }
    if (!v.humanTurn || v.humanTurn.playerId !== seat) {
      v.humanTurn = null;
      v.activeHumanId = -1;
    } else {
      v.activeHumanId = seat;
    }
    v.holders = {};
    Object.keys(g.holders).forEach(function (cid) {
      var owner = g.holders[cid];
      if (g.revealed[cid] || owner === seat) v.holders[cid] = owner;
    });
    return v;
  }

  /* ---------------- 链接入口 ---------------- */

  Net.handleHash = function () {
    var code = '';
    var m = /[?&]room=([A-Za-z0-9]{3,8})/.exec(location.search || '');
    if (m) code = m[1];
    if (!code) {
      var h = /(?:^#|[#&])room=([A-Za-z0-9]{3,8})/.exec(location.hash || '');
      if (h) code = h[1];
    }
    if (!code) return false;
    Net.joinRoom(code);
    return true;
  };
})();
