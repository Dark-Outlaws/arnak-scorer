# 交接备忘（续接用）

> 归档后如果还要改，从这里开始。目标是：**任何一次改动，都不需要重新推导一遍。**

## 一句话状态

`arnak-scorer.user.js` **v0.9.57**。计分链沿旧结论（三局真实对局 + 五个回放对过账）。本轮新增三件事：**A2 版面**、**手牌/牌库/弃牌三区**、**牌堆牌序推断**。

更新通道：`@updateURL` 指向 `ghfast.top` 转发 raw（国内直连 raw 不通，jsDelivr 对 `@main` 有缓存，两条都导致发版后收不到）。

## 续接：回来先做三件事

1. 读 `README.md` 顶部的**版本历史**（每一版改了什么，为什么改）
2. 读 `EXPERIENCE.md` 的 **三、七、七之二、七之三** 四节（设计原则与踩过的坑）
3. 跑一遍 `docs/` 里那五份 fixture —— 这是改动前后的验收线

给人（或给我）一句话就够：

```
继续 G:\arnak-scorer 的阿纳克计分插件（v0.9.62）。
先读 README 的版本历史 + EXPERIENCE 的三/七/十一节，再跑 docs 下六份 fixture，然后动手。
```

## 并行改动约定（多窗口 / 两个人同时改）

已经撞过一次：两边各自写成 0.9.60，同一份文件上两个版本号。所以：

1. **动手前先 `git fetch`，再看 `git log -1`**。版本号以 HEAD 为准往上加，不用自己心里的号。工作区不干净、或 HEAD 与自己记的不一样，先停下来问，不硬改。
2. **一个提交只装一类改动，改完立刻 push**。不攒着等——攒着的时候别人一提交就是交叉。
3. **要动同一个文件先说一句**，那段时间另一方只读不写。默认分工：计分与牌库逻辑 / UI 与窗口探测与文档。

书签版（`arnak-scorer-dev`）是派生仓库：同步前先确认主仓已 push，然后以主仓 HEAD 为准，不要在该仓库里单独改逻辑。

## 四条不变式（改代码时不要破）

1. **身份靠隐藏标记**：日志行里的 `.notif-inner-tooltip`（`data-type`/`data-num`）语言无关，卡牌行都带。不要退回"靠卡名或整句措辞认牌"。
2. **动作靠词元，不靠整句**：日志是中英混排的，甚至一句里也混（`puts 火把 to the 底部 of their deck`）。整句级措辞包必然两边都落空。
3. **撤销只回滚"改变归属"的动作**：买进/移除/恐惧增减会变归属（压栈），打出不会（不压栈）。否则无关撤销会把上一张牌回弹掉。
4. **终局分数自算**：`gameui.counters` / `scoreBreakdown` 只用来对账和反推规则，**不当总分输出**。拿官方值当总分，等于自家账本的错永远看不见。

两条语义底线：`弃掉 / discards` **不算移除**（牌回牌堆，仍属于你）；`抽取 / draw` **不算获得**（只是摸到手上）。

## 四之半、本轮新增的三层（v0.9.23–0.9.57）

### 1. 手牌层

活的源是 `gameui.hand`（`drawSelfCard` 往里 push、`cardPlayed`/`exileCard` 往里 splice，也是 `updateHand` 的渲染源）。`gamedatas.players[pid].hand` 只在开局准。

手牌牌的真实形状：`{type:'basic', num:'fear'|'fundship'|'exploreship'|'explorecar'}`。注意同一张恐惧在 `play` 区是 `{type:'fear', num:null}`，两处表示不一样，统一拆一个 `kind` 出来用。

按轮快照存在 `handByRound`，`__arnakHands()` 打印，`__arnakHand()` 看当前手牌。

### 2. 牌库与弃牌

- `弃牌` = `gamedatas.players[pid].play` 的 DOM 渲染（`.camp-<pid> .card-outer` 去掉 `.hand` 与 `.deck`），公开信息
- `牌库` = 已见 − 手牌 − 弃牌，只对自己算
- 对手只给 `牌库`（已见全量），因为他没有手牌可扣

### 3. 牌堆牌序

详见 EXPERIENCE 第十一节。关键点：位置 = 总张数 − 距底偏移；回合末洗回是**底部**，不能当顶部未知。

### 调试钩子

| 钩子 | 作用 |
|---|---|
| `__arnakShow()` | 强制渲染 + 计分诊断 |
| `__arnakHand()` / `__arnakHands()` | 当前手牌 / 按轮手牌与弃牌序列 |
| `__arnakDeck()` | 牌组模型：seeded / drift / 分块 |
| `__arnakHooks()` | 五个通知包上没有、最近调用记录 |
| `__arnakPlay()` | 弃牌区 DOM 与 gamedatas 两边对照 |
| `__arnakElo()` | ELO 读取情况 |

## 出问题时怎么办

症状通常是"**某一类账突然不记了**"——九成是 BGA 改了文案。

1. F12 粘 `docs/harvest-snippet.js` 全文 → 结果自动进剪贴板 → 粘出来
2. 那份数据里有：完整日志（含隐藏标记）、官方逐项分、插件面板当时显示的每一项
3. 按"我按日志算 / 插件显示 / 官方"三方对照，定位到具体哪一行
4. **修完必须补一份 fixture**（把出问题的那几行原文写进去），再跑全部五份
5. 版本号 +1，README 版本历史加一行

## 五份回归样本

| 文件 | 守的是什么 |
|---|---|
| `docs/log-fixture-zh.html` | 中文写作 `将X放到其牌堆的底部`、`打出X`（无空格） |
| `docs/log-fixture-en.html` | 英文写作 `puts X to the bottom of their deck` 等 |
| `docs/mixed-fixture.html` | **中英混排**：`puts 火把 to the 底部 of their deck` |
| `docs/undo-fixture.html` | 撤销语义：打出被撤销后牌必须留下；买牌被撤销必须消失 |
| `docs/spectator-fixture.html` | 观战形态：`players` 里没有 `id`，真 id 在键上 |
| `docs/elo-fixture.html` | ELO：详情头 `ELO 1234`；胶囊里不放（`tabEloLeft` 必须为 0），悬停 title 有值 |

跑法：在 `G:\arnak-scorer` 起个静态服务（`python -m http.server 8731`），依次打开这六页，看各自 `__report()`。
无头跑法（可选，工具不入库）：`G:\slice-work\fixture-run` 里 `node run.mjs`，一次性把六页跑完并打印 `__report()`（jsdom 已装在那里）。

## 加一门新语言

1. 在 `LOG_PACKS` 加一个 pack（score / boundary / undo / isFear / isFund / isExplore）
2. 卡名表再加一对（与现有两张**同序**）
3. 动作词元若也变了，扩 `TOK`
4. 拿一局真实日志做第六份 fixture

措辞包现在只管 score/boundary/undo 与起始牌写法；买/打/放逐已经走词元了。

## 已知边界（都知情，未修）

- **牌堆牌序**：刷新后牌堆内容归为未知（不猜历史）；与官方 `.deck-amt` 对不上时标 `?`。
- **对手的牌堆/手牌**：看不到，也不编。对手面板只有 `牌库` 一行。
- **hook 未验证生效**：`notif_putToDeck` / `drawSelfCard` / `shufflePlay` 的包裹是否真触发没有定论（`__arnakHooks()` 可查），所以买牌改由日志驱动，hook 仅作无日志时兜底。
- **无名的“免费获得此神器”**：不带卡名。通常紧跟着的“打出/揭示”那行会点名，所以尚未漏过；真不点名就是盲区。
- 页脚不显示「终局」（回放里 `scoreBreakdown` 为空）。
- 玩家名互为前缀时（`abc` 与 `abc2`），日志按名字认人可能归错。9.5 起就存在。
- **ELO**：读界面的 `#player_elo_<id>`，是玩家此刻的值（回放里也不是当时值）；界面未渲染或未定级就留空。

## 文件地图

```
arnak-scorer.user.js      油猴脚本（单文件，直接安装）
README.md                 功能 / 安装 / 版本历史 / 文件清单
EXPERIENCE.md             方法论（十节，可复用到其他 BGA 游戏）
HANDOFF.md                本文件
docs/arnak.js             官方客户端源码（数据表来源）
docs/tooltips.js          官方数据词典（卡表/轨道分/idol 分）
docs/harvest-snippet.js   对账采样器（F12 一段，自动复制到剪贴板）
docs/*-fixture.html       五份回归样本
docs/*.py                 开发期下载与解析脚本
```
