"""
Omaha Test Runner for Play Advisor Validation

Supports PLO4, PLO5, PLO6 variants using the 'clubs' library.
Tests actual framework styles (rock/tag/lag) across different:
- Omaha variants (4, 5, 6 card)
- Table sizes (2-9 players, limited by deck size per variant)

Real-world PLO statistics (sources: pokercopilot.com, pokerstrategy.com):
- PLO TAG VPIP: ~25-30%, PFR: ~18-25%
- PLO LAG VPIP: ~35-45%, PFR: ~25-35%
- PLO Rock VPIP: ~15-20%, PFR: ~10-15%
- Typical flop seen %: 25-40% (much higher than Hold'em)
- Equities run much closer preflop in PLO

Run: python3 OmahaTestRunner.py [variant] [players] [hands]
  e.g. python3 OmahaTestRunner.py 4 6 500
  or:  python3 OmahaTestRunner.py comprehensive
"""

import clubs
import numpy as np
import requests
import json
import time
import math
import os
import random
from datetime import datetime
from collections import defaultdict

# =============================================================================
# CARD UTILS
# =============================================================================

RANK_VALUES = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,
               '9':9,'T':10,'J':11,'Q':12,'K':13,'A':14,'10':10}
SUIT_CONVERT = {'♣':'c','♦':'d','♥':'h','♠':'s','c':'c','d':'d','h':'h','s':'s'}

def card_rank_num(card):
    """Get numeric rank (2-14) from clubs Card."""
    return RANK_VALUES.get(str(card.rank), 7)

def card_suit_char(card):
    """Get suit character from clubs Card."""
    return SUIT_CONVERT.get(str(card.suit), 'c')

def card_str(card):
    """Convert clubs Card to advisor format like 'Ah','10c'."""
    r = str(card.rank)
    if r == 'T': r = '10'
    return f"{r}{card_suit_char(card)}"

# =============================================================================
# HAND SCORING (Omaha-specific)
# =============================================================================

def score_omaha_hand(hole_cards):
    """Score PLO hand 0-100. Accounts for connectivity, suitedness, pairs, nut potential."""
    if not hole_cards:
        return 25
    ranks, suits = [], []
    for c in hole_cards:
        try:
            ranks.append(card_rank_num(c))
            suits.append(card_suit_char(c))
        except:
            return 25

    score = 0
    n = len(ranks)

    # High card value (0-25)
    avg_rank = sum(ranks) / n
    score += (avg_rank / 14) * 25

    # Pairs (0-20)
    rc = defaultdict(int)
    for r in ranks: rc[r] += 1
    pairs = [r for r, c in rc.items() if c >= 2]
    if pairs:
        score += 10 + (max(pairs) / 14) * 10

    # Suitedness (0-15)
    sc = defaultdict(int)
    for s in suits: sc[s] += 1
    suited_groups = sum(1 for c in sc.values() if c >= 2)
    if suited_groups >= 2:
        score += 15
    elif max(sc.values()) >= 3:
        score += 12
    elif max(sc.values()) >= 2:
        score += 8

    # Connectivity (0-20)
    uniq = sorted(set(ranks))
    if len(uniq) >= 2:
        gaps = [uniq[i+1]-uniq[i] for i in range(len(uniq)-1)]
        avg_gap = sum(gaps)/len(gaps)
        score += max(0, 20 - (avg_gap - 1) * 5)

    # Nut potential (0-20)
    has_ace = 14 in ranks
    suited_ace = False
    for i,r in enumerate(ranks):
        if r == 14:
            for j,r2 in enumerate(ranks):
                if j != i and suits[i] == suits[j]:
                    suited_ace = True
    if suited_ace:
        score += 15
    elif has_ace:
        score += 8
    if sum(1 for r in ranks if r >= 10) >= 3:
        score += 5

    return min(100, max(0, score))

# =============================================================================
# STYLE DEFINITIONS (Calibrated to real-world PLO stats)
# =============================================================================
#
# Real-world PLO 6-max statistics (sources: pokercopilot, pokerstrategy, runitonce):
#   Nit:          VPIP ~18%, PFR ~14%, AF 1.5, CBet 50%, FoldCBet 55%
#   TAG/Reg:      VPIP ~25-28%, PFR ~18-22%, AF 2.5, CBet 60%, FoldCBet 40%
#   LAG:          VPIP ~33-38%, PFR ~22-28%, AF 3.0, CBet 65%, FoldCBet 30%
#   Fish/Whale:   VPIP ~50-65%, PFR ~10-15%, AF 0.8, CBet 45%, FoldCBet 25%
#
# PLO5 pools run ~10-15% looser across the board.
# PLO6 pools run ~20-25% looser (avg VPIP ~60%).
#
# Thresholds are VARIANT-SPECIFIC to produce consistent VPIPs despite the
# hand scoring function producing higher averages with more hole cards.
# Calibrated via Monte Carlo: deal 5000 hands, binary search for threshold
# that produces target VPIP averaged across all 6-max positions.

# =============================================================================
# STYLE DEFINITIONS — loaded from shared JSON (single source of truth)
# Source: api/lib/style_profiles.json (generated from StyleProfiles.js)
# If the JSON file is unavailable, falls back to hardcoded values below.
# =============================================================================

def _load_shared_profiles():
    """Load style profiles from the shared JSON file."""
    import json as _json
    json_path = os.path.join(os.path.dirname(__file__), '..', 'api', 'lib', 'style_profiles.json')
    try:
        with open(json_path, 'r') as f:
            data = _json.load(f)
        styles_raw = data.get('styles', {})
        pos_adj = data.get('position_adjustments', {})

        # Convert thresholds from {"omaha4": x} to {4: x} format
        thresholds = {}
        styles = {}
        for sid, sdata in styles_raw.items():
            t = sdata.get('thresholds', {})
            thresholds[sid] = {
                int(k.replace('omaha', '')): v for k, v in t.items()
            }
            styles[sid] = {
                "name": sdata["name"],
                "vpip_target": sdata["vpip_target"],
                "pfr_ratio": sdata["pfr_ratio"],
                "aggression": sdata.get("equity_adjustments", {}).get("aggression_mult", 0.5),
                "cbet": sdata["cbet"],
                "fold_cbet": sdata["fold_cbet"],
                "raise_sizing": sdata["raise_sizing"],
                "postflop_agg": sdata["postflop_agg"],
                "barrel_turn": sdata["barrel_turn"],
                "barrel_river": sdata["barrel_river"],
            }
        return thresholds, styles, pos_adj
    except (FileNotFoundError, KeyError, ValueError) as e:
        print(f"[WARN] Could not load shared style_profiles.json: {e}")
        print("[WARN] Falling back to hardcoded style definitions.")
        return None, None, None

_shared_thresholds, _shared_styles, _shared_pos = _load_shared_profiles()

# Variant-specific thresholds calibrated to target VPIPs.
# These are tuned to account for marginal-hand calling in multi-way pots
# which adds ~8-15% on top of the base play rate.
STYLE_THRESHOLDS = _shared_thresholds if _shared_thresholds else {
    "nit":  {4: 55.0, 5: 65.5, 6: 73.0},     # target VPIP ~18-20%
    "rock": {4: 55.0, 5: 65.5, 6: 73.0},      # target VPIP ~18-20%
    "reg":  {4: 53.6, 5: 63.9, 6: 71.3},       # target VPIP ~22-25%
    "tag":  {4: 52.0, 5: 62.0, 6: 69.5},       # target VPIP ~25-28%
    "lag":  {4: 50.5, 5: 61.0, 6: 68.5},       # target VPIP ~30-35%
    "fish": {4: 46.5, 5: 56.7, 6: 64.3},       # target VPIP ~40-50%
}

STYLES = _shared_styles if _shared_styles else {
    "nit": {
        "name": "Nit (Ultra-Tight)",
        "vpip_target": 0.20, "pfr_ratio": 0.70,
        "aggression": 0.45, "cbet": 0.50, "fold_cbet": 0.55,
        "raise_sizing": 0.5,
        "postflop_agg": 0.35,
        "barrel_turn": 0.40,
        "barrel_river": 0.30,
    },
    "rock": {
        "name": "Rock (Tight-Passive)",
        "vpip_target": 0.20, "pfr_ratio": 0.45,
        "aggression": 0.25, "cbet": 0.45, "fold_cbet": 0.55,
        "raise_sizing": 0.5,
        "postflop_agg": 0.15,
        "barrel_turn": 0.35,
        "barrel_river": 0.25,
    },
    "reg": {
        "name": "Reg (Solid Regular)",
        "vpip_target": 0.25, "pfr_ratio": 0.75,
        "aggression": 0.60, "cbet": 0.58, "fold_cbet": 0.42,
        "raise_sizing": 0.75,
        "postflop_agg": 0.30,
        "barrel_turn": 0.50,
        "barrel_river": 0.40,
    },
    "tag": {
        "name": "TAG (Tight-Aggressive)",
        "vpip_target": 0.28, "pfr_ratio": 0.72,
        "aggression": 0.65, "cbet": 0.62, "fold_cbet": 0.38,
        "raise_sizing": 0.75,
        "postflop_agg": 0.35,
        "barrel_turn": 0.55,
        "barrel_river": 0.42,
    },
    "lag": {
        "name": "LAG (Loose-Aggressive)",
        "vpip_target": 0.35, "pfr_ratio": 0.65,
        "aggression": 0.75, "cbet": 0.65, "fold_cbet": 0.30,
        "raise_sizing": 1.0,
        "postflop_agg": 0.40,
        "barrel_turn": 0.60,
        "barrel_river": 0.50,
    },
    "fish": {
        "name": "Fish (Loose-Passive)",
        "vpip_target": 0.50, "pfr_ratio": 0.25,
        "aggression": 0.20, "cbet": 0.40, "fold_cbet": 0.25,
        "raise_sizing": 0.5,
        "postflop_agg": 0.10,
        "barrel_turn": 0.30,
        "barrel_river": 0.20,
    },
}

POS_ADJ = _shared_pos if _shared_pos else {"BTN":12,"CO":6,"HJ":2,"MP":-3,"EP":-8,"UTG":-12,"SB":-5,"BB":0}
MAX_PLAYERS = {4: 11, 5: 9, 6: 7}
STREET_NAMES = {0: 'preflop', 1: 'flop', 2: 'turn', 3: 'river'}

# =============================================================================
# PLAYER
# =============================================================================

class OmahaPlayer:
    def __init__(self, idx, style, variant=4, advisor_url="http://localhost:3001/api/advise", fast_mode=False):
        self.idx = idx
        self.style = style
        self.sd = STYLES[style]
        self.variant = variant
        self.advisor_url = advisor_url
        self.fast_mode = fast_mode
        # Get variant-specific threshold
        self.threshold = STYLE_THRESHOLDS.get(style, {}).get(variant, self.sd.get("threshold", 50))
        self.reset_stats()

    def reset_stats(self):
        self.hands = self.wins = self.profit = 0
        self.advisor_calls = self.api_errors = 0
        self.actions = defaultdict(int)
        self.streets = defaultdict(int)
        self.per_hand = []
        self.vpip_hands = 0  # hands where player voluntarily put money in preflop
        self._vpip_this_hand = False  # track within a single hand

    def position(self, num_p, hand_num=0):
        """Get position name, rotating based on hand number (dealer button moves)."""
        if num_p <= 3: pos = ["BTN","SB","BB"]
        elif num_p <= 6: pos = ["UTG","MP","CO","BTN","SB","BB"]
        else: pos = ["UTG","UTG","EP","MP","HJ","CO","BTN","SB","BB"]
        # Rotate: shift index by hand_num so button moves each hand
        rotated_idx = (self.idx - hand_num) % num_p
        return pos[rotated_idx % len(pos)]

    def new_hand(self):
        """Call at start of each hand to reset per-hand tracking."""
        self._vpip_this_hand = False

    def decide(self, obs, street_idx, num_p, hand_num=0):
        street = STREET_NAMES.get(street_idx, 'preflop')
        self.streets[street] += 1
        call = obs['call']
        pot = obs['pot']
        stk = obs['stacks'][self.idx] if isinstance(obs['stacks'],(list,np.ndarray)) else 200
        mnr = obs['min_raise']
        mxr = obs['max_raise']
        hole = obs['hole_cards']
        board = obs['community_cards']

        if street_idx == 0:
            return self._preflop(hole, call, pot, stk, mnr, mxr, num_p, hand_num)
        else:
            return self._postflop(hole, board, call, pot, stk, mnr, mxr, street, num_p, hand_num)

    def _preflop(self, hole, call, pot, stk, mnr, mxr, num_p, hand_num=0):
        score = score_omaha_hand(hole)
        pos = self.position(num_p, hand_num)
        adj = score + POS_ADJ.get(pos, 0)
        thresh = self.threshold  # variant-specific threshold
        pfr = self.sd["pfr_ratio"]
        sizing = self.sd.get("raise_sizing", 0.75)

        if adj >= thresh:
            if not self._vpip_this_hand:
                self.vpip_hands += 1
                self._vpip_this_hand = True
            if random.random() < pfr and mnr <= mxr:
                amt = max(mnr, min(mxr, int(pot * sizing)))
                self.actions['raise'] += 1
                return amt
            self.actions['call'] += 1
            return call

        # Free play from BB
        if call == 0:
            self.actions['call'] += 1
            return 0

        # Marginal hands: slightly wider calling range for aggressive/loose styles
        margin = 5 if self.style in ("lag", "fish") else 3 if self.style in ("tag", "reg") else 0
        if margin > 0 and adj >= thresh - margin:
            # Only call if price is right relative to stack
            max_call_pct = {"fish": 0.08, "lag": 0.05, "tag": 0.03, "reg": 0.03}.get(self.style, 0.03)
            if call <= stk * max_call_pct:
                if not self._vpip_this_hand:
                    self.vpip_hands += 1
                    self._vpip_this_hand = True
                self.actions['call'] += 1
                return call

        self.actions['fold'] += 1
        return -1

    def _postflop(self, hole, board, call, pot, stk, mnr, mxr, street, num_p, hand_num=0):
        # In fast mode, skip advisor HTTP calls
        if self.fast_mode:
            return self._heuristic(call, pot, stk, mnr, mxr)
        # Try advisor
        try:
            if board and len(board) >= 3:
                gs = {
                    "gameVariant": f"omaha{self.variant}",
                    "street": street,
                    "holeCards": [card_str(c) for c in hole[:self.variant]],
                    "board": [card_str(c) for c in board],
                    "position": self.position(num_p, hand_num),
                    "playersInHand": num_p,
                    "potSize": pot, "toCall": call,
                    "stackSize": stk, "villainActions": [],
                    "style": self.style
                }
                resp = requests.post(self.advisor_url, json=gs, timeout=2)
                resp.raise_for_status()
                rec = resp.json().get("recommendation", {})
                self.advisor_calls += 1
                action = rec.get("action", "fold").lower()
                sizing = rec.get("sizing", {})
                return self._style_action(action, sizing, call, pot, stk, mnr, mxr)
        except:
            self.api_errors += 1

        return self._heuristic(call, pot, stk, mnr, mxr)

    def _style_action(self, action, sizing, call, pot, stk, mnr, mxr):
        agg = self.sd["aggression"]
        if action == "fold":
            if self.style == "lag" and call <= pot * 0.3 and random.random() < 0.3:
                self.actions['call'] += 1; return call
            self.actions['fold'] += 1; return -1
        elif action in ("call","check"):
            if random.random() < agg * 0.3 and mnr <= mxr:
                opt = sizing.get("optimal", mnr) if sizing else mnr
                self.actions['raise'] += 1
                return max(mnr, min(int(opt), mxr))
            self.actions['call'] += 1; return call
        elif action in ("raise","bet"):
            if self.style == "rock" and random.random() > agg:
                self.actions['call'] += 1; return call
            if mnr <= mxr:
                opt = sizing.get("optimal", mnr) if sizing else mnr
                self.actions['raise'] += 1
                return max(mnr, min(int(opt), mxr))
            self.actions['call'] += 1; return call
        self.actions['call'] += 1; return call

    def _heuristic(self, call, pot, stk, mnr, mxr):
        cbet = self.sd["cbet"]
        fold_cbet = self.sd["fold_cbet"]
        postflop_agg = self.sd.get("postflop_agg", self.sd["aggression"] * 0.4)

        if call == 0:
            # Opportunity to bet (checked to us, or we're first)
            if random.random() < cbet and mnr <= mxr:
                # Bet sizing: 50-75% of pot depending on style
                sizing = 0.5 + self.sd.get("raise_sizing", 0.75) * 0.25
                self.actions['raise'] += 1
                return max(mnr, min(int(pot * sizing), mxr))
            self.actions['call'] += 1; return 0

        # Facing a bet
        if random.random() < fold_cbet:
            self.actions['fold'] += 1; return -1
        # Raise back?
        if random.random() < postflop_agg and mnr <= mxr:
            self.actions['raise'] += 1
            return max(mnr, min(int(pot * 0.75), mxr))
        self.actions['call'] += 1; return call


# =============================================================================
# GAME ENGINE
# =============================================================================

def play_hand(dealer, players, num_p, hand_num=0):
    """Play one hand. Returns array of profits per player."""
    obs = dealer.reset()
    start_stacks = list(obs['stacks'])
    for p in players:
        p.new_hand()

    max_steps = num_p * 4 * 5  # safety limit
    for _ in range(max_steps):
        action_idx = dealer.action
        street_idx = dealer.street

        if action_idx < len(players):
            player = players[action_idx]
            bet = player.decide(obs, street_idx, num_p, hand_num)
        else:
            bet = obs['call']  # shouldn't happen

        try:
            obs, rewards, done = dealer.step(max(bet, -1))
        except:
            try:
                obs, rewards, done = dealer.step(obs['call'])
            except:
                break

        if all(done):
            break

    end_stacks = list(obs['stacks'])
    return [end_stacks[i] - start_stacks[i] for i in range(num_p)]


def run_omaha_test(variant=4, num_p=6, target=500, styles=None, fast_mode=False):
    """Run PLO test. Returns results dict."""
    max_p = MAX_PLAYERS[variant]
    num_p = min(num_p, max_p)

    if styles is None:
        cycle = ["tag","lag","rock"]
        styles = [cycle[i%3] for i in range(num_p)]

    print(f"\n{'='*70}")
    print(f"PLO{variant} - {num_p} Players - {target} hands target")
    print(f"{'='*70}")
    print(f"Styles: {styles}")

    base_config = {
        'num_players': num_p, 'num_streets': 4,
        'antes': 0,
        'raise_sizes': 'pot', 'num_raises': 4,
        'num_suits': 4, 'num_ranks': 13,
        'num_hole_cards': variant,
        'num_community_cards': [0, 3, 1, 1],
        'num_cards_for_hand': 5,
        'mandatory_num_hole_cards': 2,
        'start_stack': 200,
        'low_end_straight': True, 'order': None
    }

    players = [OmahaPlayer(i, styles[i], variant, fast_mode=fast_mode) for i in range(num_p)]
    t0 = time.time()
    hands_done = 0

    while hands_done < target:
        # Rotate blinds: SB and BB shift each hand so every player
        # takes every position over time (simulates button rotation)
        blinds = [0] * num_p
        if num_p >= 2:
            sb_seat = (hands_done) % num_p
            bb_seat = (hands_done + 1) % num_p
            blinds[sb_seat] = 1
            blinds[bb_seat] = 2

        config = {**base_config, 'blinds': blinds}
        dealer = clubs.poker.Dealer(**config)
        try:
            profits = play_hand(dealer, players, num_p, hand_num=hands_done)
            hands_done += 1
            for i, p in enumerate(players):
                p.hands += 1
                pr = int(profits[i])
                p.profit += pr
                p.per_hand.append(pr)
                if pr > 0: p.wins += 1
        except:
            hands_done += 1  # skip broken hands to avoid infinite loop

        if hands_done % 500 == 0:
            elapsed = time.time() - t0
            print(f"  {hands_done}/{target} hands ({elapsed:.1f}s)")

    elapsed = time.time() - t0

    # Aggregate by style
    agg = defaultdict(lambda: {"hands":0,"wins":0,"profit":0,
        "actions":defaultdict(int),"per_hand":[],"streets":defaultdict(int),
        "advisor_calls":0,"api_errors":0,"vpip_hands":0})

    for p in players:
        a = agg[p.style]
        a["hands"] += p.hands
        a["wins"] += p.wins
        a["profit"] += p.profit
        a["advisor_calls"] += p.advisor_calls
        a["api_errors"] += p.api_errors
        a["vpip_hands"] += p.vpip_hands
        for k,v in p.actions.items(): a["actions"][k] += v
        for k,v in p.streets.items(): a["streets"][k] += v
        a["per_hand"].extend(p.per_hand)

    # Print results
    print(f"\nCompleted {hands_done} hands in {elapsed:.1f}s ({hands_done/max(elapsed,0.1):.0f} h/s)")
    print(f"\n{'Style':<25} {'Hands':>6} {'BB/100':>10} {'95% CI':>22} {'Win%':>6} {'Flop%':>6} {'VPIP':>6}")
    print("-"*85)

    results = {}
    for style in sorted(set(styles)):
        a = agg[style]
        n = a["hands"]
        if n == 0: continue

        bb100 = (a["profit"]/2)/(n/100)
        wr = a["wins"]/n*100
        flop_pct = a["streets"].get("flop",0)/n*100
        tot_act = sum(a["actions"].values()) or 1
        vpip = a["vpip_hands"]/n*100

        profs = a["per_hand"]
        if len(profs)>1:
            m = sum(profs)/len(profs)
            v = sum((x-m)**2 for x in profs)/(len(profs)-1)
            se = math.sqrt(v)/math.sqrt(len(profs))
            ci = [(m-1.96*se)/2*100, (m+1.96*se)/2*100]
        else:
            ci = [bb100, bb100]

        ci_s = f"[{ci[0]:+,.1f}, {ci[1]:+,.1f}]"
        nm = STYLES[style]["name"]
        print(f"{nm:<25} {n:>6} {bb100:>+10,.1f} {ci_s:>22} {wr:>5.1f}% {flop_pct:>5.1f}% {vpip:>5.1f}%")

        results[style] = {
            "name":nm,"hands":n,"bb100":round(bb100,1),
            "ci":[round(ci[0],1),round(ci[1],1)],
            "win_rate":round(wr,1),"flop_pct":round(flop_pct,1),
            "vpip":round(vpip,1),
            "actions":dict(a["actions"]),
            "streets":dict(a["streets"]),
            "advisor_calls":a["advisor_calls"],"api_errors":a["api_errors"]
        }

    # Action distribution
    print(f"\n{'Style':<25} {'Fold':>8} {'Call':>8} {'Raise':>8}")
    print("-"*55)
    for style in sorted(set(styles)):
        a = agg[style]
        tot = sum(a["actions"].values()) or 1
        f=a["actions"].get("fold",0)/tot*100
        c=a["actions"].get("call",0)/tot*100
        r=a["actions"].get("raise",0)/tot*100
        print(f"{STYLES[style]['name']:<25} {f:>7.1f}% {c:>7.1f}% {r:>7.1f}%")

    return {"variant":f"PLO{variant}","num_players":num_p,"styles":styles,
            "hands":hands_done,"elapsed":round(elapsed,1),"results":results}


def run_comprehensive():
    """Legacy: quick test with 500 hands. Use run_full_comprehensive() for full suite."""
    tests = [
        (4,2,500),(4,3,500),(4,6,500),(4,9,500),
        (5,2,500),(5,3,500),(5,6,500),(5,9,500),
        (6,2,500),(6,3,500),(6,6,500),(6,7,500),
    ]
    all_results = {}
    for v,p,h in tests:
        actual_p = min(p, MAX_PLAYERS[v])
        key = f"PLO{v}_{actual_p}p"
        result = run_omaha_test(variant=v, num_p=actual_p, target=h, fast_mode=True)
        all_results[key] = result
    _save_and_print(all_results, "omaha_comprehensive")
    return all_results


def run_full_comprehensive(hands_per_config=2000):
    """
    Full comprehensive test: all variants × all player counts × all style combos.

    For 2-player tables: runs all style pairings including new styles
    For 3+ player tables: runs with cycling styles (all 6 styles)

    Includes both legacy styles (tag, lag, rock) and new realistic styles
    (reg, nit, fish) for comprehensive comparison.
    """
    ALL_STYLES = ["nit", "rock", "reg", "tag", "lag", "fish"]
    # 2-player: key matchups (15 total pairings across 6 styles)
    STYLE_PAIRS_2P = []
    for i, s1 in enumerate(ALL_STYLES):
        for s2 in ALL_STYLES[i+1:]:
            STYLE_PAIRS_2P.append((f"{s1}_vs_{s2}", [s1, s2]))

    VARIANTS = [4, 5, 6]
    # Player counts per variant (3+ uses mixed cycling)
    PLAYER_RANGE = {4: range(3, 10), 5: range(3, 10), 6: range(3, 8)}

    all_results = {}
    total_hands = 0
    total_configs = 0
    t0_global = time.time()

    for variant in VARIANTS:
        max_p = MAX_PLAYERS[variant]

        # --- 2-player: all 3 style pairings ---
        for pair_name, pair_styles in STYLE_PAIRS_2P:
            key = f"PLO{variant}_2p_{pair_name}"
            print(f"\n>>> Config {total_configs+1}: {key}")
            result = run_omaha_test(
                variant=variant, num_p=2, target=hands_per_config,
                styles=pair_styles, fast_mode=True
            )
            all_results[key] = result
            total_hands += result["hands"]
            total_configs += 1

        # --- 3+ players: cycling mixed styles ---
        for num_p in PLAYER_RANGE[variant]:
            actual_p = min(num_p, max_p)
            key = f"PLO{variant}_{actual_p}p_mixed"
            # Cycling: all 6 styles
            cycle = ALL_STYLES  # nit, rock, reg, tag, lag, fish
            styles = [cycle[i % len(cycle)] for i in range(actual_p)]
            print(f"\n>>> Config {total_configs+1}: {key} styles={styles}")
            result = run_omaha_test(
                variant=variant, num_p=actual_p, target=hands_per_config,
                styles=styles, fast_mode=True
            )
            all_results[key] = result
            total_hands += result["hands"]
            total_configs += 1

    elapsed_global = time.time() - t0_global

    # Save
    _save_and_print(all_results, "omaha_full_comprehensive")

    # Grand summary
    print(f"\n{'='*90}")
    print(f"GRAND TOTAL: {total_configs} configs, {total_hands:,} hands in {elapsed_global:.1f}s")
    print(f"Average throughput: {total_hands/max(elapsed_global,0.1):,.0f} hands/sec")
    print(f"{'='*90}")

    return all_results


def _save_and_print(all_results, prefix):
    """Save results to JSON and print summary table."""
    os.makedirs("test_results", exist_ok=True)
    fname = f"test_results/{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(fname, "w") as f:
        json.dump(all_results, f, indent=2, default=str)

    print(f"\n\n{'='*100}")
    print("COMPREHENSIVE SUMMARY")
    print(f"{'='*100}")
    print(f"\n{'Config':<30} {'Style':<8} {'Hands':>6} {'BB/100':>10} {'95% CI':>22} {'Win%':>6} {'Flop%':>6} {'VPIP':>6}")
    print("-"*100)
    for k, d in all_results.items():
        for s, r in d["results"].items():
            ci_s = f"[{r['ci'][0]:+,.1f}, {r['ci'][1]:+,.1f}]"
            print(f"{k:<30} {s:<8} {r['hands']:>6} {r['bb100']:>+10,.1f} {ci_s:>22} {r['win_rate']:>5.1f}% {r['flop_pct']:>5.1f}% {r['vpip']:>5.1f}%")

    print(f"\nSaved to: {fname}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "fulltest":
        hands = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
        run_full_comprehensive(hands_per_config=hands)
    elif len(sys.argv) > 1 and sys.argv[1] == "comprehensive":
        run_comprehensive()
    else:
        v = int(sys.argv[1]) if len(sys.argv) > 1 else 4
        p = int(sys.argv[2]) if len(sys.argv) > 2 else 6
        h = int(sys.argv[3]) if len(sys.argv) > 3 else 500
        run_omaha_test(variant=v, num_p=p, target=h)
