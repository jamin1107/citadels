/* 富饶之城 · 数据层：角色、地区卡、图标、文案 */
(function (root) {
  var CIT = (root.CIT = root.CIT || {});

  CIT.TYPES = {
    noble: { name: '贵族', color: '#c9a24a', deep: '#8a6a25', ink: '#2b1f0b' },
    religious: { name: '宗教', color: '#46709f', deep: '#2b4a6e', ink: '#0c1c2d' },
    trade: { name: '商业', color: '#4c7d5d', deep: '#2f513b', ink: '#0f2417' },
    military: { name: '军事', color: '#a34a42', deep: '#6d2c27', ink: '#2a0f0d' },
    special: { name: '特殊', color: '#7a5a9c', deep: '#4e3768', ink: '#1f1630' }
  };

  CIT.CHARACTERS = [
    {
      id: 1, key: 'assassin', name: '刺客', title: '暗影之刃', short: '跳过指定角色',
      art: 'assets/art/roles/assassin.webp', art2x: 'assets/art/roles/assassin@2x.webp',
      power: '指定一个角色，该角色本轮被跳过。',
      detail: '不能指定自己持有的角色。被刺杀的角色在本轮不会获得金币、不会建造，也不会发动能力。'
    },
    {
      id: 2, key: 'thief', name: '盗贼', title: '夜行扒手', short: '偷光指定角色金币',
      power: '指定一个角色，其行动开始前金币全部归你。',
      detail: '不能选择刺客、刺客的目标或自己持有的角色。'
    },
    {
      id: 3, key: 'magician', name: '魔术师', title: '幻术之手', short: '换手牌 / 弃抽',
      power: '与一名玩家交换全部手牌，或弃掉 N 张手牌再抽 N 张。',
      detail: '整手交换没有张数限制，即使自己手上没有牌也可以交换。'
    },
    {
      id: 4, key: 'king', name: '国王', title: '王冠之主', short: '+贵族金币 · 下轮先手',
      art: 'assets/art/roles/king.webp', art2x: 'assets/art/roles/king@2x.webp',
      power: '每有 1 座贵族地区获得 1 金币；下回合由你首先选角。',
      detail: '即使国王被暗杀，皇冠仍会在本轮结束时交给该玩家。'
    },
    {
      id: 5, key: 'bishop', name: '主教', title: '圣殿守望', short: '+宗教金币 · 免拆迁',
      power: '每有 1 座宗教地区获得 1 金币；军阀不能破坏你的地区。',
      detail: '若主教被暗杀，本轮军阀可以正常破坏其地区。'
    },
    {
      id: 6, key: 'merchant', name: '商人', title: '金库之钥', short: '+商业金币 · 额外 1 金',
      power: '每有 1 座商业地区获得 1 金币，并在回合开始时额外获得 1 金币。',
      detail: '额外金币与你的行动选择无关，拿金币或抽牌都能拿到。'
    },
    {
      id: 7, key: 'architect', name: '建筑师', title: '蓝图大师', short: '+2 手牌 · 建 3 座',
      power: '行动后额外抽 2 张地区卡；本回合最多建造 3 座地区。',
      detail: '额外抽到的两张牌都进入手牌，不占用行动。'
    },
    {
      id: 8, key: 'warlord', name: '军阀', title: '铁血领主', short: '+军事金币 · 摧毁建筑',
      power: '每有 1 座军事地区获得 1 金币；可付费摧毁其他玩家的地区。',
      detail: '摧毁费用为地区造价的「造价 - 1」。已建成 8 座地区的城市不可被攻击。'
    }
  ];

  /* 地区卡：65 张（贵族 12 / 宗教 11 / 军事 11 / 商业 20 / 特殊 11） */
  CIT.DISTRICTS = [
    { key: 'manor', name: '庄园', cost: 3, type: 'noble', copies: 5 },
    { key: 'castle', name: '城堡', cost: 4, type: 'noble', copies: 4 },
    {
      key: 'palace', name: '宫殿', cost: 5, type: 'noble', copies: 3,
      art: 'assets/art/districts/palace.webp', art2x: 'assets/art/districts/palace@2x.webp'
    },

    { key: 'temple', name: '神庙', cost: 1, type: 'religious', copies: 3 },
    { key: 'church', name: '教堂', cost: 2, type: 'religious', copies: 3 },
    { key: 'monastery', name: '修道院', cost: 3, type: 'religious', copies: 3 },
    { key: 'cathedral', name: '大教堂', cost: 5, type: 'religious', copies: 2 },

    { key: 'watchtower', name: '瞭望塔', cost: 1, type: 'military', copies: 3 },
    { key: 'prison', name: '监狱', cost: 2, type: 'military', copies: 3 },
    { key: 'battlefield', name: '战场', cost: 3, type: 'military', copies: 3 },
    { key: 'fort', name: '要塞', cost: 5, type: 'military', copies: 2 },

    { key: 'tavern', name: '酒馆', cost: 1, type: 'trade', copies: 5 },
    { key: 'storehouse', name: '商栈', cost: 2, type: 'trade', copies: 3 },
    { key: 'market', name: '集市', cost: 2, type: 'trade', copies: 4 },
    { key: 'dock', name: '船坞', cost: 3, type: 'trade', copies: 3 },
    { key: 'harbor', name: '港口', cost: 4, type: 'trade', copies: 3 },
    { key: 'townhall', name: '市政厅', cost: 5, type: 'trade', copies: 2 },

    {
      key: 'library', name: '图书馆', cost: 6, type: 'special', copies: 1,
      note: '抽卡行动改为保留抽到的全部地区卡'
    },
    {
      key: 'dragon_gate', name: '巨龙门', cost: 6, type: 'special', copies: 1, value: 8,
      note: '建造需 6 金币，终局计 8 分'
    },
    {
      key: 'university', name: '大学', cost: 6, type: 'special', copies: 1, value: 8,
      note: '建造需 6 金币，终局计 8 分'
    },
    {
      key: 'observatory', name: '天文台', cost: 5, type: 'special', copies: 1,
      note: '抽卡行动改为抽 3 张保留 1 张'
    },
    {
      key: 'graveyard', name: '墓地', cost: 5, type: 'special', copies: 1,
      note: '你的地区被摧毁时，可付 1 金币把该牌收回手中（自动触发）'
    },
    {
      key: 'ghost_town', name: '鬼城', cost: 2, type: 'special', copies: 1,
      note: '终局计分时可视为任意一种颜色'
    },
    {
      key: 'magic_school', name: '魔法学院', cost: 6, type: 'special', copies: 1,
      note: '计算角色金币收入时可视为任意颜色'
    },
    {
      key: 'lab', name: '实验室', cost: 5, type: 'special', copies: 1,
      note: '每回合一次：弃 1 张手牌换 1 金币'
    },
    {
      key: 'smithy', name: '铁匠铺', cost: 5, type: 'special', copies: 1,
      note: '每回合一次：支付 2 金币抽 3 张地区卡'
    },
    {
      key: 'fortress', name: '堡垒', cost: 3, type: 'special', copies: 1,
      note: '不会被军阀摧毁'
    },
    {
      key: 'great_wall', name: '长城', cost: 6, type: 'special', copies: 1,
      note: '军阀摧毁你其它地区时必须多付 1 金币'
    }
  ];

  CIT.SPECIAL_NOTES = {
    library: '抽卡行动：保留全部抽到的牌',
    observatory: '抽卡行动：抽 3 张保留 1 张',
    dragon_gate: '终局计分 +8（造价 6）',
    university: '终局计分 +8（造价 6）',
    graveyard: '地区被摧毁时可付 1 金币取回',
    ghost_town: '计分时可视为任意颜色',
    magic_school: '收入计算时视为任意颜色',
    lab: '每回合一次：弃 1 张牌换 1 金币',
    smithy: '每回合一次：付 2 金币抽 3 张',
    fortress: '免疫军阀摧毁',
    great_wall: '军阀拆你其它地区需多付 1 金币'
  };

  /* ---------- 线性图标（24×24） ---------- */
  var S = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  CIT.ICONS = {
    assassin:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M3.5 20.5 15.2 8.8"/><path d="M13.2 6.6 18 1.8l4.2 4.2-4.8 4.8"/><path d="M9.6 10.4l4 4"/><path d="M6.2 13.6l4.2 4.2"/></svg>',
    thief:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<circle cx="8.5" cy="7.5" r="4.2"/><path d="M8.5 5.3v4.4M6.9 6.7h3.2"/><path d="M3 21v-3.6c0-2.2 1.7-3.7 3.9-3.7h4.6"/>' +
      '<path d="M13.4 14.2c1.4 1.2 3.2 2.6 4.4 3.8"/><path d="M14.6 20.4 21 14"/></svg>',
    magician:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M3.2 20.8 13.6 10.4"/><path d="M15.6 2.4l1.3 2.7 2.7 1.3-2.7 1.3-1.3 2.7-1.3-2.7L11.6 6.4l2.7-1.3 1.3-2.7z"/>' +
      '<path d="M5.4 5.4l.9.9M18.6 17.2l1.4 1.4"/></svg>',
    king:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M3.4 8.2l3.4 2.8 5.2-7 5.2 7 3.4-2.8-1.8 9.8H5.2L3.4 8.2z"/><path d="M5.4 21h13.2"/>' +
      '<circle cx="12" cy="3.6" r="1" fill="currentColor"/></svg>',
    bishop:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M12 2.6c2.8 3.1 4.4 6.8 4.4 10.4 0 2.3-1.5 3.9-2.9 4.2h-3c-1.4-.3-2.9-1.9-2.9-4.2C7.6 9.4 9.2 5.7 12 2.6z"/>' +
      '<path d="M12 6v6.6M9.6 9.4h4.8"/><path d="M6.6 18.6h10.8"/><path d="M5 21h14"/></svg>',
    merchant:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M12 3.6v16"/><path d="M7.4 19.6h9.2"/><path d="M3.4 7.4h17.2"/>' +
      '<path d="M3.4 7.4 1.4 13.4h4L3.4 7.4z"/><path d="M20.6 7.4l-2 6h4l-2-6z"/></svg>',
    architect:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M12 2.8 4.8 21"/><path d="M12 2.8 19.2 21"/><path d="M8.3 13.4a5.2 5.2 0 0 0 7.4 0"/>' +
      '<circle cx="12" cy="3.4" r="1.2"/></svg>',
    warlord:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M12 2.2l7 3v5.6c0 4.6-3 8.2-7 10.2-4-2-7-5.6-7-10.2V5.2l7-3z"/><path d="M12 7.6v8"/>' +
      '<path d="M9 10.6h6"/></svg>',

    noble:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M4.4 9.2l3 2.4 4.6-6.2 4.6 6.2 3-2.4-1.6 8.6H6L4.4 9.2z"/><path d="M6 20.6h12"/></svg>',
    religious:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M5 21V10.2C5 6.2 8.1 3.4 12 3.4s7 2.8 7 6.8V21"/><path d="M5 21h14"/>' +
      '<path d="M9.2 21v-6.4c0-1.6 1.2-2.9 2.8-2.9s2.8 1.3 2.8 2.9V21"/></svg>',
    trade:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M4 8.4h16l-1.6 12H5.6L4 8.4z"/><path d="M8.4 8.4l1.4-5h4.4l1.4 5"/><path d="M9.4 12.4v4.4M14.6 12.4v4.4"/></svg>',
    military:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M12 2.4l7.6 3.2v6c0 4.8-3.2 8.6-7.6 10.6-4.4-2-7.6-5.8-7.6-10.6v-6L12 2.4z"/><path d="M12 7v9"/></svg>',
    special:
      '<svg viewBox="0 0 24 24" ' + S + ' stroke-width="1.5">' +
      '<path d="M12 2.6l2.4 6.2 6.6.4-5.1 4.2 1.7 6.4-5.6-3.8-5.6 3.8 1.7-6.4-5.1-4.2 6.6-.4L12 2.6z"/></svg>'
  };

  /* ---------- 建筑剪影（100×84） ---------- */
  var G = 'fill="currentColor" stroke="none"';
  CIT.BUILDINGS = {
    noble:
      '<svg viewBox="0 0 100 84">' +
      '<g ' + G + ' opacity=".13"><path d="M30 84V40h10v10h20V40h10v44z"/><path d="M12 84V56h12v28z"/><path d="M76 84V56h12v28z"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M30 84V34h10v-8h20v8h10v50"/><path d="M40 26V6l12 4-12 4"/>' +
      '<path d="M12 84V52h12v32M76 84V52h12v32"/><path d="M6 84h88"/>' +
      '<path d="M46 84V64h8v20"/><path d="M23 62h8M79 62h8"/></g></svg>',
    religious:
      '<svg viewBox="0 0 100 84">' +
      '<g ' + G + ' opacity=".13"><path d="M32 84V36c0-12 8-20 18-20s18 8 18 20v48z"/><path d="M50 12V2"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M32 84V34c0-11.6 8-19.6 18-19.6s18 8 18 19.6v50"/><path d="M26 84h48"/>' +
      '<path d="M44 84V62c0-4.2 2.7-7 6-7s6 2.8 6 7v22"/>' +
      '<path d="M50 6v8M46 10h8"/><path d="M38 30h24"/></g></svg>',
    trade:
      '<svg viewBox="0 0 100 84">' +
      '<g ' + G + ' opacity=".13"><path d="M14 30h72l-6 54H20z"/><path d="M22 20h56l7 10H15z"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M22 20h56l7 10H15l7-10z"/><path d="M18 30h9v54M27 30h9v54M36 30h9v54M45 30h9v54M54 30h9v54M63 30h9v54M72 30h9v54"/>' +
      '<path d="M14 84h72"/><path d="M34 50h32v20H34z"/></g></svg>',
    military:
      '<svg viewBox="0 0 100 84">' +
      '<g ' + G + ' opacity=".13"><path d="M10 84V46h80v38z"/><path d="M36 84V38h28v46z"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M10 84V46h80v38"/><path d="M6 46v-8h8v8M22 46v-8h8v8M38 46V30h24v16M64 46v-8h8v8M80 46v-8h8v8"/>' +
      '<path d="M4 84h92"/><path d="M44 84V62h12v22"/><path d="M30 60h8M62 60h8"/></g></svg>',
    special:
      '<svg viewBox="0 0 100 84">' +
      '<g ' + G + ' opacity=".13"><path d="M50 6 68 84H32z"/><path d="M22 84V62h56v22z"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M50 6 68 84H32L50 6z"/><path d="M22 84V60h56v24"/><path d="M14 84h72"/>' +
      '<path d="M50 26l3 8 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-8z"/></g></svg>'
  };

  CIT.copy = {
    title: '富饶之城',
    subtitle: 'CITADELS · 王城崛起',
    tagline: '八位角色，五色城区。猜透对手，建成最富饶的王城。',
    rules: [
      '目标：率先建成 8 座地区，本轮结束后结算分数，最高分者获胜。',
      '选角：每回合从剩余角色中秘密选择一位，按角色编号 1→8 依次行动。',
      '行动：拿 2 金币，或抽 2 张地区卡保留 1 张；随后可建造 1 座地区。',
      '收入：国王/主教/商人/军阀分别按 贵族/宗教/商业/军事 地区数量获得金币。',
      '计分：城区造价之和 + 集齐五色 +3 + 首位 8 座 +4（其余达成者 +2）。',
      '角色技能可以随时使用且每回合一次，也可以放弃。'
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
