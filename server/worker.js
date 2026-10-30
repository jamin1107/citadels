/* 富饶之城 · 在线房间服务：Cloudflare Worker + Durable Object
 *
 * 职责只有「建房 + 座位管理 + 消息转发」，对局逻辑仍由房主浏览器裁定。
 *   POST /api/room            创建房间，返回 4 位房间号
 *   GET  /ws?room=XXXX&...    房间 WebSocket
 *        host=1   房主，占 0 号座位，count=3|4
 *        resume=N 断线重连到 N 号座位
 *        seat=N   指定座位（一般不用）
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

const MAX_SEATS = 4;

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...extra }
  });
}

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  get room() {
    return (this.state.id && this.state.id.name) || '';
  }

  async meta() {
    return (await this.state.storage.get('meta')) || { count: 4 };
  }

  /* 当前在线的座位（重连瞬间同一座位可能出现两条连接，这里去重） */
  seats() {
    const out = [];
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (typeof a.seat === 'number' && out.indexOf(a.seat) < 0) out.push(a.seat);
    }
    return out.sort((x, y) => x - y);
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* 已断开 */ }
  }

  broadcast(obj, exceptSeat) {
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.seat === exceptSeat) continue;
      this.send(ws, obj);
    }
  }

  sendTo(seat, obj) {
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.seat !== seat) continue;
      this.send(ws, obj);
      return true;
    }
    return false;
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.endsWith('/init')) {
      const body = await req.json().catch(() => ({}));
      const count = Math.min(MAX_SEATS, Math.max(3, Number(body.count) || 4));
      await this.state.storage.put('meta', { count, createdAt: Date.now() });
      await this.state.storage.setAlarm(Date.now() + 6 * 3600 * 1000);
      return json({ ok: true });
    }

    if (url.pathname.endsWith('/exists')) {
      const meta = await this.state.storage.get('meta');
      return json({ exists: !!meta, count: meta ? meta.count : 0 });
    }

    if (req.headers.get('Upgrade') !== 'websocket') {
      return json({ error: '需要 websocket 连接' }, 400);
    }

    const meta = await this.meta();
    const count = Math.min(MAX_SEATS, Math.max(3, Number(meta.count) || 4));
    const current = this.seats();
    const host = url.searchParams.get('host') === '1';
    const resume = url.searchParams.get('resume');
    const wanted = url.searchParams.get('seat');

    let seat = null;
    if (host) {
      if (current.includes(0)) return this.reject('这个房间号已被占用，请重新创建');
      seat = 0;
    } else if (resume != null && !current.includes(Number(resume))) {
      const r = Number(resume);
      if (r >= 1 && r < count) seat = r;
    } else if (wanted != null && !current.includes(Number(wanted))) {
      const w = Number(wanted);
      if (w >= 1 && w < count) seat = w;
    } else {
      for (let i = 1; i < count; i++) {
        if (!current.includes(i)) { seat = i; break; }
      }
    }
    if (seat == null) return this.reject(current.length >= 1 ? '房间坐满了，等下一局吧' : '房间还没开');

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const sid = Math.random().toString(36).slice(2);
    server.serializeAttachment({ seat, sid });
    this.state.acceptWebSocket(server);

    const seats = current.concat([seat]).sort((x, y) => x - y);
    this.send(server, { t: 'room', room: this.room, seat, count, seats });
    this.broadcast({ t: 'seats', seats }, seat);
    if (seat !== 0) this.sendTo(0, { t: 'peer', event: 'join', seat });

    return new Response(null, { status: 101, webSocket: client });
  }

  /* 座位冲突也走一条可读的错误消息，客户端不用猜 close code */
  reject(message) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    this.send(server, { t: 'error', message });
    this.send(server, { t: 'closed', message });
    try { server.close(1000, 'rejected'); } catch (e) { /* ignore */ }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    const a = ws.deserializeAttachment() || {};

    if (msg.t === 'pulse') { this.send(ws, { t: 'pulse' }); return; }

    if (msg.t === 'relay' && typeof msg.to === 'number') {
      if (!this.sendTo(msg.to, { t: 'payload', from: a.seat, payload: msg.payload })) {
        this.send(ws, { t: 'peer', event: 'gone', seat: msg.to });
      }
      return;
    }

    if (msg.t === 'leave') {
      try { ws.close(1000, 'left'); } catch (e) { /* ignore */ }
    }
  }

  webSocketClose(ws) {
    const a = ws.deserializeAttachment() || {};
    if (typeof a.seat !== 'number') return;
    // 用 sid 排除正在关闭的这条连接：同座位若已有新连接（重连）则不算掉线
    let dup = false;
    const seats = [];
    for (const other of this.state.getWebSockets()) {
      const b = other.deserializeAttachment() || {};
      if (typeof b.seat !== 'number' || b.sid === a.sid) continue;
      if (seats.indexOf(b.seat) < 0) seats.push(b.seat);
      if (b.seat === a.seat) dup = true;
    }
    if (dup) return;
    this.broadcast({ t: 'peer', event: 'leave', seat: a.seat, seats: seats.sort((x, y) => x - y) }, a.seat);
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }

  async alarm() {
    for (const ws of this.state.getWebSockets()) {
      try { ws.close(1000, 'expired'); } catch (e) { /* ignore */ }
    }
    await this.state.storage.deleteAll();
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('citadels room service ok', {
        headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/room') {
      if (req.method !== 'POST') return json({ error: '只支持 POST' }, 405);
      const body = await req.json().catch(() => ({}));
      for (let i = 0; i < 8; i++) {
        const code = roomCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const probe = await (await stub.fetch('https://room/exists')).json();
        if (probe && probe.exists) continue;
        await stub.fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ count: body.count })
        });
        return json({ code });
      }
      return json({ error: '房间号生成失败，请重试' }, 503);
    }

    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-Z0-9]{3,8}$/.test(room)) return json({ error: '房间号无效' }, 400);
      const stub = env.ROOM.get(env.ROOM.idFromName(room));
      return stub.fetch(req);
    }

    return json({ error: 'not found' }, 404);
  }
};
