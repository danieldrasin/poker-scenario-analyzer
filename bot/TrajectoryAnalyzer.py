"""
Trajectory Analyzer - Track stack changes over time

Captures:
- Stack after each hand (not just final)
- Running profit curve
- Variance / volatility metrics
- Maximum drawdown
- Win/loss streaks
- Steady vs volatile accumulation patterns
"""

from pypokerengine.players import BasePokerPlayer
from pypokerengine.api.game import setup_config, start_poker
import requests
import json
import os
import random
import math
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from collections import defaultdict


@dataclass
class HandSnapshot:
    """Snapshot of game state after one hand."""
    hand_num: int
    player_stacks: Dict[str, int]  # name -> stack
    pot_size: int
    winners: List[str]
    
    def to_dict(self):
        return {
            "hand": self.hand_num,
            "stacks": self.player_stacks,
            "pot": self.pot_size,
            "winners": self.winners
        }


@dataclass
class PlayerTrajectory:
    """Complete trajectory for one player."""
    name: str
    strategy: str
    initial_stack: int
    
    # Per-hand data
    stack_history: List[int] = field(default_factory=list)  # Stack after each hand
    profit_history: List[int] = field(default_factory=list)  # Cumulative profit
    hand_results: List[int] = field(default_factory=list)  # Per-hand P/L
    
    # Computed metrics (filled after session)
    final_stack: int = 0
    total_profit: int = 0
    peak_stack: int = 0
    min_stack: int = 0
    max_drawdown: int = 0
    max_drawdown_pct: float = 0
    volatility: float = 0  # Std dev of hand results
    sharpe_ratio: float = 0  # Risk-adjusted returns
    longest_win_streak: int = 0
    longest_lose_streak: int = 0
    hands_won: int = 0
    hands_lost: int = 0
    
    def compute_metrics(self):
        """Calculate all trajectory metrics."""
        if not self.stack_history:
            return
        
        self.final_stack = self.stack_history[-1]
        self.total_profit = self.final_stack - self.initial_stack
        self.peak_stack = max(self.stack_history)
        self.min_stack = min(self.stack_history)
        
        # Maximum drawdown
        peak = self.initial_stack
        max_dd = 0
        for stack in self.stack_history:
            if stack > peak:
                peak = stack
            dd = peak - stack
            if dd > max_dd:
                max_dd = dd
        self.max_drawdown = max_dd
        self.max_drawdown_pct = (max_dd / peak * 100) if peak > 0 else 0
        
        # Volatility (std dev of hand results)
        if len(self.hand_results) > 1:
            mean = sum(self.hand_results) / len(self.hand_results)
            variance = sum((x - mean) ** 2 for x in self.hand_results) / len(self.hand_results)
            self.volatility = math.sqrt(variance)
        
        # Sharpe ratio (profit per unit of risk)
        if self.volatility > 0 and len(self.hand_results) > 0:
            avg_profit = self.total_profit / len(self.hand_results)
            self.sharpe_ratio = avg_profit / self.volatility
        
        # Win/loss streaks
        current_streak = 0
        is_winning = None
        max_win = 0
        max_lose = 0
        
        for result in self.hand_results:
            if result > 0:
                self.hands_won += 1
                if is_winning:
                    current_streak += 1
                else:
                    current_streak = 1
                    is_winning = True
                max_win = max(max_win, current_streak)
            elif result < 0:
                self.hands_lost += 1
                if is_winning == False:
                    current_streak += 1
                else:
                    current_streak = 1
                    is_winning = False
                max_lose = max(max_lose, current_streak)
            # result == 0 doesn't affect streak
        
        self.longest_win_streak = max_win
        self.longest_lose_streak = max_lose
    
    def to_dict(self):
        return {
            "name": self.name,
            "strategy": self.strategy,
            "initial_stack": self.initial_stack,
            "final_stack": self.final_stack,
            "total_profit": self.total_profit,
            "peak_stack": self.peak_stack,
            "min_stack": self.min_stack,
            "max_drawdown": self.max_drawdown,
            "max_drawdown_pct": round(self.max_drawdown_pct, 1),
            "volatility": round(self.volatility, 2),
            "sharpe_ratio": round(self.sharpe_ratio, 3),
            "longest_win_streak": self.longest_win_streak,
            "longest_lose_streak": self.longest_lose_streak,
            "hands_won": self.hands_won,
            "hands_lost": self.hands_lost,
            "stack_history": self.stack_history,
            "profit_history": self.profit_history
        }


class TrajectoryBot(BasePokerPlayer):
    """Bot that tracks its stack trajectory."""
    
    # Shared trajectory storage
    trajectories: Dict[str, PlayerTrajectory] = {}
    hand_snapshots: List[HandSnapshot] = []
    current_hand_num: int = 0
    initial_stack: int = 10000
    
    def __init__(self, strategy: str, variant: str = "omaha4",
                 advisor_url: str = "http://localhost:3001/api/advise"):
        super().__init__()
        self.strategy = strategy
        self.variant = variant
        self.advisor_url = advisor_url
        self.my_name = None
        self.prev_stack = 0
        
        # Card utilities
        self.all_cards = [f"{r}{s}" for r in 
                         ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
                         for s in ['s','h','d','c']]
    
    def _convert_cards(self, cards, board=None):
        """Convert PyPokerEngine cards to Play Advisor format."""
        def convert(card):
            suit_map = {"C": "c", "D": "d", "H": "h", "S": "s"}
            suit = suit_map.get(card[0], card[0].lower())
            rank = card[1:] if card[1:] != "T" else "10"
            return f"{rank}{suit}"
        
        converted = [convert(c) for c in cards]
        board_converted = [convert(c) for c in (board or [])]
        
        # Pad for Omaha
        variant_cards = {"omaha4": 4, "omaha5": 5, "omaha6": 6}
        needed = variant_cards.get(self.variant, 4)
        
        if len(converted) < needed:
            used = set(converted + board_converted)
            available = [c for c in self.all_cards if c not in used]
            rng = random.Random(hash(tuple(converted)))
            while len(converted) < needed and available:
                extra = rng.choice(available)
                converted.append(extra)
                available.remove(extra)
        
        return converted, board_converted
    
    def declare_action(self, valid_actions, hole_card, round_state):
        """Make decision based on strategy."""
        street = round_state["street"]
        board = round_state.get("community_card", [])
        
        # Preflop
        if len(board) < 3:
            return self._preflop_action(valid_actions)
        
        # Post-flop - consult advisor
        try:
            hole_cards, board_cards = self._convert_cards(hole_card, board)
            
            my_stack = 0
            my_seat = 0
            for i, seat in enumerate(round_state["seats"]):
                if seat["uuid"] == self.uuid:
                    my_stack = seat["stack"]
                    my_seat = i
                    break
            
            call_amount = 0
            for va in valid_actions:
                if va["action"] == "call":
                    call_amount = va["amount"]
                    break
            
            active = len([s for s in round_state["seats"] if s["state"] == "participating"])
            
            request = {
                "gameVariant": self.variant,
                "street": street,
                "holeCards": hole_cards,
                "board": board_cards,
                "position": ["button", "sb", "bb", "utg", "mp", "co"][my_seat % 6],
                "playersInHand": active,
                "potSize": round_state["pot"]["main"]["amount"],
                "toCall": call_amount,
                "stackSize": my_stack,
                "villainActions": []
            }
            
            response = requests.post(self.advisor_url, json=request, timeout=5)
            response.raise_for_status()
            advice = response.json()
            
            rec = advice.get("recommendation", {})
            action = rec.get("action", "fold").lower()
            sizing = rec.get("sizing", {})
            confidence = float(rec.get("confidence", "0%").replace("%", "")) / 100
            
            return self._apply_strategy(action, confidence, sizing, valid_actions)
            
        except:
            return self._fallback(valid_actions)
    
    def _preflop_action(self, valid_actions):
        """Strategy-specific preflop."""
        call = next((a for a in valid_actions if a["action"] == "call"), None)
        raise_a = next((a for a in valid_actions if a["action"] == "raise"), None)
        
        if call and call["amount"] == 0:
            return "call", 0
        
        if self.strategy == "MANIAC":
            if raise_a:
                min_r, max_r = raise_a["amount"]["min"], raise_a["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", min(min_r * 3, max_r)
            return "call", call["amount"] if call else 0
        elif self.strategy == "NIT":
            if call and call["amount"] <= 10:
                return "call", call["amount"]
            return "fold", 0
        elif self.strategy == "FISH":
            return "call", call["amount"] if call else 0
        elif self.strategy == "LAG":
            if raise_a and random.random() < 0.4:
                min_r, max_r = raise_a["amount"]["min"], raise_a["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", min_r
            return "call", call["amount"] if call else 0
        else:  # TAG, GTO
            if call and call["amount"] <= 30:
                return "call", call["amount"]
            return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions):
        """Apply strategy-specific modifications."""
        call = next((a for a in valid_actions if a["action"] == "call"), None)
        raise_a = next((a for a in valid_actions if a["action"] == "raise"), None)
        
        if self.strategy == "MANIAC":
            if random.random() < 0.7 and raise_a:
                min_r, max_r = raise_a["amount"]["min"], raise_a["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", min(sizing.get("optimal", min_r), max_r)
        elif self.strategy == "FISH":
            if advisor_action in ["raise", "bet"] and call:
                return "call", call["amount"]
        elif self.strategy == "NIT":
            if confidence < 0.7:
                if call and call["amount"] == 0:
                    return "call", 0
                return "fold", 0
        elif self.strategy == "LAG":
            if advisor_action == "call" and random.random() < 0.4 and raise_a:
                min_r, max_r = raise_a["amount"]["min"], raise_a["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", min_r
        
        # Execute advisor action
        return self._execute(advisor_action, sizing, valid_actions)
    
    def _execute(self, action, sizing, valid_actions):
        """Execute action."""
        if action == "fold":
            return "fold", 0
        elif action in ["call", "check"]:
            call = next((a for a in valid_actions if a["action"] == "call"), None)
            return ("call", call["amount"]) if call else ("fold", 0)
        elif action in ["raise", "bet"]:
            raise_a = next((a for a in valid_actions if a["action"] == "raise"), None)
            if raise_a:
                min_r, max_r = raise_a["amount"]["min"], raise_a["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    amt = max(min_r, min(sizing.get("optimal", min_r), max_r))
                    return "raise", amt
            call = next((a for a in valid_actions if a["action"] == "call"), None)
            return ("call", call["amount"]) if call else ("fold", 0)
        return "fold", 0
    
    def _fallback(self, valid_actions):
        call = next((a for a in valid_actions if a["action"] == "call"), None)
        if call and call["amount"] == 0:
            return "call", 0
        return "fold", 0
    
    def receive_game_start_message(self, game_info):
        pass
    
    def receive_round_start_message(self, round_count, hole_card, seats):
        TrajectoryBot.current_hand_num = round_count
        
        # Find my name and stack
        for seat in seats:
            if seat["uuid"] == self.uuid:
                self.my_name = seat["name"]
                self.prev_stack = seat["stack"]
                break
    
    def receive_street_start_message(self, street, round_state):
        pass
    
    def receive_game_update_message(self, action, round_state):
        pass
    
    def receive_round_result_message(self, winners, hand_info, round_state):
        """Record stack snapshot after each hand."""
        # Build snapshot of all player stacks
        stacks = {}
        for seat in round_state["seats"]:
            stacks[seat["name"]] = seat["stack"]
        
        winner_names = [w["name"] for w in winners if "name" in w]
        
        snapshot = HandSnapshot(
            hand_num=TrajectoryBot.current_hand_num,
            player_stacks=stacks,
            pot_size=round_state["pot"]["main"]["amount"],
            winners=winner_names
        )
        
        # Only first bot to see this hand records it
        if (not TrajectoryBot.hand_snapshots or 
            TrajectoryBot.hand_snapshots[-1].hand_num != snapshot.hand_num):
            TrajectoryBot.hand_snapshots.append(snapshot)
        
        # Update my trajectory
        my_stack = stacks.get(self.my_name, 0)
        
        if self.my_name and self.my_name in TrajectoryBot.trajectories:
            traj = TrajectoryBot.trajectories[self.my_name]
            traj.stack_history.append(my_stack)
            traj.profit_history.append(my_stack - traj.initial_stack)
            
            # Hand P/L
            hand_pl = my_stack - self.prev_stack
            traj.hand_results.append(hand_pl)
        
        self.prev_stack = my_stack


def run_trajectory_test(
    num_players: int = 6,
    num_hands: int = 500,
    variant: str = "omaha4",
    strategies: List[str] = None,
    initial_stack: int = 10000,
    small_blind: int = 10
):
    """Run test with full trajectory tracking."""
    
    if strategies is None:
        strategies = ["TAG", "LAG", "GTO", "FISH", "NIT", "MANIAC"][:num_players]
    while len(strategies) < num_players:
        strategies.append("GTO")
    
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    print("\n" + "=" * 80)
    print("TRAJECTORY ANALYSIS TEST")
    print("=" * 80)
    print(f"Session: {session_id}")
    print(f"Players: {num_players} | Hands: {num_hands} | Variant: {variant}")
    print(f"Strategies: {', '.join(strategies[:num_players])}")
    print()
    
    # Check advisor
    try:
        requests.get("http://localhost:3001/api/health", timeout=2)
        print("✓ Play Advisor running")
    except:
        print("✗ Play Advisor not responding!")
        return None
    
    # Reset shared state
    TrajectoryBot.trajectories = {}
    TrajectoryBot.hand_snapshots = []
    TrajectoryBot.current_hand_num = 0
    TrajectoryBot.initial_stack = initial_stack
    
    # Create bots
    bots = []
    config = setup_config(
        max_round=num_hands,
        initial_stack=initial_stack,
        small_blind_amount=small_blind
    )
    
    for i in range(num_players):
        bot = TrajectoryBot(strategy=strategies[i], variant=variant)
        name = f"{strategies[i]}_{i+1}"
        bots.append((name, bot))
        config.register_player(name=name, algorithm=bot)
        
        # Initialize trajectory
        TrajectoryBot.trajectories[name] = PlayerTrajectory(
            name=name,
            strategy=strategies[i],
            initial_stack=initial_stack
        )
    
    # Run game
    print(f"\nRunning {num_hands} hands...")
    start = datetime.now()
    result = start_poker(config, verbose=0)
    elapsed = (datetime.now() - start).total_seconds()
    
    # Compute metrics
    for name, traj in TrajectoryBot.trajectories.items():
        traj.compute_metrics()
    
    # Print results
    print(f"\nCompleted in {elapsed:.1f}s ({num_hands/elapsed:.1f} hands/sec)")
    print("\n" + "=" * 80)
    print("FINAL STANDINGS")
    print("=" * 80)
    
    sorted_trajs = sorted(TrajectoryBot.trajectories.values(), 
                         key=lambda t: t.total_profit, reverse=True)
    
    print(f"\n{'Player':<12} {'Strategy':<8} {'Profit':>10} {'Peak':>8} {'MinStack':>8} {'MaxDD':>8} {'Vol':>8} {'Sharpe':>8}")
    print("-" * 85)
    
    for traj in sorted_trajs:
        print(f"{traj.name:<12} {traj.strategy:<8} {traj.total_profit:>+10d} "
              f"{traj.peak_stack:>8d} {traj.min_stack:>8d} {traj.max_drawdown:>8d} "
              f"{traj.volatility:>8.0f} {traj.sharpe_ratio:>8.3f}")
    
    # Trajectory patterns
    print("\n" + "=" * 80)
    print("TRAJECTORY PATTERNS")
    print("=" * 80)
    
    for traj in sorted_trajs:
        pattern = classify_trajectory(traj)
        streak_info = f"Win streak: {traj.longest_win_streak}, Lose streak: {traj.longest_lose_streak}"
        print(f"{traj.name:<12} {pattern:<25} {streak_info}")
    
    # Save results
    output_dir = os.path.join(os.path.dirname(__file__), "test_results")
    os.makedirs(output_dir, exist_ok=True)
    
    results_file = os.path.join(output_dir, f"trajectory_{session_id}.json")
    with open(results_file, "w") as f:
        json.dump({
            "session_id": session_id,
            "variant": variant,
            "num_hands": num_hands,
            "duration_seconds": elapsed,
            "trajectories": {name: t.to_dict() for name, t in TrajectoryBot.trajectories.items()},
            "hand_snapshots": [s.to_dict() for s in TrajectoryBot.hand_snapshots]
        }, f, indent=2)
    
    print(f"\nResults saved to: {results_file}")
    
    return {
        "session_id": session_id,
        "trajectories": TrajectoryBot.trajectories,
        "snapshots": TrajectoryBot.hand_snapshots
    }


def classify_trajectory(traj: PlayerTrajectory) -> str:
    """Classify trajectory pattern."""
    if traj.total_profit <= 0:
        if traj.volatility > 500:
            return "Volatile decline"
        else:
            return "Steady decline"
    else:
        # Winner
        dd_ratio = traj.max_drawdown / traj.peak_stack if traj.peak_stack > 0 else 0
        
        if dd_ratio < 0.2 and traj.volatility < 300:
            return "Steady accumulation"
        elif dd_ratio > 0.5:
            return "Volatile winner (big swings)"
        elif traj.sharpe_ratio > 0.1:
            return "Efficient winner (good Sharpe)"
        else:
            return "Moderate volatility"


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--players", type=int, default=6)
    parser.add_argument("--hands", type=int, default=500)
    parser.add_argument("--variant", default="omaha4")
    parser.add_argument("--strategies", nargs="+")
    
    args = parser.parse_args()
    
    run_trajectory_test(
        num_players=args.players,
        num_hands=args.hands,
        variant=args.variant,
        strategies=args.strategies
    )
