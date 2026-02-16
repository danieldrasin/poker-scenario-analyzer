"""
Style-Based Test Runner for Play Advisor Validation

Uses the ACTUAL framework styles as defined in the Scenario Builder UI:
- rock: Tight-Passive (threshold 75, VPIP ~15%)
- tag: Tight-Aggressive (threshold 55, VPIP ~25%)
- lag: Loose-Aggressive (threshold 40, VPIP ~38%)

Supports:
- Multi-player tables (2-7 players)
- Table composition analysis (how styles perform against different mixes)
- Detailed per-hand tracking for statistical analysis
- Strategy tuning through simulation results

Run with: python3 StyleBasedTestRunner.py [num_hands]
"""

from pypokerengine.players import BasePokerPlayer
from pypokerengine.api.game import setup_config, start_poker
import requests
import json
import time
import math
from datetime import datetime
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Tuple
import random


# =============================================================================
# FRAMEWORK STYLE DEFINITIONS (from app.js)
# =============================================================================

STYLE_DEFINITIONS = {
    "rock": {
        "name": "Rock (Tight-Passive)",
        "threshold": 75,      # Minimum hand score to play
        "vpip": 0.15,         # Voluntarily Put $ In Pot percentage
        "aggression": 0.3,    # Low aggression - calls more than raises
        "description": "Plays only premium hands, rarely raises"
    },
    "tag": {
        "name": "TAG (Tight-Aggressive)",
        "threshold": 55,
        "vpip": 0.25,
        "aggression": 0.7,    # High aggression - raises with strong hands
        "description": "Selective but aggressive when entering pots"
    },
    "lag": {
        "name": "LAG (Loose-Aggressive)",
        "threshold": 40,
        "vpip": 0.38,
        "aggression": 0.8,    # Very aggressive - lots of raising
        "description": "Wide range with frequent aggression"
    }
}

# Hand scores for preflop decisions (simplified from app.js handScores)
HAND_SCORE_APPROXIMATIONS = {
    "high_pair": 90,      # AA, KK
    "medium_pair": 60,    # QQ-JJ
    "low_pair": 35,       # TT and below
    "suited_connectors": 55,
    "suited_broadway": 70,
    "random": 25
}

# Position modifiers (from app.js)
POSITION_MODIFIERS = {
    "UTG": -15, "EP": -15,
    "MP": -8,
    "CO": 0,
    "BTN": 12, "button": 12,
    "SB": -5, "blind": -5,
    "BB": -2
}


# =============================================================================
# DATA CLASSES FOR TRACKING
# =============================================================================

@dataclass
class HandRecord:
    """Records a single hand's data for analysis."""
    hand_id: int
    player_name: str
    style: str
    hole_cards: List[str]
    board: List[str]
    position: str
    street_reached: str
    action_taken: str
    advisor_recommendation: Optional[str]
    advisor_confidence: Optional[float]
    pot_size: int
    stack_before: int
    stack_after: int
    profit_loss: int
    won: bool
    opponents: List[str]
    opponent_styles: List[str]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class SessionStats:
    """Aggregated statistics for a test session."""
    style: str
    hands_played: int = 0
    hands_won: int = 0
    total_profit: int = 0
    advisor_calls: int = 0
    api_errors: int = 0
    actions: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    streets_reached: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    profits_by_street: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    @property
    def win_rate(self) -> float:
        return self.hands_won / self.hands_played if self.hands_played > 0 else 0

    @property
    def bb_per_100(self) -> float:
        """Big blinds won per 100 hands (standard poker metric)."""
        if self.hands_played == 0:
            return 0
        return (self.total_profit / 20) / (self.hands_played / 100)


# =============================================================================
# STYLE-BASED PLAYERS
# =============================================================================

class StyleBasedPlayer(BasePokerPlayer):
    """
    Player that implements actual framework styles (rock/tag/lag).
    Uses Play Advisor for post-flop decisions, style for preflop.
    """

    def __init__(self, style: str = "tag", advisor_url: str = "http://localhost:3001/api/advise"):
        super().__init__()
        if style not in STYLE_DEFINITIONS:
            raise ValueError(f"Invalid style: {style}. Must be one of: {list(STYLE_DEFINITIONS.keys())}")

        self.style = style
        self.style_def = STYLE_DEFINITIONS[style]
        self.advisor_url = advisor_url

        # Tracking
        self.hand_records: List[HandRecord] = []
        self.current_hand: Dict = {}
        self.stats = SessionStats(style=style)
        self.initial_stack = 10000

    def declare_action(self, valid_actions, hole_card, round_state):
        """Main decision point using style-based strategy."""
        street = round_state["street"]

        # Track current state
        my_stack = self._get_my_stack(round_state)
        self.current_hand["street"] = street
        self.current_hand["hole_cards"] = hole_card
        self.current_hand["board"] = round_state.get("community_card", [])
        self.current_hand["pot"] = round_state["pot"]["main"]["amount"]
        self.current_hand["stack_before"] = my_stack
        self.stats.streets_reached[street] += 1

        # Preflop: use style-based decision
        if len(round_state.get("community_card", [])) < 3:
            return self._preflop_action(valid_actions, hole_card, round_state)

        # Post-flop: consult advisor with style-based adjustments
        return self._postflop_action(valid_actions, hole_card, round_state)

    def _preflop_action(self, valid_actions, hole_card, round_state):
        """Style-based preflop decision."""
        # Estimate hand score
        hand_score = self._estimate_hand_score(hole_card)

        # Apply position modifier
        position = self._get_position(round_state)
        position_mod = POSITION_MODIFIERS.get(position, 0)
        adjusted_score = hand_score + position_mod

        # Get action based on style threshold
        threshold = self.style_def["threshold"]
        aggression = self.style_def["aggression"]

        call_action = next((a for a in valid_actions if a["action"] == "call"), None)
        raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
        call_amount = call_action["amount"] if call_action else 0

        # Decision logic based on style
        if adjusted_score >= threshold:
            # Hand is playable for this style
            if raise_action and random.random() < aggression:
                # Aggressive styles raise more often
                min_raise = raise_action["amount"]["min"]
                max_raise = raise_action["amount"]["max"]
                # Raise sizing: tighter styles = smaller raises
                raise_mult = 2.5 if self.style == "rock" else (3.0 if self.style == "tag" else 3.5)
                raise_amt = min(int(call_amount * raise_mult + 10), max_raise)
                raise_amt = max(raise_amt, min_raise)
                self._record_action("raise", raise_amt)
                return "raise", raise_amt
            elif call_action:
                self._record_action("call", call_amount)
                return "call", call_amount

        # Below threshold - only play if free or very cheap
        if call_action and call_amount == 0:
            self._record_action("call", 0)
            return "call", 0
        if call_action and call_amount <= 10 and adjusted_score >= threshold - 20:
            self._record_action("call", call_amount)
            return "call", call_amount

        self._record_action("fold", 0)
        return "fold", 0

    def _postflop_action(self, valid_actions, hole_card, round_state):
        """Post-flop decision using advisor with style adjustments."""
        try:
            game_state = self._build_request(hole_card, round_state, valid_actions)
            response = requests.post(self.advisor_url, json=game_state, timeout=5)
            response.raise_for_status()
            advice = response.json()

            self.stats.advisor_calls += 1

            # Extract recommendation
            rec = advice.get("recommendation", {})
            action = rec.get("action", "fold").lower()
            confidence_str = rec.get("confidence", "0%")
            confidence = float(confidence_str.replace("%", "")) / 100 if confidence_str else 0
            sizing = rec.get("sizing", {})

            self.current_hand["advisor_action"] = action
            self.current_hand["advisor_confidence"] = confidence

            # Apply style-based adjustments
            final_action, amount = self._apply_style_adjustment(
                action, confidence, sizing, valid_actions
            )

            self._record_action(final_action, amount)
            return final_action, amount

        except Exception as e:
            self.stats.api_errors += 1
            self.current_hand["error"] = str(e)
            # Default: call if free, else fold
            call_action = next((a for a in valid_actions if a["action"] == "call"), None)
            if call_action and call_action["amount"] == 0:
                return "call", 0
            return "fold", 0

    def _apply_style_adjustment(self, advisor_action, confidence, sizing, valid_actions):
        """Adjust advisor recommendation based on style."""
        aggression = self.style_def["aggression"]

        # Rock: convert some raises to calls (less aggressive)
        if self.style == "rock" and advisor_action in ["raise", "bet"]:
            if confidence < 0.7 or random.random() > aggression:
                call_action = next((a for a in valid_actions if a["action"] == "call"), None)
                if call_action:
                    return "call", call_action["amount"]

        # LAG: convert some calls to raises (more aggressive)
        if self.style == "lag" and advisor_action == "call":
            if confidence > 0.4 and random.random() < aggression:
                raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
                if raise_action:
                    min_r = raise_action["amount"]["min"]
                    max_r = raise_action["amount"]["max"]
                    amt = min(int(sizing.get("optimal", min_r)), max_r)
                    return "raise", max(amt, min_r)

        # TAG: follow advisor closely but ensure aggression with strong hands
        if self.style == "tag" and advisor_action in ["raise", "bet"] and confidence > 0.6:
            raise_action = next((a for a in valid_actions if a["action"] == "raise"), None)
            if raise_action:
                min_r = raise_action["amount"]["min"]
                max_r = raise_action["amount"]["max"]
                opt = sizing.get("optimal", min_r) if sizing else min_r
                return "raise", max(min_r, min(int(opt), max_r))

        # Default: execute advisor action
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
                opt = sizing.get("optimal", min_r) if sizing else min_r
                amount = max(min_r, min(int(opt), max_r))
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

    def _record_action(self, action, amount):
        """Record action for statistics."""
        self.stats.actions[action] += 1
        self.current_hand["action_taken"] = action
        self.current_hand["amount"] = amount

    def _estimate_hand_score(self, hole_card):
        """Estimate hand score for preflop decisions."""
        # Simplified scoring - real implementation would be more sophisticated
        ranks = [c[1:] for c in hole_card]
        suits = [c[0] for c in hole_card]

        # Check for pairs
        if len(set(ranks)) < len(ranks):
            high_ranks = ['A', 'K', 'Q', 'J']
            if any(r in ranks for r in high_ranks[:2]):
                return HAND_SCORE_APPROXIMATIONS["high_pair"]
            elif any(r in ranks for r in high_ranks[2:]):
                return HAND_SCORE_APPROXIMATIONS["medium_pair"]
            return HAND_SCORE_APPROXIMATIONS["low_pair"]

        # Check for suited
        is_suited = len(set(suits)) < len(suits)

        # Check for broadway
        broadway = ['A', 'K', 'Q', 'J', 'T']
        broadway_count = sum(1 for r in ranks if r in broadway)

        if is_suited and broadway_count >= 2:
            return HAND_SCORE_APPROXIMATIONS["suited_broadway"]
        elif is_suited:
            return HAND_SCORE_APPROXIMATIONS["suited_connectors"]
        elif broadway_count >= 2:
            return 50

        return HAND_SCORE_APPROXIMATIONS["random"]

    def _get_position(self, round_state):
        """Determine position based on seat."""
        num_players = len(round_state["seats"])
        for i, seat in enumerate(round_state["seats"]):
            if seat["uuid"] == self.uuid:
                # Simplify: 0 = button, higher = earlier
                if i == 0:
                    return "BTN"
                elif i == num_players - 1:
                    return "BB"
                elif i == num_players - 2:
                    return "SB"
                elif i <= num_players // 3:
                    return "EP"
                elif i <= 2 * num_players // 3:
                    return "MP"
                else:
                    return "CO"
        return "MP"

    def _get_my_stack(self, round_state):
        """Get current stack."""
        for seat in round_state["seats"]:
            if seat["uuid"] == self.uuid:
                return seat["stack"]
        return self.initial_stack

    def _build_request(self, hole_card, round_state, valid_actions):
        """Build Play Advisor API request."""
        my_stack = self._get_my_stack(round_state)

        def convert_card(card):
            suit_map = {"C": "c", "D": "d", "H": "h", "S": "s"}
            suit = suit_map.get(card[0], card[0].lower())
            rank = card[1:] if card[1:] != "T" else "10"
            return f"{rank}{suit}"

        hole_cards = [convert_card(c) for c in hole_card]
        board = [convert_card(c) for c in round_state.get("community_card", [])]

        while len(hole_cards) < 4:
            hole_cards.append("2c")

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
            "position": self._get_position(round_state),
            "playersInHand": active,
            "potSize": round_state["pot"]["main"]["amount"],
            "toCall": call_amount,
            "stackSize": my_stack,
            "villainActions": [],
            "style": self.style  # Pass style to advisor
        }

    # PyPokerEngine callbacks
    def receive_game_start_message(self, game_info):
        self.initial_stack = game_info["rule"]["initial_stack"]

    def receive_round_start_message(self, round_count, hole_card, seats):
        self.stats.hands_played += 1
        self.current_hand = {
            "hand_id": round_count,
            "style": self.style,
            "initial_stack": self.initial_stack
        }

    def receive_street_start_message(self, street, round_state):
        pass

    def receive_game_update_message(self, action, round_state):
        pass

    def receive_round_result_message(self, winners, hand_info, round_state):
        won = any(w["uuid"] == self.uuid for w in winners)
        final_stack = self._get_my_stack(round_state)
        stack_before = self.current_hand.get("stack_before", self.initial_stack)
        profit = final_stack - stack_before

        if won:
            self.stats.hands_won += 1
        self.stats.total_profit += profit

        street = self.current_hand.get("street", "preflop")
        self.stats.profits_by_street[street] += profit

        # Record full hand
        record = HandRecord(
            hand_id=self.current_hand.get("hand_id", 0),
            player_name=self.uuid,
            style=self.style,
            hole_cards=self.current_hand.get("hole_cards", []),
            board=self.current_hand.get("board", []),
            position=self._get_position(round_state),
            street_reached=street,
            action_taken=self.current_hand.get("action_taken", "unknown"),
            advisor_recommendation=self.current_hand.get("advisor_action"),
            advisor_confidence=self.current_hand.get("advisor_confidence"),
            pot_size=self.current_hand.get("pot", 0),
            stack_before=stack_before,
            stack_after=final_stack,
            profit_loss=profit,
            won=won,
            opponents=[s["name"] for s in round_state["seats"] if s["uuid"] != self.uuid],
            opponent_styles=[]  # Filled in later by test runner
        )
        self.hand_records.append(record)


# =============================================================================
# STATISTICAL ANALYSIS
# =============================================================================

def calculate_sample_size_needed(
    expected_effect_bb100: float = 5.0,
    std_dev_bb100: float = 100.0,
    confidence: float = 0.95,
    power: float = 0.80
) -> int:
    """
    Calculate sample size needed for statistical significance in poker.

    Poker has extremely high variance. A typical winning player might have:
    - Expected win rate: 5-10 BB/100 hands
    - Standard deviation: 80-120 BB/100 hands

    This means you need MANY hands to distinguish skill from luck.

    Args:
        expected_effect_bb100: Expected difference in BB/100 to detect
        std_dev_bb100: Standard deviation in BB/100 (poker is ~100)
        confidence: Statistical confidence level (0.95 = 95%)
        power: Statistical power (0.80 = 80% chance to detect true effect)

    Returns:
        Number of hands needed per player
    """
    # Z-scores for confidence and power
    z_alpha = 1.96 if confidence == 0.95 else (2.58 if confidence == 0.99 else 1.645)
    z_beta = 0.84 if power == 0.80 else (1.28 if power == 0.90 else 0.52)

    # Sample size formula for comparing means
    # n = 2 * ((z_alpha + z_beta) * std_dev / effect)^2
    n = 2 * ((z_alpha + z_beta) * std_dev_bb100 / expected_effect_bb100) ** 2

    return int(math.ceil(n))


def analyze_results(players: List[StyleBasedPlayer], num_players: int) -> Dict:
    """Analyze results with statistical measures."""
    results = {}

    for player in players:
        stats = player.stats
        records = player.hand_records

        # Basic stats
        bb100 = stats.bb_per_100

        # Calculate standard error
        if len(records) > 1:
            profits = [r.profit_loss for r in records]
            mean_profit = sum(profits) / len(profits)
            variance = sum((p - mean_profit) ** 2 for p in profits) / (len(profits) - 1)
            std_dev = math.sqrt(variance)
            std_error = std_dev / math.sqrt(len(profits))

            # 95% confidence interval
            ci_lower = mean_profit - 1.96 * std_error
            ci_upper = mean_profit + 1.96 * std_error

            # Convert to BB/100
            ci_lower_bb100 = (ci_lower / 20) * 100
            ci_upper_bb100 = (ci_upper / 20) * 100
        else:
            std_dev = 0
            ci_lower_bb100 = bb100
            ci_upper_bb100 = bb100

        results[player.style] = {
            "style_name": player.style_def["name"],
            "hands": stats.hands_played,
            "wins": stats.hands_won,
            "win_rate": f"{stats.win_rate*100:.1f}%",
            "total_profit": stats.total_profit,
            "bb_per_100": round(bb100, 2),
            "95_ci_bb100": [round(ci_lower_bb100, 2), round(ci_upper_bb100, 2)],
            "std_dev": round(std_dev, 2),
            "advisor_calls": stats.advisor_calls,
            "api_errors": stats.api_errors,
            "actions": dict(stats.actions),
            "streets_reached": dict(stats.streets_reached),
            "profits_by_street": dict(stats.profits_by_street)
        }

    return results


# =============================================================================
# TEST RUNNER
# =============================================================================

def run_style_test(
    num_hands: int = 500,
    styles: List[str] = None,
    initial_stack: int = 10000,
    verbose: bool = True
) -> Dict:
    """
    Run a test with multiple style-based players.

    Args:
        num_hands: Number of hands to play
        styles: List of styles to test (default: all 3)
        initial_stack: Starting stack for each player
        verbose: Print progress

    Returns:
        Dictionary with test results
    """
    if styles is None:
        styles = ["rock", "tag", "lag"]

    print("\n" + "=" * 70)
    print("STYLE-BASED PLAY ADVISOR VALIDATION TEST")
    print("=" * 70)
    print(f"Framework styles: {', '.join(styles)}")
    print(f"Hands to play: {num_hands}")
    print(f"Initial stack: {initial_stack}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Statistical context
    sample_needed = calculate_sample_size_needed()
    print(f"\nStatistical note: ~{sample_needed:,} hands needed per player for 95% confidence")
    print(f"Current test: {num_hands} hands ({num_hands/sample_needed*100:.1f}% of recommended)")
    print()

    # Check advisor
    try:
        requests.get("http://localhost:3001/api/health", timeout=2)
        print("✓ Play Advisor server is running")
    except:
        print("✗ Play Advisor server not responding!")
        print("  Start with: node LocalAdvisorServer.js")
        return None

    # Create players
    players = [StyleBasedPlayer(style=s) for s in styles]

    # Configure game
    config = setup_config(
        max_round=num_hands,
        initial_stack=initial_stack,
        small_blind_amount=10
    )

    for i, player in enumerate(players):
        style_name = STYLE_DEFINITIONS[player.style]["name"]
        config.register_player(name=f"{style_name}", algorithm=player)

    # Run game
    print(f"\nStarting {num_hands} hands with {len(styles)} players...")
    start_time = time.time()

    game_result = start_poker(config, verbose=0)

    elapsed = time.time() - start_time
    hands_per_sec = num_hands / elapsed

    print(f"Completed in {elapsed:.1f}s ({hands_per_sec:.1f} hands/sec)")

    # Analyze results
    results = analyze_results(players, len(styles))

    # Print summary
    print("\n" + "=" * 70)
    print("RESULTS BY STYLE")
    print("=" * 70)
    print(f"\n{'Style':<25} {'Hands':>8} {'Profit':>10} {'BB/100':>10} {'95% CI':>20} {'Win%':>8}")
    print("-" * 85)

    for style, data in results.items():
        ci = f"[{data['95_ci_bb100'][0]:+.1f}, {data['95_ci_bb100'][1]:+.1f}]"
        print(f"{data['style_name']:<25} {data['hands']:>8} {data['total_profit']:>+10} {data['bb_per_100']:>+10.1f} {ci:>20} {data['win_rate']:>8}")

    # Print action distribution
    print("\n" + "-" * 70)
    print("ACTION DISTRIBUTION")
    print("-" * 70)
    print(f"\n{'Style':<25} {'Fold':>8} {'Call':>8} {'Raise':>8} {'Aggression':>12}")
    print("-" * 65)

    for style, data in results.items():
        actions = data['actions']
        total = sum(actions.values()) or 1
        fold_pct = actions.get('fold', 0) / total * 100
        call_pct = actions.get('call', 0) / total * 100
        raise_pct = actions.get('raise', 0) / total * 100
        agg = raise_pct / (call_pct + raise_pct) * 100 if (call_pct + raise_pct) > 0 else 0

        print(f"{data['style_name']:<25} {fold_pct:>7.1f}% {call_pct:>7.1f}% {raise_pct:>7.1f}% {agg:>11.1f}%")

    print("\n" + "=" * 70)

    # Determine best performer
    best_style = max(results.items(), key=lambda x: x[1]["bb_per_100"])
    print(f"\nBest performer: {best_style[1]['style_name']} at {best_style[1]['bb_per_100']:+.1f} BB/100")

    total_errors = sum(r["api_errors"] for r in results.values())
    if total_errors == 0:
        print("✓ Zero API errors")
    else:
        print(f"⚠ {total_errors} API errors")

    # Return full results
    return {
        "timestamp": datetime.now().isoformat(),
        "config": {
            "num_hands": num_hands,
            "styles": styles,
            "initial_stack": initial_stack,
            "elapsed_seconds": elapsed
        },
        "results": results,
        "sample_size_recommendation": sample_needed,
        "statistical_power": num_hands / sample_needed
    }


def run_table_composition_test(
    num_hands: int = 300,
    compositions: List[List[str]] = None
) -> Dict:
    """
    Test how styles perform against different table compositions.

    This helps understand:
    - How TAG performs against mostly ROCKs vs mostly LAGs
    - Optimal style selection based on table dynamics
    """
    if compositions is None:
        compositions = [
            ["tag", "rock", "rock"],           # TAG vs tight table
            ["tag", "lag", "lag"],             # TAG vs loose table
            ["rock", "tag", "lag"],            # Mixed table
            ["tag", "tag", "tag"],             # All TAGs (mirror match)
            ["lag", "rock", "rock", "rock"],   # LAG at tight table
            ["rock", "lag", "lag", "lag"],     # ROCK at loose table
        ]

    all_results = {}

    for i, comp in enumerate(compositions):
        comp_name = "_vs_".join(comp)
        print(f"\n{'='*70}")
        print(f"TABLE COMPOSITION TEST {i+1}/{len(compositions)}: {comp}")
        print(f"{'='*70}")

        result = run_style_test(num_hands=num_hands, styles=comp, verbose=False)
        if result:
            all_results[comp_name] = result

    # Summary
    print("\n" + "=" * 70)
    print("TABLE COMPOSITION ANALYSIS SUMMARY")
    print("=" * 70)

    # Analyze how each style performs in different compositions
    style_performance = defaultdict(list)

    for comp_name, result in all_results.items():
        for style, data in result["results"].items():
            style_performance[style].append({
                "composition": comp_name,
                "bb100": data["bb_per_100"],
                "profit": data["total_profit"]
            })

    print("\nPerformance by style across compositions:")
    print("-" * 70)

    for style, performances in style_performance.items():
        avg_bb100 = sum(p["bb100"] for p in performances) / len(performances)
        best = max(performances, key=lambda x: x["bb100"])
        worst = min(performances, key=lambda x: x["bb100"])

        print(f"\n{STYLE_DEFINITIONS[style]['name']}:")
        print(f"  Average BB/100: {avg_bb100:+.1f}")
        print(f"  Best: {best['bb100']:+.1f} in {best['composition']}")
        print(f"  Worst: {worst['bb100']:+.1f} in {worst['composition']}")

    return all_results


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import sys

    num_hands = int(sys.argv[1]) if len(sys.argv) > 1 else 500

    # Run basic style test
    results = run_style_test(num_hands=num_hands)

    # Save results
    if results:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"test_results/style_test_{timestamp}.json"

        import os
        os.makedirs("test_results", exist_ok=True)

        with open(output_file, "w") as f:
            json.dump(results, f, indent=2, default=str)

        print(f"\nResults saved to: {output_file}")
