// arnak 对账采样器（F12 控制台一次性粘贴，不改插件、不用重装）
//
// 在 BGA 页面（对局/观战/回放，建议在【终局】）按 F12，任意一层的控制台粘本文件全文，回车。
// 它会：自己找游戏帧 → 采集官方字段/DOM计数/官方逐项分/插件面板当前显示的每一项/完整日志
//       → 自动 copy 到剪贴板 → 直接粘贴发出来即可。
// 若 copy 不可用，它会把 JSON 打到控制台，手动复制即可。
(() => {
  let win = null;
  const walk = (w) => {
    try { if (!win && w.gameui && w.gameui.gamedatas) win = w; } catch (e) {}
    for (let i = 0; i < w.frames.length; i++) { try { walk(w.frames[i]); } catch (e) {} }
  };
  walk(window);
  if (!win) return '没找到 gameui';

  const gu = win.gameui, gd = gu.gamedatas, doc = win.document;

  // 官方逐项分（终局才有：arnak.js 的 updateScore 用 scoreBreakdown 填它）
  const counters = {};
  try {
    Object.keys(gu.counters || {}).forEach((k) => {
      const c = gu.counters[k] || {}, o = {};
      Object.keys(c).forEach((n) => {
        const x = c[n];
        o[n] = (x && x.current_value != null) ? x.current_value : (x && x.target_value);
      });
      counters[k] = o;
    });
  } catch (e) {}

  // 各玩家：官方字段 + DOM 计数（守卫/板块是快照字段，只能从 DOM 读）
  const players = Object.keys(gd.players).map((k) => {
    const p = gd.players[k] || {};
    const num = (s) => { const el = doc.querySelector(s); return el ? +el.innerHTML : null; };
    const cnt = (s) => doc.querySelectorAll(s).length;
    return {
      key: k, id: p.id, name: p.name,
      glass: p.research_glass, book: p.research_book, templeRank: p.temple_rank,
      idol: p.idol, idolSlot: p.idol_slot,
      score: p.score, scoreBreakdown: p.scoreBreakdown || null,
      guardians: num('#player_board_' + k + ' .counter-number-guardian'),
      tiles: {
        bronze: cnt('#player_board_' + k + ' .temple-wrap .temple-tile.bronze'),
        silver: cnt('#player_board_' + k + ' .temple-wrap .temple-tile.silver'),
        gold: cnt('#player_board_' + k + ' .temple-wrap .temple-tile.gold')
      },
      hand: (p.hand || []).map((c) => c.type + '#' + c.num),
      play: (p.play || []).map((c) => c.type + '#' + c.num)
    };
  });

  // 插件面板当下显示的结论（插件自己的账，用于对比）
  const panel = { version: null, foot: null, rows: {} };
  const el = doc.getElementById('arnak-panel');
  if (el) {
    panel.version = (el.querySelector('.ap-ver') || {}).textContent;
    panel.foot = (el.querySelector('.ap-round') || {}).textContent;
    [].forEach.call(el.querySelectorAll('.ap-tab'), (b) => {
      b.click();
      const d = el.querySelector('.ap-detail');
      panel.rows[b.dataset.id] = (d ? d.textContent : '').replace(/\s+/g, ' ').trim();
    });
  }

  // 完整日志（倒序，最新在前）；带 .notif-inner-tooltip 的行附语言无关的卡牌标记
  const logs = [].map.call(doc.querySelectorAll('#logs .log[id^="log_"]'), (x) => {
    const tt = x.querySelector('.notif-inner-tooltip');
    return {
      id: x.id,
      card: tt ? (tt.getAttribute('data-type') + '#' + tt.getAttribute('data-num')) : null,
      t: (x.textContent || '').trim().replace(/\s+/g, ' ')
    };
  });

  const out = {
    url: win.location.href,
    birdTemple: !!gd.bird_temple, round: gd.round,
    gamestate: (gd.gamestate || {}).name,
    players: players, counters: counters, panel: panel,
    logCount: logs.length, logs: logs
  };
  try {
    copy(JSON.stringify(out));
    console.log('[harvest] 已复制到剪贴板：日志 ' + logs.length + ' 条，players ' + players.length + ' 人');
  } catch (e) {
    console.log(JSON.stringify(out));
  }
  return out;
})()
