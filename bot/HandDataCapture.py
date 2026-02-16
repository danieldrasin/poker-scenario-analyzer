"""
Hand Data Capture System for Play Advisor Testing

Captures detailed per-hand data:
- Who wins / who loses
- Stack changes for each player
- Betting actions per street
- Advisor recommendations vs actual actions
- Table composition effects

Results saved to JSON for cross-session analysis.
"""

import json
import os
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any
from collections import defaultdict


@dataclass
class BettingAction:
    """Single betting action."""
    player: str
    strategy: str
    street: str
    action: str  # fold, call, raise, check
    amount: int
    pot_before: int
    pot_after: int
    stack_before: int
    stack_after: int
    advisor_action: Optional[str] = None
    advisor_confidence: Optional[float] = None
    followed_advisor: Optional[bool] = None


@dataclass 
class PlayerHandResult:
    """One player's result for a single hand."""
    seat: int
    name: str
    strategy: str
    hole_cards: List[str]
    stack_start: int
    stack_end: int
    stack_change: int  # Profit/loss this hand
    actions: List[BettingAction] = field(default_factory=list)
    went_to_showdown: bool = False
    won_hand: bool = False
    won_amount: int = 0
    folded_street: Optional[str] = None  # Which street they folded on


@dataclass
class HandRecord:
    """Complete record of one hand."""
    hand_id: int
    timestamp: str
    variant: str
    num_players: int
    
    # Board
    board: List[str] = field(default_factory=list)
    
    # Players
    players: List[PlayerHandResult] = field(default_factory=list)
    
    # Outcome
    pot_size: int = 0
    winners: List[str] = field(default_factory=list)
    winning_hand_type: str = ""
    
    # Betting summary
    total_actions: int = 0
    streets_played: List[str] = field(default_factory=list)
    
    def to_dict(self):
        return asdict(self)


@dataclass
class SessionSummary:
    """Summary statistics for a test session."""
    session_id: str
    variant: str
    num_hands: int
    num_players: int
    strategies: List[str]
    duration_seconds: float
    
    # Per-strategy results
    strategy_results: Dict[str, Dict] = field(default_factory=dict)
    
    # Matchup analysis
    head_to_head: Dict[str, Dict[str, int]] = field(default_factory=dict)
    
    def to_dict(self):
        return asdict(self)


class HandDataCollector:
    """
    Collects detailed hand data during test runs.
    Integrates with PyPokerEngine game flow.
    """
    
    def __init__(self, session_id: str = None, variant: str = "omaha4", 
                 output_dir: str = None):
        self.session_id = session_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.variant = variant
        self.output_dir = output_dir or os.path.join(
            os.path.dirname(__file__), "test_results"
        )
        
        # Ensure output directory exists
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Current hand tracking
        self.current_hand: Optional[HandRecord] = None
        self.current_hand_id = 0
        
        # Player tracking (keyed by uuid)
        self.player_info: Dict[str, Dict] = {}  # uuid -> {name, strategy, seat}
        self.player_stacks: Dict[str, int] = {}  # uuid -> current stack
        self.player_start_stacks: Dict[str, int] = {}  # uuid -> stack at hand start
        
        # All hands this session
        self.hands: List[HandRecord] = []
        
        # Session stats
        self.start_time = datetime.now()
    
    def register_player(self, uuid: str, name: str, strategy: str, seat: int, stack: int):
        """Register a player at session start."""
        self.player_info[uuid] = {
            "name": name,
            "strategy": strategy,
            "seat": seat
        }
        self.player_stacks[uuid] = stack
    
    def start_hand(self, hand_id: int, player_stacks: Dict[str, int]):
        """Called at the start of each hand."""
        self.current_hand_id = hand_id
        self.current_hand = HandRecord(
            hand_id=hand_id,
            timestamp=datetime.now().isoformat(),
            variant=self.variant,
            num_players=len(player_stacks)
        )
        
        # Record starting stacks
        self.player_start_stacks = player_stacks.copy()
        
        # Initialize player results
        for uuid, stack in player_stacks.items():
            info = self.player_info.get(uuid, {})
            self.current_hand.players.append(PlayerHandResult(
                seat=info.get("seat", 0),
                name=info.get("name", uuid),
                strategy=info.get("strategy", "unknown"),
                hole_cards=[],
                stack_start=stack,
                stack_end=stack,  # Will be updated
                stack_change=0
            ))
    
    def record_hole_cards(self, uuid: str, cards: List[str]):
        """Record a player's hole cards."""
        if not self.current_hand:
            return
        
        info = self.player_info.get(uuid, {})
        name = info.get("name", uuid)
        
        for player in self.current_hand.players:
            if player.name == name:
                player.hole_cards = cards
                break
    
    def record_board(self, board: List[str]):
        """Record the community cards."""
        if self.current_hand:
            self.current_hand.board = board
    
    def record_action(self, uuid: str, street: str, action: str, amount: int,
                      pot_before: int, pot_after: int, stack_before: int, stack_after: int,
                      advisor_action: str = None, advisor_confidence: float = None):
        """Record a betting action."""
        if not self.current_hand:
            return
        
        info = self.player_info.get(uuid, {})
        name = info.get("name", uuid)
        strategy = info.get("strategy", "unknown")
        
        # Determine if advisor was followed
        followed = None
        if advisor_action:
            followed = (action.lower() == advisor_action.lower())
        
        betting_action = BettingAction(
            player=name,
            strategy=strategy,
            street=street,
            action=action,
            amount=amount,
            pot_before=pot_before,
            pot_after=pot_after,
            stack_before=stack_before,
            stack_after=stack_after,
            advisor_action=advisor_action,
            advisor_confidence=advisor_confidence,
            followed_advisor=followed
        )
        
        # Find player and add action
        for player in self.current_hand.players:
            if player.name == name:
                player.actions.append(betting_action)
                if action.lower() == "fold":
                    player.folded_street = street
                break
        
        # Track streets played
        if street not in self.current_hand.streets_played:
            self.current_hand.streets_played.append(street)
        
        self.current_hand.total_actions += 1
    
    def end_hand(self, winners: List[Dict], final_stacks: Dict[str, int], 
                 pot_size: int, winning_hand: str = ""):
        """Called at the end of each hand."""
        if not self.current_hand:
            return
        
        self.current_hand.pot_size = pot_size
        self.current_hand.winning_hand_type = winning_hand
        
        # Process winners
        winner_names = []
        winner_uuids = set()
        for w in winners:
            uuid = w.get("uuid", "")
            winner_uuids.add(uuid)
            info = self.player_info.get(uuid, {})
            name = info.get("name", uuid)
            winner_names.append(name)
        
        self.current_hand.winners = winner_names
        
        # Update each player's results
        for player in self.current_hand.players:
            # Find their uuid
            uuid = None
            for u, info in self.player_info.items():
                if info.get("name") == player.name:
                    uuid = u
                    break
            
            if uuid:
                player.stack_end = final_stacks.get(uuid, player.stack_start)
                player.stack_change = player.stack_end - player.stack_start
                player.won_hand = uuid in winner_uuids
                if player.won_hand:
                    player.won_amount = player.stack_change
                player.went_to_showdown = player.folded_street is None
        
        # Update our stack tracking
        self.player_stacks = final_stacks.copy()
        
        # Store the hand
        self.hands.append(self.current_hand)
        self.current_hand = None
    
    def generate_session_summary(self) -> SessionSummary:
        """Generate summary statistics for this session."""
        duration = (datetime.now() - self.start_time).total_seconds()
        
        strategies = list(set(info["strategy"] for info in self.player_info.values()))
        
        summary = SessionSummary(
            session_id=self.session_id,
            variant=self.variant,
            num_hands=len(self.hands),
            num_players=len(self.player_info),
            strategies=strategies,
            duration_seconds=duration
        )
        
        # Calculate per-strategy results
        strategy_stats = defaultdict(lambda: {
            "hands": 0,
            "wins": 0,
            "total_profit": 0,
            "showdowns": 0,
            "showdown_wins": 0,
            "folds": defaultdict(int),  # by street
            "actions": defaultdict(int),  # by action type
            "advisor_followed": 0,
            "advisor_ignored": 0
        })
        
        # Head-to-head tracking
        h2h = defaultdict(lambda: defaultdict(int))  # strategy -> strategy -> profit
        
        for hand in self.hands:
            for player in hand.players:
                stats = strategy_stats[player.strategy]
                stats["hands"] += 1
                stats["total_profit"] += player.stack_change
                
                if player.won_hand:
                    stats["wins"] += 1
                
                if player.went_to_showdown:
                    stats["showdowns"] += 1
                    if player.won_hand:
                        stats["showdown_wins"] += 1
                
                if player.folded_street:
                    stats["folds"][player.folded_street] += 1
                
                # Track actions
                for action in player.actions:
                    stats["actions"][action.action] += 1
                    if action.followed_advisor is True:
                        stats["advisor_followed"] += 1
                    elif action.followed_advisor is False:
                        stats["advisor_ignored"] += 1
                
                # Head-to-head: track profit against each opponent
                for opponent in hand.players:
                    if opponent.name != player.name:
                        # Simplified: attribute profit based on who lost
                        h2h[player.strategy][opponent.strategy] += player.stack_change
        
        # Convert to regular dicts for JSON
        for strategy, stats in strategy_stats.items():
            summary.strategy_results[strategy] = {
                "hands": stats["hands"],
                "wins": stats["wins"],
                "win_rate": stats["wins"] / stats["hands"] * 100 if stats["hands"] > 0 else 0,
                "total_profit": stats["total_profit"],
                "avg_profit_per_hand": stats["total_profit"] / stats["hands"] if stats["hands"] > 0 else 0,
                "bb_100": (stats["total_profit"] / 20) / (stats["hands"] / 100) if stats["hands"] > 0 else 0,
                "showdowns": stats["showdowns"],
                "showdown_wins": stats["showdown_wins"],
                "wtsd": stats["showdowns"] / stats["hands"] * 100 if stats["hands"] > 0 else 0,
                "wsd": stats["showdown_wins"] / stats["showdowns"] * 100 if stats["showdowns"] > 0 else 0,
                "folds_by_street": dict(stats["folds"]),
                "actions": dict(stats["actions"]),
                "advisor_followed": stats["advisor_followed"],
                "advisor_ignored": stats["advisor_ignored"]
            }
        
        # Convert h2h
        summary.head_to_head = {s1: dict(s2_dict) for s1, s2_dict in h2h.items()}
        
        return summary
    
    def save_results(self):
        """Save all results to JSON files."""
        # Save individual hands
        hands_file = os.path.join(self.output_dir, f"hands_{self.session_id}.json")
        with open(hands_file, "w") as f:
            json.dump([h.to_dict() for h in self.hands], f, indent=2)
        
        # Save session summary
        summary = self.generate_session_summary()
        summary_file = os.path.join(self.output_dir, f"summary_{self.session_id}.json")
        with open(summary_file, "w") as f:
            json.dump(summary.to_dict(), f, indent=2)
        
        return hands_file, summary_file
    
    def print_summary(self):
        """Print a summary of the session."""
        summary = self.generate_session_summary()
        
        print("\n" + "=" * 80)
        print("SESSION SUMMARY")
        print("=" * 80)
        print(f"Session ID: {summary.session_id}")
        print(f"Variant: {summary.variant}")
        print(f"Hands: {summary.num_hands}")
        print(f"Players: {summary.num_players}")
        print(f"Duration: {summary.duration_seconds:.1f}s")
        print()
        
        # Strategy results table
        print(f"{'Strategy':<12} {'Profit':>10} {'BB/100':>10} {'Win%':>8} {'WTSD%':>8} {'WSD%':>8}")
        print("-" * 60)
        
        sorted_results = sorted(
            summary.strategy_results.items(),
            key=lambda x: x[1]["total_profit"],
            reverse=True
        )
        
        for strategy, stats in sorted_results:
            print(f"{strategy:<12} {stats['total_profit']:>+10d} {stats['bb_100']:>+10.1f} "
                  f"{stats['win_rate']:>7.1f}% {stats['wtsd']:>7.1f}% {stats['wsd']:>7.1f}%")
        
        print()
        
        # Head-to-head matrix
        if len(summary.strategies) > 1:
            print("HEAD-TO-HEAD PROFIT MATRIX")
            print("-" * 60)
            strategies = sorted(summary.strategies)
            
            # Header
            header = f"{'vs':<12}"
            for s in strategies:
                header += f"{s[:8]:>10}"
            print(header)
            
            # Rows
            for s1 in strategies:
                row = f"{s1:<12}"
                for s2 in strategies:
                    if s1 == s2:
                        row += f"{'---':>10}"
                    else:
                        profit = summary.head_to_head.get(s1, {}).get(s2, 0)
                        row += f"{profit:>+10d}"
                print(row)
            
            print()


def analyze_multiple_sessions(results_dir: str):
    """Aggregate and analyze results across multiple sessions."""
    
    summaries = []
    
    # Load all summary files
    for filename in os.listdir(results_dir):
        if filename.startswith("summary_") and filename.endswith(".json"):
            filepath = os.path.join(results_dir, filename)
            with open(filepath, "r") as f:
                summaries.append(json.load(f))
    
    if not summaries:
        print("No session summaries found.")
        return
    
    print("\n" + "=" * 80)
    print(f"AGGREGATE ANALYSIS - {len(summaries)} Sessions")
    print("=" * 80)
    
    # Aggregate by strategy
    strategy_agg = defaultdict(lambda: {
        "sessions": 0,
        "hands": 0,
        "total_profit": 0,
        "wins": 0
    })
    
    for summary in summaries:
        for strategy, stats in summary.get("strategy_results", {}).items():
            agg = strategy_agg[strategy]
            agg["sessions"] += 1
            agg["hands"] += stats.get("hands", 0)
            agg["total_profit"] += stats.get("total_profit", 0)
            agg["wins"] += stats.get("wins", 0)
    
    print(f"\n{'Strategy':<12} {'Sessions':>10} {'Total Hands':>12} {'Total Profit':>14} {'Avg BB/100':>12}")
    print("-" * 65)
    
    sorted_agg = sorted(strategy_agg.items(), key=lambda x: x[1]["total_profit"], reverse=True)
    
    for strategy, agg in sorted_agg:
        bb100 = (agg["total_profit"] / 20) / (agg["hands"] / 100) if agg["hands"] > 0 else 0
        print(f"{strategy:<12} {agg['sessions']:>10d} {agg['hands']:>12d} {agg['total_profit']:>+14d} {bb100:>+12.1f}")
    
    print()
    
    return strategy_agg
