/* 富饶之城 · AI 城主（启发式决策，只使用公开信息）
 * 策略要点：
 *  - 按建筑颜色 + 手牌颜色分布选收入角色（金币最大化）
 *  - 自己富时优先刺客杀盗贼保钱 / 抢盗贼先下手
 *  - 有人临近 8 城获胜时全力拦截（暗杀建筑师/军阀、军阀拆迁）
 *  - 盗贼以「推测持有人的金币」为主权重，谁钱多偷谁
 *  - 军阀优先拆领先者与巨龙门/大学等高分卡
 */
(function (root) {
  var CIT = (root.CIT = root.CIT || {});
  var E = CIT.Engine;

  function rnd(g, n) { return g.rng() * n; }

  /* 根据公开信息推测某位玩家最可能选择的角色 */
  function affinity(o, charId) {
    switch (charId) {
      case 1: return 1.1;
      case 2: return 1.1;
      case 3: return o.hand.length <= 2 ? 1.7 : 0.4;
      case 4: return E.typeCount(o, 'noble') * 1.25;
      case 5: return E.typeCount(o, 'religious') * 1.25;
      case 6: return E.typeCount(o, 'trade') * 1.25;
      case 7: return Math.min(3, o.hand.length) * 0.7 + (o.gold >= 4 ? 0.9 : 0);
      case 8: return E.typeCount(o, 'military') * 1.25;
    }
    return 0;
  }

  function threat(o) {
    return 1 + o.city.length * 1.15 + o.gold * 0.28;
  }

  function leader(g, p) {
    var best = null;
    g.players.forEach(function (o) {
      if (o.id === p.id) return;
      if (!best || o.city.length * 3 + o.gold > best.city.length * 3 + best.gold) best = o;
    });
    return best;
  }

  function richestOpponent(g, p) {
    var best = null;
    g.players.forEach(function (o) {
      if (o.id === p.id) return;
      if (!best || o.gold > best.gold) best = o;
    });
    return best;
  }

  /* 是否有人只差 1 座城就获胜（8 城触发终局） */
  function rivalClose(g, p) {
    return g.players.some(function (o) {
      return o.id !== p.id && o.city.length >= 7;
    });
  }

  function colorOfRole(role) {
    if (role === 4) return 'noble';
    if (role === 5) return 'religious';
    if (role === 6) return 'trade';
    if (role === 8) return 'military';
    return null;
  }

  /* 手里某种颜色地区卡的数量 */
  function handColorCount(p, type) {
    var n = 0;
    p.hand.forEach(function (c) { if (c.type === type) n++; });
    return n;
  }

  /* 角色收入期望：已建成建筑 + 手牌同色卡，越高越值得拿该角色 */
  function colorScore(p, type) {
    return E.typeCount(p, type) * 1.6 + handColorCount(p, type) * 0.8;
  }

  /* 手里能立即建造的牌数（付得起且城中无同名） */
  function buildableInHand(p) {
    var n = 0;
    p.hand.forEach(function (c) {
      if (c.cost <= p.gold && !p.city.some(function (d) { return d.key === c.key; })) n++;
    });
    return n;
  }

  /* 是否有牌只差 ≤2 金币就能建造 */
  function soonAffordable(p) {
    return p.hand.some(function (c) {
      if (p.city.some(function (d) { return d.key === c.key; })) return false;
      return c.cost > p.gold && c.cost - p.gold <= 2;
    });
  }

  /* ---------------- 选角 ---------------- */

  CIT.aiPickCharacter = function (g, p) {
    var lead = leader(g, p);
    var leadAhead = lead && lead.city.length >= p.city.length + 1;
    var closeIn = rivalClose(g, p);
    var rich = p.gold >= 6;
    var best = null;
    var bestScore = -1e9;

    g.pool.forEach(function (cid) {
      var s = 0;
      switch (cid) {
        case 1: /* 刺客 */
          s = 5.5 + (leadAhead ? 3.5 : 0) + (closeIn ? 4 : 0) + p.style.aggression * 4;
          if (rich) s += 2.5; /* 自己富：高概率杀盗贼保钱 */
          break;
        case 2: /* 盗贼 */
          s = 3.2 + Math.min(4, (lead ? lead.gold : 0) * 0.75) + p.style.greed * 3;
          if (rich) s += 1.5; /* 自己富：抢先当盗贼先下手 */
          break;
        case 3: /* 魔术师 */
          s = 2.4 + (p.hand.length <= 1 ? 4 : 0) + (p.gold <= 1 ? 1.5 : 0);
          break;
        case 4: /* 国王 */
          s = 2.8 + colorScore(p, 'noble') + (p.city.length >= 3 ? 0.8 : 0);
          if (rich) s += 0.8; /* 国王不招贼，富时相对安全 */
          break;
        case 5: /* 主教 */
          s = 2.8 + colorScore(p, 'religious') +
            (lead && E.typeCount(lead, 'military') >= 1 ? 1 : 0);
          if (rich) s += 0.8; /* 主教防拆迁，富时相对安全 */
          break;
        case 6: /* 商人 */
          s = 4.2 + colorScore(p, 'trade');
          break;
        case 7: /* 建筑师：手里有可建的牌或金币充足时才高分 */
          s = 3 + Math.min(3, p.hand.length) * 0.5 + buildableInHand(p) * 1.4 +
            (p.gold >= 6 ? 1.8 : 0) + p.style.build * 2;
          break;
        case 8: /* 军阀 */
          s = 2.6 + colorScore(p, 'military') * 0.9 +
            (lead && lead.city.length >= 5 ? 1.6 : 0) + (closeIn ? 3.5 : 0) +
            p.style.aggression * 2;
          break;
      }
      s += rnd(g, 2.4);
      if (s > bestScore) { bestScore = s; best = cid; }
    });
    return best;
  };

  /* ---------------- 行动 ---------------- */

  CIT.aiTakeTurn = function (g, p, cid) {
    if (cid === 1) aiAssassin(g, p);
    else if (cid === 2) aiThief(g, p);
    else if (cid === 3) aiMagician(g, p);

    aiAction(g, p, cid);
    aiBuild(g, p, cid);
    aiSpecialBuildings(g, p);

    if (cid === 8) aiWarlord(g, p);
  };

  function aiAction(g, p, cid) {
    var affordable = buildableInHand(p);
    var soon = soonAffordable(p);
    var finishPush = p.city.length >= 7;

    var wantCards = p.hand.length === 0 ||
      (affordable === 0 && p.gold < 7 && !soon) ||
      (p.hand.length <= 2 && p.gold <= 2) ||
      rnd(g, 1) < 0.08;

    if (soon) wantCards = false; /* 差 ≤2 金就能建：拿钱凑齐 */
    if (finishPush && p.hand.length > 0) {
      wantCards = affordable === 0 && p.gold < 6; /* 冲刺期优先拿钱建完 */
    }

    if (wantCards) {
      E.aiDraw(g, p);
    } else {
      p.gold += 2;
      E.log(g, p.name + ' 拿取 2 金币', '');
    }

    if (cid === 7) {
      var extra = E.drawTop(g, 2);
      p.hand.push.apply(p.hand, extra);
      if (extra.length) E.log(g, p.name + ' 作为建筑师额外抽 2 张地区卡', '');
    }
  }

  function aiBuild(g, p, cid) {
    var limit = cid === 7 ? 3 : 1;
    while (limit > 0) {
      var options = p.hand.filter(function (c) {
        return !E.buildIssue(p, c);
      });
      if (!options.length) break;

      var roleColor = colorOfRole(cid);
      options.forEach(function (c) {
        c.__s = (c.value || c.cost)
          + (roleColor && c.type === roleColor ? 2.2 : 0) /* 与角色收入联动 */
          + (c.value >= 8 ? 2.5 : 0) /* 巨龙门/大学等 +8 分卡优先 */
          + rnd(g, 1);
      });
      options.sort(function (a, b) { return b.__s - a.__s; });

      var card = options[0];
      p.gold -= card.cost;
      p.hand.splice(p.hand.indexOf(card), 1);
      card.builtRound = g.round;
      p.city.push(card);
      E.log(g, p.name + ' 建造了【' + card.name + '】(-' + card.cost + ' 金币)', '');
      E.checkWinTrigger(g, p);
      limit--;
      if (p.gold <= 0) break;
    }
  }

  function aiSpecialBuildings(g, p) {
    if (E.has(p, 'smithy') && p.gold >= 6 && p.hand.length <= 3) {
      p.gold -= 2;
      var cards = E.drawTop(g, 3);
      p.hand.push.apply(p.hand, cards);
      E.log(g, p.name + ' 使用铁匠铺，支付 2 金币抽 3 张地区卡', '');
    }
    if (E.has(p, 'lab') && p.gold <= 1 && p.hand.length >= 2) {
      var worst = p.hand.slice(0).sort(function (a, b) { return a.cost - b.cost; })[0];
      p.hand.splice(p.hand.indexOf(worst), 1);
      E.putBottom(g, [worst]);
      p.gold += 1;
      E.log(g, p.name + ' 使用实验室，弃【' + worst.name + '】换 1 金币', '');
    }
  }

  /* ---------------- 技能 ---------------- */

  var DANGER = { 1: 1.0, 2: 1.0, 3: 1.6, 4: 2.0, 5: 2.0, 6: 2.6, 7: 2.8, 8: 2.0 };

  function aiAssassin(g, p) {
    var closeIn = rivalClose(g, p);
    var richest = richestOpponent(g, p);
    var best = null;
    var bestScore = -1;
    for (var c = 1; c <= 8; c++) {
      if (c === p.role) continue;
      if (g.excludedKnown.indexOf(c) >= 0) continue;
      var s = DANGER[c] * 1.2;
      g.players.forEach(function (o) {
        if (o.id === p.id) return;
        s += affinity(o, c) * threat(o) * 0.9;
        /* 最富的对手手里若持有盗贼/商人/建筑师，威胁大幅上调 */
        if (richest && o.id === richest.id && (c === 2 || c === 6 || c === 7)) s += 2.4;
      });
      /* 自己金币多：杀盗贼保钱 */
      if (p.gold >= 6 && c === 2) s += 2.6;
      /* 有人临近获胜：优先杀建筑师/军阀，打断节奏 */
      if (closeIn && (c === 7 || c === 8)) s += 2.2;
      s += rnd(g, 1.2);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best != null) {
      g.killed = best;
      E.log(g, p.name + ' 宣布暗杀【' + E.charName(best) + '】', 'danger',
        { type: 'assassinate', charId: best, byPlayer: p.id });
    }
  }

  function aiThief(g, p) {
    var best = null;
    var bestScore = -1;
    for (var c = 2; c <= 8; c++) {
      if (c === p.role || c === g.killed || g.excludedKnown.indexOf(c) >= 0) continue;
      var s = 0;
      /* 主权重：推测持有人身上的金币，谁钱多偷谁 */
      g.players.forEach(function (o) {
        if (o.id === p.id) return;
        var a = affinity(o, c);
        if (a > 0) s += a * (o.gold * 1.6 + 0.5);
      });
      if (c === 6) s += 2.2; /* 商人天生攒钱 */
      if (c === 7) s += 1.2; /* 建筑师攒钱建城 */
      s += rnd(g, 0.8);      /* 随机扰动压到很低，保证目标稳定 */
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best != null) {
      g.thiefTarget = best;
      E.log(g, p.name + ' 宣布盯上【' + E.charName(best) + '】的钱袋', 'danger',
        { type: 'thiefAnnounce', charId: best, byPlayer: p.id });
    }
  }

  function aiMagician(g, p) {
    var others = g.players.filter(function (o) { return o.id !== p.id; });
    var richest = null;
    others.forEach(function (o) {
      if (!richest || o.hand.length > richest.hand.length) richest = o;
    });

    /* 1. 没手牌时与手牌最多的人换牌 */
    if (p.hand.length <= 1 && richest && richest.hand.length >= 2) {
      var tmp = p.hand;
      p.hand = richest.hand;
      richest.hand = tmp;
      E.log(g, p.name + ' 与 ' + richest.name + ' 交换了全部手牌', '');
      return;
    }

    /* 2. 金币充足但手里全是建不起的牌 → 全弃重抽 */
    var unaffordable = p.hand.filter(function (c) { return c.cost > p.gold; });
    if (p.gold >= 4 && p.hand.length >= 2 && unaffordable.length === p.hand.length) {
      p.hand = [];
      E.putBottom(g, unaffordable);
      var drawnAll = E.drawTop(g, unaffordable.length);
      p.hand.push.apply(p.hand, drawnAll);
      E.log(g, p.name + ' 弃掉 ' + unaffordable.length + ' 张建不起的地区卡并重新抽牌', '');
      return;
    }

    /* 3. 建不起的牌较多 → 弃 2 张换新 */
    var junk = p.hand.filter(function (c) { return c.cost > p.gold + 1; });
    if (junk.length >= 2) {
      var discard = junk.slice(0, 2);
      discard.forEach(function (c) { p.hand.splice(p.hand.indexOf(c), 1); });
      E.putBottom(g, discard);
      var drawn = E.drawTop(g, discard.length);
      p.hand.push.apply(p.hand, drawn);
      E.log(g, p.name + ' 弃掉 2 张地区卡并重新抽牌', '');
    }
  }

  function aiWarlord(g, p) {
    var lead = leader(g, p);
    var best = null;
    g.players.forEach(function (o) {
      if (o.id === p.id) return;
      if (o.city.length >= 8) return;
      if (E.isBishopProtected(g, o)) return;
      o.city.forEach(function (d) {
        if (d.key === 'fortress') return;
        var cost = E.destroyCost(g, o, d);
        if (cost > p.gold) return;
        var v = (d.value || d.cost);
        if (d.value >= 8) v += 3.5;              /* 巨龙门/大学等 +8 分卡优先拆 */
        if (o.city.length >= 6) v += 3;
        if (o.city.length >= 7) v += 2.5;        /* 阻止对方达成 8 城 */
        if (lead && o.id === lead.id) v += 2.5;  /* 领先者优先 */
        v += rnd(g, 0.8);
        if (!best || v > best.v) best = { owner: o, district: d, cost: cost, v: v };
      });
    });

    if (!best) return;
    var keepGold = p.city.length >= 7 ? 2 : 0;
    if (best.v < 4 && rnd(g, 1) > p.style.aggression) return;
    if (p.gold - best.cost < keepGold) return;

    p.gold -= best.cost;
    E.destroyDistrict(g, best.owner, best.district, p);
    if (best.cost > 0) E.log(g, p.name + ' 为此支付了 ' + best.cost + ' 金币', 'muted');
  }
})(typeof window !== 'undefined' ? window : globalThis);
