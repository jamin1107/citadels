/* 富饶之城 · AI 城主（启发式决策，不使用隐藏信息） */
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

  function colorOfRole(role) {
    if (role === 4) return 'noble';
    if (role === 5) return 'religious';
    if (role === 6) return 'trade';
    if (role === 8) return 'military';
    return null;
  }

  /* ---------------- 选角 ---------------- */

  CIT.aiPickCharacter = function (g, p) {
    var lead = leader(g, p);
    var leadAhead = lead && lead.city.length >= p.city.length + 1;
    var best = null;
    var bestScore = -1e9;

    g.pool.forEach(function (cid) {
      var s = 0;
      switch (cid) {
        case 1:
          s = 5.5 + (leadAhead ? 3.5 : 0) + p.style.aggression * 4;
          break;
        case 2:
          s = 3.2 + Math.min(4, (lead ? lead.gold : 0) * 0.75) + p.style.greed * 3;
          break;
        case 3:
          s = 2.4 + (p.hand.length <= 1 ? 4 : 0) + (p.gold <= 1 ? 1.5 : 0);
          break;
        case 4:
          s = 2.8 + E.typeCount(p, 'noble') * 1.25 + (p.city.length >= 3 ? 0.8 : 0);
          break;
        case 5:
          s = 2.8 + E.typeCount(p, 'religious') * 1.25 + (lead && E.typeCount(lead, 'military') >= 1 ? 1 : 0);
          break;
        case 6:
          s = 4.2 + E.typeCount(p, 'trade') * 1.25;
          break;
        case 7:
          s = 3 + Math.min(3, p.hand.length) * 0.85 + (p.gold >= 5 ? 1.6 : 0) + p.style.build * 2;
          break;
        case 8:
          s = 2.6 + E.typeCount(p, 'military') * 1.15 + (lead && lead.city.length >= 5 ? 1.6 : 0) + p.style.aggression * 2;
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
    var affordable = 0;
    p.hand.forEach(function (c) {
      if (c.cost <= p.gold && !p.city.some(function (d) { return d.key === c.key; })) affordable++;
    });

    var wantCards = p.hand.length <= 1 || (affordable === 0 && p.gold < 7) ||
      (p.hand.length <= 2 && p.gold <= 2) || rnd(g, 1) < 0.2;

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
      options.forEach(function (c) { c.__s = (c.value || c.cost) + (roleColor && c.type === roleColor ? 1.6 : 0) + rnd(g, 1.4); });
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
    if (rnd(g, 1) < 0.12) {
      E.log(g, p.name + ' 放弃了刺客能力', 'muted');
      return;
    }
    var best = null;
    var bestScore = -1;
    for (var c = 1; c <= 8; c++) {
      if (c === p.role) continue;
      if (g.excludedKnown.indexOf(c) >= 0) continue;
      var s = DANGER[c] * 1.2;
      g.players.forEach(function (o) {
        if (o.id === p.id) return;
        s += affinity(o, c) * threat(o) * 0.9;
      });
      s += rnd(g, 2.6);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best != null) {
      g.killed = best;
      E.log(g, p.name + ' 宣布暗杀【' + E.charName(best) + '】', 'danger');
    }
  }

  function aiThief(g, p) {
    if (rnd(g, 1) < 0.1) {
      E.log(g, p.name + ' 放弃了盗贼能力', 'muted');
      return;
    }
    var best = null;
    var bestScore = -1;
    for (var c = 2; c <= 8; c++) {
      if (c === p.role || c === g.killed || g.excludedKnown.indexOf(c) >= 0) continue;
      var s = (c === 6 ? 1.6 : 0) + rnd(g, 1.4);
      g.players.forEach(function (o) {
        if (o.id === p.id) return;
        s += affinity(o, c) * (o.gold * 0.9 + 0.6);
      });
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best != null) {
      g.thiefTarget = best;
      E.log(g, p.name + ' 宣布盯上【' + E.charName(best) + '】的钱袋', 'danger');
    }
  }

  function aiMagician(g, p) {
    var others = g.players.filter(function (o) { return o.id !== p.id; });
    var richest = null;
    others.forEach(function (o) {
      if (!richest || o.hand.length > richest.hand.length) richest = o;
    });

    if (p.hand.length <= 1 && richest && richest.hand.length >= 2) {
      var tmp = p.hand;
      p.hand = richest.hand;
      richest.hand = tmp;
      E.log(g, p.name + ' 与 ' + richest.name + ' 交换了全部手牌', '');
      return;
    }

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
        var v = (d.value || d.cost) + (o.city.length >= 6 ? 3 : 0) + (lead && o.id === lead.id ? 1.5 : 0);
        v += rnd(g, 1);
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
