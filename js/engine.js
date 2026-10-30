/* 富饶之城 · 规则引擎（纯逻辑，可脱离浏览器运行） */
(function (root) {
  var CIT = (root.CIT = root.CIT || {});
  var E = (CIT.Engine = {});

  /* ---------------- 基础工具 ---------------- */

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  E.charName = function (id) {
    var c = CIT.CHARACTERS[id - 1];
    return c ? c.name : '未知角色';
  };

  E.charDef = function (id) { return CIT.CHARACTERS[id - 1]; };

  E.log = function (g, text, kind) {
    g.log.push({ round: g.round, text: text, kind: kind || '' });
    if (g.log.length > 160) g.log.shift();
    g.lastEvent = { text: text, kind: kind || '' };
  };

  E.humanPlayer = function (g) {
    return g.humanId >= 0 ? g.players[g.humanId] : null;
  };

  E.playerById = function (g, id) {
    for (var i = 0; i < g.players.length; i++) if (g.players[i].id === id) return g.players[i];
    return null;
  };

  E.has = function (p, key) {
    for (var i = 0; i < p.city.length; i++) if (p.city[i].key === key) return true;
    return false;
  };

  E.typeCount = function (p, type) {
    var n = 0;
    for (var i = 0; i < p.city.length; i++) if (p.city[i].type === type) n++;
    return n;
  };

  /* 角色收入：魔法学院可视为任意颜色 */
  E.incomeCount = function (p, type) {
    var n = E.typeCount(p, type);
    if (E.has(p, 'magic_school')) n += 1;
    return n;
  };

  E.drawTop = function (g, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      if (!g.deck.length) {
        if (!g.discard.length) break;
        g.deck = shuffle(g.discard.splice(0, g.discard.length), g.rng);
        E.log(g, '地区牌堆耗尽，弃牌堆已洗回牌堆', 'muted');
      }
      out.push(g.deck.pop());
    }
    return out;
  };

  E.putBottom = function (g, cards) {
    for (var i = cards.length - 1; i >= 0; i--) g.deck.unshift(cards[i]);
  };

  E.aiDraw = function (g, p) {
    var lib = E.has(p, 'library');
    var obs = E.has(p, 'observatory');
    var n = 2;
    var keep = 1;
    if (lib && obs) { n = 3; keep = 2; }
    else if (obs) { n = 3; keep = 1; }
    else if (lib) { n = 2; keep = 2; }

    var cards = E.drawTop(g, n);
    if (!cards.length) {
      E.log(g, p.name + ' 想抽牌，但牌堆已空', 'muted');
      return [];
    }
    if (keep > cards.length) keep = cards.length;
    cards.sort(function (a, b) { return (b.value || b.cost) - (a.value || a.cost); });
    var kept = cards.slice(0, keep);
    var rest = cards.slice(keep);
    p.hand.push.apply(p.hand, kept);
    E.putBottom(g, rest);
    E.log(g, p.name + ' 抽取 ' + cards.length + ' 张地区卡，保留 ' + kept.length + ' 张', '');
    return kept;
  };

  E.buildIssue = function (p, card) {
    if (!card) return '手牌中没有这张地区卡';
    if (p.gold < card.cost) return '金币不足（需要 ' + card.cost + ' 枚）';
    for (var i = 0; i < p.city.length; i++) {
      if (p.city[i].key === card.key) return '城中已有同名地区，不能重复建造';
    }
    return null;
  };

  E.buildDistrict = function (g, p, card) {
    p.gold -= card.cost;
    var idx = p.hand.indexOf(card);
    if (idx >= 0) p.hand.splice(idx, 1);
    card.builtRound = g.round;
    p.city.push(card);
    E.log(g, (p.isHuman ? '你' : p.name) + ' 建造了【' + card.name + '】(-' + card.cost + ' 金币)',
      p.isHuman ? 'you' : '');
    checkWinTrigger(g, p);
    return true;
  };

  E.destroyCost = function (g, owner, d) {
    var cost = Math.max(0, d.cost - 1);
    if (d.key !== 'great_wall' && E.has(owner, 'great_wall')) cost += 1;
    return cost;
  };

  E.isBishopProtected = function (g, owner) {
    return g.bishopProtection && g.holders[5] === owner.id && g.killed !== 5;
  };

  E.destroyDistrict = function (g, owner, d, by) {
    var idx = owner.city.indexOf(d);
    if (idx < 0) return false;
    owner.city.splice(idx, 1);
    g.discard.push(d);
    E.log(g, by.name + ' 摧毁了 ' + owner.name + ' 的【' + d.name + '】', 'danger');
    if (E.has(owner, 'graveyard') && owner.gold >= 1) {
      owner.gold -= 1;
      owner.hand.push(d);
      g.discard.pop();
      E.log(g, owner.name + ' 用【墓地】花 1 金币收回【' + d.name + '】', 'muted');
    }
    return true;
  };

  /* ---------------- 创建对局 ---------------- */

  E.createGame = function (opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var count = Math.max(3, Math.min(4, opts.playerCount || 4));
    var humanIndex = opts.humanIndex === undefined ? 0 : opts.humanIndex;
    var allNames = ['你', '灰烬伯爵', '银月女爵', '锈剑骑士'];
    var players = [];
    for (var i = 0; i < count; i++) {
      players.push({
        id: i,
        name: allNames[i],
        isHuman: i === humanIndex,
        gold: 2,
        hand: [],
        city: [],
        role: null,
        roleRevealed: false,
        crown: false,
        style: {
          aggression: 0.35 + rng() * 0.5,
          greed: 0.3 + rng() * 0.5,
          build: 0.4 + rng() * 0.5
        }
      });
    }

    var deck = [];
    var uid = 0;
    CIT.DISTRICTS.forEach(function (def) {
      for (var k = 0; k < def.copies; k++) {
        var card = {
          uid: uid++,
          key: def.key,
          name: def.name,
          cost: def.cost,
          type: def.type,
          value: def.value || def.cost
        };
        deck.push(card);
      }
    });
    shuffle(deck, rng);
    players.forEach(function (p) { p.hand = deck.splice(0, 4); });

    var g = {
      rng: rng,
      players: players,
      deck: deck,
      discard: [],
      round: 0,
      crown: 0,
      phase: 'setup',
      pending: null,
      humanTurn: null,
      humanId: humanIndex,
      log: [],
      lastEvent: null,
      lastReveal: null,
      excludedKnown: [],
      excludedHidden: 0,
      pool: [],
      draftOrder: [],
      draftPtr: 0,
      holders: {},
      revealed: {},
      playPtr: 1,
      killed: null,
      thiefTarget: null,
      thiefDone: false,
      bishopProtection: false,
      firstTo8: null,
      finalRound: null,
      over: false,
      results: null
    };

    E.log(g, '对局开始 · ' + count + ' 位城主入座，每人 4 张地区卡与 2 枚金币', 'crown');
    return g;
  };

  /* ---------------- 回合开始 ---------------- */

  function beginRound(g) {
    g.round++;
    g.phase = 'draft';
    g.killed = null;
    g.thiefTarget = null;
    g.thiefDone = false;
    g.bishopProtection = false;
    g.revealed = {};
    g.holders = {};
    g.pending = null;
    g.humanTurn = null;
    g.playPtr = 1;
    g.lastReveal = null;

    g.players.forEach(function (p) {
      p.role = null;
      p.roleRevealed = false;
      p.crown = (p.id === g.crown);
    });

    /* 8 张角色卡：随机 1 张暗置排除 + 2 张公开排除（国王不可公开排除）*/
    var ids = [1, 2, 3, 4, 5, 6, 7, 8];
    shuffle(ids, g.rng);
    g.excludedHidden = ids.pop();
    var faceUp = ids.filter(function (id) { return id !== 4; });
    shuffle(faceUp, g.rng);
    g.excludedKnown = faceUp.slice(0, 2);
    g.pool = ids.filter(function (id) {
      return id !== g.excludedHidden && g.excludedKnown.indexOf(id) < 0;
    });

    g.draftOrder = [];
    for (var i = 0; i < g.players.length; i++) {
      g.draftOrder.push((g.crown + i) % g.players.length);
    }
    g.draftPtr = 0;

    E.log(g, '—— 第 ' + g.round + ' 回合 · ' + g.players[g.crown].name + ' 持有皇冠 ——', 'crown');
    E.log(g, '公开排除：' + g.excludedKnown.map(E.charName).join('、') + '（另有 1 张未知）', 'muted');
  }

  /* ---------------- 选角 ---------------- */

  function stepDraft(g) {
    if (g.draftPtr >= g.draftOrder.length) {
      g.pool = [];
      g.phase = 'play';
      g.playPtr = 1;
      E.log(g, '角色选定完毕，按照 1→8 的顺序依次行动', 'muted');
      return 'draftDone';
    }
    var pid = g.draftOrder[g.draftPtr];
    var p = g.players[pid];

    if (p.isHuman) {
      g.pending = { type: 'draft', options: g.pool.slice(0) };
      return 'pending';
    }

    var pick = (CIT.aiPickCharacter ? CIT.aiPickCharacter(g, p) : null);
    if (pick == null || g.pool.indexOf(pick) < 0) pick = g.pool[0];
    g.pool.splice(g.pool.indexOf(pick), 1);
    g.holders[pick] = p.id;
    p.role = pick;
    g.draftPtr++;
    E.log(g, p.name + ' 秘密选定了角色', '');
    return 'draftPick';
  }

  E.pickCharacter = function (g, charId) {
    if (!g.pending || g.pending.type !== 'draft') return false;
    var pid = g.draftOrder[g.draftPtr];
    if (pid === undefined) return false;
    var p = g.players[pid];
    if (!p || !p.isHuman) return false;
    var idx = g.pool.indexOf(charId);
    if (idx < 0) return false;
    g.pool.splice(idx, 1);
    g.holders[charId] = p.id;
    p.role = charId;
    g.pending = null;
    g.draftPtr++;
    E.log(g, '你选定了【' + E.charName(charId) + '】', 'you');
    return true;
  };

  /* ---------------- 角色行动 ---------------- */

  function applyPassive(g, p, cid) {
    if (cid === 4) {
      var n1 = E.incomeCount(p, 'noble');
      p.gold += n1;
      p.crown = true;
      E.log(g, p.name + ' · 国王加冕，贵族地区 ' + n1 + ' 座，+' + n1 + ' 金币', 'income');
    } else if (cid === 5) {
      var n2 = E.incomeCount(p, 'religious');
      p.gold += n2;
      g.bishopProtection = true;
      E.log(g, p.name + ' · 主教布道，宗教地区 ' + n2 + ' 座，+' + n2 + ' 金币', 'income');
    } else if (cid === 6) {
      var n3 = E.incomeCount(p, 'trade');
      p.gold += 1 + n3;
      E.log(g, p.name + ' · 商人经营，商业地区 ' + n3 + ' 座，+' + (n3 + 1) + ' 金币', 'income');
    } else if (cid === 8) {
      var n4 = E.incomeCount(p, 'military');
      p.gold += n4;
      E.log(g, p.name + ' · 军阀征税，军事地区 ' + n4 + ' 座，+' + n4 + ' 金币', 'income');
    }
  }

  function performSteal(g, targetPid) {
    var thiefPid = g.holders[2];
    var victim = g.players[targetPid];
    g.thiefDone = true;
    if (thiefPid == null) return;
    var thief = g.players[thiefPid];
    var amount = victim.gold;
    victim.gold = 0;
    thief.gold += amount;
    E.log(g, '盗贼从 ' + victim.name + ' 处偷走了 ' + amount + ' 金币', 'danger');
  }

  function startHumanTurn(g, p, cid) {
    g.humanTurn = {
      charId: cid,
      actionDone: false,
      architectDone: false,
      buildsLeft: cid === 7 ? 3 : 1,
      buildsTotal: cid === 7 ? 3 : 1,
      powerUsed: false,
      labUsed: false,
      smithyUsed: false,
      drawn: null
    };
    E.log(g, '轮到你行动 · 【' + E.charName(cid) + '】', 'you');
  }

  function stepPlay(g) {
    while (g.playPtr <= 8) {
      var cid = g.playPtr;
      var pid = g.holders[cid];
      if (pid == null) { g.playPtr++; continue; }
      var p = g.players[pid];

      if (cid === g.killed) {
        E.log(g, p.name + ' 的【' + E.charName(cid) + '】被暗杀，本轮跳过', 'danger');
        g.playPtr++;
        return 'killed';
      }

      if (!g.revealed[cid]) {
        g.revealed[cid] = true;
        p.roleRevealed = true;
        E.log(g, p.name + ' 亮出【' + E.charName(cid) + '】', 'reveal');
        applyPassive(g, p, cid);
        g.lastReveal = { charId: cid, playerId: pid };
        return 'reveal';
      }

      if (g.thiefTarget === cid && !g.thiefDone) {
        performSteal(g, pid);
        return 'steal';
      }

      if (p.isHuman) {
        startHumanTurn(g, p, cid);
        return 'human';
      }
      if (CIT.aiTakeTurn) CIT.aiTakeTurn(g, p, cid);
      g.playPtr++;
      return 'aiTurn';
    }
    endRound(g);
    return 'roundEnd';
  }

  E.step = function (g) {
    if (g.over) return 'over';
    if (g.pending) return 'pending';
    if (g.humanTurn) return 'human';
    if (g.phase === 'setup') { beginRound(g); return 'roundStart'; }
    if (g.phase === 'draft') return stepDraft(g);
    if (g.phase === 'play') return stepPlay(g);
    return 'idle';
  };

  /* ---------------- 人类玩家操作 ---------------- */

  E.humanTakeGold = function (g) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.actionDone) return false;
    p.gold += 2;
    ht.actionDone = true;
    E.log(g, '你拿取 2 枚金币', 'you');
    afterAction(g, p, ht);
    return true;
  };

  E.humanTakeCards = function (g) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.actionDone) return null;
    ht.actionDone = true;

    var lib = E.has(p, 'library');
    var obs = E.has(p, 'observatory');
    var n = 2;
    var keep = 1;
    if (lib && obs) { n = 3; keep = 2; }
    else if (obs) { n = 3; keep = 1; }
    else if (lib) { n = 2; keep = 2; }

    var cards = E.drawTop(g, n);
    if (!cards.length) {
      E.log(g, '地区牌堆已空，行动没有抽到牌', 'muted');
      afterAction(g, p, ht);
      return { cards: [], keep: 0 };
    }
    if (keep > cards.length) keep = cards.length;

    if (keep >= cards.length) {
      p.hand.push.apply(p.hand, cards);
      E.log(g, '你抽到 ' + cards.map(function (c) { return '【' + c.name + '】'; }).join(''), 'you');
      afterAction(g, p, ht);
      return { cards: [], keep: 0, auto: true };
    }

    ht.drawn = { cards: cards, keep: keep };
    E.log(g, '你抽取 ' + cards.length + ' 张地区卡，需保留 ' + keep + ' 张', 'you');
    return { cards: cards.slice(0), keep: keep };
  };

  E.humanChooseDrawn = function (g, uids) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || !ht.drawn) return false;
    var cards = ht.drawn.cards;
    var keep = ht.drawn.keep;
    if (!uids || uids.length !== keep) return false;
    var kept = [];
    var rest = [];
    cards.forEach(function (c) {
      if (uids.indexOf(c.uid) >= 0) kept.push(c); else rest.push(c);
    });
    if (kept.length !== keep) return false;
    p.hand.push.apply(p.hand, kept);
    E.putBottom(g, rest);
    E.log(g, '你保留了 ' + kept.map(function (c) { return '【' + c.name + '】'; }).join(''), 'you');
    ht.drawn = null;
    afterAction(g, p, ht);
    return true;
  };

  function afterAction(g, p, ht) {
    if (ht.charId === 7 && !ht.architectDone) {
      ht.architectDone = true;
      var extra = E.drawTop(g, 2);
      p.hand.push.apply(p.hand, extra);
      if (extra.length) {
        E.log(g, '建筑师额外抽到 ' + extra.map(function (c) { return '【' + c.name + '】'; }).join(''), 'you');
      }
    }
  }

  E.humanBuild = function (g, uid) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht) return { ok: false, msg: '现在不是你的回合' };
    if (!ht.actionDone) return { ok: false, msg: '请先执行拿金币或抽卡行动' };
    if (ht.buildsLeft <= 0) return { ok: false, msg: '本回合建造次数已用完' };
    var card = null;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].uid === uid) card = p.hand[i];
    if (!card) return { ok: false, msg: '手牌中没有这张地区卡' };
    var issue = E.buildIssue(p, card);
    if (issue) return { ok: false, msg: issue };
    E.buildDistrict(g, p, card);
    ht.buildsLeft--;
    return { ok: true, card: card };
  };

  E.humanAssassinate = function (g, target) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.charId !== 1 || ht.powerUsed) return false;
    if (target === 1 || g.holders[target] === p.id) return false;
    g.killed = target;
    ht.powerUsed = true;
    E.log(g, '你暗杀了【' + E.charName(target) + '】', 'danger');
    return true;
  };

  E.humanSteal = function (g, target) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.charId !== 2 || ht.powerUsed) return false;
    if (target === 1 || target === g.killed || g.holders[target] === p.id) return false;
    g.thiefTarget = target;
    ht.powerUsed = true;
    E.log(g, '你盯上了【' + E.charName(target) + '】的钱袋', 'danger');
    return true;
  };

  E.humanMagicianSwap = function (g, targetPid) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.charId !== 3 || ht.powerUsed) return false;
    if (targetPid === p.id) return false;
    var other = E.playerById(g, targetPid);
    if (!other) return false;
    var tmp = p.hand;
    p.hand = other.hand;
    other.hand = tmp;
    ht.powerUsed = true;
    E.log(g, '你与 ' + other.name + ' 交换了全部手牌（' + p.hand.length + ' 张 / ' + other.hand.length + ' 张）', 'you');
    return true;
  };

  E.humanMagicianDiscard = function (g, uids) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.charId !== 3 || ht.powerUsed) return false;
    if (!uids || !uids.length) return false;
    var chosen = [];
    var rest = [];
    p.hand.forEach(function (c) {
      if (uids.indexOf(c.uid) >= 0) chosen.push(c); else rest.push(c);
    });
    if (chosen.length !== uids.length) return false;
    p.hand = rest;
    E.putBottom(g, chosen);
    var drawn = E.drawTop(g, chosen.length);
    p.hand.push.apply(p.hand, drawn);
    ht.powerUsed = true;
    E.log(g, '你弃掉 ' + chosen.length + ' 张地区卡并重新抽牌', 'you');
    return true;
  };

  E.humanWarlordTargets = function (g) {
    var p = E.humanPlayer(g);
    var out = [];
    if (!p) return out;
    g.players.forEach(function (owner) {
      if (owner.city.length >= 8) return;
      if (E.isBishopProtected(g, owner)) return;
      owner.city.forEach(function (d) {
        if (d.key === 'fortress') return;
        out.push({ ownerId: owner.id, ownerName: owner.name, district: d, cost: E.destroyCost(g, owner, d) });
      });
    });
    return out;
  };

  E.humanWarlordDestroy = function (g, ownerId, uid) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.charId !== 8 || ht.powerUsed) return { ok: false, msg: '无法使用军阀能力' };
    var owner = E.playerById(g, ownerId);
    if (!owner) return { ok: false, msg: '目标不存在' };
    if (owner.city.length >= 8) return { ok: false, msg: '对方已建成 8 座地区，不能攻击' };
    if (E.isBishopProtected(g, owner)) return { ok: false, msg: '主教保护着这座城市' };
    var d = null;
    for (var i = 0; i < owner.city.length; i++) if (owner.city[i].uid === uid) d = owner.city[i];
    if (!d) return { ok: false, msg: '目标地区不存在' };
    if (d.key === 'fortress') return { ok: false, msg: '堡垒无法被摧毁' };
    var cost = E.destroyCost(g, owner, d);
    if (p.gold < cost) return { ok: false, msg: '金币不足（需要 ' + cost + ' 枚）' };
    p.gold -= cost;
    ht.powerUsed = true;
    E.destroyDistrict(g, owner, d, p);
    if (cost > 0) E.log(g, '你为此支付了 ' + cost + ' 金币', 'muted');
    return { ok: true };
  };

  E.humanLab = function (g, uid) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.labUsed || !E.has(p, 'lab')) return { ok: false, msg: '实验室本回合已使用' };
    var idx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].uid === uid) idx = i;
    if (idx < 0) return { ok: false, msg: '请选择一张手牌' };
    var card = p.hand.splice(idx, 1)[0];
    E.putBottom(g, [card]);
    p.gold += 1;
    ht.labUsed = true;
    E.log(g, '实验室：弃掉【' + card.name + '】，获得 1 金币', 'you');
    return { ok: true };
  };

  E.humanSmithy = function (g) {
    var p = E.humanPlayer(g);
    var ht = g.humanTurn;
    if (!p || !ht || ht.smithyUsed || !E.has(p, 'smithy')) return { ok: false, msg: '铁匠铺本回合已使用' };
    if (p.gold < 2) return { ok: false, msg: '需要 2 枚金币' };
    p.gold -= 2;
    var cards = E.drawTop(g, 3);
    p.hand.push.apply(p.hand, cards);
    ht.smithyUsed = true;
    E.log(g, '铁匠铺：支付 2 金币，抽到 ' + cards.map(function (c) { return '【' + c.name + '】'; }).join(''), 'you');
    return { ok: true };
  };

  E.endHumanTurn = function (g) {
    var ht = g.humanTurn;
    if (!ht) return false;
    if (ht.drawn) return false;
    g.humanTurn = null;
    g.playPtr++;
    return true;
  };

  /* ---------------- 回合结束与计分 ---------------- */

  function checkWinTrigger(g, p) {
    if (g.firstTo8 == null && p.city.length >= 8) {
      g.firstTo8 = p.id;
      g.finalRound = g.round;
      E.log(g, p.name + ' 建成了第 8 座地区！本轮结束后游戏结束', 'crown');
    }
  }
  E.checkWinTrigger = checkWinTrigger;

  function endRound(g) {
    if (g.killed != null && g.holders[g.killed] != null && !g.revealed[g.killed]) {
      var dead = g.players[g.holders[g.killed]];
      dead.roleRevealed = true;
      E.log(g, dead.name + ' 揭示被暗杀的角色【' + E.charName(g.killed) + '】', 'muted');
    }

    if (g.holders[4] != null) {
      var newCrown = g.holders[4];
      if (newCrown !== g.crown) {
        E.log(g, '皇冠移交给 ' + g.players[newCrown].name, 'crown');
      }
      g.crown = newCrown;
    }

    g.humanTurn = null;
    g.pending = null;

    if (g.firstTo8 != null) {
      g.over = true;
      g.phase = 'over';
      computeResults(g);
      E.log(g, '对局结束，开始结算', 'crown');
      return;
    }
    beginRound(g);
  }

  function computeResults(g) {
    var res = g.players.map(function (p) {
      var base = 0;
      p.city.forEach(function (d) { base += (d.value || d.cost); });

      var colored = p.city.filter(function (d) { return d.key !== 'ghost_town'; });
      var missing = [];
      ['noble', 'religious', 'trade', 'military', 'special'].forEach(function (t) {
        var hit = false;
        for (var i = 0; i < colored.length; i++) if (colored[i].type === t) hit = true;
        if (!hit) missing.push(t);
      });
      var flex = 0;
      p.city.forEach(function (d) {
        if (d.key === 'ghost_town' && (g.finalRound == null || d.builtRound < g.finalRound)) flex++;
      });
      var colorBonus = missing.length <= flex ? 3 : 0;

      var eight = p.city.length >= 8;
      var firstBonus = 0;
      if (g.firstTo8 === p.id) firstBonus = 4;
      else if (eight) firstBonus = 2;

      return {
        id: p.id,
        name: p.name,
        isHuman: p.isHuman,
        base: base,
        colorBonus: colorBonus,
        firstBonus: firstBonus,
        total: base + colorBonus + firstBonus,
        districts: p.city.length,
        gold: p.gold,
        missingColors: missing,
        flex: flex
      };
    });
    res.sort(function (a, b) {
      return (b.total - a.total) || (b.base - a.base) || (b.gold - a.gold);
    });
    var top = res.length ? res[0].total : 0;
    res.forEach(function (r) { r.winner = (r.total === top); });
    g.results = res;
  }

  E.computeResults = computeResults;
})(typeof window !== 'undefined' ? window : globalThis);
