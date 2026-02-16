# Basic Multi-User Test Suite

> **Test Type**: Functional / Integration
> **Purpose**: Verify all basic poker operations work correctly across multiple bots
> **Prerequisites**: TEST_SETUP_AND_EXECUTION.md setup completed
> **Runner**: AI Agent (GenAI) - requires intelligent decision-making due to random hands

---

## Test Objectives

Because poker deals random hands, this test suite cannot follow a deterministic script. Instead, the AI agent running these tests must make intelligent decisions to achieve the following **testing goals**:

### Goal 1: Bot Join Operations ✓ Must Test
- [ ] Successfully join 3+ bots to a single table
- [ ] Verify each bot has unique session (different cookies)
- [ ] Confirm stack sizes are set correctly
- [ ] Verify all bots show as "seated" in game

### Goal 2: Game State Parsing ✓ Must Test
- [ ] Parse hole cards correctly for each bot
- [ ] Parse board cards (flop, turn, river)
- [ ] Parse pot size accurately
- [ ] Identify dealer button position
- [ ] Determine whose turn it is
- [ ] Parse available actions (fold/check/call/raise)

### Goal 3: All Action Types ✓ Must Test
Execute each action type at least once during the test:
- [ ] **FOLD** - Discard hand and forfeit pot
- [ ] **CHECK** - Pass without betting (when allowed)
- [ ] **CALL** - Match the current bet
- [ ] **BET** - Make the first bet in a round
- [ ] **RAISE** - Increase the current bet
- [ ] **ALL-IN** (optional) - Bet entire stack

### Goal 4: Hand Progression ✓ Must Test
- [ ] Complete at least 5 full hands
- [ ] See action on all streets (preflop, flop, turn, river)
- [ ] Verify pot awarded to winner
- [ ] Confirm stack updates after hands

### Goal 5: Multi-Bot Coordination ✓ Must Test
- [ ] All bots can take turns in sequence
- [ ] No timing conflicts between bot actions
- [ ] Game progresses smoothly with multiple bots

---

## Test Execution Instructions (For AI Agent)

### Phase 1: Setup (5 minutes)

1. **Create a new PokerNow game**
   - Game type: PLO Hi (Pot Limit Omaha)
   - Blinds: 10/20
   - Save the game URL

2. **Launch bots via Desktop Commander**
   ```bash
   cd /Users/DanDrasin/projects/smalltalk\ stuff/poker/poker-simulator/bot
   node run-bots.js
   ```

3. **Approve bots** using Claude in Chrome on the owner browser
   - Open Players panel
   - Click approve for each pending bot

4. **Start the game** when 3+ players are seated

### Phase 2: Basic Operations Test (10-15 minutes)

For each hand, the AI agent should:

1. **Check the current game state** (screenshot + parse)
2. **Identify which actions are available**
3. **Execute an action that tests an untested goal** when possible
4. **Log the result**

#### Decision Framework for Action Selection

```
IF need to test FOLD and hand is weak:
    → Execute FOLD
ELSE IF need to test CHECK and check is available:
    → Execute CHECK  
ELSE IF need to test CALL and facing a bet:
    → Execute CALL
ELSE IF need to test BET and first to act post-flop:
    → Execute BET
ELSE IF need to test RAISE and facing a bet:
    → Execute RAISE
ELSE:
    → Make any reasonable action to progress the hand
```

### Phase 3: Verification (5 minutes)

After running through multiple hands, verify:

1. **Screenshot evidence** exists for each tested action
2. **Stack changes** reflect wins/losses correctly
3. **All goals are marked complete**

---

## Test Checklist

Use this checklist to track test completion:

```
BASIC MULTI-USER TEST RESULTS
Date: ___________
Tester: AI Agent / Human
Game URL: ___________

BOT JOIN OPERATIONS:
[_] 3+ bots joined successfully
[_] Unique sessions confirmed
[_] Stack sizes correct
[_] All bots seated

GAME STATE PARSING:
[_] Hole cards parsed
[_] Board cards parsed  
[_] Pot size accurate
[_] Dealer button identified
[_] Turn detection working
[_] Actions parsed correctly

ACTION EXECUTION:
[_] FOLD executed
[_] CHECK executed
[_] CALL executed
[_] BET executed
[_] RAISE executed
[_] ALL-IN executed (optional)

HAND PROGRESSION:
[_] 5+ hands completed
[_] Preflop action seen
[_] Flop action seen
[_] Turn action seen
[_] River action seen
[_] Pot awarded correctly
[_] Stacks updated correctly

MULTI-BOT COORDINATION:
[_] Bots take turns properly
[_] No timing issues
[_] Game progresses smoothly

OVERALL STATUS: [_] PASS  [_] FAIL
Notes: ___________
```

---

## Expected Issues and Mitigations

| Issue | Mitigation |
|-------|------------|
| Bot times out | Increase action speed or implement auto-fold on timeout |
| Wrong button clicked | Use force:true and verify selectors |
| Game state parse fails | Check CSS selectors haven't changed |
| Multiple bots try to act | Implement turn-detection before action |

---

## Success Criteria

Test **PASSES** if:
- All bots successfully join and stay connected
- All action types are executed at least once
- At least 5 hands complete without errors
- Game state is parsed correctly throughout

Test **FAILS** if:
- Bots cannot join or disconnect unexpectedly
- Any action type consistently fails
- Game state parsing produces incorrect data
- Critical errors prevent hand completion

---

## Artifacts to Collect

After test completion, save:
1. `test-results/basic-test-YYYY-MM-DD.json` - Full test log
2. `debug-screenshots/` - Screenshots from key moments
3. Console output log

