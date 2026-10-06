// ==UserScript==
// @name         阿纳克实时计分 (Arnak Live Scorer)
// @namespace    arnak.live.scorer
// @version      0.9.15
// @description  BGA《失落的阿纳克遗迹》：常驻浮窗显示所有玩家实时终局分（基础版，鸟庙/蛇庙）
// @author       浮沉 & hanako
// @match        https://boardgamearena.com/*
// @match        https://*.boardgamearena.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * ──────────────────────────────────────────────────────────────
 *  数据来源：gameui.gamedatas（BGA 服务端状态的客户端镜像，notif 实时更新）
 *  计分数据全部来自官方：arnak.js + tooltips.js（已解析）
 *
 *  架构分层：
 *    1. 数据表   CARD_POINTS / ROW_MAP / STEP_SCORE / IDOL_SLOT_POINTS / RULES
 *    2. 计分层   scorePlayer：状态 → 分项 + 总分
 *    3. 状态层   collectState：gamedatas → 玩家状态（含已见牌追踪）
 *    4. 装配层   init / iframe 让位 / MutationObserver / 节流
 *    5. 表现层   createPanel / render：常驻浮窗
 *    6. 情报层   window.__arnakDump
 *
 *  终局时 showAllCards 重灌已见牌，实时模式即精确；scoreBreakdown 仅作诊断。
 * ──────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // 一、数据表（全部来自官方 tooltips.js / arnak.js）
  // ════════════════════════════════════════════════════════════
  const RULES = {
    GUARDIAN: 5,
    IDOL: 3,
    FEAR: -1,
    TEMPLE: { bronze: 2, silver: 6, gold: 11 },
    // 索引 = 剩余空 idol slot 数（0-4）→ 终局分。官方原文：0/1/2/3/4 → 0/4/7/9/10
    IDOL_SLOT: [0, 4, 7, 9, 10],
  };

  // 卡牌分值：索引 = 卡的 num（1-based），fear = -1，起始牌 = 0
  const CARD_POINTS = {
    item: [0, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 3, 1, 2, 1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 1, 3, 2, 2, 1],
    art: [0, 1, 1, 1, 3, 2, 2, 1, 2, 1, 2, 1, 1, 2, 2, 1, 1, 2, 1, 2, 1, 1, 1, 2, 2, 1, 1, 2, 1, 1, 2, 2, 1, 1, 1, 2],
  };

  // 卡牌中文名：索引 = num（1-based），对齐 tooltips.js cardName 顺序
  const ITEM_NAMES = ['', '海龟', '鸵鸟', '驮运驴子', '马', '蒸汽机船', '汽车', '结实的靴子', '淘金盘', '泥铲', '十字镐', '热气球', '飞机', '日志', '鹦鹉', '手表', '军刀', '双筒望远镜', '帐篷', '钓鱼竿', '精密指南针', '弓箭', '信鸽', '鞭子', '粗略地图', '空投物资', '水瓶', '大砍刀', '火把', '大旅行包', '绳索', '左轮手枪', '帽子', '捕熊陷阱', '抓钩', '提灯', '狗', '刷子', '斧头', '天文钟', '经纬仪'];
  const ART_NAMES = ['', '探路者的凉鞋', '探路者的手杖', '作战面具', '藏宝箱', '仪式匕首', '水晶耳环', '研钵', '巨蛇的黄金', '巨蛇神像', '猴子挂坠', '阿拉阿努神像', '铭刻之刃', '守护者的陶笛', '虎爪发簪', '作战棍', '日晷', '商人的天平', '狩猎箭头', '椰壳水瓶', '净化坩埚', '陈年佳酿', '装饰号角', '华丽之锤', '星图', '石罐', '贝壳通道', '仪式摇铃', '神圣乐鼓', '商人的钱币', '石钥匙', '黑曜石耳环', '指路石', '指路头骨', '亡者符文', '守护者的王冠'];

  // 官方英文卡名（tooltips.js 原文），与上面两张表同序，供日志里的卡名扫描反查
  const ITEM_NAMES_EN = ['', 'Sea Turtle', 'Ostrich', 'Pack Donkey', 'Horse', 'Steam Boat', 'Automobile', 'Sturdy Boots', 'Gold Pan', 'Trowel', 'Pickaxe', 'Hot Air Balloon', 'Aeroplane', 'Journal', 'Parrot', 'Watch', 'Army Knife', 'Binoculars', 'Tent', 'Fishing Rod', 'Precision Compass', 'Bow and Arrows', 'Carrier Pigeon', 'Whip', 'Rough Map', 'Airdrop', 'Flask', 'Machete', 'Torch', 'Large Backpack', 'Rope', 'Revolver', 'Hat', 'Bear Trap', 'Grappling Hook', 'Lantern', 'Dog', 'Brush', 'Axe', 'Chronometer', 'Theodolite'];
  const ART_NAMES_EN = ['', "Pathfinder's Sandals", "Pathfinder's Staff", 'War Mask', 'Treasure Chest', 'Ritual Dagger', 'Crystal Earring', 'Mortar', "Serpent's Gold", 'Serpent Idol', 'Monkey Medallion', 'Idol of Ara-Anu', 'Inscribed Blade', "Guardian's Ocarina", 'Tigerclaw Hairpin', 'War Club', 'Sundial', "Traders' Scales", 'Hunting Arrows', 'Coconut Flask', 'Cleansing Cauldron', 'Ancient Wine', 'Decorated Horn', 'Ornate Hammer', 'Star Charts', 'Stone Jar', 'Passage Shell', 'Ceremonial Rattle', 'Sacred Drum', "Trader's Coins", 'Stone Key', 'Obsidian Earring', 'Guiding Stone', 'Guiding Skull', 'Runes of the Dead', "Guardian's Crown"];

  function cardNameOf(type, num) {
    return (type === 'item' ? ITEM_NAMES[num] : ART_NAMES[num]) || (type + '#' + num);
  }

  // ── 日志措辞包 ────────────────────────────────────────────────
  // 日志文案由服务端按界面语言生成，所以中文、英文各一套动作措辞；
  // 中文按真实中文对局日志实测：「将 X 放到其牌堆的 底部」（是「放到」不是「放在」，
  // 且名字与「将」之间常常没有空格），打出同理。卡名反查走内置表扫描。
  const LOG_PACKS = {
    zh: {
      score: (t) => { const m = t.match(/以 (.+?) 获得 (-?\d+) 分/); return m ? { src: m[1], pts: parseInt(m[2], 10) } : null; },
      isFearSource: (s) => s.indexOf('恐惧') >= 0,
      boundary: /结束其回合|已跳过|抽了 \d+ 张牌|获得起始玩家指示物/,
      undo: /取消了他的行动/,
      buy: /将\s*(.+?)\s*(?:放到|放在)其牌堆的\s*(?:底部|顶部)/,
      play: /打出\s*(.+)/,
      remove: /移除\s*了?\s*(.+)/,
      fearGain: /获得\s*1\s*张?\s*恐惧牌/,
      isFear: (s) => s.indexOf('恐惧') >= 0,
      isFund: (s) => s.indexOf('资金') >= 0,
      isExplore: (s) => s.indexOf('探索') >= 0,
    },
    en: {
      score: (t) => { const m = t.match(/(-?\d+)\s+points?\s+(?:for|with)\s+(.+)/i); return m ? { src: m[2], pts: parseInt(m[1], 10) } : null; },
      isFearSource: (s) => /fear/i.test(s),
      boundary: /ends?\s+(?:their|his|her)\s+turn|(?:has\s+)?passed\b|\bpasses\b|draws?\s+(?:a|\d+)\s+cards?|start(?:ing)? player (?:token|marker)/i,
      undo: /cancels?\s+(?:their|his|her)\s+(?:action|move)|undoes?\s+(?:their|his|her)?\s*(?:last\s+)?(?:action|move)/i,
      buy: /\b(?:places?|puts?)\s*(.+?)\s*(?:at|on|to)\s+(?:the\s+)?(?:bottom|top)\s+of\s+(?:their|his|her)\s+deck/i,
      play: /\bplays?\s*(.+)/i,
      remove: /\b(?:exiles?|removes?)\s+(.+)/i,
      fearGain: /\b(?:gains?|takes?|gets?|receives?)\s+(?:a|\d+)\s+fears?\b/i,
      isFear: (s) => /fear/i.test(s),
      isFund: (s) => /funding/i.test(s),
      isExplore: (s) => /explor(?:ation|ing)/i.test(s),
    },
  };
  let currentLogPack = null;

  // 界面语言检测：日志样本含汉字 → zh，否则 en（日志文案由服务端按界面语言生成）
  function detectLogLang(doc) {
    const el = doc && doc.querySelector('#logs .log[id^="log_"]');
    if (!el) return null;
    const sample = (el.textContent || '').trim();
    if (!sample) return null;
    return /[\u4e00-\u9fa5]/.test(sample) ? 'zh' : 'en';
  }

  // 研究轨：格 id（0-14）→ 行（0-8）。官方 research() 函数
  const ROW_MAP = {
    bird:  [0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6, 7, 7, 8],
    snake: [0, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 8],
  };

  // 研究轨：行 → 终局分。官方 stepScore()（只有行 0-7）。
  // 顶格（格 14）不走行表：放大镜按到顶顺序给分（浮沉提供：23/21/20/19），
  // 笔记本顶格只算行 7 的分（蛇庙 15 / 鸟庙 10，浮沉提供）。
  const STEP_SCORE = {
    bird:  { glass: [0, 1, 2, 4, 6, 9, 12, 16], book: [0, 0, 1, 2, 4, 6, 8, 10] },
    snake: { glass: [0, 1, 2, 3, 4, 5, 10, 15], book: [0, 0, 3, 4, 5, 8, 12, 15] },
  };

  // 放大镜顶格（到顶顺序 1-4）：23 / 21 / 20 / 19
  const GLASS_TOP = { 1: 23, 2: 21, 3: 20, 4: 19 };
  // 笔记本顶格：固定 = 行 7 的分
  const BOOK_TOP = { bird: 10, snake: 15 };

  const CONFIG = {
    DEBUG: true,
    ROOT_POLL_MS: 500,
    ROOT_POLL_MAX: 600,   // 最长等待 5 分钟（回放页游戏 DOM 进场慢）
    RENDER_THROTTLE_MS: 250,
  };

  // ════════════════════════════════════════════════════════════
  // 二、计分引擎（纯函数）
  // ════════════════════════════════════════════════════════════
  function cardPoints(type, num) {
    if (type === 'fear') return RULES.FEAR;
    if (type === 'item' || type === 'art') return (CARD_POINTS[type] && CARD_POINTS[type][num]) || 0;
    return 0; // fund/explore 起始牌
  }

  function glassScore(research, birdTemple, templeRank) {
    const side = birdTemple ? 'bird' : 'snake';
    const pos = Math.min(research.glass, 14);
    const row = ROW_MAP[side][pos] || 0;
    // 顶格（格 14）不走行表：按到顶顺序给分
    return pos === 14 ? (GLASS_TOP[+templeRank] || 21) : (STEP_SCORE[side].glass[row] || 0);
  }

  function bookScore(research, birdTemple) {
    const side = birdTemple ? 'bird' : 'snake';
    const pos = Math.min(research.book, 14);
    const row = ROW_MAP[side][pos] || 0;
    // 笔记本顶格：固定 = 行 7 的分
    return pos === 14 ? BOOK_TOP[side] : (STEP_SCORE[side].book[row] || 0);
  }

  function scorePlayer(p, birdTemple) {
    const research = p.research || { glass: 0, book: 0 };
    const glass = glassScore(research, birdTemple, p.templeRank);
    const book = bookScore(research, birdTemple);
    // 卡牌拆两行：普通牌分 + 恐惧负分
    const detail = p.cardDetail || { normalPts: 0, fearCount: 0, normal: [] };
    const cards = detail.normalPts;
    const fear = -detail.fearCount;
    // 空槽分无条件：idol_slot = 剩余空槽数，4 个空槽 = 10 分，每占用 1 个槽依次扣 1/2/3/4 分（官方 IDOL_SLOT 表）
    const idolBonus = RULES.IDOL_SLOT[p.idolSlots] || 0;
    const idols = p.idols * RULES.IDOL;   // 神像本体分
    const idolSlots = idolBonus;          // 神像槽位分
    const guardians = p.guardians * RULES.GUARDIAN;
    const temple = p.temple.bronze * RULES.TEMPLE.bronze
      + p.temple.silver * RULES.TEMPLE.silver
      + p.temple.gold * RULES.TEMPLE.gold;
    const parts = { glass, book, cards, idols, idolSlots, guardians, temple, fear };
    return {
      parts,
      total: glass + book + cards + fear + idols + idolSlots + guardians + temple,
    };
  }

  // ════════════════════════════════════════════════════════════
  // 三、状态层：gamedatas → 玩家状态
  // ════════════════════════════════════════════════════════════
  // 已见牌追踪：playerId → { cards: Map(type:num → {type,num}), fears: Map(fearId → true) }
  // fear 有唯一 id（notif_gainFear 推送），按 id 计数；其他牌按 type:num 去重
  const seenCards = new Map();

  // 被 exile 移除的恐惧卡：playerId → Set(fearId)。hook notif_exileCard 记录
  const fearExiled = new Map();
  // 新增获得的恐惧卡：playerId → Set(fearId)。hook notif_gainFear 记录
  const fearGained = new Map();
  // 终局恐惧卡数覆盖：playerId → count。notif_showAllCards 服务端给出全部牌，直接数
  const finalFear = new Map();
  // 牌 id → {type, num, pid}，用于 exile 时反查删除已见记录
  const idToCard = new Map();

  function seenSet(pid) {
    if (!seenCards.has(pid)) seenCards.set(pid, { cards: new Map(), fears: new Map() });
    return seenCards.get(pid);
  }

  function rememberCard(pid, card) {
    if (!card || !card.type) return;
    const t = card.type;
    // 只认计分牌；起始牌（资金/探索）与其它类型一律不进牌库（避免 basic#NaN 这类脏条目）
    if (t !== 'item' && t !== 'art' && t !== 'fear') return;
    const s = seenSet(pid);
    if (t === 'fear') {
      s.fears.set(String(card.id != null ? card.id : 'f' + s.fears.size), true);
    } else {
      s.cards.set(t + ':' + card.num, { type: t, num: +card.num });
      if (card.id != null) idToCard.set(String(card.id), { type: t, num: +card.num, pid });
    }
  }

  // 恐惧卡数：终局（showAllCards）用服务端精确值；实时 = 初始 2 + 新增获得 − 移除
  // 额外下界：见过且未被移除的恐惧牌（观战中途加入时，至少反映当前可见的）
  function fearCount(pid) {
    if (finalFear.has(pid)) return finalFear.get(pid);
    const g = (fearGained.get(pid) || new Set()).size;
    const e = (fearExiled.get(pid) || new Set()).size;
    const seen = seenSet(pid).fears.size;
    return Math.max(2 + g - e, Math.max(0, seen - e));
  }

  // 已见牌分 = 正分（item/art 去重累计）+ 恐惧负分（每张 -1）
  function seenPoints(pid) {
    const s = seenSet(pid);
    let pts = 0;
    for (const c of s.cards.values()) pts += cardPoints(c.type, c.num);
    pts -= fearCount(pid);
    return pts;
  }

  // 牌明细：普通牌列表（type/num/分值）+ 恐惧卡数，供浮窗展开显示
  function cardDetailOf(pid) {
    const s = seenSet(pid);
    const normal = [];
    let normalPts = 0;
    for (const c of s.cards.values()) {
      const pts = cardPoints(c.type, c.num);
      normal.push({ type: c.type, num: c.num, pts });
      normalPts += pts;
    }
    return { normal, normalPts, fearCount: fearCount(pid) };
  }

  // 把一个 notif 方法只包一层：先处理 e.args，再照常调用原方法（保持行为不变）
  function wrapNotif(proto, name, handle) {
    const orig = proto && proto[name];
    if (!orig || orig.__arnakHooked) return;
    const wrapper = function (e) {
      handle((e && e.args) || {});
      return orig.apply(this, arguments);
    };
    wrapper.__arnakHooked = true;
    proto[name] = wrapper;
  }

  // hook 游戏的 fear 通知：notif_gainFear 记新增，notif_exileCard 记移除，notif_showAllCards 终局全量重灌
  function hookExileTracking(win) {
    const gu = win.gameui;
    if (!gu || gu.__arnakExileHooked) return;
    const proto = gu.constructor && gu.constructor.prototype;

    // 移除：恐惧记移除；普通牌用 id 反查并删除已见记录
    wrapNotif(proto, 'notif_exileCard', (args) => {
      const pid = args.player_id == null ? null : String(args.player_id);
      if (!pid || logModeActive) return;
      const ct = String(args.cardType);
      if (ct === 'fear') {
        if (!fearExiled.has(pid)) fearExiled.set(pid, new Set());
        const es = fearExiled.get(pid);
        es.add(String(args.cardId != null ? args.cardId : 'x' + es.size));
      } else if (ct === 'item' || ct === 'art') {
        const ref = idToCard.get(String(args.cardId));
        if (ref) {
          seenSet(ref.pid).cards.delete(ref.type + ':' + ref.num);
          idToCard.delete(String(args.cardId));
        }
      } else if (gu.gamedatas && gu.gamedatas.players && gu.gamedatas.players[pid]) {
        const play = gu.gamedatas.players[pid].play || [];
        const card = play.find((c) => String(c.id) === String(args.cardId));
        if (card && card.type === 'fear') {
          if (!fearExiled.has(pid)) fearExiled.set(pid, new Set());
          fearExiled.get(pid).add(String(card.id));
        }
      }
    });

    // 获得恐惧：记新增 id
    wrapNotif(proto, 'notif_gainFear', (args) => {
      const pid = args.player_id == null ? null : String(args.player_id);
      if (pid && args.fearId != null && !logModeActive) {
        if (!fearGained.has(pid)) fearGained.set(pid, new Set());
        fearGained.get(pid).add(String(args.fearId));
      }
    });

    // 终局：showAllCards 给出全部牌（服务端权威清单），全量重灌已见牌 + 精确恐惧数
    wrapNotif(proto, 'notif_showAllCards', (args) => {
      try {
        const cards = JSON.parse(args.cards);
        const pid = String(args.player_id);
        if (pid && Array.isArray(cards)) {
          const s = seenSet(pid);
          s.cards.clear();
          s.fears.clear();
          let fearN = 0;
          for (const c of cards) {
            if (c && c.type === 'fear') fearN++;
            rememberCard(pid, c);
          }
          finalFear.set(pid, fearN);
        }
      } catch (err) { /* 解析失败忽略 */ }
    });

    gu.__arnakExileHooked = true;
  }

  // ── 日志账本（logMode，对局/观战/回放全部启用）──
  // BGA 只发状态快照+增量通知，历史牌库靠解析 #logs 历史日志补全
  // 已处理日志用 Set 去重（全量扫描，不依赖日志 id 递增顺序，观战历史日志可能乱序加载）
  let logProcessed = new Set();
  let logCount = 0;
  let logInited = false;
  // 初始牌（资金/探索）被移除的数量：pid -> { fund, explore }
  const basicRemoved = new Map();
  // 观战日志模式标志：日志模式下 hook 的恐惧记录让位（避免双计）
  let logModeActive = false;
  // 每玩家动作快照栈：动作日志压栈，回合边界清栈，取消弹栈回滚最近一次主动作
  const playerStacks = new Map();
  // 最近一次动作是否会改变“归属”（买进 / 移除 / 恐惧增减 → 会；打出 → 不会）
  // 撤销只能回滚上一步，但日志里的撤销行并没有说它撤的是哪一步；
  // 若不管三七二十一都弹栈，就会把“上一次买进来的牌”误删掉。
  const ownershipAction = new Map();

  function pushSnapshot(pid) {
    const s = seenSet(pid);
    const snap = {
      cards: new Map(s.cards),
      fears: new Set(s.fears),
      gained: new Set(fearGained.get(pid) || []),
      exiled: new Set(fearExiled.get(pid) || []),
      basic: { ...(basicRemoved.get(pid) || { fund: 0, explore: 0 }) },
    };
    if (!playerStacks.has(pid)) playerStacks.set(pid, []);
    playerStacks.get(pid).push(snap);
  }

  function popRestore(pid) {
    const stack = playerStacks.get(pid);
    const snap = stack && stack.pop();
    if (!snap) return;
    const s = seenSet(pid);
    s.cards = snap.cards;
    s.fears = snap.fears;
    if (snap.gained.size) fearGained.set(pid, snap.gained); else fearGained.delete(pid);
    if (snap.exiled.size) fearExiled.set(pid, snap.exiled); else fearExiled.delete(pid);
    basicRemoved.set(pid, snap.basic);
  }

  // 日志里的卡名可能带尾部时间戳或引号（如“马01:54”），先清理
  function cleanCardName(name) {
    return String(name || '')
      .trim()
      .replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*$/, '')
      .replace(/^[「『"'“‘]+|[」』"'”’]+$/g, '')
      .trim();
  }

  // 生效的措辞包序列：探测到的语言优先，另一个兜底（日志常常中英混排）
  function activePacks() {
    const first = currentLogPack || LOG_PACKS.zh;
    return first === LOG_PACKS.zh ? [LOG_PACKS.zh, LOG_PACKS.en] : [LOG_PACKS.en, LOG_PACKS.zh];
  }

  // 跟语言无关的动作词元。实测日志会中英混排，甚至同一句里也混：
  //   「puts 火把 to the 底部 of their deck」「exiles 恐惧牌」「plays 提灯」
  // 所以动作只认词元，不认整句。注意「弃掉 / discards」不算移除（牌会回牌堆）。
  const TOK = {
    buyVerb: /将|\b(?:puts?|places?)\b/i,
    deckWord: /牌堆|牌库|底部|顶部|\b(?:deck|bottom|top)\b/i,
    play: /打出|\bplays?\b/i,
    exile: /移除|放逐|\b(?:exiles?|removes?)\b/i,
    fearGain: /获得\s*\d*\s*张?\s*恐惧|\b(?:gains?|takes?|gets?|receives?)\b[^\n]*\bfears?\b/i,
  };

  // 日志行里语言无关的卡牌标记（游戏自己注入的隐藏 div，见 format_string_recursive）
  function tooltipCardOf(logEl) {
    const el = logEl && logEl.querySelector && logEl.querySelector('.notif-inner-tooltip');
    if (!el) return null;
    const ty = el.getAttribute('data-type');
    const nu = String(el.getAttribute('data-num'));
    if (ty === 'item' || ty === 'art') return { type: ty, num: +nu };
    if (ty === 'fear') return { type: 'fear' };
    if (ty === 'basic') {
      if (nu === 'fear') return { type: 'fear' };
      if (nu.indexOf('fund') >= 0) return { type: 'basic', kind: 'fund' };
      if (nu.indexOf('explore') >= 0) return { type: 'basic', kind: 'explore' };
    }
    return null;
  }

  // 卡名 → {type,num}：中/英、物品/神器四张表同序，合并成一轮扫描
  const NAME_TABLES = [
    ['item', ITEM_NAMES], ['art', ART_NAMES],
    ['item', ITEM_NAMES_EN], ['art', ART_NAMES_EN],
  ];

  // 卡牌身份：先读隐藏标记（语言无关，最稳），再退回卡名表扫描
  function cardOf(logEl, text) {
    const t = tooltipCardOf(logEl);
    if (t) return t;
    const n = cleanCardName(text);
    for (const [type, names] of NAME_TABLES) {
      for (let i = 1; i < names.length; i++) if (n.indexOf(names[i]) >= 0) return { type, num: i };
    }
    return null;
  }

  function basicKindOf(text, packs) {
    const s = String(text || '');
    if (!s) return null;
    if (packs.some((P) => P.isFear(s))) return 'fear';
    if (packs.some((P) => P.isFund(s))) return 'fund';
    if (packs.some((P) => P.isExplore(s))) return 'explore';
    return null;
  }

  // 解析一条日志；日志文本带前导空白，必须先 trim。
  // 动作按跨语言词元判定，卡牌身份优先读隐藏标记。
  function parseLogEntry(rawText, logEl, pidMap) {
    const packs = activePacks();
    const text = (rawText || '').trim();
    const name = Object.keys(pidMap).find((n) => text.startsWith(n));
    if (!name) return;
    const pid = pidMap[name];
    // 结算日志（回放结束）：“X 以 恐惧牌 获得 -2 分” → 官方恐惧数校准（服务端最终事实）
    let sc = null;
    for (const P of packs) { sc = P.score(text); if (sc) break; }
    if (sc) {
      if (packs.some((P) => P.isFearSource(sc.src))) finalFear.set(pid, Math.max(0, -sc.pts));
      return;
    }
    // 回合边界：结束回合/跳过/抽牌/起始指示物 → 清空动作栈
    if (packs.some((P) => P.boundary.test(text))) {
      playerStacks.delete(pid);
      ownershipAction.delete(pid);
      return;
    }
    // 撤销：只在“上一步确实改变了归属”时弹栈；否则让位
    // （打出被撤销时牌是回到手里，仍然属于你，不能从牌库里删）
    if (packs.some((P) => P.undo.test(text))) {
      if (ownershipAction.get(pid)) { popRestore(pid); ownershipAction.delete(pid); }
      return;
    }
    const card = cardOf(logEl, text);
    // 购买/获得进牌库：动词 + 牌堆词（允许中英混排）
    if (TOK.buyVerb.test(text) && TOK.deckWord.test(text)) {
      pushSnapshot(pid);
      ownershipAction.set(pid, true);
      if (card) rememberCard(pid, { type: card.type, num: card.num });
      return;
    }
    // 打出：牌只是换了位置（手牌 → 已打出区），归属没变，不压栈
    if (TOK.play.test(text)) {
      ownershipAction.set(pid, false);
      if (card) rememberCard(pid, { type: card.type, num: card.num });
      return;
    }
    // 移除/放逐（恐惧牌记移除；初始资金/探索单独计数）
    if (TOK.exile.test(text)) {
      pushSnapshot(pid);
      ownershipAction.set(pid, true);
      const kind = card
        ? (card.type === 'fear' ? 'fear' : (card.kind || null))
        : basicKindOf(text, packs);
      if (kind === 'fear') {
        if (!fearExiled.has(pid)) fearExiled.set(pid, new Set());
        fearExiled.get(pid).add('logx:' + (fearExiled.get(pid).size + 1));
        return;
      }
      if (kind === 'fund' || kind === 'explore') {
        const r = basicRemoved.get(pid) || { fund: 0, explore: 0 };
        r[kind]++;
        basicRemoved.set(pid, r);
        return;
      }
      if (card) seenSet(pid).cards.delete(card.type + ':' + card.num);
      return;
    }
    // 恐惧获得
    if (TOK.fearGain.test(text)) {
      pushSnapshot(pid);
      ownershipAction.set(pid, true);
      if (!fearGained.has(pid)) fearGained.set(pid, new Set());
      fearGained.get(pid).add('logg:' + (fearGained.get(pid).size + 1));
      return;
    }
    // 其余带玩家名的行（付资源 / 移动 / 研究 / 用助手…）都不是归属变更
    ownershipAction.set(pid, false);
  }

  // 全量扫描日志，未处理过的才解析；日志数量减少（撤销）时全量重建
  function updateLogTracker(doc, players) {
    const logs = Array.from(doc.querySelectorAll('#logs .log[id^="log_"]'));
    if (!logs.length) return;
    const pidMap = {};
    players.forEach((p) => { pidMap[p.name] = p.id; });
    if (logInited && logs.length < logCount) {
      // 撤销/回放重建：清空日志维护的状态，全量重来（含终局清单，否则它会变成陈旧值）
      seenCards.clear();
      finalFear.clear();
      fearGained.clear();
      fearExiled.clear();
      idToCard.clear();
      basicRemoved.clear();
      playerStacks.clear();
      ownershipAction.clear();
      logProcessed = new Set();
    }
    logCount = logs.length;
    logInited = true;
    // 日志 DOM 是倒序（最新在前），必须按 id 升序（旧→新）处理，否则"先删后加"顺序颠倒
    const ordered = logs.slice().sort((a, b) => {
      const ia = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
      const ib = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
      return ia - ib;
    });
    for (const log of ordered) {
      const id = log.id;
      if (logProcessed.has(id)) continue;
      logProcessed.add(id);
      parseLogEntry(log.textContent, log, pidMap);
    }
  }

  function collectState() {
    const fr = getFrame();
    const gd = fr && fr.win.gameui && fr.win.gameui.gamedatas;
    if (!gd || !gd.players) return null;
    if (!isArnakGame(gd)) return null;
    const doc = fr.doc;

    const birdTemple = !!gd.bird_temple;
    const mode = detectMode();
    // 日志补全：对局/观战/回放全部启用。界面语言决定动作措辞包（中文/英文）
    const logLang = detectLogLang(doc);
    const isLogMode = (mode === 'spectator' || mode === 'replay' || mode === 'player') && !!logLang;
    logModeActive = isLogMode;
    currentLogPack = logLang ? LOG_PACKS[logLang] : null;
    // 玩家身份统一成字符串：优先用 p.id（与 9.5 同源，也是 DOM 选择器与 notif args 用的那个值），
    // 取不到才退回 gamedatas.players 的键（键一定存在且唯一）。
    // 数字/字符串两种形态都归一，否则拿它跟 DOM dataset 比会永远不相等，
    // 后果是标签切不动、甚至多人落到同一个牌库。
    const playerKey = (key) => {
      const p = gd.players[key];
      return String(p.id != null ? p.id : key);
    };

    // 先把日志账本跑完，再取牌明细：否则本帧拿到的是账本处理前的旧账
    // （回放停下、界面不再重绘时，这一拍永远追不上，就表现为“少了几张牌”）
    if (isLogMode) {
      updateLogTracker(doc, Object.keys(gd.players).map((key) => ({ name: gd.players[key].name, id: playerKey(key) })));
    }

    const players = Object.keys(gd.players).map((key) => {
      const p = gd.players[key];
      const pid = playerKey(key);
      // 观战日志模式：牌库由日志维护，fear 由日志计数，跳过 play/hand 的 fear 双计
      (p.hand || []).forEach((c) => { if (isLogMode && c.type === 'fear') return; rememberCard(pid, c); });
      (p.play || []).forEach((c) => { if (isLogMode && c.type === 'fear') return; rememberCard(pid, c); });

      // 牌明细：结算后刷新/中途加入时事件追踪缺失，用官方 scoreBreakdown 校准恐惧数和卡牌分
      // （注意：这层只影响卡牌与恐惧两项，总分仍由插件自算）
      const cd = cardDetailOf(pid);
      if (p.scoreBreakdown) {
        cd.fearCount = Math.max(0, -(+p.scoreBreakdown.fear || 0));
        cd.normalPts = +p.scoreBreakdown.cards || 0;
      }

      return {
        id: pid,
        name: p.name,
        color: p.color,
        // “我”只看观看者自己的 player_id：current_player_id 是「当前回合的人」，
        // 觀战时会把正在行动的人标成“（我）”，观战者根本没入局
        isMe: !!(fr.win.gameui && pid === String(fr.win.gameui.player_id)),
        research: { glass: +p.research_glass, book: +p.research_book },
        templeRank: p.temple_rank,
        // guardian 是开局快照，从 DOM 读实时值；idol 总数 = 空闲(idol) + 入槽(4 - idol_slot)，两字段都活
        guardians: domCount(doc, '#player_board_' + pid + ' .counter-number-guardian'),
        idols: +p.idol + (4 - +p.idol_slot),
        idolSlots: +p.idol_slot,
        temple: {
          bronze: domCountAll(doc, '#player_board_' + pid + ' .temple-wrap .temple-tile.bronze'),
          silver: domCountAll(doc, '#player_board_' + pid + ' .temple-wrap .temple-tile.silver'),
          gold: domCountAll(doc, '#player_board_' + pid + ' .temple-wrap .temple-tile.gold'),
        },
        cardDetail: cd,
        basicRemoved: basicRemoved.get(pid) || { fund: 0, explore: 0 },
        scoreBreakdown: p.scoreBreakdown || null,
      };
    });
    // 回合数：gamedatas.round 是开局快照，优先从 DOM 月杖容器读 roundN class
    const round = (() => {
      const staff = doc.querySelector('.staff-parent');
      if (staff) {
        const m = String(staff.className).match(/round(\d+)/);
        if (m) return +m[1];
      }
      return +gd.round || 1;
    })();

    return { round, birdTemple, players, gameEnd: !!players[0].scoreBreakdown, mode };
  }

  // ════════════════════════════════════════════════════════════
  // 四、装配层：iframe 探测 / 根节点 / 监听
  // ════════════════════════════════════════════════════════════
  function isTopWindow() { return window.self === window.top; }

  function findGameRoot(doc) {
    doc = doc || document;
    const q = doc.querySelector('#game_play_area, #table-wrap, .game_play_area');
    if (q) return q;
    // 兜底：找 class/id 含 arnak 的最上层容器
    const hit = Array.from(doc.querySelectorAll('[class*="arnak" i], [id*="arnak" i]'))
      .find((n) => n.children.length >= 5);
    return hit ? (hit.closest('#game_play_area, #table-wrap') || hit) : null;
  }

  function findArnakIframe() {
    // 排除 blank 壳（回放页的空 iframe），只认真实游戏 iframe
    return Array.from(document.querySelectorAll('iframe'))
      .find((f) => f.src && /arnak/i.test(f.src) && !/blank/i.test(f.src) && f.contentDocument);
  }

  function getFrame() {
    if (!isTopWindow()) return { win: window, doc: document };
    // 顶层有游戏 DOM 直接用顶层（回放页）；否则钻真实游戏 iframe（对局页）
    if (findGameRoot()) return { win: window, doc: document };
    const f = findArnakIframe();
    return f ? { win: f.contentWindow, doc: f.contentDocument } : null;
  }

  function getGamedatas() {
    const fr = getFrame();
    return fr && fr.win.gameui && fr.win.gameui.gamedatas;
  }

  // 阿纳克身份检测：特征字段（鸟庙布尔/研究 bonus/版图位置），避免在其他游戏页面弹出
  function isArnakGame(gd) {
    return !!(gd && (gd.bird_temple !== undefined || gd.research_bonus !== undefined || gd.board_position !== undefined));
  }

  // 运行模式：replay 回放 / player 自己打 / spectator 观战
  function detectMode() {
    if (/\/archive\/replay\//.test(location.href)) return 'replay';
    const fr = getFrame();
    if (!fr) return 'unknown';
    const gu = fr.win.gameui;
    const gd = gu && gu.gamedatas;
    if (!gd || !gd.players) return 'unknown';
    const pid = gu.player_id;
    if (pid != null && Object.keys(gd.players).some((k) => String(k) === String(pid))) return 'player';
    return 'spectator';
  }

  function domCount(doc, sel) {
    const el = doc.querySelector(sel);
    return el ? +el.innerHTML : 0;
  }

  function domCountAll(doc, sel) {
    return doc.querySelectorAll(sel).length;
  }

  // ════════════════════════════════════════════════════════════
  // 五、浮窗 UI
  // ════════════════════════════════════════════════════════════
  let panel = null;

  function ensureStyle() {
    if (document.getElementById('arnak-scorer-style')) return;
    const style = document.createElement('style');
    style.id = 'arnak-scorer-style';
    style.textContent = `

      #arnak-panel {
        --ap-bg: rgba(28,28,30,0.82);
        --ap-head-bg: rgba(255,255,255,0.06);
        --ap-text: #F5EFE4;
        --ap-sub: rgba(245,239,228,0.62);
        --ap-faint: rgba(245,239,228,0.45);
        --ap-border: rgba(255,255,255,0.12);
        --ap-top: #F2C14E;
        --ap-danger: #FF453A;
        --ap-hover: rgba(255,255,255,0.07);
        position: fixed; right: 14px; top: 45%; z-index: 999999;
        width: 288px; border-radius: 16px; overflow: hidden;
        background: var(--ap-bg);
        -webkit-backdrop-filter: blur(20px) saturate(1.6);
        backdrop-filter: blur(20px) saturate(1.6);
        color: var(--ap-text);
        font: 12px/1.6 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 10px 40px rgba(0,0,0,0.45);
        border: 0.5px solid var(--ap-border);
        user-select: none;
      }
      #arnak-panel.ap-light {
        --ap-bg: rgba(251,247,238,0.88);
        --ap-head-bg: rgba(0,0,0,0.03);
        --ap-text: #2A2622;
        --ap-sub: #4A433C;
        --ap-faint: #8F867B;
        --ap-border: rgba(42,38,34,0.14);
        --ap-top: #9D5F4D;
        --ap-danger: #8B2C1F;
        --ap-hover: rgba(83,125,150,0.08);
        box-shadow: 0 10px 40px rgba(42,38,34,0.22);
      }
      #arnak-panel * { box-sizing: border-box; }
      #arnak-panel .ap-head { display: flex; align-items: center; gap: 3px; padding: 9px 12px; cursor: move; background: var(--ap-head-bg); border-bottom: 0.5px solid var(--ap-border); }
      #arnak-panel .ap-title { flex: 1 1 auto; min-width: 0; font-weight: 600; font-size: 13px; color: var(--ap-text); letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #arnak-panel .ap-mode, #arnak-panel .ap-close { flex: none; cursor: pointer; padding: 0 3px; color: var(--ap-text); font-size: 12px; line-height: 1.3; opacity: 0.75; }
      #arnak-panel .ap-mode:hover, #arnak-panel .ap-close:hover { opacity: 1; }
      #arnak-panel .ap-close:hover { color: var(--ap-danger); }
      #arnak-panel .ap-body { max-height: 62vh; overflow-y: auto; padding: 5px 0; }
      #arnak-panel .ap-tabs { display: flex; gap: 5px; padding: 8px 10px; border-bottom: 0.5px solid var(--ap-border); }
      #arnak-panel .ap-tab {
        flex: 1; min-width: 0; padding: 5px 6px; cursor: pointer;
        background: transparent; border: 0.5px solid var(--ap-border); border-radius: 999px;
        font: 600 11px/1.35 inherit; color: var(--ap-sub); text-align: center;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        transition: background 0.15s, color 0.15s;
      }
      #arnak-panel .ap-tab:hover { background: var(--ap-hover); }
      #arnak-panel .ap-tab.active { background: #537D96; border-color: #537D96; color: #fff; }
      #arnak-panel .ap-tab-total { display: block; font-size: 13.5px; font-weight: 700; color: var(--ap-text); font-variant-numeric: tabular-nums; }
      #arnak-panel .ap-tab.active .ap-tab-total { color: #fff; }
      #arnak-panel .ap-tab-total.top { color: var(--ap-top); }
      #arnak-panel .ap-tab.active .ap-tab-total.top { color: #fff; }
      #arnak-panel .ap-detail { padding: 8px 12px 10px; }
      #arnak-panel .ap-dhead { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
      #arnak-panel .ap-dname { flex: 1; font-weight: 600; font-size: 13.5px; color: var(--ap-text); }
      #arnak-panel .ap-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      #arnak-panel .ap-grid { display: flex; gap: 18px; }
      #arnak-panel .ap-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      #arnak-panel .ap-gitem { display: flex; justify-content: space-between; align-items: baseline; padding: 1.5px 0; font-size: 11.5px; color: var(--ap-sub); }
      #arnak-panel .ap-gitem b { color: var(--ap-text); font-weight: 600; font-variant-numeric: tabular-nums; }
      #arnak-panel .ap-gitem.fear b { color: var(--ap-danger); }
      #arnak-panel .ap-zones { margin-top: 7px; border-top: 0.5px solid var(--ap-border); padding-top: 6px; }
      #arnak-panel .ap-zone { display: flex; gap: 6px; font-size: 11px; line-height: 1.7; }
      #arnak-panel .ap-zone-label { flex: none; color: var(--ap-faint); }
      #arnak-panel .ap-zone-cards { color: var(--ap-sub); word-break: break-all; }
      #arnak-panel .ap-chip { display: inline-block; padding: 0 7px; margin: 1px 3px 1px 0; border-radius: 7px; font-size: 11px; line-height: 1.8; white-space: nowrap; font-weight: 600; }
      #arnak-panel .ap-chip-fund { background: #F2C14E; color: #1C1C1E; }
      #arnak-panel .ap-chip-explore { background: #7FB069; color: #1C1C1E; }
      #arnak-panel .ap-chip-item { background: #A57B5A; color: #1C1C1E; }
      #arnak-panel .ap-chip-art { background: #6D9DC5; color: #1C1C1E; }
      #arnak-panel .ap-chip-fear { background: #8E8E93; color: #fff; }
      #arnak-panel .ap-foot { padding: 6px 12px; font-size: 11px; color: var(--ap-faint); border-top: 0.5px solid var(--ap-border); display: flex; justify-content: space-between; }

`;
    document.head.appendChild(style);
  }

  function createPanel() {
    ensureStyle();
    const el = document.createElement('div');
    el.id = 'arnak-panel';
    el.innerHTML = `
      <div class="ap-head">
        <span class="ap-title">阿纳克 · 实时计分</span>
        <span class="ap-mode" title="深浅切换">深</span>
        <span class="ap-close" title="收起">×</span>
      </div>
      <div class="ap-body"></div>
      <div class="ap-foot">
        <span class="ap-round"></span>
        <span class="ap-ver">v0.9.15</span>
      </div>`;
    document.body.appendChild(el);

    // 收起 → 右下角迷你图标，点击恢复（内联样式保证正圆形）
    const mini = document.createElement('div');
    mini.className = 'ap-mini';
    mini.textContent = '计';
    mini.style.cssText = 'position:fixed;right:16px;bottom:20px;z-index:999999;width:44px;height:44px;border-radius:50%;cursor:pointer;background:rgba(28,28,30,0.85);color:#F2C14E;border:0.5px solid rgba(255,255,255,0.15);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);display:none;align-items:center;justify-content:center;font:600 15px/1 -apple-system,"PingFang SC",sans-serif;box-shadow:0 4px 18px rgba(0,0,0,0.35);user-select:none;';
    document.body.appendChild(mini);
    el.querySelector('.ap-close').addEventListener('click', () => {
      el.style.display = 'none';
      mini.style.display = 'flex';
    });
    // 迷你图标：可拖动；未拖动（点击）时恢复面板
    let miniDrag = null;
    mini.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const sl = mini.offsetLeft, st = mini.offsetTop;
      miniDrag = { sx, sy, sl, st, moved: false };
      const move = (ev) => {
        const d = miniDrag;
        if (!d) return;
        const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
        if (d.moved) {
          mini.style.left = (d.sl + dx) + 'px';
          mini.style.top = (d.st + dy) + 'px';
          mini.style.right = 'auto';
          mini.style.bottom = 'auto';
        }
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        const wasMoved = miniDrag && miniDrag.moved;
        miniDrag = null;
        if (!wasMoved) {
          mini.style.display = 'none';
          el.style.display = '';
        }
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    // 深浅模式：首次跟随系统，之后记住选择，可手动切换
    const modeKey = 'arnak_scorer_mode';
    const modeBtn = el.querySelector('.ap-mode');
    function getInitialMode() {
      try {
        const saved = localStorage.getItem(modeKey);
        if (saved === 'dark' || saved === 'light') return saved;
      } catch (e) { /* ignore */ }
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    function applyMode(mode) {
      el.classList.remove('ap-dark', 'ap-light');
      el.classList.add('ap-' + mode);
      modeBtn.textContent = mode === 'dark' ? '深' : '浅';
      // 迷你图标内联配色跟随
      if (mode === 'light') {
        mini.style.background = 'rgba(251,247,238,0.92)';
        mini.style.color = '#9D5F4D';
        mini.style.borderColor = 'rgba(42,38,34,0.14)';
      } else {
        mini.style.background = 'rgba(28,28,30,0.85)';
        mini.style.color = '#F2C14E';
        mini.style.borderColor = 'rgba(255,255,255,0.15)';
      }
      try { localStorage.setItem(modeKey, mode); } catch (e) { /* ignore */ }
    }
    modeBtn.addEventListener('click', () => {
      const cur = el.classList.contains('ap-dark') ? 'dark' : 'light';
      applyMode(cur === 'dark' ? 'light' : 'dark');
    });
    applyMode(getInitialMode());

    const body = el.querySelector('.ap-body');

    const head = el.querySelector('.ap-head');
    let dragging = false, dx = 0, dy = 0;
    head.addEventListener('mousedown', (e) => {
      dragging = true;
      dx = e.clientX - el.getBoundingClientRect().left;
      dy = e.clientY - el.getBoundingClientRect().top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, e.clientX - dx) + 'px';
      el.style.top = Math.max(0, e.clientY - dy) + 'px';
      el.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    return { el, body };
  }

  let currentViewId = null;
  let lastState = null;

  function computeScored(state) {
    return state.players
      .map((p) => ({ p, s: scorePlayer(p, state.birdTemple) }))
      .sort((a, b) => b.s.total - a.s.total);
  }

  // 标签栏只更新数字/激活态，不重建（避免切换卡顿）
  function updateTabs(scored) {
    const tabsEl = panel.body.querySelector('.ap-tabs');
    if (!tabsEl) return;
    const scoreMap = new Map(scored.map((x) => [x.p.id, x]));
    tabsEl.querySelectorAll('.ap-tab').forEach((btn) => {
      const entry = scoreMap.get(btn.dataset.id);
      const totalEl = btn.querySelector('.ap-tab-total');
      if (entry && totalEl) totalEl.textContent = entry.s.total;
      btn.classList.toggle('active', btn.dataset.id === currentViewId);
      if (totalEl) totalEl.classList.toggle('top', scored.length && scored[0].p.id === btn.dataset.id);
    });
  }

  // 详情区（当前查看玩家）独立渲染，切换时只重建这一小块
  function renderDetail(scored) {
    const detailEl = panel.body.querySelector('.ap-detail');
    if (!detailEl || !scored.length) return;
    const cur = scored.find((x) => x.p.id === currentViewId) || scored[0];
    const { p, s } = cur;
    const rowHtml = ([label, v, cls]) => `<div class="ap-gitem${cls ? ' ' + cls : ''}"><span>${label}</span><b>${v}</b></div>`;
    const left = [
      ['放大镜', s.parts.glass, ''],
      ['神像槽位', s.parts.idolSlots, ''],
      ['神庙板块', s.parts.temple, ''],
      ['卡牌分', s.parts.cards, ''],
    ].map(rowHtml).join('');
    const right = [
      ['笔记本', s.parts.book, ''],
      ['神像', s.parts.idols, ''],
      ['守护者', s.parts.guardians, ''],
      ['恐惧', s.parts.fear, 'fear'],
    ].map(rowHtml).join('');
    const gridHtml = `<div class="ap-col">${left}</div><div class="ap-col">${right}</div>`;

    const detailHtml = (p.cardDetail)
      ? (() => {
          const d = p.cardDetail;
          const items = d.normal.filter((c) => c.type === 'item').sort((a, b) => a.num - b.num);
          const arts = d.normal.filter((c) => c.type === 'art').sort((a, b) => a.num - b.num);
          const chip = (cls, text) => `<span class="ap-chip ap-chip-${cls}">${text}</span>`;
          const br = p.basicRemoved || { fund: 0, explore: 0 };
          const lib = [
            ...Array(Math.max(0, 2 - br.fund)).fill(chip('fund', '资金')),
            ...Array(Math.max(0, 2 - br.explore)).fill(chip('explore', '探索')),
            ...items.map((c) => chip('item', `${cardNameOf(c.type, c.num)}(${c.pts})`)),
            ...arts.map((c) => chip('art', `${cardNameOf(c.type, c.num)}(${c.pts})`)),
            ...Array(d.fearCount).fill(chip('fear', '恐惧')),
          ];
          // 牌库列表是“见过的牌”（日志 + 可见区），与官方卡牌分不完全等同，故用“已见”命名
          return `<div class="ap-zones"><div class="ap-zone"><span class="ap-zone-label">已见牌库</span><span class="ap-zone-cards">${lib.join('')}</span></div></div>`;
        })()
      : '';

    detailEl.innerHTML = `
      <div class="ap-dhead">
        <span class="ap-dot" style="background:#${p.color}"></span>
        <span class="ap-dname">${p.name}${p.isMe ? '（我）' : ''}</span>
      </div>
      <div class="ap-grid">${gridHtml}</div>
      ${detailHtml}`;
  }

  function render(state) {
    if (!panel) panel = createPanel();
    lastState = state;
    const scored = computeScored(state);
    if (!scored.length) return;

    if (!currentViewId || !state.players.some((pl) => pl.id === currentViewId)) {
      const me = state.players.find((pl) => pl.isMe) || scored[0].p;
      currentViewId = me.id;
    }

    const body = panel.body;
    if (!body.querySelector('.ap-tabs')) {
      // 首次：创建标签栏 + 绑定点击（之后不再重建）
      const scoreMap = new Map(scored.map((x) => [x.p.id, x]));
      // 标签顺序：我排最左，其余按座位序跟在后面（观战时没有“我”，就纯座位序）。
      // 用 sort 的稳定性保证“其余依次”，锚点是身份而不是分数，所以不会随比分跳位。
      const ordered = state.players.slice().sort((a, b) => (a.isMe ? 0 : 1) - (b.isMe ? 0 : 1));
      const tabs = ordered.map((pp) => {
        const entry = scoreMap.get(pp.id);
        const total = entry ? entry.s.total : 0;
        return `
        <button class="ap-tab${pp.id === currentViewId ? ' active' : ''}" data-id="${pp.id}" title="${pp.name}">
          ${pp.name}
          <span class="ap-tab-total${scored[0].p.id === pp.id ? ' top' : ''}">${total}</span>
        </button>`;
      }).join('');
      body.innerHTML = `<div class="ap-tabs">${tabs}</div><div class="ap-detail"></div>`;
      body.querySelectorAll('.ap-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentViewId = btn.dataset.id;
          const sc = computeScored(lastState);
          updateTabs(sc);
          renderDetail(sc);
        });
      });
    }

    updateTabs(scored);
    renderDetail(scored);

    panel.el.querySelector('.ap-round').textContent =
      `${state.mode === 'replay' ? '回放' : state.mode === 'spectator' ? '观战' : '对局'} · ${state.round}/5 · ${state.birdTemple ? '鸟庙' : '蛇庙'}${state.gameEnd ? ' · 终局' : ''}`;
  }

  // ════════════════════════════════════════════════════════════
  // 六、装配
  // ════════════════════════════════════════════════════════════
  let active = false;
  let waitLogged = false;

  function init() {
    if (active) return true;
    // 顶层壳页面且顶层无游戏 DOM → 让位给 iframe 实例（对局页）；回放页顶层有游戏则自己接管
    if (isTopWindow() && findArnakIframe() && !findGameRoot()) return true;
    const fr = getFrame();
    const gd = fr && fr.win.gameui && fr.win.gameui.gamedatas;
    if (!gd) {
      if (CONFIG.DEBUG && !waitLogged) { console.log('[arnak-scorer] 等待 gamedatas…'); waitLogged = true; }
      return false;
    }
    if (!isArnakGame(gd)) {
      if (CONFIG.DEBUG && !waitLogged) console.log('[arnak-scorer] 非阿纳克游戏，插件静默');
      waitLogged = true;
      return true;
    }
    active = true;

    // hook 恐惧卡移除追踪（对局页/回放页同一框架）
    const fr0 = getFrame();
    if (fr0) hookExileTracking(fr0.win);

    let timer = null;
    const refresh = () => {
      const state = collectState();
      if (state) render(state);
    };
    const throttled = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refresh(); }, CONFIG.RENDER_THROTTLE_MS);
    };

    // 挂 body：游戏容器可能被重建（回放重放），body 永不失效
    new MutationObserver(throttled).observe(document.body, { subtree: true, childList: true, attributes: true });
    refresh();
    if (CONFIG.DEBUG) console.log('[arnak-scorer] 已挂载，gameRoot=' + (findGameRoot() ? '有' : '无'));
    return true;
  }

  if (!init()) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (init() || tries > CONFIG.ROOT_POLL_MAX) clearInterval(timer);
    }, CONFIG.ROOT_POLL_MS);
  }

  // 手动钩子：强制渲染浮窗 + 诊断（回放页排查用）
  window.__arnakShow = function () {
    console.log('[arnak-scorer] 手动触发: URL=' + location.href);
    console.log('[arnak-scorer] gameRoot:', findGameRoot() ? '有' : '无');
    const gd = getGamedatas();
    console.log('[arnak-scorer] gamedatas:', gd ? '有 players=' + Object.keys(gd.players || {}).length : '无');
    if (gd && gd.players) {
      Object.values(gd.players).forEach((p) => {
        console.log('[arnak-scorer] 玩家 ' + p.name + ': scoreBreakdown=' + (p.scoreBreakdown ? JSON.stringify(p.scoreBreakdown) : '无') + ' officialScore=' + p.score);
      });
    }
    if (active) console.log('[arnak-scorer] 已处于接管状态');
    // 已见牌明细
    seenCards.forEach((s, pid) => {
      const cards = [];
      for (const c of s.cards.values()) cards.push(c.type + '#' + c.num + '=' + cardPoints(c.type, c.num));
      const exiled = (fearExiled.get(pid) || new Set()).size;
      const gained = (fearGained.get(pid) || new Set()).size;
      console.log('[arnak-scorer] 玩家' + pid + ' seen牌: ' + (cards.join(', ') || '(无)') + ' | fear 新增=' + gained + ' 移除=' + exiled + ' 实际=' + fearCount(pid) + ' | seenPoints=' + seenPoints(pid));
    });
    const state = collectState();
    if (state) { render(state); console.log('[arnak-scorer] 浮窗已渲染'); return true; }
    console.log('[arnak-scorer] 无数据，未渲染');
    return false;
  };

  // 情报层（开发期保留）
  window.__arnakDump = function () {
    const doc = (isTopWindow() && findArnakIframe()) ? findArnakIframe().contentDocument : document;
    return { url: location.href, hasGameArea: !!doc.querySelector('#game_play_area'), gamedatasKeys: getGamedatas() ? Object.keys(getGamedatas()) : null };
  };
})();
