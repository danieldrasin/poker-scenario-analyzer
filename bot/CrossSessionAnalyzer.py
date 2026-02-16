"""
Cross-Session Analyzer - Aggregate results across multiple test sessions

Analyzes:
- Strategy performance across sessions
- Volatility patterns
- Consistency vs variance
- Head-to-head matchups
"""

import json
import os
from collections import defaultdict
from datetime import datetime
from typing import List, Dict
import math


def load_trajectory_files(results_dir: str) -> List[Dict]:
    """Load all trajectory JSON files."""
    sessions = []
    
    for filename in sorted(os.listdir(results_dir)):
        if filename.startswith("trajectory_") and filename.endswith(".json"):
            filepath = os.path.join(results_dir, filename)
            with open(filepath, "r") as f:
                data = json.load(f)
                sessions.append(data)
    
    return sessions


def analyze_sessions(sessions: List[Dict]) -> Dict:
    """Aggregate analysis across sessions."""
    
    # Per-strategy aggregation
    strategy_stats = defaultdict(lambda: {
        "sessions": 0,
        "total_hands": 0,
        "total_profit": 0,
        "wins": 0,  # Sessions won
        "losses": 0,  # Sessions with negative profit
        "busts": 0,  # Times went to 0
        "profits": [],  # Per-session profits
        "volatilities": [],
        "sharpe_ratios": [],
        "max_drawdowns": [],
        "peak_stacks": [],
        "final_stacks": [],
        "win_streaks": [],
        "lose_streaks": []
    })
    
    for session in sessions:
        trajs = session.get("trajectories", {})
        num_hands = session.get("num_hands", 0)
        
        # Find session winner
        if trajs:
            winner_name = max(trajs.keys(), key=lambda n: trajs[n]["total_profit"])
        else:
            winner_name = None
        
        for name, t in trajs.items():
            strategy = t["strategy"]
            stats = strategy_stats[strategy]
            
            stats["sessions"] += 1
            stats["total_hands"] += num_hands
            stats["total_profit"] += t["total_profit"]
            stats["profits"].append(t["total_profit"])
            stats["volatilities"].append(t["volatility"])
            stats["sharpe_ratios"].append(t["sharpe_ratio"])
            stats["max_drawdowns"].append(t["max_drawdown"])
            stats["peak_stacks"].append(t["peak_stack"])
            stats["final_stacks"].append(t["final_stack"])
            stats["win_streaks"].append(t["longest_win_streak"])
            stats["lose_streaks"].append(t["longest_lose_streak"])
            
            if name == winner_name:
                stats["wins"] += 1
            if t["total_profit"] < 0:
                stats["losses"] += 1
            if t["final_stack"] == 0:
                stats["busts"] += 1
    
    # Calculate derived metrics
    results = {}
    for strategy, stats in strategy_stats.items():
        n = stats["sessions"]
        if n == 0:
            continue
        
        # Averages
        avg_profit = stats["total_profit"] / n
        avg_vol = sum(stats["volatilities"]) / n if stats["volatilities"] else 0
        avg_sharpe = sum(stats["sharpe_ratios"]) / n if stats["sharpe_ratios"] else 0
        avg_drawdown = sum(stats["max_drawdowns"]) / n if stats["max_drawdowns"] else 0
        
        # Profit consistency (std dev of session profits)
        if len(stats["profits"]) > 1:
            mean_p = sum(stats["profits"]) / len(stats["profits"])
            var = sum((p - mean_p)**2 for p in stats["profits"]) / len(stats["profits"])
            profit_std = math.sqrt(var)
        else:
            profit_std = 0
        
        # Win rate
        win_rate = (stats["wins"] / n * 100) if n > 0 else 0
        bust_rate = (stats["busts"] / n * 100) if n > 0 else 0
        
        # BB/100 (assuming 20 big blind)
        total_hands = stats["total_hands"]
        bb100 = (stats["total_profit"] / 20) / (total_hands / 100) if total_hands > 0 else 0
        
        results[strategy] = {
            "sessions": n,
            "total_hands": total_hands,
            "total_profit": stats["total_profit"],
            "avg_profit_per_session": round(avg_profit, 0),
            "profit_std": round(profit_std, 0),
            "bb_100": round(bb100, 2),
            "win_rate": round(win_rate, 1),
            "bust_rate": round(bust_rate, 1),
            "avg_volatility": round(avg_vol, 1),
            "avg_sharpe": round(avg_sharpe, 3),
            "avg_max_drawdown": round(avg_drawdown, 0),
            "best_session": max(stats["profits"]) if stats["profits"] else 0,
            "worst_session": min(stats["profits"]) if stats["profits"] else 0,
            "avg_win_streak": round(sum(stats["win_streaks"]) / n, 1) if stats["win_streaks"] else 0,
            "avg_lose_streak": round(sum(stats["lose_streaks"]) / n, 1) if stats["lose_streaks"] else 0
        }
    
    return results


def print_analysis(results: Dict, num_sessions: int):
    """Print formatted analysis."""
    
    print("\n" + "=" * 90)
    print(f"CROSS-SESSION ANALYSIS - {num_sessions} Sessions")
    print("=" * 90)
    
    # Sort by total profit
    sorted_results = sorted(results.items(), key=lambda x: x[1]["total_profit"], reverse=True)
    
    # Main table
    print(f"\n{'Strategy':<10} {'Sessions':>8} {'TotalProfit':>12} {'AvgProfit':>10} {'BB/100':>8} {'WinRate':>8} {'BustRate':>9}")
    print("-" * 75)
    
    for strategy, stats in sorted_results:
        print(f"{strategy:<10} {stats['sessions']:>8d} {stats['total_profit']:>+12d} "
              f"{stats['avg_profit_per_session']:>+10.0f} {stats['bb_100']:>+8.2f} "
              f"{stats['win_rate']:>7.1f}% {stats['bust_rate']:>8.1f}%")
    
    # Volatility table
    print(f"\n{'Strategy':<10} {'AvgVol':>10} {'AvgSharpe':>10} {'AvgMaxDD':>10} {'ProfitStd':>12} {'Best':>10} {'Worst':>10}")
    print("-" * 75)
    
    for strategy, stats in sorted_results:
        print(f"{strategy:<10} {stats['avg_volatility']:>10.1f} {stats['avg_sharpe']:>10.3f} "
              f"{stats['avg_max_drawdown']:>10.0f} {stats['profit_std']:>12.0f} "
              f"{stats['best_session']:>+10d} {stats['worst_session']:>+10d}")
    
    # Pattern analysis
    print("\n" + "=" * 90)
    print("PATTERN ANALYSIS")
    print("=" * 90)
    
    for strategy, stats in sorted_results:
        pattern = classify_strategy_pattern(stats)
        print(f"{strategy:<10}: {pattern}")
    
    print()


def classify_strategy_pattern(stats: Dict) -> str:
    """Classify overall strategy pattern."""
    
    profit = stats["total_profit"]
    win_rate = stats["win_rate"]
    bust_rate = stats["bust_rate"]
    vol = stats["avg_volatility"]
    sharpe = stats["avg_sharpe"]
    profit_std = stats["profit_std"]
    
    patterns = []
    
    # Profitability
    if profit > 0:
        if win_rate >= 50:
            patterns.append("Consistent winner")
        else:
            patterns.append("Occasional big winner")
    else:
        if bust_rate >= 50:
            patterns.append("High bust risk")
        else:
            patterns.append("Gradual loser")
    
    # Volatility
    if vol > 500:
        patterns.append("high volatility")
    elif vol < 100:
        patterns.append("low volatility")
    else:
        patterns.append("moderate volatility")
    
    # Consistency
    if profit_std > 10000:
        patterns.append("highly variable results")
    elif profit_std < 3000:
        patterns.append("consistent results")
    
    # Risk-adjusted
    if sharpe > 0.05:
        patterns.append("good risk-adjusted returns")
    elif sharpe < -0.05:
        patterns.append("poor risk-adjusted returns")
    
    return " | ".join(patterns)


def main():
    """Run cross-session analysis."""
    
    results_dir = os.path.join(os.path.dirname(__file__), "test_results")
    
    print("Loading trajectory files...")
    sessions = load_trajectory_files(results_dir)
    
    if not sessions:
        print("No trajectory files found!")
        return
    
    print(f"Found {len(sessions)} sessions")
    
    results = analyze_sessions(sessions)
    print_analysis(results, len(sessions))
    
    # Save analysis
    output_file = os.path.join(results_dir, f"cross_session_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(output_file, "w") as f:
        json.dump({
            "num_sessions": len(sessions),
            "analysis_timestamp": datetime.now().isoformat(),
            "strategy_results": results
        }, f, indent=2)
    
    print(f"Analysis saved to: {output_file}")


if __name__ == "__main__":
    main()
