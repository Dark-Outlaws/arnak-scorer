// ==UserScript==
// @name         阿纳克实时计分 (Arnak Live Scorer)
// @namespace    arnak.live.scorer
// @version      0.9.64
// @description  BGA《失落的阿纳克遗迹》：常驻浮窗显示所有玩家实时终局分（基础版，鸟庙/蛇庙）
// @author       浮沉 & hanako
// @homepageURL  https://github.com/Dark-Outlaws/arnak-scorer
// @supportURL   https://github.com/Dark-Outlaws/arnak-scorer/issues
// @updateURL    https://ghfast.top/https://raw.githubusercontent.com/Dark-Outlaws/arnak-scorer/main/arnak-scorer.user.js
// @downloadURL  https://ghfast.top/https://raw.githubusercontent.com/Dark-Outlaws/arnak-scorer/main/arnak-scorer.user.js
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
      isFear: (s) => s.indexOf('恐惧') >= 0,
      isFund: (s) => s.indexOf('资金') >= 0,
      isExplore: (s) => s.indexOf('探索') >= 0,
    },
    en: {
      score: (t) => { const m = t.match(/(-?\d+)\s+points?\s+(?:for|with)\s+(.+)/i); return m ? { src: m[2], pts: parseInt(m[1], 10) } : null; },
      isFearSource: (s) => /fear/i.test(s),
      boundary: /ends?\s+(?:their|his|her)\s+turn|(?:has\s+)?passed\b|\bpasses\b|draws?\s+(?:a|\d+)\s+cards?|start(?:ing)? player (?:token|marker)/i,
      undo: /cancels?\s+(?:their|his|her)\s+(?:action|move)|undoes?\s+(?:their|his|her)?\s*(?:last\s+)?(?:action|move)/i,
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
  // 已被放逐的牌（pid → Set('item:25')），防止从陈旧快照里复活
  const exileKeys = new Map();

  function seenSet(pid) {
    if (!seenCards.has(pid)) seenCards.set(pid, { cards: new Map(), fears: new Map() });
    return seenCards.get(pid);
  }

  function rememberCard(pid, card) {
    if (!card || !card.type) return;
    const t = card.type;
    // 只认计分牌；起始牌（资金/探索）与其它类型一律不进牌库（避免 basic#NaN 这类脏条目）
    if (t !== 'item' && t !== 'art' && t !== 'fear') return;
    // 已经放逐掉的牌不许回来：gamedatas 的 play 数组可能还是旧的，
    // 不拦的话每帧都会把「放逐自身的牌」（水瓶 / 粗略地图 / 空投这类）重新加回牌库
    if (t !== 'fear') {
      const ex = exileKeys.get(pid);
      if (ex && ex.has(t + ':' + card.num)) return;
    }
    const s = seenSet(pid);
    if (t === 'fear') {
      s.fears.set(String(card.id != null ? card.id : 'f' + s.fears.size), true);
    } else {
      s.cards.set(t + ':' + card.num, { type: t, num: +card.num });
      if (card.id != null) idToCard.set(String(card.id), { type: t, num: +card.num, pid });
    }
  }

  // 记一笔「这张已经放逐了」：从已见里抹掉，并阻止它从陈旧快照里复活
  function markExiled(pid, key) {
    if (!key) return;
    seenSet(pid).cards.delete(key);
    if (!exileKeys.has(pid)) exileKeys.set(pid, new Set());
    exileKeys.get(pid).add(key);
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

  // hook 调用计量：判断 wrapNotif 到底有没有真的包上
  function hookLog(name, args) {
    try {
      const arr = window.__arnakHookLog || (window.__arnakHookLog = []);
      arr.push({ t: Date.now(), name, args });
      if (arr.length > 30) arr.splice(0, arr.length - 30);
    } catch (e) { /* ignore */ }
  }

  // hook 游戏的 fear 通知：notif_gainFear 记新增，notif_exileCard 记移除，notif_showAllCards 终局全量重灌
  function hookExileTracking(win) {
    const gu = win.gameui;
    if (!gu || gu.__arnakExileHooked) return;
    const proto = gu.constructor && gu.constructor.prototype;

    // 移除：把牌从「已见」里删掉。item/art 的删除是幂等的，日志模式也做：
    // 日志里不一定有「移除了 X」这行（放逐自身的牌常常只发通知），只靠日志会漏删。
    wrapNotif(proto, 'notif_exileCard', (args) => {
      const pid = args.player_id == null ? null : String(args.player_id);
      if (!pid) return;
      const ct = String(args.cardType);
      if (ct === 'item' || ct === 'art') {
        const ref = idToCard.get(String(args.cardId));
        const key = ref ? ref.type + ':' + ref.num : (args.cardNum != null && args.cardNum !== '' ? ct + ':' + (+args.cardNum) : null);
        if (ref) {
          seenSet(ref.pid).cards.delete(ref.type + ':' + ref.num);
          idToCard.delete(String(args.cardId));
        }
        if (key) markExiled(pid, key);
        return;
      }
      if (logModeActive) return;   // 恐惧计数交给日志，避免双计
      if (ct === 'fear') {
        if (!fearExiled.has(pid)) fearExiled.set(pid, new Set());
        const es = fearExiled.get(pid);
        es.add(String(args.cardId != null ? args.cardId : 'x' + es.size));
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

    // ── 牌组模拟：买进 / 放回牌堆顶 / 抽牌 / 回合末洗牌 ─────────────
    const meNow = () => String(gu.player_id);
    wrapNotif(proto, 'notif_putToDeck', (args) => {
      hookLog('putToDeck', args);
      if (logModeActive) return;   // 日志通道负责买牌，避免双计
      if (!deckSeeded) return;
      const pid = args.playerId == null ? null : String(args.playerId);
      if (!pid || pid !== meNow()) return;
      const card = cardById(gu, args.cardId, win.document);
      if (card) deckPush(card, !!args.top);
    });
    wrapNotif(proto, 'notif_drawSelfCard', (args) => {
      hookLog('drawSelfCard', args);
      if (!deckSeeded) return;
      deckDraw(args.card_id);
    });
    wrapNotif(proto, 'notif_shufflePlay', () => {
      hookLog('shufflePlay', {});
      if (!deckSeeded) return;
      const p = gu.gamedatas && gu.gamedatas.players && gu.gamedatas.players[meNow()];
      const raw = p && p.play;
      const n = raw ? (Array.isArray(raw) ? raw.length : Object.keys(raw).length) : 0;
      deckShuffleIn(n);
    });

    gu.__arnakExileHooked = true;
  }

  // ── 日志账本（logMode，对局/观战/回放全部启用）──
  // BGA 只发状态快照+增量通知，历史牌库靠解析 #logs 历史日志补全
  // 已处理日志用 Set 去重（全量扫描，不依赖日志 id 递增顺序，观战历史日志可能乱序加载）
  let logProcessed = new Set();
  let logCount = 0;
  let logInited = false;
  let logInitialScan = false;   // 首次全量回放 / 重建期间为真，避免把历史买牌重复叠进牌组
  let roundLogCount = 0;        // 日志里「出牌区洗混」出现几次 = 已结束几轮
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

  // 日志通道的买牌：日志里这条线一旦出现，就说明牌进了牌堆底部。
  // 在主流程里就把它接进牌组模型（不再依赖 hook 是否真的包上了）。
  function noteBuy(card, text) {
    if (!card || !deckSeeded || logInitialScan) return;
    const view = { type: card.type, kind: card.type, num: card.num, name: cardNameOf(card.type, card.num), id: 'buy:' + card.type + ':' + card.num };
    deckPush(view, /顶部|\btop\b/i.test(text));
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
    // 防住恐惧的句子同样含「获得…恐惧」（作战面具/净化坡坍这类），必须先拦下来
    fearPrevent: /不\s*获得\s*\d*\s*张?\s*恐惧|未\s*获得\s*\d*\s*张?\s*恐惧|(?:does|do|did|will|would)\s+not\s+(?:gain|take|get|receive)|ignore[sd]?\s+(?:a\s+|the\s+)?fears?/i,
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
    // 回合末把出牌区洗混后放到牌堆底部 → 之前买的牌不再贴着牌堆底（补录段作废）
    // 回合末：出牌区洗混后放到牌堆底部。这行没有玩家名前缀，也没说张数，
    // 所以一当轮次计数（每出现一次 = 结束一轮），二当信号：接下来的增张落在底部。
    if (/洗混|洗牌|shuffle/i.test(text) && /牌堆|deck/i.test(text)) {
      deckShufflePending = true;
      roundLogCount += 1;
    }
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
      if (card) {
        // 又买了一张同名牌：之前放逐的那张不再代表现在，解除封锁
        const ex = exileKeys.get(pid);
        if (ex) ex.delete(card.type + ':' + card.num);
        rememberCard(pid, { type: card.type, num: card.num });
      }
      // 牌组还没播种时，先把买牌记下来（底部的名字是确定的，能补回来）
      if (mePid != null && pid === mePid) noteBuy(card, text);
      return;
    }
    // 打出：牌只是换了位置（手牌 → 已打出区），归属没变，不压栈
    if (TOK.play.test(text)) {
      ownershipAction.set(pid, false);
      if (card) {
        rememberCard(pid, { type: card.type, num: card.num });
        notePlay(pid, card, roundLogCount + 1);
      }
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
      if (card) markExiled(pid, card.type + ':' + card.num);
      return;
    }
    // 恐惧获得
    // 「Dark Irregulars 因作战面具不获得恐惧牌」这类句子里也有「获得…恐惧」，
    // 宽正则会把否定句当肯定句，凭空多算一张恐惧。先拦否定，再认获得。
    if (TOK.fearPrevent.test(text)) return;
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

  // 每个玩家每轮打出的牌：pid -> Map(roundNo -> [cardView])
  // 对手那栏靠它显示「上一回合打了什么」，数据来自日志，回放/观战一样有
  const playByRound = new Map();

  function notePlay(pid, card, roundNo) {
    if (!card || !card.type) return;
    const t = card.type;
    if (t !== 'item' && t !== 'art' && t !== 'basic' && t !== 'fear') return;
    if (!playByRound.has(pid)) playByRound.set(pid, new Map());
    const m = playByRound.get(pid);
    if (!m.has(roundNo)) m.set(roundNo, []);
    const arr = m.get(roundNo);
    const view = handCardView({ type: t, num: card.num, id: t + ':' + card.num + ':' + arr.length });
    // 物品/神器一牌一版，同轮重复出现只记一次；
    // 资金/探索/恐惧 是成对的，打两张就要显两张，不能按 type:num 合并
    if (view.type === 'item' || view.type === 'art') {
      const key = view.type + ':' + view.num;
      if (arr.some((c) => c.type + ':' + c.num === key)) return;
    }
    arr.push(view);
  }

  // 全量扫描日志，未处理过的才解析；日志数量减少（撤销）时全量重建
  function updateLogTracker(doc, players) {
    const logs = Array.from(doc.querySelectorAll('#logs .log[id^="log_"]'));
    if (!logs.length) return;
    const pidMap = {};
    players.forEach((p) => { pidMap[p.name] = p.id; });
    const rebuilding = logInited && logs.length < logCount;
    if (rebuilding) {
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
      roundLogCount = 0;
      playByRound.clear();
      exileKeys.clear();
    }
    logInitialScan = !logInited || rebuilding;
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
    logInitialScan = false;
  }

  // ════════════════════════════════════════════════════════════
  // 三之三、手牌层：读「我」每轮的手牌
  // ════════════════════════════════════════════════════════════
  // 手牌是隐藏信息：服务端只把 hand 发给本人，别人营地只有 #hand-amt-<pid> 这个数字。
  // 所以这层只在「自己打的对局」里有数据，观战与回放一律跳过。
  // 活的源是 gameui.hand：drawSelfCard 往里 push、cardPlayed / exileCard 往里 splice，
  // 它同时也是 updateHand 的渲染源，跟玩家屏幕上看到的一致。
  // gamedatas.players[pid].hand 只在开局那一刻准（notif 里 restoreServerGameState 会把
  // gamedatas 整包换掉，而游戏自己还捏着旧的 this.hand），只当快照用。
  const handByRound = new Map();   // round -> [{ sig, cards }]

  // 手牌里的牌长这样（实测）：起始牌与恐惧全是 type:'basic'，子类型塞在 num 里，而且是字符串。
  //   {id:'7', type:'basic', num:'fear'}
  //   {id:'8', type:'basic', num:'fundship'} / fundcar / exploreship / explorecar
  // 注意：同一张恐惧在 play 区与 notif_gainFear 里是 {type:'fear', num:null}，两处表示不一样。
  // 所以这里统一拆一个 kind 出来（fear / fund / explore / item / art），num 只存有意义的数值。
  function handCardView(c) {
    const t = String(c.type);
    const raw = c.num;
    if (t === 'basic') {
      const k = String(raw);
      let kind = 'other';
      let name = 'basic#' + k;
      if (k === 'fear') { kind = 'fear'; name = '恐惧'; }
      else if (k.indexOf('fund') === 0) { kind = 'fund'; name = '资金'; }
      else if (k.indexOf('explore') === 0) { kind = 'explore'; name = '探索'; }
      else if (k === 'back') { kind = 'back'; name = '牌背'; }
      return { id: String(c.id), kind, type: t, num: k, name };
    }
    if (t === 'fear') return { id: String(c.id), kind: 'fear', type: t, num: null, name: '恐惧' };
    const n = raw == null || raw === '' ? null : +raw;
    return { id: String(c.id), kind: t, type: t, num: n, name: cardNameOf(t, n) };
  }

  // DOM 节点 → 卡牌视图。dataset 里全是字符串，"null" 要还原成真正的空
  function cardFromEl(el) {
    return handCardView({
      id: el.dataset.cardid,
      type: el.dataset.cardtype,
      num: el.dataset.cardnum === 'null' ? null : el.dataset.cardnum,
    });
  }

  // 手牌只在「带 gameui 的那个窗口」里。顶层页面的 #game_play_area / #table-wrap 也会命中，
  // 所以不能靠根节点找窗口（对局页的顶层实例只是个壳，它的 gameui 是 undefined），
  // 直接枚举真带 gameui 的窗口，不猜设备、不看 src。
  // 所有能碰到的同源窗口：自己 → 顶层 → 递归扫 iframe（深度限 3）。
  // gameUiSources 与 eloDocs 都从这里取，不再各写一套「顶层 + iframe」的探测。
  function sameOriginFrames() {
    const out = [];
    const add = (win, doc, depth) => {
      if (!win || !doc || depth > 3) return;
      if (out.some((s) => s.win === win)) return;
      out.push({ win, doc });
      let frames = [];
      try { frames = Array.from(doc.querySelectorAll('iframe')); } catch (e) { return; }
      for (const f of frames) {
        try {
          const fd = f.contentDocument;
          if (fd) add(f.contentWindow, fd, depth + 1);
        } catch (e) { /* 跨域跳过 */ }
      }
    };
    add(window, document, 0);
    try { if (window.top && window.top !== window) add(window.top, window.top.document, 0); } catch (e) { /* 跨域跳过 */ }
    return out;
  }

  // 真带 gameui 的窗口（对局页的顶层实例只是个壳，它的 gameui 是 undefined）
  function gameUiSources() {
    return sameOriginFrames().filter((s) => {
      try { return !!s.win.gameui; } catch (e) { return false; }
    });
  }

  function readHandFrom(src) {
    const gu = src.win && src.win.gameui;
    if (!gu) return null;
    if (Array.isArray(gu.hand)) return gu.hand.map(handCardView);
    // 兜底：DOM。updateHand 给手牌外框挂 .hand，外层带 data-cardtype（fear 的 num 是 "null" 字符串）
    const me = String(gu.player_id);
    const els = src.doc.querySelectorAll('.camp-' + me + ' .card-outer.hand');
    if (!els.length) return null;
    return Array.from(els).map(cardFromEl);
  }

  // 出牌区：返回 null = 读不到（营地还没渲染），调用方自己兜底；
  // 返回空数组 = 真的没牌。这两件事必须分开：回合初出牌区本来就是空的，
  // 若因为「空」就回退到 gamedatas.players[].play，会把上一回合的牌又摆回来。
  function readPlayFrom(src, pid) {
    const gu = src.win && src.win.gameui;
    if (!gu) return null;
    const who = String(pid != null ? pid : gu.player_id);
    const camp = src.doc.querySelector('.camp-' + who);
    if (!camp) {
      // 营地还没出来：退回 gamedatas（服务端可能发的是对象而不是数组，两种都收）
      const gd = gu.gamedatas;
      const p = gd && gd.players && gd.players[who];
      const raw = p && p.play;
      if (!raw) return null;
      const list = Array.isArray(raw) ? raw : Object.keys(raw).map((k) => raw[k]);
      return list.filter(Boolean).map(handCardView);
    }
    // 手牌带 .hand、牌堆带 .deck，两者之外的 card-outer 就是本轮已出的牌
    const out = [];
    Array.from(camp.querySelectorAll('.card-outer')).forEach((el) => {
      const cl = el.classList;
      if (cl.contains('hand') || cl.contains('deck')) return;
      if (!el.dataset.cardtype) return;   // 还没渲染完的过渡节点
      out.push(cardFromEl(el));
    });
    return out;
  }

  // 手牌和出牌区一起读：两边任一个变了就算新快照
  function readBoard(fr) {
    const tried = [];
    const trySrc = (src) => {
      if (!src || !src.win || tried.indexOf(src.win) >= 0) return null;
      tried.push(src.win);
      try {
        const cards = readHandFrom(src);
        if (!cards) return null;
        return { cards, played: readPlayFrom(src) || [] };
      } catch (e) { return null; }
    };
    const fromGiven = trySrc(fr);
    if (fromGiven) return fromGiven;
    for (const src of gameUiSources()) {
      const r = trySrc(src);
      if (r) return r;
    }
    return null;
  }

  function readHand(fr) {
    const b = readBoard(fr);
    return b ? b.cards : null;
  }

  // 每轮记一串快照：手牌或出牌区变了就追加，第一份是本轮第一帧
  function trackHand(round, board) {
    if (!board) return;
    const cards = board.cards;
    const played = board.played || [];
    const sig = cards.map((c) => c.id).sort().join(',') + '|' + played.map((c) => c.id).sort().join(',');
    if (!handByRound.has(round)) handByRound.set(round, []);
    const list = handByRound.get(round);
    if (list.length && list[list.length - 1].sig === sig) return;
    list.push({ sig, cards, played });
  }

  // ════════════════════════════════════════════════════════════
  // 三之四、牌组层：推断牌堆里已知牌的张位
  // ════════════════════════════════════════════════════════════
  // 牌堆是洗混的，只能知道张数；但三条硬规则给了我们牌序的铉口：
  //   · 买进的牌放在牌堆底部
  //   · 每轮开始抽 5 张（从顶部）
  //   · 回合末把出牌区洗混后放到牌堆底部
  // 于是牌堆可以建模成一串「自底向上」的分块：已知顺序的牌 / 未知×N。
  // 位置 = 总张数 − 离底部的偏移，所以官方 deck_amt 一变，所有位置自动上移。
  let deckSegs = [];       // 自底向上：{ cards: [cardView] } 或 { n }
  let deckSeeded = false;
  let deckDrift = false;   // 模型与服务器不同步时的降级标记
  let deckKeyStr = null;   // sessionStorage 键：同一局 + 同一玩家才复用
  const roundPlayedIds = new Set();   // 本轮出牌区出现过的牌（保留供诊断用）
  let deckShufflePending = false;     // 刚看到「出牌区洗混放回牌堆底部」，接下来的增张要落在底部
  let mePid = null;

  // 刷新、装新版本都不该把已知牌序丢掉，所以存到 sessionStorage。
  // 键里带 table 与 player，换局自然换键。
  function deckStorageKey(gu) {
    let table = '';
    try { const m = String(location.search).match(/[?&]table=(\d+)/); table = m ? m[1] : ''; } catch (e) { /* ignore */ }
    const pid = gu && gu.player_id != null ? String(gu.player_id) : '';
    return 'arnak_deck_v3_' + table + '_' + pid;
  }

  function deckSave() {
    if (!deckKeyStr || !deckSeeded) return;
    try { sessionStorage.setItem(deckKeyStr, JSON.stringify({ segs: deckSegs, drift: deckDrift })); } catch (e) { /* 满了 / 禁用就静静退化 */ }
  }

  function deckRestore(total) {
    if (!deckKeyStr) return false;
    try {
      const raw = sessionStorage.getItem(deckKeyStr);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.segs) || !obj.segs.length) return false;
      // 已经漂移过的模型不可信，宁可重新从日志重建
      if (obj.drift) return false;
      const sum = obj.segs.reduce((a, s) => a + (s.n != null ? s.n : (s.cards ? s.cards.length : 0)), 0);
      // 模型每帧都跟官方张数对齐，所以正确的存档必然与原张数相等；不等就说明旧模型是错的或期间发生过变动
      if (total != null && sum !== total) return false;
      deckSegs = obj.segs;
      deckSeeded = true;
      deckDrift = false;
      return true;
    } catch (e) { return false; }
  }

  function deckSeed(total) {
    // 只存张数，不猜内容：中途启动/刷新后，牌堆里有什么牌是真的不知道。
    // 买牌从这一刻起由日志继续往上记，补历史那套只会骗自己（买过又被抽走的牌会被当成还在牌堆里）。
    deckSegs = [{ n: Math.max(0, total || 0) }];
    deckSeeded = true;
    deckDrift = false;
    deckSave();
  }

  function deckSum() {
    return deckSegs.reduce((a, s) => a + (s.n != null ? s.n : s.cards.length), 0);
  }

  function deckPush(card, atTop) {
    if (!deckSeeded || !card) return;
    if (atTop) {
      const top = deckSegs[deckSegs.length - 1];
      if (top && top.cards) top.cards.push(card);
      else deckSegs.push({ cards: [card] });
    } else {
      const bottom = deckSegs[0];
      if (bottom && bottom.cards) bottom.cards.unshift(card);
      else deckSegs.unshift({ cards: [card] });
    }
    deckSave();
  }

  function deckDraw(id) {
    if (!deckSeeded || !deckSegs.length) return;
    const top = deckSegs[deckSegs.length - 1];
    if (top.n != null) {
      top.n -= 1;
      if (top.n <= 0) deckSegs.pop();
      deckSave();
      return;
    }
    const c = top.cards[top.cards.length - 1];
    if (c && String(c.id) === String(id)) {
      top.cards.pop();
      if (!top.cards.length) deckSegs.pop();
    } else {
      // 抽到的不是模型认为的顶牌：与服务器不同步，位置标注降级为不确定
      deckDrift = true;
    }
    deckSave();
  }

  function deckShuffleIn(n) {
    if (!deckSeeded || !(n > 0)) return;
    const bottom = deckSegs[0];
    if (bottom && bottom.n != null) bottom.n += n;
    else deckSegs.unshift({ n });
    deckSave();
  }

  // 与官方张数对齐：多出来的牌默认当作「牌堆顶的未知块」，少了就从顶部扣。
  // 顶部已是已知块时，多出的牌只能另起一块未知盖在它上面（未知牌本来就可能在那里）。
  function deckSync(total) {
    if (total == null) return;
    if (!deckSeeded) {
      if (!deckRestore(total)) deckSeed(total);
    }
    const delta = total - deckSum();
    if (delta === 0) { if (deckDrift) { deckDrift = false; deckSave(); } return; }
    if (delta > 0) {
      if (deckShufflePending) {
        // 回合末洗回来的那堆：落在牌堆底部，不是盖在最前面
        deckShuffleIn(delta);
        deckSave();
        return;
      }
      const top = deckSegs[deckSegs.length - 1];
      if (top && top.n != null) top.n += delta;
      else deckSegs.push({ n: delta });
      deckSave();
      return;
    }
    // 张数变少 = 开始抽牌，洗牌那一波到此结束
    deckShufflePending = false;
    let need = -delta;
    while (need > 0 && deckSegs.length) {
      const top = deckSegs[deckSegs.length - 1];
      if (top.n != null) {
        const take = Math.min(top.n, need);
        top.n -= take;
        need -= take;
        if (top.n <= 0) deckSegs.pop();
      } else {
        // 张数变少一般是抽牌，从顶部吃，吃到已知牌也算正常（那就是被抽走了）
        const take = Math.min(top.cards.length, need);
        top.cards.splice(top.cards.length - take, take);
        need -= take;
        if (!top.cards.length) deckSegs.pop();
      }
    }
    if (need > 0) deckDrift = true;
    deckSave();
  }

  // 自顶向下的牌位列表，供面板展示（segs 可传入其他实例的账本）
  function deckSnapshot(total, segs) {
    if (!segs && !deckSeeded) return null;
    const list = segs || deckSegs;
    const items = [];
    let pos = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const seg = list[i];
      if (seg.n != null) {
        if (seg.n > 0) {
          items.push({ unknown: seg.n, from: pos + 1, to: pos + seg.n });
          pos += seg.n;
        }
      } else {
        for (let j = seg.cards.length - 1; j >= 0; j--) {
          pos += 1;
          items.push({ card: seg.cards[j], pos });
        }
      }
    }
    return { total: total != null ? total : pos, items, drift: deckDrift || (total != null && pos !== total) };
  }

  // 官方张数：营地里的 .deck-amt 是活的（cardToDeck +1、drawSelfCard -1）
  function deckAmtOf(doc, pid) {
    const el = doc && doc.querySelector('.camp-' + pid + ' .deck-amt');
    if (!el) return null;
    const n = parseInt(el.textContent, 10);
    return Number.isFinite(n) ? n : null;
  }

  // 按 id 反查一张牌。优先看 DOM：cardToDeck 靠 #card-<id> 找节点，没节点会直接抛错，
  // 所以那一刻 DOM 一定在，而供应堆数组可能已过期。
  function cardById(gu, id, doc) {
    if (id == null) return null;
    const sid = String(id);
    const el = doc && doc.querySelector('#card-' + sid);
    if (el && el.dataset && el.dataset.cardtype) return cardFromEl(el);
    if (!gu) return null;
    const pools = [];
    [gu.hand, gu.itemSupply, gu.artSupply].forEach((p) => { if (Array.isArray(p)) pools.push(p); });
    const gd = gu.gamedatas;
    if (gd && gd.players) {
      Object.keys(gd.players).forEach((k) => {
        const pl = gd.players[k] && gd.players[k].play;
        if (Array.isArray(pl)) pools.push(pl);
      });
    }
    for (const pool of pools) {
      const hit = pool.find((c) => c && String(c.id) === sid);
      if (hit) return handCardView(hit);
    }
    return null;
  }

  // 回合数：对数靠日志里「出牌区洗混」的条数（含历史，刷新也准）；
  // 拿不到日志时才退回月杖容器的 roundN class。
  // 注意 class 上那个开局写进去的 round0 永远不会被移除，直接取第一个匹配会永远停在 0。
  function roundOf(doc, gd) {
    if (logInited) return roundLogCount + 1;
    const staff = doc.querySelector('.staff-parent');
    if (staff) {
      const hits = String(staff.className).match(/round(\d+)/g) || [];
      const nums = hits.map((s) => parseInt(s.replace(/\D/g, ''), 10)).filter((n) => Number.isFinite(n));
      if (nums.length) return Math.max(...nums) + 1;
    }
    return Math.max(1, +gd.round + 1 || 1);
  }

  function collectState() {
    const fr = getFrame();
    const gd = fr && fr.win.gameui && fr.win.gameui.gamedatas;
    if (!gd || !gd.players) return null;
    if (!isArnakGame(gd)) return null;
    const doc = fr.doc;

    const birdTemple = !!gd.bird_temple;
    const mode = detectMode();
    mePid = fr.win.gameui && fr.win.gameui.player_id != null ? String(fr.win.gameui.player_id) : null;
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

    // 牌组模型与官方张数对齐（只对本人），必须赶在下面取快照之前
    if (mode === 'player' && fr.win.gameui) {
      if (!deckKeyStr) deckKeyStr = deckStorageKey(fr.win.gameui);
      const dTotal = deckAmtOf(doc, String(fr.win.gameui.player_id));
      const domPlayMe = fr ? readPlayFrom(fr, mePid) : null;
      (domPlayMe || []).forEach((c) => roundPlayedIds.add(c.id));
      deckSync(dTotal);
    }

    const players = Object.keys(gd.players).map((key) => {
      const p = gd.players[key];
      const pid = playerKey(key);
      // 出牌区以 DOM 为准：gamedatas 的 play 数组有时是旧的（restoreServerGameState 换过引用），
      // 已经放逐的牌会从旧数组里被每帧重新加回牌库。DOM 是渲染结果，移除的牌不会留在里面。
      const domPlay = fr ? (readPlayFrom(fr, pid) || []) : [];
      const playSrc = domPlay.length ? domPlay : (p.play || []);
      // 观战日志模式：牌库由日志维护，fear 由日志计数，跳过 play/hand 的 fear 双计
      (p.hand || []).forEach((c) => { if (isLogMode && c.type === 'fear') return; rememberCard(pid, c); });
      playSrc.forEach((c) => { if (isLogMode && c.type === 'fear') return; rememberCard(pid, c); });

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
        // 每个玩家的出牌区（公开信息，DOM 里都能读）
        played: domPlay,
        // 牌组只算自己：别人的牌堆只有张数，没有可靠牌序
        deck: (fr && fr.win.gameui && pid === String(fr.win.gameui.player_id)) ? deckSnapshot(deckAmtOf(doc, pid)) : null,
        basicRemoved: basicRemoved.get(pid) || { fund: 0, explore: 0 },
        scoreBreakdown: p.scoreBreakdown || null,
      };
    });
    // 回合数（与牌组块用同一个函数，保证同帧一致）
    const round = roundOf(doc, gd);

    // 手牌快照：每轮记一串变化，第一帧就是本轮最早看到的手牌
    // 对局模式下永远给一个 board：手牌空了就是空数组，不能变成 null，
    // 否则下面「牌库 = 已见 − 手牌 − 已出」会因为拿不到手牌而整段失效
    const board = mode === 'player'
      ? (readBoard(fr) || { cards: [], played: (fr && readPlayFrom(fr, mePid)) || [] })
      : null;
    if (board) trackHand(round, board);

    return {
      round, birdTemple, players, gameEnd: !!players[0].scoreBreakdown, mode,
      // 手牌与出牌区只属于「我」，观战/回放里为 null（服务端不发隐藏信息）
      hand: board ? board.cards : null,
      played: board ? board.played : null,
    };
  }

  // ════════════════════════════════════════════════════════════
  // 三之二、ELO 情报层（可选增强；取不到就静默降级，绝不影响计分）
  // ════════════════════════════════════════════════════════════
  // BGA 界面自己会渲染每位玩家在这个游戏里的 ELO：<span id="player_elo_<玩家id>">745</span>。
  // 零请求、零解析：不碰个人资料页（资料页 fetch 超时、iframe 403，见《姬路城》那次排查）。
  // 一局只读一次：首次读到数字就存住，之后不再查 DOM，也不随对局进程变化。
  // 元素常晚于首帧渲染，读不到返回 null（详情头就不由这段），下次重绘再试。
  const eloSeen = {};   // pid -> '745'

  // 手机上 BGA 的玩家条可能另一个框架里，所以不只查本窗口与顶层，
  // 把能碰到的同源 iframe 都扫一遭（深度限 3，避免递归坑）。
  function eloDocs() {
    return sameOriginFrames().map((s) => s.doc);
  }

  function eloOf(pid) {
    if (eloSeen[pid] != null) return eloSeen[pid];
    try {
      for (const d of eloDocs()) {
        const el = d.getElementById('player_elo_' + pid);
        if (!el) continue;
        const t = String(el.textContent || '').trim();
        if (!t) continue;
        eloSeen[pid] = t;
        return t;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // 详情头：名字后面跟一句 ELO 745（玩家卡上已直接显示，这里仅作兼容保留）
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
    // 顶层自己有 gameui 就是它在跑游戏（回放页）；否则钻真实游戏 iframe（对局页）。
    // 以 gameui 为判断依据，不用 DOM 根节点：顶层壳页也可能有 #table-wrap，
    // 但那里的 gameui 是空的，书签版（只跑顶层）就会一直卡在等 gamedatas。
    if (window.gameui && window.gameui.gamedatas) return { win: window, doc: document };
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
        --ap-bg: linear-gradient(180deg, rgba(38,50,58,0.92), rgba(27,37,44,0.94));
        --ap-text: #E7EEF3;
        --ap-sub: #A9B7C1;
        --ap-faint: #7E8E9A;
        --ap-border: rgba(255,255,255,0.12);
        --ap-card: rgba(255,255,255,0.06);
        --ap-cardbd: rgba(255,255,255,0.12);
        --ap-danger: #FF6B60;
        --ap-top: #9FD3F0;
        position: fixed; right: 14px; top: 45%; z-index: 999999;
        width: 292px; border-radius: 15px; overflow: hidden;
        background: var(--ap-bg);
        -webkit-backdrop-filter: blur(20px) saturate(1.6);
        backdrop-filter: blur(20px) saturate(1.6);
        color: var(--ap-text);
        font: 12px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 12px 34px rgba(6,16,20,0.34), inset 0 0.5px 0 rgba(255,255,255,0.16);
        border: 0.5px solid var(--ap-border);
        user-select: none;
      }
      #arnak-panel.ap-light {
        --ap-bg: linear-gradient(180deg, rgba(238,247,252,0.94), rgba(224,238,247,0.90));
        --ap-text: #22303A;
        --ap-sub: #5A6B77;
        --ap-faint: #8293A0;
        --ap-border: rgba(120,150,170,0.22);
        --ap-card: rgba(255,255,255,0.50);
        --ap-cardbd: rgba(120,150,170,0.28);
        --ap-danger: #C0392B;
        --ap-top: #1F4A63;
        box-shadow: 0 12px 34px rgba(42,58,66,0.24), inset 0 0.5px 0 rgba(255,255,255,0.85);
      }
      #arnak-panel * { box-sizing: border-box; }

      /* 顶栏：标题 + 深浅 + 关闭 */
      #arnak-panel .ap-head { display: flex; align-items: center; gap: 6px; padding: 10px 10px 0 13px; cursor: move; }
      #arnak-panel .ap-title { flex: 1 1 auto; min-width: 0; font-weight: 600; font-size: 11.5px; letter-spacing: .2px; color: var(--ap-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #arnak-panel .ap-mode, #arnak-panel .ap-close {
        flex: none; display: inline-flex; align-items: center; justify-content: center;
        height: 19px; min-width: 19px; padding: 0 5px; border-radius: 6px; cursor: pointer;
        font: 600 10.5px/1 inherit; color: var(--ap-faint);
        background: transparent; border: 0.5px solid var(--ap-cardbd);
        transition: color .15s, border-color .15s;
      }
      #arnak-panel .ap-close { font-size: 12px; font-weight: 400; padding: 0 4px; }
      #arnak-panel .ap-mode:hover, #arnak-panel .ap-close:hover { color: var(--ap-text); }
      #arnak-panel .ap-close:hover { color: var(--ap-danger); }

      /* 玩家卡 */
      #arnak-panel .ap-players { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 9px 12px 11px; }
      #arnak-panel .ap-pcard {
        display: block; text-align: left; cursor: pointer; padding: 7px 9px 8px; border-radius: 11px;
        background: var(--ap-card); border: 0.5px solid var(--ap-cardbd); color: var(--ap-text);
        font: inherit; transition: background .15s, border-color .15s, box-shadow .15s;
      }
      #arnak-panel .ap-pcard:hover { border-color: rgba(120,160,190,0.55); }
      #arnak-panel .ap-pcard.on {
        background: linear-gradient(160deg, #39647F, #2C4F66);
        border-color: rgba(255,255,255,0.25); color: #F2F8FC;
        box-shadow: 0 4px 12px rgba(30,60,80,0.28);
      }
      #arnak-panel .ap-pname { display: block; font-size: 11px; font-weight: 600; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #arnak-panel .ap-pscore { display: block; font-size: 23px; font-weight: 700; line-height: 1.15; letter-spacing: -.4px; font-variant-numeric: tabular-nums; }
      #arnak-panel .ap-pcard.on .ap-pscore { color: #C9E7F7; }
      #arnak-panel .ap-pscore.top { color: var(--ap-top); }
      #arnak-panel .ap-pcard.on .ap-pscore.top { color: #C9E7F7; }
      #arnak-panel .ap-pelo { display: block; font-size: 9.5px; letter-spacing: .3px; opacity: .62; margin-top: 1px; }

      /* 分项 */
      #arnak-panel .ap-detail { max-height: 56vh; overflow-y: auto; }
      #arnak-panel .ap-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; padding: 2px 13px 10px; }
      #arnak-panel .ap-st { display: flex; justify-content: space-between; align-items: baseline; padding: 2.5px 0; font-size: 11.5px; color: var(--ap-sub); }
      #arnak-panel .ap-st b { font-weight: 600; color: var(--ap-text); font-variant-numeric: tabular-nums; }
      #arnak-panel .ap-st.warn b { color: var(--ap-danger); }

      /* 牌区：手牌/已出 | 牌组/牌库 两组 */
      #arnak-panel .ap-zones { border-top: 0.5px solid var(--ap-border); padding: 0 13px; }
      #arnak-panel .ap-zone { display: flex; align-items: flex-start; padding: 4.5px 0; }
      #arnak-panel .ap-zone:first-child { padding-top: 8px; }
      #arnak-panel .ap-zone.gap { padding-top: 11px; margin-top: 5px; border-top: 0.5px solid var(--ap-border); }
      #arnak-panel .ap-zone:last-child { padding-bottom: 10px; }
      #arnak-panel .ap-zone-label { flex: none; width: 34px; font-size: 10px; letter-spacing: .4px; color: var(--ap-faint); padding-top: 2px; }
      #arnak-panel .ap-zone-cards { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; }
      #arnak-panel .ap-chip { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 10.5px; line-height: 1.6; white-space: nowrap; font-weight: 600; }
      #arnak-panel .ap-chip-fund { background: #F0D28A; color: #3A2E10; }
      #arnak-panel .ap-chip-explore { background: #A9CE93; color: #22301A; }
      #arnak-panel .ap-chip-item { background: #CDA98C; color: #33241A; }
      #arnak-panel .ap-chip-art { background: #A6C3DE; color: #1D2E3D; }
      #arnak-panel .ap-chip-fear { background: #B9C0C6; color: #232A30; }
      #arnak-panel .ap-chip-unknown { background: transparent; border: 0.5px dashed var(--ap-cardbd); color: var(--ap-faint); font-weight: 500; }
      #arnak-panel.ap-dark .ap-chip { filter: saturate(.88) brightness(.96); }
      #arnak-panel .ap-dash { color: var(--ap-faint); font-size: 11px; line-height: 1.9; }

      /* 底栏：轮次 + 版本 */
      #arnak-panel .ap-foot { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 6px 13px 7px; border-top: 0.5px solid var(--ap-border); font-size: 10.5px; color: var(--ap-faint); }
      #arnak-panel .ap-ver { font-variant-numeric: tabular-nums; letter-spacing: .2px; }

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
      <div class="ap-players"></div>
      <div class="ap-detail"></div>
      <div class="ap-foot">
        <span class="ap-round"></span>
        <span class="ap-ver">v0.9.64</span>
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

    const body = el;

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
  let zoneMin = 0;   // 牌区块见过的最大高度，用于对齐自己与对手的面板高度

  function computeScored(state) {
    return state.players
      .map((p) => ({ p, s: scorePlayer(p, state.birdTemple) }))
      .sort((a, b) => b.s.total - a.s.total);
  }

  // 玩家卡：只在人数变化时重建，之后只更新分数与选中态
  function updatePlayers(scored) {
    const wrap = panel.body.querySelector('.ap-players');
    if (!wrap) return;
    const scoreMap = new Map(scored.map((x) => [x.p.id, x]));
    wrap.querySelectorAll('.ap-pcard').forEach((btn) => {
      const entry = scoreMap.get(btn.dataset.id);
      const totalEl = btn.querySelector('.ap-pscore');
      if (entry && totalEl) totalEl.textContent = entry.s.total;
      if (totalEl) totalEl.classList.toggle('top', scored.length > 0 && scored[0].p.id === btn.dataset.id);
      const eloEl = btn.querySelector('.ap-pelo');
      if (eloEl) { const e = eloOf(btn.dataset.id); eloEl.textContent = e ? 'ELO ' + e : 'ELO —'; }
      btn.classList.toggle('on', btn.dataset.id === currentViewId);
    });
  }

  // 详情区（当前查看玩家）：八格分项 + 四条牌区
  function renderDetail(scored) {
    const detailEl = panel.body.querySelector('.ap-detail');
    if (!detailEl || !scored.length) return;
    const cur = scored.find((x) => x.p.id === currentViewId) || scored[0];
    const { p, s } = cur;

    const stat = ([label, v, cls]) => `<div class="ap-st${cls ? ' ' + cls : ''}"><span>${label}</span><b>${v}</b></div>`;
    const stats = [
      stat(['放大镜', s.parts.glass, '']),
      stat(['笔记本', s.parts.book, '']),
      stat(['神像槽位', s.parts.idolSlots, '']),
      stat(['神像', s.parts.idols, '']),
      stat(['神庙板块', s.parts.temple, '']),
      stat(['守护者', s.parts.guardians, '']),
      stat(['卡牌分', s.parts.cards, '']),
      stat(['恐惧', s.parts.fear, 'warn']),
    ].join('');

    const zones = [];
    const d = p.cardDetail;
    if (d) {
      const items = d.normal.filter((c) => c.type === 'item').sort((a, b) => a.num - b.num);
      const arts = d.normal.filter((c) => c.type === 'art').sort((a, b) => a.num - b.num);
      const chip = (cls, text) => `<span class="ap-chip ap-chip-${cls}">${text}</span>`;
      const chipOf = (c) => chip(['fund', 'explore', 'item', 'art', 'fear'].indexOf(c.kind) >= 0 ? c.kind : 'item', c.name);
      const DASH = '<span class="ap-dash">—</span>';
      const mine = !!p.isMe;
      const handList = (lastState && Array.isArray(lastState.hand)) ? lastState.hand : [];

      // 手牌：只有自己知道，对手那栏不出
      if (mine) {
        const handChips = handList.map(chipOf).join('');
        zones.push(`<div class="ap-zone"><span class="ap-zone-label">手牌</span><span class="ap-zone-cards">${handChips || DASH}</span></div>`);
      }

      // 已出：所有人的出牌区都是公开信息（只给自己看，对手那栏只要牌库）
      if (mine) {
        const playedChips = (p.played || []).map(chipOf).join('');
        zones.push(`<div class="ap-zone"><span class="ap-zone-label">弃牌</span><span class="ap-zone-cards">${playedChips || DASH}</span></div>`);
      }

      // 牌组：只有自己知道牌序，对手那栏占位不出内容
      if (mine) {
        let deckBody = DASH;
        const dk = p.deck;
        if (dk) {
          const chips = dk.items.map((it) => {
            if (it.unknown != null) {
              const at = it.from === it.to ? '#' + it.from : '#' + it.from + '-' + it.to;
              return `<span class="ap-chip ap-chip-unknown">${at} 未知×${it.unknown}</span>`;
            }
            const c = it.card;
            const cls = ['fund', 'explore', 'item', 'art', 'fear'].indexOf(c.kind) >= 0 ? c.kind : 'item';
            return `<span class="ap-chip ap-chip-${cls}">#${it.pos} ${c.name}</span>`;
          });
          deckBody = `<span class="ap-dash">${dk.total}张${dk.drift ? ' ?' : ''}</span>${chips.join('')}`;
        }
        zones.push(`<div class="ap-zone gap"><span class="ap-zone-label">牌组</span><span class="ap-zone-cards">${deckBody}</span></div>`);
      }

      // 牌库：自己的扣掉手牌与已出；对手只能列已见（没有手牌可扣）
      const br = p.basicRemoved || { fund: 0, explore: 0 };
      let lib;
      if (mine) {
        // 同一张卡可能同时存在于两份快照，按 id 去重
        const held = new Map();
        for (const c of handList) held.set(c.id, c);
        for (const c of (p.played || [])) held.set(c.id, c);
        let fundHeld = 0, exploreHeld = 0, fearHeld = 0;
        const cardHeld = new Set();
        for (const c of held.values()) {
          if (c.kind === 'fund') fundHeld++;
          else if (c.kind === 'explore') exploreHeld++;
          else if (c.kind === 'fear') fearHeld++;
          else if (c.type === 'item' || c.type === 'art') cardHeld.add(c.type + ':' + c.num);
        }
        lib = [
          ...Array(Math.max(0, 2 - br.fund - fundHeld)).fill(chip('fund', '资金')),
          ...Array(Math.max(0, 2 - br.explore - exploreHeld)).fill(chip('explore', '探索')),
          ...items.filter((c) => !cardHeld.has('item:' + c.num)).map((c) => chip('item', `${cardNameOf(c.type, c.num)}(${c.pts})`)),
          ...arts.filter((c) => !cardHeld.has('art:' + c.num)).map((c) => chip('art', `${cardNameOf(c.type, c.num)}(${c.pts})`)),
          ...Array(Math.max(0, d.fearCount - fearHeld)).fill(chip('fear', '恐惧')),
        ];
      } else {
        lib = [
          ...Array(Math.max(0, 2 - br.fund)).fill(chip('fund', '资金')),
          ...Array(Math.max(0, 2 - br.explore)).fill(chip('explore', '探索')),
          ...items.map((c) => chip('item', `${cardNameOf(c.type, c.num)}(${c.pts})`)),
          ...arts.map((c) => chip('art', `${cardNameOf(c.type, c.num)}(${c.pts})`)),
          ...Array(Math.max(0, d.fearCount)).fill(chip('fear', '恐惧')),
        ];
      }
      // 对手：上一回合打了什么（日志里推出来的，回放/观战一样有）
      if (!mine) {
        const rNow = (lastState && lastState.round) || 1;
        const byRound = playByRound.get(p.id);
        const prev = (byRound && byRound.get(rNow - 1)) || [];
        const prevChips = prev.map(chipOf).join('');
        zones.push(`<div class="ap-zone"><span class="ap-zone-label">上回合</span><span class="ap-zone-cards">${prevChips || DASH}</span></div>`);
      }

      zones.push(`<div class="ap-zone"><span class="ap-zone-label">牌库</span><span class="ap-zone-cards">${lib.join('') || DASH}</span></div>`);
    }

    detailEl.innerHTML = `<div class="ap-stats">${stats}</div><div class="ap-zones">${zones.join('')}</div>`;

    // 两边高度对齐：牌区块记住见过的最大高度，内容少的一方用 min-height 补齐
    const zEl = detailEl.querySelector('.ap-zones');
    if (zEl) {
      zoneMin = Math.max(zoneMin, zEl.scrollHeight);
      zEl.style.minHeight = zoneMin + 'px';
    }
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
    const wrap = body.querySelector('.ap-players');
    const sig = state.players.map((p) => p.id).join(',');
    if (wrap.dataset.sig !== sig) {
      // 顺序：我排最左，其余按座位序；锚点是身份，不随比分跳位
      const ordered = state.players.slice().sort((a, b) => (a.isMe ? 0 : 1) - (b.isMe ? 0 : 1));
      wrap.innerHTML = ordered.map((pp) => `
        <button class="ap-pcard${pp.id === currentViewId ? ' on' : ''}" data-id="${pp.id}" title="${pp.name}">
          <span class="ap-pname">${pp.name}</span>
          <span class="ap-pscore">0</span>
          <span class="ap-pelo">ELO —</span>
        </button>`).join('');
      wrap.dataset.sig = sig;
      wrap.querySelectorAll('.ap-pcard').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentViewId = btn.dataset.id;
          const sc = computeScored(lastState);
          updatePlayers(sc);
          renderDetail(sc);
        });
      });
    }

    updatePlayers(scored);
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

  // 给其他框架（顶层的控制台）看的账本
  window.__arnakHandStore = handByRound;
  window.__arnakDeckRaw = function () {
    return { seeded: deckSeeded, drift: deckDrift, segs: deckSegs };
  };

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

  // 手牌诊断：当前手牌 / 每轮的手牌变化序列
  window.__arnakHand = function () {
    const cards = readHand(getFrame());
    if (cards) {
      console.table(cards.map((c) => ({ id: c.id, kind: c.kind, type: c.type, num: c.num, name: c.name })));
      return cards;
    }
    // 只在失败时打诊断，成功时保持安静
    const srcs = gameUiSources();
    console.log('[arnak-scorer] 读不到手牌：带 gameui 的窗口 ' + srcs.length + ' 个');
    if (srcs.length) {
      console.table(srcs.map((s) => ({
        窗口: s.win === window ? '本窗口' : '其他窗口',
        玩家: s.win.gameui.player_id,
        hand字段: Array.isArray(s.win.gameui.hand) ? s.win.gameui.hand.length + ' 张' : typeof s.win.gameui.hand,
        手牌DOM: s.doc.querySelectorAll('.card-outer.hand').length,
      })));
    } else {
      console.log('[arnak-scorer] 没有窗口带 gameui，把控制台上方的执行上下文切到游戏 iframe 再试');
    }
    return null;
  };

  // 每轮快照存在各自的实例里，同一局里只有真正在计分的那个实例有数据；
  // 跨框架可读（同源），所以这里把候选窗口的账本都捞一遍
  function handStores() {
    const out = [];
    const srcs = gameUiSources();
    srcs.push({ win: window, doc: document });
    for (const s of srcs) {
      let st = null;
      try { st = s.win && s.win.__arnakHandStore; } catch (e) { continue; }
      // 跨域取不到 Map 身份，只做鸭子类型判断
      if (!st || typeof st.get !== 'function' || typeof st.forEach !== 'function' || !st.size) continue;
      if (out.indexOf(st) < 0) out.push(st);
    }
    return out;
  }

  window.__arnakHands = function (round) {
    const stores = handStores();
    const store = stores.length ? stores[0] : handByRound;
    const rounds = round != null ? [+round] : Array.from(store.keys()).sort((a, b) => a - b);
    const out = [];
    const json = {};
    for (const r of rounds) {
      const list = store.get(r) || [];
      // 本轮「出过的所有牌」：跨快照取并集，否则回合末洗回牌库后出牌区会变空，最后一帧就看不到出过什么
      const seenPlayed = new Set();
      const playedAll = [];
      for (const s of list) {
        for (const c of (s.played || [])) {
          if (seenPlayed.has(c.id)) continue;
          seenPlayed.add(c.id);
          playedAll.push(c);
        }
      }
      json[r] = {
        hands: list.map((s) => s.cards.map((c) => c.name)),
        played: playedAll.map((c) => c.name),
      };
      list.forEach((snap, i) => {
        const played = snap.played || [];
        const prev = i > 0 ? list[i - 1] : null;
        let step = '首帧';
        if (prev) {
          const dHand = snap.cards.length - prev.cards.length;
          const dPlay = played.length - (prev.played || []).length;
          if (dHand > 0) step = '抽+' + dHand;
          else if (dHand < 0) step = '出' + dHand;
          else if (dPlay > 0) step = '出牌区+' + dPlay;
          else if (dPlay < 0) step = '洗回' + (-dPlay);
          else step = '换牌';
        }
        out.push({
          round: r,
          step,
          count: snap.cards.length,
          cards: snap.cards.map((c) => c.name).join('、'),
          played: played.map((c) => c.name).join('、'),
        });
      });
    }
    console.table(out);
    return json;   // { 轮次: { hands: [[手牌名…]…], played: [已出名…] } }
  };

  // hook 诊断：包上了没、最近调用过什么
  window.__arnakHooks = function () {
    const srcs = gameUiSources();
    if (!srcs.length) { console.log('[arnak-scorer] 没有窗口带 gameui'); return null; }
    const out = [];
    srcs.forEach((s) => {
      const proto = s.win.gameui && s.win.gameui.constructor && s.win.gameui.constructor.prototype;
      const rows = ['notif_putToDeck', 'notif_drawSelfCard', 'notif_shufflePlay', 'notif_exileCard', 'notif_gainFear'].map((n) => ({
        通知: n,
        存在: !!(proto && proto[n]),
        已包裹: !!(proto && proto[n] && proto[n].__arnakHooked),
      }));
      console.log('[arnak-scorer] ' + (s.win === window ? '本窗口' : '其他窗口') + ' 的 hook 状态：');
      console.table(rows);
      console.log('[arnak-scorer] 最近调用：', (s.win.__arnakHookLog || []).slice(-10));
      out.push({ win: s.win === window ? 'self' : 'other', rows, log: (s.win.__arnakHookLog || []).slice(-10) });
    });
    return out;
  };

  // 牌组诊断：模型现状（跨框架，去报告真正在计分的那个实例）
  window.__arnakDeck = function () {
    const srcs = gameUiSources();
    if (!srcs.length) { console.log('[arnak-scorer] 没有窗口带 gameui'); return null; }
    const out = [];
    srcs.forEach((s) => {
      const raw = typeof s.win.__arnakDeckRaw === 'function' ? s.win.__arnakDeckRaw() : null;
      const pid = String(s.win.gameui && s.win.gameui.player_id);
      const total = deckAmtOf(s.doc, pid);
      const segs = raw ? raw.segs : [];
      const seeded = !!(raw && raw.seeded);
      console.log('[arnak-scorer] 牌组 ' + (s.win === window ? '本窗口' : '其他窗口') +
        '：seeded=' + seeded + ' drift=' + !!(raw && raw.drift) + ' 官方张数=' + total);
      console.log('[arnak-scorer] 分块（自底向上）：', JSON.parse(JSON.stringify(segs)));
      if (seeded) {
        const snap = deckSnapshot(total, segs);
        console.table(snap.items.map((it) => (it.unknown != null
          ? { 位置: '#' + it.from + '-' + it.to, 牌: '未知×' + it.unknown }
          : { 位置: '#' + it.pos, 牌: it.card.name })));
      }
      out.push({ win: s.win === window ? 'self' : 'other', seeded, total, segs });
    });
    return out;
  };

  // 出牌区诊断：DOM 与 gamedatas 两边分别是什么
  window.__arnakPlay = function () {
    const srcs = gameUiSources();
    if (!srcs.length) { console.log('[arnak-scorer] 没有窗口带 gameui'); return null; }
    const s = srcs[0];
    const me = String(s.win.gameui.player_id);
    const p = s.win.gameui.gamedatas.players[me];
    const raw = p && p.play;
    const dom = Array.from(s.doc.querySelectorAll('.camp-' + me + ' .card-outer')).map((el) => ({
      id: el.dataset.cardid,
      type: el.dataset.cardtype,
      cls: el.className,
    }));
    console.log('[arnak-scorer] player_id=' + me + ' 出牌区 DOM：');
    console.table(dom);
    console.log('[arnak-scorer] gamedatas.play 类型=' + (Array.isArray(raw) ? 'Array' : typeof raw) + ' 长度=' + (raw ? (Array.isArray(raw) ? raw.length : Object.keys(raw).length) : 0) + '：');
    console.log(raw);
    return { me, dom, raw };
  };

  // ELO 诊断：谁读到了、值是多少
  window.__arnakElo = function () {
    const pids = Object.keys(getGamedatas() && getGamedatas().players || {});
    const out = pids.map((k) => {
      const p = getGamedatas().players[k];
      const pid = String(p.id != null ? p.id : k);
      return { pid, name: p.name, elo: eloOf(pid), el: !!document.getElementById('player_elo_' + pid) };
    });
    console.table(out);
    return out;
  };

  // 情报层（开发期保留）
  window.__arnakDump = function () {
    const doc = (isTopWindow() && findArnakIframe()) ? findArnakIframe().contentDocument : document;
    return { url: location.href, hasGameArea: !!doc.querySelector('#game_play_area'), gamedatasKeys: getGamedatas() ? Object.keys(getGamedatas()) : null };
  };
})();
