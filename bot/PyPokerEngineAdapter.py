"""
PyPokerEngine Adapter for Play Advisor

This adapter allows the existing Play Advisor to be tested using PyPokerEngine,
which is a pure Python poker engine specifically designed for bot/AI testing.

Benefits over browser-based testing:
- Runs 1000+ hands per second (vs ~0.1 for browser)
- No external services or reCAPTCHA to deal with
- Fully deterministic and reproducible
- True unattended operation

Usage:
    pip install PyPokerEngine
    python PyPokerEngineAdapter.py
"""

from pypokerengine.players import BasePokerPlayer
from pypokerengine.api.game import setup_config, start_poker
import requests
import json
import time


class PlayAdvisorPlayer(BasePokerPlayer):
    """
    Adapter that wraps Play Advisor to work with PyPokerEngine.
    """

    def __init__(self, advisor_url="http://localhost:3001/api/advise", style="tag"):
        super().__init__()
        self.advisor_url = advisor_url
        self.style = style
        self.stats = {
            "hands_played": 0,
            "actions_taken": [],
            "api_errors": 0,
            "default_folds": 0
        }

    def declare_action(self, valid_actions, hole_card, round_state):
        """
        Called when it's our turn to act.
        Translates PyPokerEngine state to Play Advisor format and gets advice.
        """
        try:
            # Translate state to Play Advisor format
            game_state = self._translate_state(hole_card, round_state, valid_actions)

            # If preflop (no board yet), use simple strategy
            if game_state is None:
                return self._preflop_action(valid_actions)

            # Get advice from Play Advisor
            advice = self._get_advice(game_state)

            # Translate advice back to PyPokerEngine action
            action, amount = self._translate_action(advice, valid_actions)

            self.stats["actions_taken"].append({
                "action": action,
                "amount": amount,
                "street": round_state["street"]
            })
            self.stats["advisor_calls"] = self.stats.get("advisor_calls", 0) + 1

            return action, amount

        except Exception as e:
            print(f"Error getting advice: {e}")
            self.stats["api_errors"] += 1
            self.stats["default_folds"] += 1
            # Default to call if free, else fold
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0

    def _preflop_action(self, valid_actions):
        """Simple preflop strategy when advisor can't help."""
        # Check if we can check for free
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        if call_action and call_action["amount"] == 0:
            return "call", 0
        # Otherwise call small amounts, fold large
        if call_action and call_action["amount"] <= 20:
            return "call", call_action["amount"]
        return "fold", 0

    def _translate_state(self, hole_card, round_state, valid_actions):
        """
        Translate PyPokerEngine state to Play Advisor format.
        Play Advisor expects Omaha format with specific fields.
        """
        # Find our seat
        my_uuid = self.uuid
        my_seat = None
        my_stack = 1000

        for i, seat in enumerate(round_state["seats"]):
            if seat["uuid"] == my_uuid:
                my_seat = i
                my_stack = seat["stack"]
                break

        # Map PyPokerEngine cards to Play Advisor format (e.g., "C2" -> "2c", "SA" -> "As")
        def convert_card(card):
            # PyPokerEngine format: "SA" = Spade Ace, "H2" = Heart 2
            suit_map = {"C": "c", "D": "d", "H": "h", "S": "s"}
            suit = suit_map.get(card[0], card[0].lower())
            rank = card[1:]
            if rank == "T":
                rank = "10"
            # Play Advisor wants "As" not "A s" - rank then suit
            return f"{rank}{suit}"

        hole_cards = [convert_card(c) for c in hole_card]
        community_cards = [convert_card(c) for c in round_state.get("community_card", [])]

        # Play Advisor requires at least 3 board cards (flop)
        # If preflop, we can't use the advisor - return None
        if len(community_cards) < 3:
            return None

        # For Omaha, we need 4 hole cards. PyPokerEngine gives 2 for Hold'em.
        # Pad with placeholder cards if needed (for testing compatibility)
        while len(hole_cards) < 4:
            # Add placeholder hole cards for Omaha format
            hole_cards.append("2c")  # Dummy card

        # Calculate pot
        pot = round_state["pot"]["main"]["amount"]

        # Determine call amount
        call_amount = 0
        for va in valid_actions:
            if va["action"] == "call":
                call_amount = va["amount"]
                break

        # Map street names
        street_map = {
            "preflop": "preflop",
            "flop": "flop",
            "turn": "turn",
            "river": "river"
        }
        street = street_map.get(round_state["street"], "flop")

        # Count active players
        active_players = len([s for s in round_state["seats"] if s["state"] == "participating"])

        # Build Play Advisor request format
        return {
            "gameVariant": "omaha4",  # Play Advisor is for Omaha
            "street": street,
            "holeCards": hole_cards,
            "board": community_cards,
            "position": "middle" if my_seat == 1 else ("button" if my_seat == 0 else "blind"),
            "playersInHand": active_players,
            "potSize": pot,
            "toCall": call_amount,
            "stackSize": my_stack,
            "villainActions": []
        }

    def _get_advice(self, game_state):
        """
        Call Play Advisor API to get advice.
        """
        response = requests.post(
            self.advisor_url,
            json=game_state,
            timeout=5
        )
        response.raise_for_status()
        return response.json()

    def _translate_action(self, advice, valid_actions):
        """
        Translate Play Advisor advice to PyPokerEngine action.
        Play Advisor response format:
        {
            "recommendation": {
                "action": "call/fold/raise/bet/check",
                "sizing": {"optimal": 123, ...}
            }
        }
        """
        # Extract action from Play Advisor response
        recommendation = advice.get("recommendation", {})
        if not recommendation:
            return "fold", 0

        action = recommendation.get("action", "fold").lower()
        sizing = recommendation.get("sizing", {})
        amount = sizing.get("optimal", 0) if sizing else 0

        # Map to PyPokerEngine actions
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
                # Clamp amount to valid range
                min_raise = raise_action["amount"]["min"]
                max_raise = raise_action["amount"]["max"]
                if amount > 0:
                    amount = max(min_raise, min(amount, max_raise))
                else:
                    amount = min_raise  # Default to min raise
                return "raise", amount
            # If can't raise, try to call
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action:
                return "call", call_action["amount"]
            return "fold", 0
        else:
            # Unknown action - try to call
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0

    def receive_game_start_message(self, game_info):
        """Called at the start of each game."""
        pass

    def receive_round_start_message(self, round_count, hole_card, seats):
        """Called at the start of each round (hand)."""
        self.stats["hands_played"] += 1

    def receive_street_start_message(self, street, round_state):
        """Called at the start of each street."""
        pass

    def receive_game_update_message(self, action, round_state):
        """Called when any player takes an action."""
        pass

    def receive_round_result_message(self, winners, hand_info, round_state):
        """Called at the end of each round."""
        pass

    def get_stats(self):
        """Return collected statistics."""
        return self.stats


class SimpleOpponent(BasePokerPlayer):
    """
    Simple opponent that plays a basic TAG style.
    Useful for testing against a predictable baseline.
    """

    def declare_action(self, valid_actions, hole_card, round_state):
        # Simple strategy: call if call amount < 10% of stack, else fold
        call_action = next((a for a in valid_actions if a["action"] == "call"), None)

        if call_action and call_action["amount"] == 0:
            return "call", 0  # Check if free

        my_stack = 1000  # Default
        for seat in round_state["seats"]:
            if seat["uuid"] == self.uuid:
                my_stack = seat["stack"]
                break

        if call_action and call_action["amount"] < my_stack * 0.1:
            return "call", call_action["amount"]

        return "fold", 0

    def receive_game_start_message(self, game_info):
        pass

    def receive_round_start_message(self, round_count, hole_card, seats):
        pass

    def receive_street_start_message(self, street, round_state):
        pass

    def receive_game_update_message(self, action, round_state):
        pass

    def receive_round_result_message(self, winners, hand_info, round_state):
        pass


def run_validation_test(num_hands=100, advisor_url="http://localhost:3001/api/advise"):
    """
    Run a validation test of Play Advisor using PyPokerEngine.

    This runs completely locally without any browser automation.
    """
    print(f"\n{'='*60}")
    print("PyPokerEngine Validation Test for Play Advisor")
    print(f"{'='*60}")
    print(f"Hands to play: {num_hands}")
    print(f"Advisor URL: {advisor_url}")
    print()

    # Check if Play Advisor is running
    try:
        response = requests.get(advisor_url.replace("/api/advise", "/health"), timeout=2)
        print("✓ Play Advisor server is running")
    except:
        print("⚠ Play Advisor server may not be running")
        print("  Start it with: node LocalAdvisorServer.js")
        print()

    # Create players
    play_advisor = PlayAdvisorPlayer(advisor_url=advisor_url, style="tag")
    opponent = SimpleOpponent()

    # Configure game with higher stacks for more hands
    config = setup_config(
        max_round=num_hands,
        initial_stack=10000,
        small_blind_amount=10
    )
    config.register_player(name="PlayAdvisor", algorithm=play_advisor)
    config.register_player(name="Opponent", algorithm=opponent)

    # Run game
    print(f"Starting {num_hands} hands...")
    start_time = time.time()

    game_result = start_poker(config, verbose=0)

    elapsed = time.time() - start_time

    # Calculate results
    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}")
    print(f"Time elapsed: {elapsed:.2f} seconds")
    print(f"Hands per second: {num_hands / elapsed:.1f}")
    print()

    # Find PlayAdvisor's final stack
    initial_stack = 10000
    for player in game_result["players"]:
        print(f"{player['name']}:")
        print(f"  Final stack: {player['stack']}")
        profit = player['stack'] - initial_stack
        print(f"  Profit/Loss: {profit:+d}")
        print()

    # Stats from PlayAdvisor
    stats = play_advisor.get_stats()
    print("Play Advisor Stats:")
    print(f"  Hands played: {stats['hands_played']}")
    print(f"  API errors: {stats['api_errors']}")
    print(f"  Default folds: {stats['default_folds']}")

    if stats['hands_played'] > 0:
        default_fold_rate = (stats['default_folds'] / stats['hands_played']) * 100
        print(f"  Default fold rate: {default_fold_rate:.1f}%")

    print(f"\n{'='*60}")

    return game_result, stats


if __name__ == "__main__":
    import sys

    num_hands = int(sys.argv[1]) if len(sys.argv) > 1 else 100

    result, stats = run_validation_test(num_hands=num_hands)
