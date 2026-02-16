"""
Strategic Test Runner for Play Advisor Validation

Implements the testing strategy from STRATEGIC_TESTING_APPROACH.md:
- Multiple bot types with different decision strategies
- Per-hand tracking and session summaries
- Statistical analysis of advisor accuracy

Run with: python3 StrategicTestRunner.py
"""

from pypokerengine.players import BasePokerPlayer
from pypokerengine.api.game import setup_config, start_poker
import requests
import json
import time
from datetime import datetime
from collections import defaultdict


class AdvisorBot(BasePokerPlayer):
    """
    Base class for bots that consult the Play Advisor.
    Subclasses implement different decision-making strategies.
    """
    
    def __init__(self, bot_type="strict", advisor_url="http://localhost:3001/api/advise"):
        super().__init__()
        self.bot_type = bot_type
        self.advisor_url = advisor_url
        self.hand_history = []
        self.current_hand = {}
        self.stats = {
            "hands_played": 0,
            "advisor_calls": 0,
            "api_errors": 0,
            "default_folds": 0,
            "low_confidence_count": 0,
            "actions": defaultdict(int)
        }
    
    def declare_action(self, valid_actions, hole_card, round_state):
        """Main decision point - get advice and decide action."""
        street = round_state["street"]
        
        # Track current hand state
        self.current_hand["street"] = street
        self.current_hand["hole_cards"] = hole_card
        self.current_hand["board"] = round_state.get("community_card", [])
        self.current_hand["pot"] = round_state["pot"]["main"]["amount"]
        
        # Preflop - use simple strategy (advisor needs board cards)
        if len(round_state.get("community_card", [])) < 3:
            return self._preflop_action(valid_actions)
        
        try:
            # Get advice from Play Advisor
            game_state = self._build_request(hole_card, round_state, valid_actions)
            response = requests.post(self.advisor_url, json=game_state, timeout=5)
            response.raise_for_status()
            advice = response.json()
            
            self.stats["advisor_calls"] += 1
            
            # Extract recommendation
            recommendation = advice.get("recommendation", {})
            action = recommendation.get("action", "fold").lower()
            confidence_str = recommendation.get("confidence", "0%")
            confidence = float(confidence_str.replace("%", "")) / 100 if confidence_str else 0
            sizing = recommendation.get("sizing", {})
            
            # Track low confidence
            if confidence < 0.5:
                self.stats["low_confidence_count"] += 1
            
            # Record recommendation
            self.current_hand["advisor_action"] = action
            self.current_hand["advisor_confidence"] = confidence
            self.current_hand["advisor_reasoning"] = recommendation.get("reasoning", {})
            
            # Apply bot-specific decision logic
            final_action, amount = self._apply_strategy(action, confidence, sizing, valid_actions)
            
            self.current_hand["action_taken"] = final_action
            self.current_hand["amount"] = amount
            self.stats["actions"][final_action] += 1
            
            return final_action, amount
            
        except Exception as e:
            self.stats["api_errors"] += 1
            self.stats["default_folds"] += 1
            self.current_hand["advisor_action"] = "error"
            self.current_hand["error"] = str(e)
            # Default: call if free, else fold
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions):
        """
        Apply bot-specific strategy. Override in subclasses.
        Default (strict): always follow advisor exactly.
        """
        return self._execute_action(advisor_action, sizing, valid_actions)
    
    def _execute_action(self, action, sizing, valid_actions):
        """Convert advisor action to PyPokerEngine action."""
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
                optimal = sizing.get("optimal", min_r) if sizing else min_r
                amount = max(min_r, min(optimal, max_r))
                return "raise", amount
            # Can't raise, try call
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        else:
            # Unknown - call if free
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0
    
    def _preflop_action(self, valid_actions):
        """Simple preflop strategy."""
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        if call_action and call_action["amount"] == 0:
            return "call", 0
        if call_action and call_action["amount"] <= 20:
            return "call", call_action["amount"]
        return "fold", 0
    
    def _build_request(self, hole_card, round_state, valid_actions):
        """Build Play Advisor API request."""
        # Find our stack
        my_stack = 1000
        my_seat = 0
        for i, seat in enumerate(round_state["seats"]):
            if seat["uuid"] == self.uuid:
                my_stack = seat["stack"]
                my_seat = i
                break
        
        # Convert cards
        def convert_card(card):
            suit_map = {"C": "c", "D": "d", "H": "h", "S": "s"}
            suit = suit_map.get(card[0], card[0].lower())
            rank = card[1:] if card[1:] != "T" else "10"
            return f"{rank}{suit}"
        
        hole_cards = [convert_card(c) for c in hole_card]
        board = [convert_card(c) for c in round_state.get("community_card", [])]
        
        # Pad to 4 cards for Omaha format
        while len(hole_cards) < 4:
            hole_cards.append("2c")
        
        # Get call amount
        call_amount = 0
        for va in valid_actions:
            if va["action"] == "call":
                call_amount = va["amount"]
                break
        
        active = len([s for s in round_state["seats"] if s["state"] == "participating"])
        
        return {
            "gameVariant": "omaha4",
            "street": round_state["street"],
            "holeCards": hole_cards,
            "board": board,
            "position": "button" if my_seat == 0 else "blind",
            "playersInHand": active,
            "potSize": round_state["pot"]["main"]["amount"],
            "toCall": call_amount,
            "stackSize": my_stack,
            "villainActions": []
        }
    
    def receive_game_start_message(self, game_info):
        pass
    
    def receive_round_start_message(self, round_count, hole_card, seats):
        self.stats["hands_played"] += 1
        self.current_hand = {"hand_id": round_count, "bot_type": self.bot_type}
    
    def receive_street_start_message(self, street, round_state):
        pass
    
    def receive_game_update_message(self, action, round_state):
        pass
    
    def receive_round_result_message(self, winners, hand_info, round_state):
        # Record if we won
        won = any(w["uuid"] == self.uuid for w in winners)
        self.current_hand["hand_won"] = won
        self.current_hand["winners"] = [w["name"] for w in winners]
        self.hand_history.append(self.current_hand.copy())


class ConfidenceGatedBot(AdvisorBot):
    """Only follows advisor when confidence > 60%."""
    
    def __init__(self, **kwargs):
        super().__init__(bot_type="confidence_gated", **kwargs)
        self.confidence_threshold = 0.6
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions):
        if confidence >= self.confidence_threshold:
            return self._execute_action(advisor_action, sizing, valid_actions)
        else:
            # Low confidence - check/fold
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0


class AggressiveBot(AdvisorBot):
    """Follows advisor but raises more often."""
    
    def __init__(self, **kwargs):
        super().__init__(bot_type="aggressive", **kwargs)
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions):
        # Convert calls to raises when possible
        if advisor_action == "call" and confidence > 0.5:
            raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
            if raise_action:
                return self._execute_action("raise", sizing, valid_actions)
        return self._execute_action(advisor_action, sizing, valid_actions)


class PassiveBot(AdvisorBot):
    """Follows advisor but calls instead of raises."""
    
    def __init__(self, **kwargs):
        super().__init__(bot_type="passive", **kwargs)
    
    def _apply_strategy(self, advisor_action, confidence, sizing, valid_actions):
        # Convert raises to calls
        if advisor_action in ["raise", "bet"]:
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
        return self._execute_action(advisor_action, sizing, valid_actions)


class RandomBot(BasePokerPlayer):
    """Chaos bot - makes random valid decisions."""
    
    def __init__(self):
        super().__init__()
        import random
        self.random = random
        self.stats = {"hands_played": 0}
    
    def declare_action(self, valid_actions, hole_card, round_state):
        # Random valid action
        action_info = self.random.choice(valid_actions)
        action = action_info["action"]
        if action == "raise":
            min_amt = action_info["amount"]["min"]
            max_amt = action_info["amount"]["max"]
            if min_amt <= 0 or max_amt < min_amt:
                # Invalid raise, fall back to call
                call_action = next((a for a in valid_actions if a["action"] == "call"), None)
                if call_action:
                    return "call", call_action.get("amount", 0)
                return "fold", 0
            amount = self.random.randint(min_amt, min(max_amt, min_amt * 3))
            return action, amount
        return action, action_info.get("amount", 0)
    
    def receive_game_start_message(self, game_info): pass
    def receive_round_start_message(self, round_count, hole_card, seats):
        self.stats["hands_played"] += 1
    def receive_street_start_message(self, street, round_state): pass
    def receive_game_update_message(self, action, round_state): pass
    def receive_round_result_message(self, winners, hand_info, round_state): pass


def run_strategic_test(num_hands=200, initial_stack=10000):
    """Run the full strategic test suite."""
    
    print("\n" + "="*70)
    print("STRATEGIC PLAY ADVISOR VALIDATION TEST")
    print("="*70)
    print(f"Hands per matchup: {num_hands}")
    print(f"Initial stack: {initial_stack}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check if advisor is running
    try:
        requests.get("http://localhost:3001/api/health", timeout=2)
        print("✓ Play Advisor server is running")
    except:
        print("✗ Play Advisor server not responding!")
        print("  Start with: node LocalAdvisorServer.js")
        return None
    
    results = {}
    
    # Test 1: Strict Advisor vs Random (baseline)
    print("\n" + "-"*50)
    print("TEST 1: Strict Advisor vs Random Bot")
    print("-"*50)
    
    strict_bot = AdvisorBot(bot_type="strict")
    random_bot = RandomBot()
    
    config = setup_config(max_round=num_hands, initial_stack=initial_stack, small_blind_amount=10)
    config.register_player(name="StrictAdvisor", algorithm=strict_bot)
    config.register_player(name="RandomBot", algorithm=random_bot)
    
    start = time.time()
    result = start_poker(config, verbose=0)
    elapsed = time.time() - start
    
    strict_stack = next(p["stack"] for p in result["players"] if p["name"] == "StrictAdvisor")
    strict_profit = strict_stack - initial_stack
    
    print(f"Time: {elapsed:.1f}s | Hands: {strict_bot.stats['hands_played']}")
    print(f"StrictAdvisor profit: {strict_profit:+d}")
    print(f"API calls: {strict_bot.stats['advisor_calls']} | Errors: {strict_bot.stats['api_errors']}")
    print(f"Low confidence decisions: {strict_bot.stats['low_confidence_count']}")
    
    results["strict_vs_random"] = {
        "profit": strict_profit,
        "hands": strict_bot.stats["hands_played"],
        "errors": strict_bot.stats["api_errors"],
        "actions": dict(strict_bot.stats["actions"])
    }
    
    # Test 2: Confidence-Gated vs Random
    print("\n" + "-"*50)
    print("TEST 2: Confidence-Gated Bot vs Random Bot")
    print("-"*50)
    
    conf_bot = ConfidenceGatedBot()
    random_bot2 = RandomBot()
    
    config = setup_config(max_round=num_hands, initial_stack=initial_stack, small_blind_amount=10)
    config.register_player(name="ConfidenceGated", algorithm=conf_bot)
    config.register_player(name="RandomBot", algorithm=random_bot2)
    
    start = time.time()
    result = start_poker(config, verbose=0)
    elapsed = time.time() - start
    
    conf_stack = next(p["stack"] for p in result["players"] if p["name"] == "ConfidenceGated")
    conf_profit = conf_stack - initial_stack
    
    print(f"Time: {elapsed:.1f}s | Hands: {conf_bot.stats['hands_played']}")
    print(f"ConfidenceGated profit: {conf_profit:+d}")
    print(f"API calls: {conf_bot.stats['advisor_calls']} | Errors: {conf_bot.stats['api_errors']}")
    
    results["confidence_vs_random"] = {
        "profit": conf_profit,
        "hands": conf_bot.stats["hands_played"],
        "errors": conf_bot.stats["api_errors"]
    }
    
    # Test 3: Aggressive vs Random
    print("\n" + "-"*50)
    print("TEST 3: Aggressive Bot vs Random Bot")
    print("-"*50)
    
    agg_bot = AggressiveBot()
    random_bot3 = RandomBot()
    
    config = setup_config(max_round=num_hands, initial_stack=initial_stack, small_blind_amount=10)
    config.register_player(name="Aggressive", algorithm=agg_bot)
    config.register_player(name="RandomBot", algorithm=random_bot3)
    
    start = time.time()
    result = start_poker(config, verbose=0)
    elapsed = time.time() - start
    
    agg_stack = next(p["stack"] for p in result["players"] if p["name"] == "Aggressive")
    agg_profit = agg_stack - initial_stack
    
    print(f"Time: {elapsed:.1f}s | Hands: {agg_bot.stats['hands_played']}")
    print(f"Aggressive profit: {agg_profit:+d}")
    print(f"API calls: {agg_bot.stats['advisor_calls']} | Errors: {agg_bot.stats['api_errors']}")
    
    results["aggressive_vs_random"] = {
        "profit": agg_profit,
        "hands": agg_bot.stats["hands_played"],
        "errors": agg_bot.stats["api_errors"]
    }
    
    # Test 4: Passive vs Random
    print("\n" + "-"*50)
    print("TEST 4: Passive Bot vs Random Bot")
    print("-"*50)
    
    pass_bot = PassiveBot()
    random_bot4 = RandomBot()
    
    config = setup_config(max_round=num_hands, initial_stack=initial_stack, small_blind_amount=10)
    config.register_player(name="Passive", algorithm=pass_bot)
    config.register_player(name="RandomBot", algorithm=random_bot4)
    
    start = time.time()
    result = start_poker(config, verbose=0)
    elapsed = time.time() - start
    
    pass_stack = next(p["stack"] for p in result["players"] if p["name"] == "Passive")
    pass_profit = pass_stack - initial_stack
    
    print(f"Time: {elapsed:.1f}s | Hands: {pass_bot.stats['hands_played']}")
    print(f"Passive profit: {pass_profit:+d}")
    print(f"API calls: {pass_bot.stats['advisor_calls']} | Errors: {pass_bot.stats['api_errors']}")
    
    results["passive_vs_random"] = {
        "profit": pass_profit,
        "hands": pass_bot.stats["hands_played"],
        "errors": pass_bot.stats["api_errors"]
    }
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY: Play Advisor Validation Results")
    print("="*70)
    print()
    print(f"{'Bot Type':<20} {'Profit':>10} {'Hands':>8} {'Errors':>8} {'BB/100':>10}")
    print("-"*60)
    
    for name, data in results.items():
        bb100 = (data["profit"] / 20) / (data["hands"] / 100) if data["hands"] > 0 else 0
        bot_name = name.replace("_vs_random", "").replace("_", " ").title()
        print(f"{bot_name:<20} {data['profit']:>+10d} {data['hands']:>8d} {data['errors']:>8d} {bb100:>+10.1f}")
    
    print()
    print("="*70)
    
    # Determine winner
    best = max(results.items(), key=lambda x: x[1]["profit"])
    print(f"Best performing: {best[0].replace('_vs_random', '')} with {best[1]['profit']:+d} profit")
    
    total_errors = sum(r["errors"] for r in results.values())
    if total_errors == 0:
        print("✓ Zero API errors across all tests")
    else:
        print(f"⚠ {total_errors} total API errors")
    
    print()
    
    return results


if __name__ == "__main__":
    import sys
    num_hands = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    run_strategic_test(num_hands=num_hands)
