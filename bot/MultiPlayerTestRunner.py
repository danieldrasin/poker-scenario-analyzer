"""
Multi-Player Test Runner for Play Advisor Validation

Supports:
- 2-7 players at the table
- Multiple strategy types (TAG, LAG, NIT, FISH, MANIAC, GTO)
- Omaha variants (4/5/6 card)
- Large-scale testing with comprehensive logging

Usage:
    python3 MultiPlayerTestRunner.py --players 6 --hands 1000 --variant omaha4
"""

from pypokerengine.players import BasePokerPlayer
from pypokerengine.api.game import setup_config, start_poker
import requests
import json
import time
import random
import argparse
from datetime import datetime
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional
import hashlib


# =============================================================================
# DATA CLASSES FOR TRACKING
# =============================================================================

@dataclass
class Decision:
    street: str
    advisor_action: str
    advisor_confidence: float
    action_taken: str
    pot_odds: float = 0
    equity: float = 0

@dataclass
class PlayerHandResult:
    seat: int
    strategy: str
    hole_cards: List[str]
    decisions: List[Decision] = field(default_factory=list)
    profit: int = 0
    went_to_showdown: bool = False
    won_at_showdown: bool = False

@dataclass
class HandResult:
    hand_id: int
    variant: str
    players: List[PlayerHandResult] = field(default_factory=list)
    pot_size: int = 0
    winner: str = ""
    winning_hand: str = ""

@dataclass
class StrategyStats:
    name: str
    hands_played: int = 0
    profit: int = 0
    vpip: int = 0  # Voluntarily Put In Pot
    pfr: int = 0   # Pre-Flop Raise
    wtsd: int = 0  # Went To ShowDown
    wsd: int = 0   # Won at ShowDown
    advisor_calls: int = 0
    advisor_errors: int = 0
    low_confidence: int = 0
    
    @property
    def bb100(self):
        if self.hands_played == 0:
            return 0
        return (self.profit / 20) / (self.hands_played / 100)


# =============================================================================
# STRATEGY BASE CLASS
# =============================================================================

class StrategyBot(BasePokerPlayer):
    """Base class for all strategy bots."""
    
    STRATEGIES = ["TAG", "LAG", "NIT", "FISH", "MANIAC", "GTO", "RANDOM"]
    
    def __init__(self, strategy: str, variant: str = "omaha4", 
                 advisor_url: str = "http://localhost:3001/api/advise"):
        super().__init__()
        self.strategy = strategy
        self.variant = variant
        self.advisor_url = advisor_url
        self.stats = StrategyStats(name=strategy)
        self.current_hand = None
        self.hand_history = []
        
        # Generate extra hole cards for Omaha (PyPokerEngine only deals 2)
        self.extra_cards = []
        self.all_cards = self._generate_deck()
    
    def _generate_deck(self):
        """Generate a standard deck."""
        suits = ['s', 'h', 'd', 'c']
        ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        return [f"{r}{s}" for r in ranks for s in suits]
    
    def _get_omaha_cards(self, hole_card, round_state):
        """Get the required number of hole cards for the Omaha variant."""
        # Convert PyPokerEngine cards to our format
        def convert(card):
            suit_map = {"C": "c", "D": "d", "H": "h", "S": "s"}
            suit = suit_map.get(card[0], card[0].lower())
            rank = card[1:] if card[1:] != "T" else "10"
            return f"{rank}{suit}"
        
        cards = [convert(c) for c in hole_card]
        board = [convert(c) for c in round_state.get("community_card", [])]
        
        # Determine how many cards we need
        variant_cards = {"omaha4": 4, "omaha5": 5, "omaha6": 6}
        needed = variant_cards.get(self.variant, 4)
        
        # Generate additional cards if needed (deterministic per hand)
        if len(cards) < needed:
            # Use hand ID as seed for reproducibility
            hand_seed = hash(tuple(cards + board)) % 10000
            rng = random.Random(hand_seed)
            
            # Get cards not in use
            used = set(cards + board)
            available = [c for c in self.all_cards if c not in used]
            
            # Add extra cards
            while len(cards) < needed and available:
                extra = rng.choice(available)
                cards.append(extra)
                available.remove(extra)
        
        return cards, board
    
    def declare_action(self, valid_actions, hole_card, round_state):
        """Main decision point."""
        street = round_state["street"]
        board = round_state.get("community_card", [])
        
        # Preflop - use strategy-specific preflop logic
        if len(board) < 3:
            return self._preflop_action(valid_actions, hole_card)
        
        try:
            # Get advice from Play Advisor
            hole_cards, board_cards = self._get_omaha_cards(hole_card, round_state)
            game_state = self._build_request(hole_cards, board_cards, round_state, valid_actions)
            
            response = requests.post(self.advisor_url, json=game_state, timeout=5)
            response.raise_for_status()
            advice = response.json()
            
            self.stats.advisor_calls += 1
            
            # Extract recommendation
            rec = advice.get("recommendation", {})
            action = rec.get("action", "fold").lower()
            conf_str = rec.get("confidence", "0%")
            confidence = float(conf_str.replace("%", "")) / 100 if conf_str else 0
            sizing = rec.get("sizing", {})
            
            if confidence < 0.5:
                self.stats.low_confidence += 1
            
            # Apply strategy-specific modifications
            final_action, amount = self._apply_strategy(
                action, confidence, sizing, valid_actions, street
            )
            
            # Track decision
            if self.current_hand:
                self.current_hand.decisions.append(Decision(
                    street=street,
                    advisor_action=action,
                    advisor_confidence=confidence,
                    action_taken=final_action
                ))
            
            return final_action, amount
            
        except Exception as e:
            self.stats.advisor_errors += 1
            return self._fallback_action(valid_actions)
    
    def _preflop_action(self, valid_actions, hole_card):
        """Strategy-specific preflop action. Override in subclasses."""
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        if call_action and call_action["amount"] == 0:
            return "call", 0
        if call_action and call_action["amount"] <= 20:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        """Apply strategy-specific modifications. Override in subclasses."""
        return self._execute_action(advisor_action, sizing, valid_actions)
    
    def _execute_action(self, action, sizing, valid_actions):
        """Convert action to PyPokerEngine format."""
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
                    # Invalid raise
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
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0
    
    def _fallback_action(self, valid_actions):
        """Fallback when advisor fails."""
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        if call_action and call_action["amount"] == 0:
            return "call", 0
        return "fold", 0
    
    def _build_request(self, hole_cards, board_cards, round_state, valid_actions):
        """Build Play Advisor API request."""
        my_stack = 1000
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
        
        # Map position based on seat
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
    
    def receive_game_start_message(self, game_info):
        pass
    
    def receive_round_start_message(self, round_count, hole_card, seats):
        self.stats.hands_played += 1
        # Find our seat
        my_seat = 0
        for i, seat in enumerate(seats):
            if seat["uuid"] == self.uuid:
                my_seat = i
                break
        self.current_hand = PlayerHandResult(
            seat=my_seat,
            strategy=self.strategy,
            hole_cards=[str(c) for c in hole_card]
        )
    
    def receive_street_start_message(self, street, round_state):
        pass
    
    def receive_game_update_message(self, action, round_state):
        pass
    
    def receive_round_result_message(self, winners, hand_info, round_state):
        won = any(w["uuid"] == self.uuid for w in winners)
        if self.current_hand:
            # Calculate profit
            my_stack = 0
            for seat in round_state["seats"]:
                if seat["uuid"] == self.uuid:
                    my_stack = seat["stack"]
                    break
            # This is approximate - would need to track starting stack per hand
            self.current_hand.won_at_showdown = won
            if won:
                self.stats.wsd += 1
            self.hand_history.append(self.current_hand)


# =============================================================================
# STRATEGY IMPLEMENTATIONS
# =============================================================================

class TAGBot(StrategyBot):
    """Tight-Aggressive: Plays few hands but aggressively."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="TAG", **kwargs)
    
    def _preflop_action(self, valid_actions, hole_card):
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        # TAG: Only call/raise with premium hands (simplified)
        if call_action and call_action["amount"] == 0:
            return "call", 0
        if call_action and call_action["amount"] <= 30:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # TAG: Follow advisor but slightly more aggressive
        if advisor_action == "call" and confidence > 0.7:
            raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
            if raise_action and random.random() < 0.3:
                return self._execute_action("raise", sizing, valid_actions)
        return self._execute_action(advisor_action, sizing, valid_actions)


class LAGBot(StrategyBot):
    """Loose-Aggressive: Plays many hands aggressively."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="LAG", **kwargs)
    
    def _preflop_action(self, valid_actions, hole_card):
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
        # LAG: Raise more often preflop
        if raise_action and random.random() < 0.4:
            min_r = raise_action["amount"]["min"]
            max_r = raise_action["amount"]["max"]
            if min_r > 0 and max_r >= min_r:
                return "raise", min_r
        if call_action:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # LAG: More aggressive - convert many calls to raises
        if advisor_action in ["call", "check"] and random.random() < 0.4:
            return self._execute_action("raise", sizing, valid_actions)
        return self._execute_action(advisor_action, sizing, valid_actions)


class NITBot(StrategyBot):
    """Ultra-tight: Only plays premium hands."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="NIT", **kwargs)
    
    def _preflop_action(self, valid_actions, hole_card):
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        # NIT: Only play free or very cheap
        if call_action and call_action["amount"] == 0:
            return "call", 0
        if call_action and call_action["amount"] <= 10:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # NIT: Only follow when very confident
        if confidence < 0.7:
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0
        return self._execute_action(advisor_action, sizing, valid_actions)


class FISHBot(StrategyBot):
    """Loose-Passive: Calls too much, rarely raises."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="FISH", **kwargs)
    
    def _preflop_action(self, valid_actions, hole_card):
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        # FISH: Call almost everything
        if call_action:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # FISH: Always call instead of raise
        if advisor_action in ["raise", "bet"]:
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
        return self._execute_action(advisor_action, sizing, valid_actions)


class MANIACBot(StrategyBot):
    """Hyper-aggressive: Raises constantly."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="MANIAC", **kwargs)
    
    def _preflop_action(self, valid_actions, hole_card):
        raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
        if raise_action:
            min_r = raise_action["amount"]["min"]
            max_r = raise_action["amount"]["max"]
            if min_r > 0 and max_r >= min_r:
                # Raise big
                amount = min(min_r * 3, max_r)
                return "raise", amount
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        if call_action:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # MANIAC: Try to raise everything
        if random.random() < 0.7:
            return self._execute_action("raise", sizing, valid_actions)
        return self._execute_action(advisor_action, sizing, valid_actions)


class GTOBot(StrategyBot):
    """Game Theory Optimal: Balanced play."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="GTO", **kwargs)
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # GTO: Follow advisor closely (it's our best approximation)
        return self._execute_action(advisor_action, sizing, valid_actions)


class RandomBot(StrategyBot):
    """Random: Makes random valid decisions."""
    
    def __init__(self, **kwargs):
        super().__init__(strategy="RANDOM", **kwargs)
    
    def _preflop_action(self, valid_actions, hole_card):
        action_info = random.choice(valid_actions)
        action = action_info["action"]
        if action == "raise":
            min_r = action_info["amount"]["min"]
            max_r = action_info["amount"]["max"]
            if min_r > 0 and max_r >= min_r:
                return action, random.randint(min_r, min(max_r, min_r * 3))
            return "fold", 0
        return action, action_info.get("amount", 0)
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions, street):
        # Random: Ignore advisor, pick randomly
        action_info = random.choice(valid_actions)
        action = action_info["action"]
        if action == "raise":
            min_r = action_info["amount"]["min"]
            max_r = action_info["amount"]["max"]
            if min_r > 0 and max_r >= min_r:
                return action, random.randint(min_r, min(max_r, min_r * 3))
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        return action, action_info.get("amount", 0)


# =============================================================================
# BOT FACTORY
# =============================================================================

def create_bot(strategy: str, variant: str = "omaha4") -> StrategyBot:
    """Create a bot with the specified strategy."""
    strategy_map = {
        "TAG": TAGBot,
        "LAG": LAGBot,
        "NIT": NITBot,
        "FISH": FISHBot,
        "MANIAC": MANIACBot,
        "GTO": GTOBot,
        "RANDOM": RandomBot
    }
    
    bot_class = strategy_map.get(strategy.upper(), GTOBot)
    return bot_class(variant=variant)


# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

def run_multiplayer_test(
    num_players: int = 6,
    num_hands: int = 1000,
    variant: str = "omaha4",
    strategies: List[str] = None,
    initial_stack: int = 10000,
    small_blind: int = 10
):
    """Run a multi-player test session."""
    
    if strategies is None:
        # Default: mix of strategies
        default_strategies = ["TAG", "LAG", "GTO", "FISH", "NIT", "MANIAC", "RANDOM"]
        strategies = default_strategies[:num_players]
    
    while len(strategies) < num_players:
        strategies.append(random.choice(["TAG", "LAG", "GTO"]))
    
    print("\n" + "=" * 70)
    print("MULTI-PLAYER PLAY ADVISOR TEST")
    print("=" * 70)
    print(f"Players: {num_players}")
    print(f"Hands: {num_hands}")
    print(f"Variant: {variant}")
    print(f"Strategies: {', '.join(strategies[:num_players])}")
    print(f"Initial Stack: {initial_stack}")
    print(f"Blinds: {small_blind}/{small_blind*2}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check advisor
    try:
        requests.get("http://localhost:3001/api/health", timeout=2)
        print("✓ Play Advisor server is running")
    except:
        print("✗ Play Advisor not responding!")
        print("  Start with: node LocalAdvisorServer.js")
        return None
    
    # Create bots
    bots = []
    for i in range(num_players):
        strategy = strategies[i]
        bot = create_bot(strategy, variant)
        bots.append(bot)
    
    # Configure game
    config = setup_config(
        max_round=num_hands,
        initial_stack=initial_stack,
        small_blind_amount=small_blind
    )
    
    for i, bot in enumerate(bots):
        config.register_player(name=f"{bot.strategy}_{i+1}", algorithm=bot)
    
    # Run game
    print(f"\nStarting {num_hands} hands...")
    start_time = time.time()
    
    result = start_poker(config, verbose=0)
    
    elapsed = time.time() - start_time
    
    # Collect results
    print("\n" + "=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"Time: {elapsed:.1f}s | Hands/sec: {num_hands/elapsed:.1f}")
    print()
    
    # Build results table
    results = []
    for i, player in enumerate(result["players"]):
        bot = bots[i]
        profit = player["stack"] - initial_stack
        bot.stats.profit = profit
        results.append({
            "name": player["name"],
            "strategy": bot.strategy,
            "stack": player["stack"],
            "profit": profit,
            "bb100": bot.stats.bb100,
            "advisor_calls": bot.stats.advisor_calls,
            "errors": bot.stats.advisor_errors,
            "low_conf": bot.stats.low_confidence
        })
    
    # Sort by profit
    results.sort(key=lambda x: x["profit"], reverse=True)
    
    # Print table
    print(f"{'Rank':<5} {'Player':<15} {'Strategy':<10} {'Profit':>10} {'BB/100':>10} {'Advisor':>8} {'Errors':>7}")
    print("-" * 75)
    
    for rank, r in enumerate(results, 1):
        print(f"{rank:<5} {r['name']:<15} {r['strategy']:<10} {r['profit']:>+10d} {r['bb100']:>+10.1f} {r['advisor_calls']:>8} {r['errors']:>7}")
    
    print()
    
    # Summary stats
    total_advisor = sum(r["advisor_calls"] for r in results)
    total_errors = sum(r["errors"] for r in results)
    
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Winner: {results[0]['name']} ({results[0]['strategy']}) with {results[0]['profit']:+d}")
    print(f"Total advisor calls: {total_advisor}")
    print(f"Total errors: {total_errors} ({total_errors/total_advisor*100:.1f}%)" if total_advisor > 0 else "No advisor calls")
    print()
    
    return {
        "variant": variant,
        "hands": num_hands,
        "players": num_players,
        "duration": elapsed,
        "results": results
    }


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-Player Play Advisor Test")
    parser.add_argument("--players", type=int, default=6, help="Number of players (2-7)")
    parser.add_argument("--hands", type=int, default=500, help="Number of hands to play")
    parser.add_argument("--variant", type=str, default="omaha4", 
                        choices=["omaha4", "omaha5", "omaha6"],
                        help="Omaha variant")
    parser.add_argument("--strategies", type=str, nargs="+",
                        help="Strategy for each seat (e.g., TAG LAG GTO)")
    parser.add_argument("--stack", type=int, default=10000, help="Initial stack")
    parser.add_argument("--blind", type=int, default=10, help="Small blind")
    
    args = parser.parse_args()
    
    run_multiplayer_test(
        num_players=min(7, max(2, args.players)),
        num_hands=args.hands,
        variant=args.variant,
        strategies=args.strategies,
        initial_stack=args.stack,
        small_blind=args.blind
    )
