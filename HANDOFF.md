# 交接备忘（续接用）

> 归档后如果还要改，从这里开始。目标是：**任何一次改动，都不需要重新推导一遍。**

## 一句话状态

`arnak-scorer.user.js` **v0.9.15**。三局真实对局（鸟庙/蛇庙、纯中文/中英混排）逐项与官方一致；五个回放实测无误。

## 续接：回来先做三件事

1. 读 `README.md` 顶部的**版本历史**（每一版改了什么，为什么改）
2. 读 `EXPERIENCE.md` 的 **三、七、七之二、七之三** 四节（设计原则与踩过的坑）
3. 跑一遍 `docs/` 里那五份 fixture —— 这是改动前后的验收线

给人（或给我）一句话就够：

```
继续 G:\arnak-scorer 的阿纳克计分插件（v0.9.15）。
先读 README 的版本历史 + EXPERIENCE 的三/七节，再跑 docs 下五份 fixture，然后动手。
```

## 四条不变式（改代码时不要破）

1. **身份靠隐藏标记**：日志行里的 `.notif-inner-tooltip`（`data-type`/`data-num`）语言无关，卡牌行都带。不要退回"靠卡名或整句措辞认牌"。
2. **动作靠词元，不靠整句**：日志是中英混排的，甚至一句里也混（`puts 火把 to the 底部 of their deck`）。整句级措辞包必然两边都落空。
3. **撤销只回滚"改变归属"的动作**：买进/移除/恐惧增减会变归属（压栈），打出不会（不压栈）。否则无关撤销会把上一张牌回弹掉。
4. **终局分数自算**：`gameui.counters` / `scoreBreakdown` 只用来对账和反推规则，**不当总分输出**。拿官方值当总分，等于自家账本的错永远看不见。

两条语义底线：`弃掉 / discards` **不算移除**（牌回牌堆，仍属于你）；`抽取 / draw` **不算获得**（只是摸到手上）。

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

跑法：在 `G:\arnak-scorer` 起个静态服务（`python -m http.server 8731`），依次打开这五页，看各自 `__report()`。

## 加一门新语言

1. 在 `LOG_PACKS` 加一个 pack（score / boundary / undo / isFear / isFund / isExplore）
2. 卡名表再加一对（与现有两张**同序**）
3. 动作词元若也变了，扩 `TOK`
4. 拿一局真实日志做第六份 fixture

措辞包现在只管 score/boundary/undo 与起始牌写法；买/打/放逐已经走词元了。

## 已知边界（都知情，未修）

- **无名的"免费获得此神器"**：不带卡名。通常紧跟着的"打出/揭示"那行会点名，所以尚未漏过；真不点名就是盲区。
- 页脚不显示「终局」（回放里 `scoreBreakdown` 为空），轮次可能显示 `0/5`。纯显示，与分数无关。
- 玩家名互为前缀时（`abc` 与 `abc2`），日志按名字认人可能归错。9.5 起就存在。

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
