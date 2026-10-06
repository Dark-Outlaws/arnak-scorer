import io

path = r"G:\arnak-scorer\arnak-scorer.user.js"
src = io.open(path, encoding="utf-8").read()

start_marker = "style.textContent = `"
end_marker = "`;\n    document.head.appendChild(style);"

start = src.index(start_marker) + len(start_marker)
end = src.index(end_marker, start)

new_css = """
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
        width: 254px; border-radius: 16px; overflow: hidden;
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
      #arnak-panel .ap-head { display: flex; align-items: center; padding: 9px 12px; cursor: move; background: var(--ap-head-bg); border-bottom: 0.5px solid var(--ap-border); }
      #arnak-panel .ap-title { flex: 1; font-weight: 600; font-size: 13px; color: var(--ap-text); letter-spacing: .3px; }
      #arnak-panel .ap-round { font-size: 11px; color: var(--ap-faint); margin-right: 6px; font-variant-numeric: tabular-nums; }
      #arnak-panel .ap-mode, #arnak-panel .ap-toggle, #arnak-panel .ap-close { cursor: pointer; padding: 0 3px; color: var(--ap-faint); font-size: 14px; line-height: 1; background: none; border: none; }
      #arnak-panel .ap-mode:hover, #arnak-panel .ap-toggle:hover, #arnak-panel .ap-close:hover { color: var(--ap-text); }
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
      #arnak-panel .ap-grid { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(4, auto); gap: 2px 16px; }
      #arnak-panel .ap-gitem { display: flex; justify-content: space-between; align-items: baseline; padding: 1.5px 0; font-size: 11.5px; color: var(--ap-sub); }
      #arnak-panel .ap-gitem b { color: var(--ap-text); font-weight: 600; font-variant-numeric: tabular-nums; }
      #arnak-panel .ap-gitem.fear b { color: var(--ap-danger); }
      #arnak-panel .ap-seen { color: var(--ap-faint); font-size: 11px; margin-left: 4px; }
      #arnak-panel .ap-zones { margin-top: 7px; border-top: 0.5px solid var(--ap-border); padding-top: 6px; }
      #arnak-panel .ap-zone { display: flex; gap: 6px; font-size: 11px; line-height: 1.7; }
      #arnak-panel .ap-zone-label { flex: none; color: var(--ap-faint); }
      #arnak-panel .ap-zone-cards { color: var(--ap-sub); word-break: break-all; }
      #arnak-panel .ap-chip { display: inline-block; padding: 0 7px; margin: 1px 3px 1px 0; border-radius: 7px; font-size: 11px; line-height: 1.8; white-space: nowrap; font-weight: 600; }
      #arnak-panel .ap-chip-fund { background: #F2C14E; color: #1C1C1E; }
      #arnak-panel .ap-chip-explore { background: #7FB069; color: #1C1C1E; }
      #arnak-panel .ap-chip-item { background: #A57B5A; color: #fff; }
      #arnak-panel .ap-chip-art { background: #6D9DC5; color: #1C1C1E; }
      #arnak-panel .ap-chip-fear { background: #8E8E93; color: #fff; }
      #arnak-panel .ap-foot { padding: 6px 12px; font-size: 11px; color: var(--ap-faint); border-top: 0.5px solid var(--ap-border); display: flex; justify-content: space-between; }
      #arnak-panel .ap-official { color: #4A6B4A; font-size: 11px; margin-left: 4px; }
      .ap-mini {
        position: fixed; right: 16px; bottom: 20px; z-index: 999999;
        width: 42px; height: 42px; border-radius: 50%; cursor: pointer;
        background: rgba(28,28,30,0.82); color: #F2C14E; border: 0.5px solid rgba(255,255,255,0.12);
        -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
        display: flex; align-items: center; justify-content: center;
        font: 600 15px/1 -apple-system, "PingFang SC", sans-serif;
        box-shadow: 0 4px 18px rgba(0,0,0,0.35); user-select: none;
      }
      .ap-mini.ap-light { background: rgba(251,247,238,0.9); color: #9D5F4D; border-color: rgba(42,38,34,0.14); box-shadow: 0 4px 18px rgba(42,38,34,0.22); }
"""

src = src[:start] + "\n" + new_css + "\n" + src[end:]
io.open(path, "w", encoding="utf-8", newline="").write(src)
print("CSS replaced OK, new length:", len(src))
