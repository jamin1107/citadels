/* 富饶之城 · 无服务器联机（WebRTC 手动交换邀请码） */
(function () {
  var CIT = (window.CIT = window.CIT || {});
  var E = CIT.Engine;
  var Net = (CIT.Net = {});

  var RESP_PREFIX = 'citadels_resp_';
  /* 手机之间互联：仅靠 mDNS 本机候选经常失败（部分路由隔离组播），补 STUN 拿公网候选 */
  var ICE = { iceServers: [
    { urls: ['stun:stun.qq.com:3478', 'stun:stun.miwifi.com:3478'] },
    { urls: 'stun:stun.l.google.com:19302' }
  ] };
  var respChan = null;
  try { respChan = new BroadcastChannel('citadels_resp'); } catch (e) {}
  var sm = {
    role: null,          // host | guest
    room: '',
    count: 4,
    peers: {},           // seat -> {pc, dc, connected, code}
    openSeat: null,
    guestPc: null,
    guestDc: null,
    guestSeat: null,
    answerCode: '',
    connectedSeats: [],
    syncSig: '',
    syncTimer: null,
    err: ''
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function randRoom() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 4; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    var s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  async function pack(obj) {
    var json = JSON.stringify(obj);
    if (typeof CompressionStream !== 'undefined') {
      try {
        var stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        var buf = await new Response(stream).arrayBuffer();
        return 'z' + b64url(new Uint8Array(buf));
      } catch (e) {}
    }
    return 'j' + b64url(new TextEncoder().encode(json));
  }
  async function unpack(code) {
    code = String(code || '').trim();
    if (!code) throw new Error('邀请码为空');
    var kind = code.charAt(0);
    var bytes = fromB64url(code.slice(1));
    var json;
    if (kind === 'z') {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      json = await new Response(stream).text();
    } else if (kind === 'j') {
      json = new TextDecoder().decode(bytes);
    } else {
      throw new Error('邀请码格式无法识别');
    }
    return JSON.parse(json);
  }
  function waitIce(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') return resolve();
      var done = false;
      function check() {
        if (done) return;
        if (pc.iceGatheringState === 'complete') {
          done = true;
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      }
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(function () {
        if (!done) { done = true; resolve(); }
      }, 5000);
    });
  }
  function makeUrl(hash) {
    return location.origin + location.pathname + location.search + hash;
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
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------------- 房间界面 ---------------- */

  function showRoom(html) {
    var el = $('netroom');
    if (!el) return;
    el.innerHTML = '<div class="net-card">' + html + '</div>';
    el.classList.remove('hidden');
    var start = $('start');
    if (start) start.classList.add('hidden');
  }
  function hideRoom() {
    var el = $('netroom');
    if (!el) return;
    el.classList.add('hidden');
    el.innerHTML = '';
  }
  function netErr(msg) {
    sm.err = msg || '';
    var box = $('net-room-err');
    if (box) { box.textContent = sm.err; box.classList.toggle('hidden', !sm.err); }
  }

  Net.openLobby = function (count) {
    sm.count = count;
    sm.role = null;
    sm.err = '';
    showRoom(
      '<div class="net-head"><span class="net-kicker">局域网联机</span>' +
      '<button class="net-close" id="net-back">返回</button></div>' +
      '<h2>同一 WiFi，开一桌</h2>' +
      '<p class="net-sub">无需服务器。流程：房主出示邀请码 → 客人扫码生成应答码 → 房主用相机扫应答码即自动连接。' +
      '也可以全程复制/粘贴。真人 1–3 位，剩余座位由 AI 补全。</p>' +
      '<div class="net-choice">' +
      '<button class="btn primary" id="net-host">创建房间（我是房主）</button>' +
      '<button class="btn" id="net-join">加入房间（我是客人）</button>' +
      '</div>' +
      '<p class="net-tip">建议在 Safari / Chrome 中打开；手机需与房主处于同一 WiFi。</p>'
    );
    $('net-back').addEventListener('click', function () { hideRoom(); var s = $('start'); if (s) s.classList.remove('hidden'); });
    $('net-host').addEventListener('click', function () { Net.createRoom(); });
    $('net-join').addEventListener('click', function () { Net.showJoin(); });
  };

  Net.showJoin = function () {
    showRoom(
      '<div class="net-head"><span class="net-kicker">加入房间</span>' +
      '<button class="net-close" id="net-back">返回</button></div>' +
      '<h2>粘贴房主的邀请码</h2>' +
      '<p class="net-sub">如果房主给你看了二维码，直接用系统相机扫码即可自动进入此步骤。</p>' +
      '<textarea class="net-textarea" id="net-offer" placeholder="粘贴邀请码"></textarea>' +
      '<div class="net-error hidden" id="net-room-err"></div>' +
      '<button class="btn primary" id="net-gen">生成应答码</button>' +
      '<p class="net-tip">生成后把应答码发给房主（截图扫码或复制粘贴）。</p>'
    );
    $('net-back').addEventListener('click', function () { hideRoom(); var s = $('start'); if (s) s.classList.remove('hidden'); });
    $('net-gen').addEventListener('click', function () {
      var code = $('net-offer').value.trim();
      if (!code) return netErr('请先粘贴邀请码');
      netErr('');
      Net.joinWithOffer(code, false);
    });
  };

  Net.createRoom = async function () {
    sm.role = 'host';
    sm.room = randRoom();
    sm.peers = {};
    sm.connectedSeats = [];
    sm.count = sm.count || 4;
    showRoom('<h2>创建中…</h2><p class="net-sub">正在生成本机邀请码</p>');
    try {
      await openSlot(1);
    } catch (e) {
      showRoom('<h2>创建失败</h2><p class="net-sub">' + esc(e.message) + '</p>');
    }
  };

  async function openSlot(seat) {
    if (sm.openSeat && sm.peers[sm.openSeat] && !sm.peers[sm.openSeat].connected) {
      try { sm.peers[sm.openSeat].pc.close(); } catch (e) {}
      delete sm.peers[sm.openSeat];
    }
    var pc = new RTCPeerConnection(ICE);
    var dc = pc.createDataChannel('game', { ordered: true });
    var peer = { pc: pc, dc: dc, connected: false, seat: seat, code: '' };
    sm.peers[seat] = peer;
    sm.openSeat = seat;
    bindPeer(peer);
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    var code = await pack({
      v: 1, room: sm.room, seat: seat, type: 'offer',
      sdp: pc.localDescription.sdp
    });
    peer.code = code;
    renderHostRoom();
  }

  function bindPeer(peer) {
    var seat = peer.seat;
    peer.pc.onconnectionstatechange = function () {
      if (peer.pc.connectionState === 'failed' && !peer.connected) {
        netErr('座位 ' + (seat + 1) + ' 连接失败：请确认两台设备在同一 WiFi（且路由器未隔离设备），然后点「重新生成邀请码」重试。');
      }
    };
    peer.dc.onopen = function () {
      peer.connected = true;
      sm.connectedSeats = Object.keys(sm.peers).filter(function (k) {
        return sm.peers[k].connected;
      }).map(Number).sort();
      if (sm.openSeat === seat) sm.openSeat = null;
      try {
        peer.dc.send(JSON.stringify({ t: 'welcome', seat: seat, room: sm.room }));
      } catch (e) {}
      var g = CIT.UI && CIT.UI.g;
      if (g && CIT.UI.net && CIT.UI.net.role === 'host') {
        try { peer.dc.send(JSON.stringify({ t: 'state', view: buildView(g, seat) })); } catch (e) {}
      }
      renderHostRoom();
    };
    peer.dc.onclose = function () {
      peer.connected = false;
      sm.connectedSeats = sm.connectedSeats.filter(function (s) { return s !== seat; });
      var g = CIT.UI && CIT.UI.g;
      if (g && !g.over && CIT.UI.net && CIT.UI.net.role === 'host') takeover(seat, g);
      renderHostRoom();
    };
    peer.dc.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || msg.t !== 'action') return;
      Net.applyAction(seat, msg);
    };
  }

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
  }

  function renderHostRoom() {
    if (sm.role !== 'host') return;
    var seats = Object.keys(sm.peers).map(Number).sort();
    var connected = seats.filter(function (s) { return sm.peers[s].connected; });
    var open = seats.filter(function (s) { return !sm.peers[s].connected; })[0];
    var peer = open != null ? sm.peers[open] : null;
    var nextSeat = 1;
    connected.forEach(function (s) { if (s >= nextSeat) nextSeat = s + 1; });
    if (open != null && nextSeat <= open) nextSeat = open + 1;
    var canAdd = nextSeat <= sm.count - 1 && connected.length < sm.count - 1;

    var html = '<div class="net-head"><span class="net-kicker">房主 · 房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">关闭</button></div>' +
      '<h2>' + sm.count + ' 人桌 · ' + (connected.length + 1) + ' 位真人</h2>';

    if (peer) {
      var url = makeUrl('#offer=' + peer.code);
      var qr = qrSVG(url);
      html += '<p class="net-sub">让客人用系统相机扫描，或把邀请码发给他。</p>' +
        (qr ? '<div class="net-qr">' + qr + '</div>' : '<p class="net-tip">二维码过长，请复制邀请码。</p>') +
        '<div class="net-label">邀请码（座位 ' + (peer.seat + 1) + '）</div>' +
        '<textarea class="net-code" id="net-code" readonly>' + esc(peer.code) + '</textarea>' +
        '<button class="btn mini" id="net-copy-offer">复制邀请码</button>' +
        '<button class="btn mini" id="net-regen">重新生成邀请码</button>' +
        '<div class="net-label">客人回传的应答码</div>' +
        '<p class="net-tip">让客人把应答二维码给你扫（手机相机扫码后会自动回到本页连接），或粘贴应答码。</p>' +
        '<textarea class="net-textarea" id="net-answer" placeholder="粘贴客人发来的应答码"></textarea>' +
        '<button class="btn primary" id="net-connect">连接这位客人</button>';
    } else {
      html += '<p class="net-sub">' + (connected.length
        ? '已连接 ' + connected.length + ' 位客人。可以继续添加，或直接开始（其余座位由 AI 补位）。'
        : '') + '</p>';
    }

    html += '<div class="net-connected"><b>已入座</b><span>房主</span>' +
      connected.map(function (s) { return '<span>玩家' + (s + 1) + '</span>'; }).join('') +
      '</div>';

    if (canAdd && !peer) html += '<button class="btn" id="net-add">添加下一位玩家</button>';
    if (canAdd && peer) html += '<p class="net-tip">当前邀请码是座位 ' + (peer.seat + 1) + ' 的；连接后可继续添加。</p>';
    html += '<div class="net-error hidden" id="net-room-err">' + esc(sm.err) + '</div>';
    html += '<div class="net-actions">' +
      '<button class="btn' + (connected.length ? ' primary' : '') + '" id="net-start"' +
      (connected.length ? '' : ' disabled') + '>开始游戏</button>' +
      '</div>' +
      '<p class="net-tip">真人座位填满后剩余位置由 AI 补全。开始后不能再加入。</p>';

    showRoom(html);
    if ($('net-room-err') && sm.err) $('net-room-err').classList.remove('hidden');

    $('net-back').addEventListener('click', function () {
      Object.keys(sm.peers).forEach(function (k) { try { sm.peers[k].pc.close(); } catch (e) {} });
      sm.peers = {};
      sm.role = null;
      hideRoom();
      var s = $('start'); if (s) s.classList.remove('hidden');
    });
    if ($('net-copy-offer')) {
      $('net-copy-offer').addEventListener('click', function () {
        copyText(peer.code);
        CIT.UI.toastMsg('邀请码已复制');
      });
    }
    if ($('net-regen')) {
      $('net-regen').addEventListener('click', function () {
        openSlot(peer.seat).catch(function (e) { netErr(e.message); });
      });
    }
    if ($('net-connect')) {
      $('net-connect').addEventListener('click', function () {
        var code = $('net-answer').value.trim();
        if (!code) return netErr('请先粘贴应答码');
        netErr('');
        Net.applyAnswer(code, peer.seat).catch(function (e) { netErr(e.message); });
      });
    }
    if ($('net-add')) {
      $('net-add').addEventListener('click', function () {
        openSlot(nextSeat).catch(function (e) { netErr(e.message); });
      });
    }
    if ($('net-start')) {
      $('net-start').addEventListener('click', function () {
        if (!connected.length) return;
        Net.startGame();
      });
    }
  }

  Net.applyAnswer = async function (codeText, expectSeat) {
    var ans = await unpack(codeText);
    if (!ans || ans.type !== 'answer') throw new Error('这不是应答码');
    if (ans.room !== sm.room) throw new Error('应答码不属于本房间');
    if (expectSeat != null && ans.seat !== expectSeat) throw new Error('应答码座位不匹配');
    var peer = sm.peers[ans.seat];
    if (!peer) throw new Error('该座位的邀请已失效，请重新生成');
    if (peer.connected) {
      if (expectSeat != null) throw new Error('该座位已连接');
      return; // localStorage 与 BroadcastChannel 可能双触发，幂等处理
    }
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
    // 连接在 dc.onopen 中确认
  };

  /* ---------------- 客人 ---------------- */

  Net.joinWithOffer = async function (offerCode, auto) {
    sm.role = 'guest';
    showRoom('<h2>生成应答码…</h2><p class="net-sub">正在与本机建立连接</p>');
    try {
      var off = await unpack(offerCode);
      if (!off || off.type !== 'offer') throw new Error('邀请码无效');
      sm.room = off.room;
      sm.guestSeat = off.seat;
      var pc = new RTCPeerConnection(ICE);
      sm.guestPc = pc;
      pc.ondatachannel = function (ev) {
        sm.guestDc = ev.channel;
        bindGuestDc(ev.channel);
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: off.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      var code = await pack({
        v: 1, room: off.room, seat: off.seat, type: 'answer',
        sdp: pc.localDescription.sdp
      });
      sm.answerCode = code;
      renderGuestAnswer(auto);
    } catch (e) {
      showRoom('<div class="net-head"><button class="net-close" id="net-back">返回</button></div>' +
        '<h2>加入失败</h2><p class="net-sub">' + esc(e.message) + '</p>');
      $('net-back').addEventListener('click', function () { hideRoom(); var s = $('start'); if (s) s.classList.remove('hidden'); });
    }
  };

  function bindGuestDc(dc) {
    dc.onopen = function () {
      var st = $('net-guest-status');
      if (st) st.innerHTML = '<b style="color:#7fc98d">已连接房主！</b>等待房主开始游戏…';
      CIT.UI.toastMsg('已连接房主');
    };
    dc.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.t === 'welcome') {
        CIT.UI.netWelcome(msg.seat);
      } else if (msg.t === 'state') {
        CIT.UI.netState(msg.view);
      }
    };
    dc.onclose = function () {
      var st = $('net-guest-status');
      if (st) st.textContent = '连接已断开';
    };
  }

  function renderGuestAnswer(auto) {
    var url = makeUrl('#resp=' + sm.answerCode);
    var qr = qrSVG(url);
    showRoom(
      '<div class="net-head"><span class="net-kicker">客人 · 房间 ' + esc(sm.room) + '</span>' +
      '<button class="net-close" id="net-back">退出</button></div>' +
      '<h2>把应答码交给房主</h2>' +
      '<p class="net-sub">让房主用系统相机扫下面的二维码，或复制应答码发给房主。</p>' +
      (qr ? '<div class="net-qr">' + qr + '</div>' : '<p class="net-tip">二维码过长，请复制应答码。</p>') +
      '<textarea class="net-code" id="net-ans-code" readonly>' + esc(sm.answerCode) + '</textarea>' +
      '<button class="btn primary" id="net-ans-copy">复制应答码</button>' +
      '<p class="net-tip" id="net-guest-status">等待房主连接…</p>'
    );
    $('net-back').addEventListener('click', function () {
      try { if (sm.guestPc) sm.guestPc.close(); } catch (e) {}
      sm.role = null;
      hideRoom();
      var s = $('start'); if (s) s.classList.remove('hidden');
    });
    $('net-ans-copy').addEventListener('click', function () {
      copyText(sm.answerCode);
      CIT.UI.toastMsg('应答码已复制，请发给房主');
    });
    watchGuestConnection();
  }

  /* 客人端实时反馈连接进度，失败时给出可操作提示，不再无限"等待房主连接" */
  function watchGuestConnection() {
    var st = $('net-guest-status');
    if (!st) return;
    var cleared = false;
    function stop() { cleared = true; }
    sm.guestWatch = stop;
    var poll = setInterval(function () {
      var pc = sm.guestPc;
      var el = $('net-guest-status');
      if (!pc || !el || cleared || sm.role !== 'guest') { clearInterval(poll); return; }
      if (sm.guestDc && sm.guestDc.readyState === 'open') { clearInterval(poll); return; }
      var cs = pc.connectionState;
      if (cs === 'new') el.textContent = '等待房主扫应答码…';
      else if (cs === 'connecting') el.textContent = '正在与房主建立连接…';
      else if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
        clearInterval(poll);
        el.innerHTML = '<b style="color:#e08a7f">连接失败。</b>请检查：<br>' +
          '① 两台手机连的是<b>同一个 WiFi</b>（部分 WiFi 禁止设备互访）；<br>' +
          '② 房主扫完码后停留在房间页面；<br>' +
          '③ 仍不行就点右上角「退出」，房主点「重新生成邀请码」再试一次。';
      }
    }, 800);
    pcOnState();
    function pcOnState() {
      var pc = sm.guestPc;
      if (!pc) return;
      pc.onconnectionstatechange = function () {
        if (cleared) return;
        var el = $('net-guest-status');
        if (!el || (sm.guestDc && sm.guestDc.readyState === 'open')) return;
        var cs = pc.connectionState;
        if (cs === 'connecting') el.textContent = '正在与房主建立连接…';
        else if (cs === 'failed' || cs === 'disconnected' || cs === 'closed') {
          el.innerHTML = '<b style="color:#e08a7f">连接失败。</b>请检查两台手机是否同一个 WiFi，房主是否已扫码；可退出后重新扫码。';
        }
      };
    }
  }

  /* ---------------- 开局与同步 ---------------- */

  Net.startGame = function () {
    var seats = sm.connectedSeats.slice(0).sort(function (a, b) { return a - b; });
    if (!seats.length) { netErr('至少需要一位客人'); return; }
    // 关闭未使用的邀请
    Object.keys(sm.peers).forEach(function (k) {
      var p = sm.peers[Number(k)];
      if (!p.connected) { try { p.pc.close(); } catch (e) {} delete sm.peers[Number(k)]; }
    });
    sm.openSeat = null;
    var count = sm.count;
    var humanIds = [0].concat(seats);
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
    var s = $('start'); if (s) s.classList.add('hidden');
    var ov = $('overlay'); if (ov) { ov.classList.add('hidden'); ov.innerHTML = ''; }
    var ps = $('pass'); if (ps) { ps.classList.add('hidden'); ps.innerHTML = ''; }
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
    if (sm.role !== 'guest' || !sm.guestDc || sm.guestDc.readyState !== 'open') return;
    msg.t = 'action';
    try { sm.guestDc.send(JSON.stringify(msg)); } catch (e) {}
  };

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
    Object.keys(sm.peers).forEach(function (k) {
      var peer = sm.peers[Number(k)];
      if (!peer || !peer.connected || !peer.dc || peer.dc.readyState !== 'open') return;
      try {
        peer.dc.send(JSON.stringify({ t: 'state', view: buildView(g, Number(k)) }));
      } catch (e) {}
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

  /* ---------------- 扫码/哈希入口 ---------------- */

  Net.handleHash = function () {
    var h = location.hash.replace(/^#/, '');
    var i = h.indexOf('=');
    if (i < 0) return false;
    var key = h.slice(0, i);
    var val = h.slice(i + 1);
    if (!val) return false;
    if (key === 'offer') {
      sm.role = 'guest';
      Net.joinWithOffer(val, true);
      return true;
    }
    if (key === 'resp') {
      handleResp(val);
      return true;
    }
    return false;
  };

  async function handleResp(code) {
    var ans = null;
    try { ans = await unpack(code); } catch (e) {}
    var room = ans ? (ans.room || '') : '';
    if (room) {
      try { localStorage.setItem(RESP_PREFIX + room, code); } catch (e) {}
      if (respChan) {
        try { respChan.postMessage({ room: room, code: code }); } catch (e) {}
      }
    }
    /* 扫码后恰好开在房主本页（同一标签页继续是房主）时直接连接 */
    var applied = false;
    if (sm.role === 'host' && ans && ans.seat != null && sm.peers[ans.seat]) {
      try { await Net.applyAnswer(code, ans.seat); applied = true; } catch (e) {}
    }
    showRoom(
      '<div class="net-head"><span class="net-kicker">应答码</span></div>' +
      '<h2>' + (applied ? '已连接！回到房间页面即可' : '已提交给房主页面') + '</h2>' +
      '<p class="net-sub">' + (applied
        ? '应答码已在房间页面生效，请切回房主的房间页查看座位状态。'
        : '请切回房主的房间页面查看是否已连接。如果没反应，说明扫码打开了另一个浏览器 App（两个 App 的页面不互通），请复制下面的应答码，回到<b>原来开房间页面的那个浏览器</b>里粘贴。') + '</p>' +
      '<textarea class="net-code" id="net-resp-code" readonly>' + esc(code) + '</textarea>' +
      '<button class="btn primary" id="net-resp-copy">复制应答码</button>' +
      '<p class="net-tip">完成后可以关闭本页。</p>'
    );
    $('net-resp-copy').addEventListener('click', function () {
      copyText(code);
      CIT.UI.toastMsg('应答码已复制');
    });
  }

  function onRespCode(code) {
    if (sm.role !== 'host') return;
    Net.applyAnswer(code).catch(function (err) { netErr(err.message); });
  }

  if (respChan) {
    respChan.onmessage = function (ev) {
      var d = ev.data || {};
      if (!d.code) return;
      onRespCode(d.code);
    };
  }

  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(RESP_PREFIX) !== 0) return;
    var code = e.newValue;
    try { localStorage.removeItem(e.key); } catch (err) {}
    if (!code) return;
    onRespCode(code);
  });
})();
