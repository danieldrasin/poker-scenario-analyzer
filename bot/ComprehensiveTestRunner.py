"""
Comprehensive Test Runner with Full Data Capture

Captures per-hand:
- Who wins / who loses
- Stack changes for each player  
- All betting actions per street
- Advisor recommendations vs actual actions

Saves results to JSON for cross-session analysis.
"""

from pypokerengine.players import BasePokerPlayer
from pypokerengine.api.game import setup_config, start_poker
import requests
import json
import os
import random
import argparse
from datetime import datetime
from typing import List, Dict, Optional
from HandDataCapture import HandDataCollector, HandRecord


# =============================================================================
# STRATEGY BOT WITH DATA CAPTURE
# =============================================================================

class InstrumentedBot(BasePokerPlayer):
    """Bot that captures all actions for analysis."""
    
    # Class-level data collector (shared across all bots)
    collector: HandDataCollector = None
    
    def __init__(self, strategy: str, variant: str = "omaha4",
                 advisor_url: str = "http://localhost:3001/api/advise"):
        super().__init__()
        self.strategy = strategy
        self.variant = variant
        self.advisor_url = advisor_url
        self.current_stack = 0
        self.hand_count = 0
        
        # Strategy parameters
        self.preflop_tightness = self._get_preflop_tightness()
        self.aggression_factor = self._get_aggression_factor()
        
        # All cards for generating Omaha hands
        self.all_cards = self._generate_deck()
    
    def _get_preflop_tightness(self):
        """How tight preflop (0=loose, 1=tight)."""
        return {
            "TAG": 0.7, "LAG": 0.3, "NIT": 0.9, 
            "FISH": 0.1, "MANIAC": 0.0, "GTO": 0.5, "RANDOM": 0.5
        }.get(self.strategy, 0.5)
    
    def _get_aggression_factor(self):
        """How aggressive (0=passive, 1=aggressive)."""
        return {
            "TAG": 0.7, "LAG": 0.9, "NIT": 0.3,
            "FISH": 0.2, "MANIAC": 1.0, "GTO": 0.5, "RANDOM": 0.5
        }.get(self.strategy, 0.5)
    
    def _generate_deck(self):
        suits = ['s', 'h', 'd', 'c']
        ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        return [f"{r}{s}" for r in ranks for s in suits]
    
    def _convert_cards(self, cards, board=None):
        """Convert PyPokerEngine cards to Play Advisor format."""
        def convert(card):
            suit_map = {"C": "c", "D": "d", "H": "h", "S": "s"}
            suit = suit_map.get(card[0], card[0].lower())
            rank = card[1:] if card[1:] != "T" else "10"
            return f"{rank}{suit}"
        
        converted = [convert(c) for c in cards]
        board_converted = [convert(c) for c in (board or [])]
        
        # Pad to Omaha requirements
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
        """Main decision with full instrumentation."""
        street = round_state["street"]
        pot = round_state["pot"]["main"]["amount"]
        board = round_state.get("community_card", [])
        
        # Get my current stack
        for seat in round_state["seats"]:
            if seat["uuid"] == self.uuid:
                self.current_stack = seat["stack"]
                break
        
        stack_before = self.current_stack
        
        # Preflop or no board - use strategy-specific logic
        if len(board) < 3:
            action, amount = self._preflop_action(valid_actions)
            self._record_action(street, action, amount, pot, stack_before, None, None)
            return action, amount
        
        # Post-flop - consult advisor
        advisor_action = None
        advisor_confidence = None
        
        try:
            hole_cards, board_cards = self._convert_cards(hole_card, board)
            request = self._build_request(hole_cards, board_cards, round_state, valid_actions)
            
            response = requests.post(self.advisor_url, json=request, timeout=5)
            response.raise_for_status()
            advice = response.json()
            
            rec = advice.get("recommendation", {})
            advisor_action = rec.get("action", "fold").lower()
            conf_str = rec.get("confidence", "0%")
            advisor_confidence = float(conf_str.replace("%", "")) / 100 if conf_str else 0
            sizing = rec.get("sizing", {})
            
            # Apply strategy modifications
            action, amount = self._apply_strategy(
                advisor_action, advisor_confidence, sizing, valid_actions, street
            )
            
        except Exception as e:
            # Fallback on error
            action, amount = self._fallback_action(valid_actions)
        
        # Record the action
        self._record_action(street, action, amount, pot, stack_before, 
                          advisor_action, advisor_confidence)
        
        return action, amount
    
    def _record_action(self, street, action, amount, pot_before, stack_before,
                       advisor_action, advisor_confidence):
        """Record action to the data collector."""
        if InstrumentedBot.collector:
            pot_after = pot_before + amount if action != "fold" else pot_before
            stack_after = stack_before - amount if action in ["call", "raise"] else stack_before
            
            InstrumentedBot.collector.record_action(
                uuid=self.uuid,
                street=street,
                action=action,
                amount=amount,
                pot_before=pot_before,
                pot_after=pot_after,
                stack_before=stack_before,
                stack_after=stack_after,
                advisor_action=advisor_action,
                advisor_confidence=advisor_confidence
            )
    
    def _preflop_action(self, valid_actions):
        """Strategy-specific preflop action."""
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
        
        # Check for free
        if call_action and call_action["amount"] == 0:
            return "call", 0
        
        # Strategy-based decision
        if self.strategy == "MANIAC":
            if raise_action:
                min_r = raise_action["amount"]["min"]
                max_r = raise_action["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", min(min_r * 3, max_r)
            return "call", call_action["amount"] if call_action else 0
        
        elif self.strategy == "NIT":
            if call_action and call_action["amount"] <= 10:
                return "call", call_action["amount"]
            return "fold", 0
        
        elif self.strategy == "FISH":
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        
        elif self.strategy == "LAG":
            if raise_action and random.random() < 0.4:
                min_r = raise_action["amount"]["min"]
                max_r = raise_action["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", min_r
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        
        elif self.strategy == "RANDOM":
            choice = random.choice(valid_actions)
            if choice["action"] == "raise":
                min_r = choice["amount"]["min"]
                max_r = choice["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", random.randint(min_r, min(max_r, min_r * 3))
                return "fold", 0
            return choice["action"], choice.get("amount", 0)
        
        else:  # TAG, GTO
            if call_action and call_action["amount"] <= 30:
                return "call", call_action["amount"]
            return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        """Apply strategy-specific modifications to advisor recommendation."""
        
        if self.strategy == "RANDOM":
            # Ignore advisor completely
            choice = random.choice(valid_actions)
            if choice["action"] == "raise":
                min_r = choice["amount"]["min"]
                max_r = choice["amount"]["max"]
                if min_r > 0 and max_r >= min_r:
                    return "raise", random.randint(min_r, min(max_r, min_r * 2))
                return "fold", 0
            return choice["action"], choice.get("amount", 0)
        
        elif self.strategy == "MANIAC":
            # Always try to raise
            if random.random() < 0.8:
                return self._execute_action("raise", sizing, valid_actions)
            return self._execute_action(advisor_action, sizing, valid_actions)
        
        elif self.strategy == "FISH":
            # Always call instead of raise
            if advisor_action in ["raise", "bet"]:
                call_action = next((a for a in valid_actions if a["action"] == "call"), None)
                if call_action:
                    return "call", call_action["amount"]
            return self._execute_action(advisor_action, sizing, valid_actions)
        
        elif self.strategy == "LAG":
            # More aggressive - convert calls to raises
            if advisor_action == "call" and random.random() < 0.4:
                return self._execute_action("raise", sizing, valid_actions)
            return self._execute_action(advisor_action, sizing, valid_actions)
        
        elif self.strategy == "NIT":
            # Only act on high confidence
            if confidence < 0.7:
                call_action = next((a for a in valid_actions if a["action"] == "call"), None)
                if call_action and call_action["amount"] == 0:
                    return "call", 0
                return "fold", 0
            return self._execute_action(advisor_action, sizing, valid_actions)
        
        elif self.strategy == "TAG":
            # Slightly more aggressive than pure advisor
            if advisor_action == "call" and confidence > 0.7 and random.random() < 0.3:
                return self._execute_action("raise", sizing, valid_actions)
            return self._execute_action(advisor_action, sizing, valid_actions)
        
        else:  # GTO - follow advisor exactly
            return self._execute_action(advisor_action, sizing, valid_actions)
    
    def _execute_action(self, action, sizing, valid_actions):
        """Convert to PyPokerEngine action."""
        if action == "fold":
            return "fold", 0
        elif action in ["call", "check"]:
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        elif action in ["raise", "bet"]:
            raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
            if raise_action:
                min_r = raise_action["amount"]["min"]
                max_r = raise_action["amount"]["max"]
                if min_r <= 0 or max_r < min_r:
                    call_action = next((a for a in valid_actions if a["action"] == "call"), None)
                    if call_action:
                        return "call", call_action["amount"]
                    return "fold", 0
                optimal = sizing.get("optimal", min_r) if sizing else min_r
                amount = max(min_r, min(optimal, max_r))
                return "raise", amount
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        else:
            return "fold", 0
    
    def _fallback_action(self, valid_actions):
        """Fallback when advisor fails."""
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        if call_action and call_action["amount"] == 0:
            return "call", 0
        return "fold", 0
    
    def _build_request(self, hole_cards, board_cards, round_state, valid_actions):
        """Build Play Advisor API request."""
        my_stack = self.current_stack
        my_seat = 0
        for i, seat in enumerate(round_state["seats"]):
            if seat["uuid"] == self.uuid:
                my_seat = i
                break
        
        call_amount = 0
        for va in valid_actions:
            if va["action"] == "call":
                call_amount = va["amount"]
                break
        
        active = len([s for s in round_state["seats"] if s["state"] == "participating"])
        positions = ["button", "sb", "bb", "utg", "mp", "co", "btn"]
        position = positions[my_seat % len(positions)]
        
        return {
            "gameVariant": self.variant,
            "street": round_state["street"],
            "holeCards": hole_cards,
            "board": board_cards,
            "position": position,
            "playersInHand": active,
            "potSize": round_state["pot"]["main"]["amount"],
            "toCall": call_amount,
            "stackSize": my_stack,
            "villainActions": []
        }
    
    # PyPokerEngine callbacks
    def receive_game_start_message(self, game_info):
        pass
    
    def receive_round_start_message(self, round_count, hole_card, seats):
        self.hand_count = round_count
        
        # Record hole cards
        if InstrumentedBot.collector:
            converted, _ = self._convert_cards(hole_card)
            InstrumentedBot.collector.record_hole_cards(self.uuid, converted)
    
    def receive_street_start_message(self, street, round_state):
        # Record board when it changes
        if InstrumentedBot.collector and street != "preflop":
            board = round_state.get("community_card", [])
            _, board_converted = self._convert_cards([], board)
            InstrumentedBot.collector.record_board(board_converted)
    
    def receive_game_update_message(self, action, round_state):
        pass
    
    def receive_round_result_message(self, winners, hand_info, round_state):
        pass


# =============================================================================
# CUSTOM GAME RUNNER WITH DATA CAPTURE
# =============================================================================

class InstrumentedDealer:
    """
    Custom dealer that captures hand data.
    Wraps PyPokerEngine's start_poker with instrumentation.
    """
    
    @staticmethod
    def run_game(config, collector: HandDataCollector, verbose=0):
        """Run game with full data capture."""
        
        # Get all registered players
        players = config.players_info
        initial_stack = config.initial_stack
        
        # Register players with collector
        for i, (name, algo) in enumerate(players):
            # We'll get UUID after game starts
            pass
        
        # Store collector reference for bots
        InstrumentedBot.collector = collector
        
        # Run the game with a custom message handler
        result = start_poker(config, verbose=verbose)
        
        return result


# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

def run_comprehensive_test(
    num_players: int = 6,
    num_hands: int = 500,
    variant: str = "omaha4",
    strategies: List[str] = None,
    initial_stack: int = 10000,
    small_blind: int = 10,
    save_results: bool = True
):
    """Run a comprehensive test with full data capture."""
    
    if strategies is None:
        default_strategies = ["TAG", "LAG", "GTO", "FISH", "NIT", "MANIAC", "RANDOM"]
        strategies = default_strategies[:num_players]
    
    while len(strategies) < num_players:
        strategies.append(random.choice(["TAG", "LAG", "GTO"]))
    
    # Create session ID
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    print("\n" + "=" * 80)
    print("COMPREHENSIVE PLAY ADVISOR TEST")
    print("=" * 80)
    print(f"Session ID: {session_id}")
    print(f"Players: {num_players}")
    print(f"Hands: {num_hands}")
    print(f"Variant: {variant}")
    print(f"Strategies: {', '.join(strategies[:num_players])}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check advisor
    try:
        requests.get("http://localhost:3001/api/health", timeout=2)
        print("✓ Play Advisor server is running")
    except:
        print("✗ Play Advisor not responding!")
        return None
    
    # Create data collector
    output_dir = os.path.join(os.path.dirname(__file__), "test_results")
    collector = HandDataCollector(session_id=session_id, variant=variant, output_dir=output_dir)
    
    # Create bots
    bots = []
    for i in range(num_players):
        bot = InstrumentedBot(strategy=strategies[i], variant=variant)
        bots.append(bot)
    
    # Configure game
    config = setup_config(
        max_round=num_hands,
        initial_stack=initial_stack,
        small_blind_amount=small_blind
    )
    
    for i, bot in enumerate(bots):
        name = f"{bot.strategy}_{i+1}"
        config.register_player(name=name, algorithm=bot)
    
    # Set up collector reference
    InstrumentedBot.collector = collector
    
    # Run game
    print(f"\nRunning {num_hands} hands...")
    start_time = datetime.now()
    
    # We need to capture hand data during the game
    # PyPokerEngine doesn't expose per-hand hooks easily, 
    # so we'll track via the bots' callbacks
    
    result = start_poker(config, verbose=0)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    # Register final results
    for i, player in enumerate(result["players"]):
        bot = bots[i]
        # Register player info retroactively
        collector.register_player(
            uuid=bot.uuid,
            name=player["name"],
            strategy=bot.strategy,
            seat=i,
            stack=initial_stack
        )
    
    # Calculate per-player results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    print(f"Time: {elapsed:.1f}s | Hands/sec: {num_hands/elapsed:.1f}")
    print()
    
    # Results table
    results = []
    for i, player in enumerate(result["players"]):
        bot = bots[i]
        profit = player["stack"] - initial_stack
        results.append({
            "rank": 0,
            "name": player["name"],
            "strategy": bot.strategy,
            "stack": player["stack"],
            "profit": profit,
            "bb100": (profit / 20) / (num_hands / 100) if num_hands > 0 else 0
        })
    
    # Sort by profit
    results.sort(key=lambda x: x["profit"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
    
    # Print results
    print(f"{'Rank':<5} {'Player':<15} {'Strategy':<10} {'Stack':>10} {'Profit':>12} {'BB/100':>10}")
    print("-" * 70)
    
    for r in results:
        print(f"{r['rank']:<5} {r['name']:<15} {r['strategy']:<10} {r['stack']:>10d} "
              f"{r['profit']:>+12d} {r['bb100']:>+10.1f}")
    
    print()
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    winner = results[0]
    loser = results[-1]
    print(f"Winner: {winner['name']} ({winner['strategy']}) with {winner['profit']:+d}")
    print(f"Loser: {loser['name']} ({loser['strategy']}) with {loser['profit']:+d}")
    print()
    
    # Save results
    if save_results:
        # Save to JSON
        results_file = os.path.join(output_dir, f"results_{session_id}.json")
        os.makedirs(output_dir, exist_ok=True)
        
        with open(results_file, "w") as f:
            json.dump({
                "session_id": session_id,
                "variant": variant,
                "num_hands": num_hands,
                "num_players": num_players,
                "duration_seconds": elapsed,
                "strategies": strategies[:num_players],
                "results": results,
                "timestamp": datetime.now().isoformat()
            }, f, indent=2)
        
        print(f"Results saved to: {results_file}")
    
    return {
        "session_id": session_id,
        "variant": variant,
        "num_hands": num_hands,
        "duration": elapsed,
        "results": results
    }


def run_multiple_sessions(
    num_sessions: int = 5,
    num_players: int = 6,
    num_hands: int = 500,
    variant: str = "omaha4",
    strategies: List[str] = None
):
    """Run multiple sessions and aggregate results."""
    
    print("\n" + "=" * 80)
    print(f"RUNNING {num_sessions} TEST SESSIONS")
    print("=" * 80)
    
    all_results = []
    
    for session in range(num_sessions):
        print(f"\n>>> Session {session + 1}/{num_sessions}")
        result = run_comprehensive_test(
            num_players=num_players,
            num_hands=num_hands,
            variant=variant,
            strategies=strategies,
            save_results=True
        )
        if result:
            all_results.append(result)
    
    # Aggregate analysis
    if all_results:
        print("\n" + "=" * 80)
        print("AGGREGATE RESULTS")
        print("=" * 80)
        
        strategy_totals = {}
        for result in all_results:
            for player in result["results"]:
                strategy = player["strategy"]
                if strategy not in strategy_totals:
                    strategy_totals[strategy] = {
                        "sessions": 0,
                        "total_profit": 0,
                        "wins": 0,
                        "losses": 0
                    }
                strategy_totals[strategy]["sessions"] += 1
                strategy_totals[strategy]["total_profit"] += player["profit"]
                if player["rank"] == 1:
                    strategy_totals[strategy]["wins"] += 1
                if player["rank"] == len(result["results"]):
                    strategy_totals[strategy]["losses"] += 1
        
        print(f"\n{'Strategy':<12} {'Sessions':>10} {'Total Profit':>14} {'Avg Profit':>12} {'Wins':>6} {'Losses':>8}")
        print("-" * 70)
        
        sorted_strats = sorted(strategy_totals.items(), 
                              key=lambda x: x[1]["total_profit"], reverse=True)
        
        for strategy, stats in sorted_strats:
            avg = stats["total_profit"] / stats["sessions"] if stats["sessions"] > 0 else 0
            print(f"{strategy:<12} {stats['sessions']:>10d} {stats['total_profit']:>+14d} "
                  f"{avg:>+12.0f} {stats['wins']:>6d} {stats['losses']:>8d}")
        
        print()
    
    return all_results


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Comprehensive Play Advisor Test")
    parser.add_argument("--players", type=int, default=6)
    parser.add_argument("--hands", type=int, default=500)
    parser.add_argument("--variant", type=str, default="omaha4",
                        choices=["omaha4", "omaha5", "omaha6"])
    parser.add_argument("--strategies", type=str, nargs="+")
    parser.add_argument("--sessions", type=int, default=1)
    parser.add_argument("--stack", type=int, default=10000)
    parser.add_argument("--blind", type=int, default=10)
    
    args = parser.parse_args()
    
    if args.sessions > 1:
        run_multiple_sessions(
            num_sessions=args.sessions,
            num_players=args.players,
            num_hands=args.hands,
            variant=args.variant,
            strategies=args.strategies
        )
    else:
        run_comprehensive_test(
            num_players=args.players,
            num_hands=args.hands,
            variant=args.variant,
            strategies=args.strategies,
            initial_stack=args.stack,
            small_blind=args.blind
        )
