#!/usr/bin/env python3
"""Generate an interactive HTML report with charts from Omaha test results."""

import json
import os
from datetime import datetime

DATA_FILE = "test_results/omaha_full_comprehensive_20260216_014009.json"
OUTPUT_FILE = "VISUAL_REPORT.html"

with open(DATA_FILE) as f:
    data = json.load(f)

# ── Extract structured data ──────────────────────────────────────────────────

VARIANTS = ["PLO4", "PLO5", "PLO6"]
STYLES = ["nit", "rock", "reg", "tag", "lag", "fish"]
STYLE_LABELS = {
    "nit": "Nit", "rock": "Rock", "reg": "Reg",
    "tag": "TAG", "lag": "LAG", "fish": "Fish"
}
STYLE_COLORS = {
    "nit": "#8b5cf6", "rock": "#6b7280", "reg": "#0ea5e9",
    "tag": "#2563eb", "lag": "#dc2626", "fish": "#f59e0b"
}
STYLE_COLORS_LIGHT = {
    "nit": "rgba(139,92,246,0.15)", "rock": "rgba(107,114,128,0.15)",
    "reg": "rgba(14,165,233,0.15)", "tag": "rgba(37,99,235,0.15)",
    "lag": "rgba(220,38,38,0.15)", "fish": "rgba(245,158,11,0.15)"
}

# Heads-up results
hu_results = {}
for v in VARIANTS:
    hu_results[v] = {}
    for key, cfg in data.items():
        if cfg["variant"] == v and cfg["num_players"] == 2:
            styles_in = cfg["styles"]
            for s, r in cfg["results"].items():
                if s not in hu_results[v]:
                    hu_results[v][s] = {}
                opponent = [x for x in styles_in if x != s][0]
                hu_results[v][s][f"vs_{opponent}"] = r["bb100"]

# Multi-player results
mp_results = {}
for v in VARIANTS:
    mp_results[v] = {}
    for key, cfg in data.items():
        if cfg["variant"] == v and cfg["num_players"] >= 3:
            np = cfg["num_players"]
            mp_results[v][np] = {}
            for s, r in cfg["results"].items():
                mp_results[v][np][s] = {
                    "bb100": r["bb100"],
                    "ci": r["ci"],
                    "vpip": r["vpip"],
                    "win_rate": r["win_rate"],
                    "flop_pct": r.get("flop_pct", 0),
                }

# Cross-variant averages
avg_by_variant = {}
for v in VARIANTS:
    avg_by_variant[v] = {}
    for s in STYLES:
        vals = []
        for np, styles_data in mp_results[v].items():
            if s in styles_data:
                vals.append(styles_data[s]["bb100"])
        avg_by_variant[v][s] = sum(vals) / len(vals) if vals else 0

# ── Build HTML ───────────────────────────────────────────────────────────────

def make_hu_table(variant):
    """Generate heads-up results table HTML."""
    # Dynamically find all pairings for this variant
    pairings = []
    for i, s1 in enumerate(STYLES):
        for s2 in STYLES[i+1:]:
            k = f"{variant}_2p_{s1}_vs_{s2}"
            if k in data:
                pairings.append((s1, s2, f"{STYLE_LABELS[s1]} vs {STYLE_LABELS[s2]}"))

    rows = ""
    for s1, s2, label in pairings:
        k1 = f"{variant}_2p_{s1}_vs_{s2}"
        cfg = data[k1]
        r1 = cfg["results"][s1]
        r2 = cfg["results"][s2]
        winner = STYLE_LABELS[s1] if r1["bb100"] > r2["bb100"] else STYLE_LABELS[s2]
        margin = abs(r1["bb100"] - r2["bb100"])
        bb1_class = "positive" if r1["bb100"] > 0 else "negative"
        bb2_class = "positive" if r2["bb100"] > 0 else "negative"
        rows += f"""<tr>
            <td>{label}</td>
            <td class="{bb1_class}">{r1['bb100']:+.1f}</td>
            <td class="{bb2_class}">{r2['bb100']:+.1f}</td>
            <td><strong>{winner}</strong></td>
            <td>{margin:.1f}</td>
        </tr>"""
    return f"""<table class="data-table">
        <thead><tr><th>Matchup</th><th>Player 1 BB/100</th><th>Player 2 BB/100</th><th>Winner</th><th>Margin</th></tr></thead>
        <tbody>{rows}</tbody>
    </table>"""


def make_mp_table(variant):
    """Generate multi-player results table HTML."""
    rows = ""
    player_counts = sorted(mp_results[variant].keys())
    style_order = STYLES  # nit, rock, reg, tag, lag, fish
    for np in player_counts:
        sd = mp_results[variant][np]
        best_style = max(sd.keys(), key=lambda s: sd[s]["bb100"])
        cells = f"<td>{np}</td>"
        for s in style_order:
            if s in sd:
                val = sd[s]["bb100"]
                cls = "positive" if val > 0 else "negative"
                bold = " style='font-weight:700'" if s == best_style else ""
                cells += f'<td class="{cls}"{bold}>{val:+.1f}</td>'
            else:
                cells += "<td>—</td>"
        cells += f"<td><strong>{STYLE_LABELS[best_style]}</strong></td>"
        rows += f"<tr>{cells}</tr>"
    headers = "".join(f"<th>{STYLE_LABELS[s]}</th>" for s in style_order)
    return f"""<table class="data-table">
        <thead><tr><th>Players</th>{headers}<th>Best</th></tr></thead>
        <tbody>{rows}</tbody>
    </table>"""


# Chart.js datasets for multi-player line charts
def mp_chart_data(variant):
    player_counts = sorted(mp_results[variant].keys())
    datasets = []
    for s in STYLES:
        vals = []
        for np in player_counts:
            if s in mp_results[variant][np]:
                vals.append(mp_results[variant][np][s]["bb100"])
            else:
                vals.append(None)
        datasets.append({
            "label": STYLE_LABELS[s],
            "data": vals,
            "borderColor": STYLE_COLORS[s],
            "backgroundColor": STYLE_COLORS_LIGHT[s],
            "fill": False,
            "tension": 0.3,
            "pointRadius": 5,
            "pointHoverRadius": 8,
            "borderWidth": 2.5,
        })
    return {"labels": [f"{n}p" for n in player_counts], "datasets": datasets}


def vpip_chart_data(variant):
    player_counts = sorted(mp_results[variant].keys())
    datasets = []
    for s in STYLES:
        vals = []
        for np in player_counts:
            if s in mp_results[variant][np]:
                vals.append(mp_results[variant][np][s]["vpip"])
            else:
                vals.append(None)
        datasets.append({
            "label": STYLE_LABELS[s],
            "data": vals,
            "backgroundColor": STYLE_COLORS[s],
            "borderColor": STYLE_COLORS[s],
            "borderWidth": 1,
        })
    return {"labels": [f"{n}p" for n in player_counts], "datasets": datasets}


# Heads-up summary: for each style, average BB/100 across all heads-up matchups
def hu_avg_data():
    """Compute average BB/100 for each style across all heads-up matchups per variant."""
    result = {}
    for v in VARIANTS:
        result[v] = {}
        for s in STYLES:
            vals = []
            for key, cfg in data.items():
                if cfg["variant"] == v and cfg["num_players"] == 2 and s in cfg["results"]:
                    vals.append(cfg["results"][s]["bb100"])
            if vals:
                result[v][s] = sum(vals) / len(vals)
    return result

hu_avgs = hu_avg_data()

# Cross-variant bar chart
cross_variant_data = {
    "labels": VARIANTS,
    "datasets": [
        {"label": "LAG", "data": [avg_by_variant[v]["lag"] for v in VARIANTS], "backgroundColor": STYLE_COLORS["lag"]},
        {"label": "TAG", "data": [avg_by_variant[v]["tag"] for v in VARIANTS], "backgroundColor": STYLE_COLORS["tag"]},
        {"label": "Rock", "data": [avg_by_variant[v]["rock"] for v in VARIANTS], "backgroundColor": STYLE_COLORS["rock"]},
    ]
}

# Confidence interval data for error bar visualization
def ci_chart_data(variant):
    player_counts = sorted(mp_results[variant].keys())
    datasets = []
    for s in STYLES:
        points = []
        for np in player_counts:
            if s in mp_results[variant][np]:
                d = mp_results[variant][np][s]
                points.append({"x": str(np), "y": d["bb100"], "lo": d["ci"][0], "hi": d["ci"][1]})
        datasets.append({"style": STYLE_LABELS[s], "color": STYLE_COLORS[s], "points": points})
    return {"labels": [str(n) for n in player_counts], "datasets": datasets}


# ── Assemble the HTML ────────────────────────────────────────────────────────

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Omaha Style Testing — Visual Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root {{
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #334155;
    --text: #e2e8f0;
    --text-dim: #94a3b8;
    --accent: #38bdf8;
    --green: #22c55e;
    --red: #ef4444;
    --border: #475569;
}}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }}
.container {{ max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }}
h1 {{ font-size: 2.2rem; font-weight: 800; margin-bottom: 0.5rem; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
h2 {{ font-size: 1.5rem; font-weight: 700; margin: 2.5rem 0 1rem; color: var(--accent); border-bottom: 2px solid var(--surface2); padding-bottom: 0.5rem; }}
h3 {{ font-size: 1.15rem; font-weight: 600; margin: 1.5rem 0 0.75rem; color: #a5b4fc; }}
p {{ color: var(--text-dim); margin-bottom: 1rem; max-width: 800px; }}
.subtitle {{ font-size: 1rem; color: var(--text-dim); margin-bottom: 2rem; }}
.stats-row {{ display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }}
.stat-card {{ background: var(--surface); border-radius: 12px; padding: 1.25rem 1.5rem; flex: 1; min-width: 160px; border: 1px solid var(--surface2); }}
.stat-card .label {{ font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); margin-bottom: 0.25rem; }}
.stat-card .value {{ font-size: 1.6rem; font-weight: 700; color: var(--accent); }}
.chart-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin: 1.5rem 0; }}
.chart-box {{ background: var(--surface); border-radius: 12px; padding: 1.25rem; border: 1px solid var(--surface2); }}
.chart-box.full {{ grid-column: 1 / -1; }}
.chart-box h4 {{ font-size: 0.95rem; color: var(--text-dim); margin-bottom: 0.75rem; text-align: center; }}
.chart-box canvas {{ max-height: 350px; }}
.data-table {{ width: 100%; border-collapse: collapse; margin: 1rem 0 1.5rem; background: var(--surface); border-radius: 12px; overflow: hidden; }}
.data-table th {{ background: var(--surface2); padding: 0.75rem 1rem; text-align: left; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim); }}
.data-table td {{ padding: 0.65rem 1rem; border-top: 1px solid var(--surface2); font-size: 0.95rem; }}
.data-table tr:hover td {{ background: rgba(56,189,248,0.05); }}
.positive {{ color: var(--green); }}
.negative {{ color: var(--red); }}
.section {{ margin-bottom: 3rem; }}
.insight {{ background: var(--surface); border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; padding: 1rem 1.25rem; margin: 1rem 0; color: var(--text-dim); }}
.insight strong {{ color: var(--text); }}
.tabs {{ display: flex; gap: 0; margin-bottom: 0; }}
.tab {{ padding: 0.6rem 1.5rem; background: var(--surface2); color: var(--text-dim); border: none; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: all 0.2s; border-radius: 8px 8px 0 0; }}
.tab.active {{ background: var(--surface); color: var(--accent); }}
.tab-content {{ display: none; }}
.tab-content.active {{ display: block; }}
.legend-row {{ display: flex; gap: 1.5rem; justify-content: center; margin: 1rem 0; flex-wrap: wrap; }}
.legend-item {{ display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--text-dim); }}
.legend-dot {{ width: 12px; height: 12px; border-radius: 3px; }}
@media (max-width: 768px) {{
    .chart-grid {{ grid-template-columns: 1fr; }}
    .stats-row {{ flex-direction: column; }}
}}
</style>
</head>
<body>
<div class="container">

<h1>Omaha Style Testing Report</h1>
<p class="subtitle">128,000 hands across 64 configurations &bull; 6 calibrated styles &bull; PLO4 / PLO5 / PLO6 &bull; Generated {datetime.now().strftime('%B %d, %Y')}</p>

<div class="stats-row">
    <div class="stat-card"><div class="label">Total Hands</div><div class="value">128,000</div></div>
    <div class="stat-card"><div class="label">Configurations</div><div class="value">64</div></div>
    <div class="stat-card"><div class="label">Variants</div><div class="value">PLO4 / 5 / 6</div></div>
    <div class="stat-card"><div class="label">Player Styles</div><div class="value">6</div></div>
    <div class="stat-card"><div class="label">Hands/Config</div><div class="value">2,000</div></div>
</div>

<div class="legend-row">
    <div class="legend-item"><div class="legend-dot" style="background:#8b5cf6"></div> Nit (~20% VPIP)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div> Rock (~20% VPIP)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#0ea5e9"></div> Reg (~25% VPIP)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#2563eb"></div> TAG (~28% VPIP)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div> LAG (~35% VPIP)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> Fish (~50% VPIP)</div>
</div>

<!-- ═══════════════ CROSS-VARIANT OVERVIEW ═══════════════ -->
<div class="section">
<h2>Cross-Variant Overview</h2>
<p>Average BB/100 win rates across all multi-player table sizes (3–9 players) for each variant.</p>
<div class="chart-grid">
    <div class="chart-box full">
        <h4>Average BB/100 by Style &amp; Variant (Multi-Player Tables)</h4>
        <canvas id="crossVariantChart"></canvas>
    </div>
</div>
<div class="insight"><strong>Key finding:</strong> With calibrated VPIP ranges matching real-world player pools, TAG and Reg emerge as the most consistent winning styles. Fish (VPIP ~50%) and Nit (ultra-tight) tend to underperform, while LAG profits in specific spots. Styles are now variant-aware with thresholds that produce realistic play frequencies.</div>
</div>

<!-- ═══════════════ HEADS-UP RESULTS ═══════════════ -->
<div class="section">
<h2>Heads-Up Results (2-Player)</h2>
<p>All three style pairings tested at 2,000 hands each across all variants.</p>

<div class="chart-grid">
    <div class="chart-box full">
        <h4>Heads-Up BB/100 — All Pairings</h4>
        <canvas id="huChart"></canvas>
    </div>
</div>

<div class="tabs">
    <button class="tab active" onclick="showTab('hu', 0)">PLO4</button>
    <button class="tab" onclick="showTab('hu', 1)">PLO5</button>
    <button class="tab" onclick="showTab('hu', 2)">PLO6</button>
</div>
"""

for i, v in enumerate(VARIANTS):
    active = " active" if i == 0 else ""
    html += f'<div class="tab-content hu-tab{active}" id="hu-tab-{i}">{make_hu_table(v)}</div>'

html += """
<div class="insight"><strong>Heads-up insight:</strong> With 15 pairings per variant (6 styles), the TAG and Reg styles consistently produce the highest average BB/100. Fish's loose-passive play bleeds chips in heads-up, while LAG profits against passive opponents but struggles against disciplined aggression.</div>
</div>

<!-- ═══════════════ MULTI-PLAYER RESULTS ═══════════════ -->
<div class="section">
<h2>Multi-Player Results (3–9 Players)</h2>
<p>Mixed-style tables with one of each style cycling through seats. BB/100 win rates with confidence intervals.</p>

<div class="tabs">
    <button class="tab active" onclick="showTab('mp', 0)">PLO4</button>
    <button class="tab" onclick="showTab('mp', 1)">PLO5</button>
    <button class="tab" onclick="showTab('mp', 2)">PLO6</button>
</div>
"""

for i, v in enumerate(VARIANTS):
    active = " active" if i == 0 else ""
    html += f'<div class="tab-content mp-tab{active}" id="mp-tab-{i}">'
    html += make_mp_table(v)
    html += f"""<div class="chart-grid">
        <div class="chart-box">
            <h4>{v} — BB/100 by Table Size</h4>
            <canvas id="mpLine_{v}"></canvas>
        </div>
        <div class="chart-box">
            <h4>{v} — BB/100 with 95% Confidence Intervals</h4>
            <canvas id="ciChart_{v}"></canvas>
        </div>
    </div>"""
    html += '</div>'

html += """
<div class="insight"><strong>Table size matters:</strong> TAG and Reg excel at shorter tables (3–5 players) where selective aggression and hand reading pay off. At larger tables (7–9 players), LAG can exploit dead money but variance increases. Fish consistently loses across all table sizes. Nit and Rock survive but rarely thrive.</div>
</div>

<!-- ═══════════════ VPIP ANALYSIS ═══════════════ -->
<div class="section">
<h2>VPIP Analysis</h2>
<p>Voluntarily Put money In Pot — how often each style enters the pot preflop. Grouped bar charts show observed VPIP at each table size.</p>

<div class="chart-grid">
"""

for v in VARIANTS:
    html += f"""<div class="chart-box">
        <h4>{v} — VPIP % by Table Size</h4>
        <canvas id="vpipChart_{v}"></canvas>
    </div>"""

html += """
</div>
<div class="insight"><strong>Calibration status:</strong> VPIP values now match real-world PLO targets. Nit/Rock ~18-20%, Reg ~22-25%, TAG ~25-28%, LAG ~33-37%, Fish ~43-50%. Variant-specific thresholds compensate for the higher hand scores produced by more hole cards in PLO5/PLO6.</div>
</div>

<!-- ═══════════════ STRATEGY RECOMMENDATIONS ═══════════════ -->
<div class="section">
<h2>Strategy Recommendations</h2>
"""

recs = [
    ("PLO4 Heads-Up", "TAG/Reg", "Best avg BB/100 across all matchups"),
    ("PLO4 Short (3–5p)", "TAG/Reg", "Selective aggression with solid hand selection"),
    ("PLO4 Full (6–9p)", "TAG/LAG", "Aggression profits from dead money in multi-way pots"),
    ("PLO5 Heads-Up", "TAG", "Tight-aggressive with 5-card advantage"),
    ("PLO5 Short (3–6p)", "Reg/TAG", "Solid fundamentals prevail at smaller tables"),
    ("PLO5 Full (7–9p)", "TAG/LAG", "Mix of selective and aggressive play"),
    ("PLO6 Heads-Up", "TAG/Reg", "Hand reading advantage with more cards"),
    ("PLO6 Short (3–4p)", "TAG/Reg", "Position-aware selective play"),
    ("PLO6 Full (5–7p)", "TAG", "Aggressive hand selection with 6 cards"),
    ("Avoid vs Regs", "Fish", "Loose-passive play bleeds chips against all competent styles"),
    ("Maximum profit", "TAG vs Fish", "TAG maximally exploits loose-passive play"),
]

html += '<table class="data-table"><thead><tr><th>Scenario</th><th>Recommended</th><th>Why</th></tr></thead><tbody>'
for scenario, style, why in recs:
    html += f'<tr><td>{scenario}</td><td><strong>{style}</strong></td><td>{why}</td></tr>'
html += '</tbody></table></div>'

# ── WIN RATE HEATMAP ──
html += """
<div class="section">
<h2>Win Rate Heatmap</h2>
<p>BB/100 win rates visualized as a heatmap across all variants and table sizes.</p>
<div class="chart-box full" style="background:var(--surface);border-radius:12px;padding:1.5rem;border:1px solid var(--surface2)">
    <canvas id="heatmapChart" height="280"></canvas>
</div>
</div>
"""

# Build heatmap data — each row must have one entry per x-axis column
heatmap_data = []
heatmap_labels_y = []
heatmap_labels_x = []

# Build the full x-axis: every (variant, player_count) combination
all_columns = []  # list of (variant, player_count) tuples
for v in VARIANTS:
    pcs = sorted(mp_results[v].keys())
    for pc in pcs:
        all_columns.append((v, pc))
        heatmap_labels_x.append(f"{v} {pc}p")

# Build y-axis labels and data rows
for v in VARIANTS:
    for s in STYLES:
        heatmap_labels_y.append(f"{v} {STYLE_LABELS[s]}")
        row = []
        for col_v, col_pc in all_columns:
            if col_v == v and col_pc in mp_results[v] and s in mp_results[v][col_pc]:
                row.append(mp_results[v][col_pc][s]["bb100"])
            else:
                row.append(None)
        heatmap_data.append(row)


html += f"""
<!-- ═══════════════ FOOTER ═══════════════ -->
<div style="text-align:center; color:var(--text-dim); margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--surface2); font-size:0.85rem;">
    Omaha Style Testing Report &bull; 128,000 hands &bull; 6 Calibrated Styles &bull; {datetime.now().strftime('%B %d, %Y')} &bull; Generated by OmahaTestRunner.py
</div>

</div><!-- .container -->

<script>
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';
Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";

// ── Tab switching ──
function showTab(group, idx) {{
    document.querySelectorAll('.' + group + '-tab').forEach((el, i) => {{
        el.classList.toggle('active', i === idx);
    }});
    // Update tab buttons (find the tabs div right before)
    const tabs = document.querySelectorAll('.tabs');
    tabs.forEach(t => {{
        const btns = t.querySelectorAll('.tab');
        const contents = t.parentElement ? document.querySelectorAll('.' + group + '-tab') : [];
        if (contents.length > 0 && btns.length === contents.length) {{
            btns.forEach((b, i) => b.classList.toggle('active', i === idx));
        }}
    }});
    // Also re-trigger tab button styling
    event.target.closest('.tabs').querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', i === idx));
}}

// ── Cross-Variant Chart ──
new Chart(document.getElementById('crossVariantChart'), {{
    type: 'bar',
    data: {json.dumps(cross_variant_data)},
    options: {{
        responsive: true,
        plugins: {{ legend: {{ position: 'top' }} }},
        scales: {{
            y: {{ title: {{ display: true, text: 'Avg BB/100' }}, grid: {{ color: '#1e293b' }} }},
            x: {{ grid: {{ display: false }} }}
        }}
    }}
}});

// ── Heads-Up Average Chart ──
new Chart(document.getElementById('huChart'), {{
    type: 'bar',
    data: {{
        labels: {json.dumps(VARIANTS)},
        datasets: {json.dumps([
            {"label": STYLE_LABELS[s], "data": [hu_avgs.get(v, {}).get(s, 0) for v in VARIANTS],
             "backgroundColor": STYLE_COLORS[s]} for s in STYLES if any(s in hu_avgs.get(v, {}) for v in VARIANTS)
        ])}
    }},
    options: {{
        responsive: true,
        plugins: {{ legend: {{ position: 'top' }} }},
        scales: {{
            y: {{ title: {{ display: true, text: 'Avg BB/100' }}, grid: {{ color: '#1e293b' }} }},
            x: {{ grid: {{ display: false }} }}
        }}
    }}
}});

// ── Multi-Player Line Charts ──
"""

for v in VARIANTS:
    chart_data = mp_chart_data(v)
    html += f"""
new Chart(document.getElementById('mpLine_{v}'), {{
    type: 'line',
    data: {json.dumps(chart_data)},
    options: {{
        responsive: true,
        plugins: {{ legend: {{ position: 'top' }}, tooltip: {{ mode: 'index', intersect: false }} }},
        scales: {{
            y: {{ title: {{ display: true, text: 'BB/100' }}, grid: {{ color: '#1e293b' }} }},
            x: {{ title: {{ display: true, text: 'Table Size' }}, grid: {{ display: false }} }}
        }}
    }}
}});
"""

# ── Confidence Interval Charts (custom plugin) ──
for v in VARIANTS:
    ci_data = ci_chart_data(v)
    player_counts = sorted(mp_results[v].keys())
    # Build datasets for CI chart as scatter with error bars
    html += f"""
(function() {{
    const ctx = document.getElementById('ciChart_{v}');
    const ciData = {json.dumps(ci_data)};
    const labels = ciData.labels;
    const datasets = ciData.datasets.map((ds, i) => {{
        const offset = (i - 1) * 0.15;
        return {{
            label: ds.style,
            data: ds.points.map((p, j) => ({{ x: j + offset, y: p.y }})),
            backgroundColor: ds.color,
            borderColor: ds.color,
            pointRadius: 6,
            pointHoverRadius: 9,
            showLine: false,
            _ciData: ds.points
        }};
    }});
    new Chart(ctx, {{
        type: 'scatter',
        data: {{ datasets }},
        options: {{
            responsive: true,
            plugins: {{
                legend: {{ position: 'top' }},
                tooltip: {{
                    callbacks: {{
                        label: function(context) {{
                            const ci = context.dataset._ciData[context.dataIndex];
                            return `${{context.dataset.label}}: ${{ci.y.toFixed(1)}} BB/100 (95% CI: ${{ci.lo.toFixed(0)}} to ${{ci.hi.toFixed(0)}})`;
                        }}
                    }}
                }}
            }},
            scales: {{
                x: {{
                    type: 'linear',
                    min: -0.5,
                    max: labels.length - 0.5,
                    ticks: {{
                        callback: function(v) {{ return labels[Math.round(v)] ? labels[Math.round(v)] + 'p' : ''; }},
                        stepSize: 1
                    }},
                    title: {{ display: true, text: 'Table Size' }},
                    grid: {{ display: false }}
                }},
                y: {{ title: {{ display: true, text: 'BB/100' }}, grid: {{ color: '#1e293b' }} }}
            }}
        }},
        plugins: [{{
            afterDraw: function(chart) {{
                const ctx2 = chart.ctx;
                chart.data.datasets.forEach((ds) => {{
                    const meta = chart.getDatasetMeta(chart.data.datasets.indexOf(ds));
                    ds._ciData.forEach((ci, i) => {{
                        const pt = meta.data[i];
                        if (!pt) return;
                        const yLo = chart.scales.y.getPixelForValue(ci.lo);
                        const yHi = chart.scales.y.getPixelForValue(ci.hi);
                        ctx2.save();
                        ctx2.strokeStyle = ds.borderColor;
                        ctx2.lineWidth = 1.5;
                        ctx2.globalAlpha = 0.5;
                        ctx2.beginPath();
                        ctx2.moveTo(pt.x, yLo);
                        ctx2.lineTo(pt.x, yHi);
                        ctx2.stroke();
                        // caps
                        ctx2.beginPath();
                        ctx2.moveTo(pt.x - 4, yLo);
                        ctx2.lineTo(pt.x + 4, yLo);
                        ctx2.stroke();
                        ctx2.beginPath();
                        ctx2.moveTo(pt.x - 4, yHi);
                        ctx2.lineTo(pt.x + 4, yHi);
                        ctx2.stroke();
                        ctx2.restore();
                    }});
                }});
            }}
        }}]
    }});
}})();
"""

# ── VPIP Charts ──
for v in VARIANTS:
    vd = vpip_chart_data(v)
    html += f"""
new Chart(document.getElementById('vpipChart_{v}'), {{
    type: 'bar',
    data: {json.dumps(vd)},
    options: {{
        responsive: true,
        plugins: {{ legend: {{ position: 'top' }} }},
        scales: {{
            y: {{ title: {{ display: true, text: 'VPIP %' }}, max: 100, grid: {{ color: '#1e293b' }} }},
            x: {{ title: {{ display: true, text: 'Table Size' }}, grid: {{ display: false }} }}
        }}
    }}
}});
"""

# ── Heatmap (canvas-based custom rendering) ──
html += f"""
(function() {{
    const canvas = document.getElementById('heatmapChart');
    const ctx = canvas.getContext('2d');
    const data = {json.dumps(heatmap_data)};
    const ylabels = {json.dumps(heatmap_labels_y)};
    const xlabels = {json.dumps(heatmap_labels_x)};

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement.clientWidth - 30;
    const H = 320;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const marginL = 100, marginT = 40, marginR = 80, marginB = 10;
    const cols = xlabels.length;
    const rows = ylabels.length;
    const cellW = (W - marginL - marginR) / cols;
    const cellH = (H - marginT - marginB) / rows;

    function valToColor(v) {{
        if (v === null) return '#1e293b';
        const clamped = Math.max(-200, Math.min(300, v));
        if (clamped >= 0) {{
            const t = clamped / 300;
            const r = Math.round(34 + (34 - 34) * t);
            const g = Math.round(197 + (197 - 100) * (1 - t));
            const b = Math.round(94 + (94 - 30) * (1 - t));
            return `rgb(${{Math.round(15 + t * 20)}}, ${{Math.round(80 + t * 117)}}, ${{Math.round(30 + t * 64)}})`;
        }} else {{
            const t = Math.abs(clamped) / 200;
            return `rgb(${{Math.round(80 + t * 159)}}, ${{Math.round(30 + (1-t) * 30)}}, ${{Math.round(30 + (1-t) * 20)}})`;
        }}
    }}

    ctx.font = '11px Inter, sans-serif';
    ctx.textBaseline = 'middle';

    // Draw cells
    for (let r = 0; r < rows; r++) {{
        // Y label
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(ylabels[r], marginL - 8, marginT + r * cellH + cellH / 2);

        for (let c = 0; c < data[r].length; c++) {{
            const v = data[r][c];
            const x = marginL + c * cellW;
            const y = marginT + r * cellH;
            ctx.fillStyle = valToColor(v);
            ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

            // Value text
            if (v !== null) {{
                ctx.fillStyle = Math.abs(v) > 80 ? '#fff' : '#e2e8f0';
                ctx.textAlign = 'center';
                ctx.fillText((v > 0 ? '+' : '') + v.toFixed(0), x + cellW / 2, y + cellH / 2);
            }}
        }}
    }}

    // X labels
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    for (let c = 0; c < cols; c++) {{
        ctx.fillText(xlabels[c], marginL + c * cellW + cellW / 2, marginT - 12);
    }}

    // Legend gradient
    const lgX = W - marginR + 20, lgW = 15, lgH = H - marginT - marginB - 20;
    const grad = ctx.createLinearGradient(lgX, marginT + 10, lgX, marginT + 10 + lgH);
    grad.addColorStop(0, valToColor(300));
    grad.addColorStop(0.4, valToColor(100));
    grad.addColorStop(0.6, valToColor(0));
    grad.addColorStop(1, valToColor(-200));
    ctx.fillStyle = grad;
    ctx.fillRect(lgX, marginT + 10, lgW, lgH);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('+300', lgX + lgW + 4, marginT + 15);
    ctx.fillText('0', lgX + lgW + 4, marginT + 10 + lgH * 0.6);
    ctx.fillText('-200', lgX + lgW + 4, marginT + 10 + lgH);
}})();
"""

html += """
</script>
</body>
</html>"""

# Write output
output_path = os.path.join(os.path.dirname(DATA_FILE), "..", OUTPUT_FILE)
with open(OUTPUT_FILE, "w") as f:
    f.write(html)

print(f"Report written to {OUTPUT_FILE}")
print(f"Size: {len(html):,} bytes")
