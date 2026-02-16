# PokerNow Bot Test Plan

## Game URL
```
https://www.pokernow.com/games/pgl2wy20QIsPBt_NSZ5zQfL4X
```

## Game Settings
- **Variant:** Pot Limit Omaha Hi
- **Blinds:** 10/20
- **Host:** Dan (can issue chips, manage game)

---

## Phase 1: Mechanical Testing (Bot vs Bot)

### Objective
Verify the bot can:
1. Join a PokerNow game
2. Parse game state correctly (cards, pot, positions)
3. Get recommendations from Play Advisor
4. Execute actions (fold, check, call, raise)
5. Handle chip management

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude (Orchestrator)                         │
│                                                                  │
│  Uses: Playwright / Desktop Commander / MCP Chrome               │
│                                                                  │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│   Bot 1      │   Bot 2      │   Bot 3      │   Observer        │
│  (Browser    │  (Browser    │  (Browser    │   (Monitor &      │
│   Context 1) │   Context 2) │   Context 3) │   Log Results)    │
└──────────────┴──────────────┴──────────────┴───────────────────┘
        │              │              │               │
        └──────────────┴──────────────┴───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   PokerNow Game   │
                    │   (Your Table)    │
                    └───────────────────┘
```

### Test Sequence

1. **T1: Single Bot Join**
   - Launch one browser
   - Navigate to game URL
   - Enter nickname
   - Take a seat
   - Verify: Bot appears at table

2. **T2: Game State Parsing**
   - Wait for cards to be dealt
   - Parse hole cards
   - Verify: Cards match what's shown
   - Parse pot, stack, position

3. **T3: Action Execution**
   - Wait for turn
   - Execute check/call
   - Verify: Action registered on PokerNow

4. **T4: Multi-Bot Game**
   - Launch 2-3 bots
   - Each takes a seat
   - Play 10 hands automatically
   - Log all decisions and outcomes

5. **T5: Edge Cases**
   - All-in situations
   - Running out of chips (host rebuys)
   - Disconnection/reconnection

---

## Phase 2: Strategy Validation

### Objective
Verify the Play Advisor makes reasonable decisions

### Tests

1. **Premium Hands**
   - Deal AAxx double-suited
   - Verify: Advisor recommends raise/reraise

2. **Trash Hands**
   - Deal 7-2-3-4 rainbow
   - Verify: Advisor recommends fold to aggression

3. **Position Awareness**
   - Same hand from BTN vs UTG
   - Verify: Different recommendations

4. **SPR-Based Sizing**
   - Deep stacks (SPR > 10): Smaller bets
   - Short stacks (SPR < 3): Shove/fold

---

## Phase 3: Human Opponent Testing

### Objective
Test bot against real human decision-making

### Options

| Method | Pros | Cons |
|--------|------|------|
| **Poker Now Lounge** | Real opponents, free | Public, can't control game type |
| **Discord Sit & Go** | Auto-matched, social | May be Hold'em focused |
| **Invite Friends** | Controlled, can get feedback | Need willing participants |
| **Post on Reddit** | Large audience | May attract scrutiny |

### Recommended Approach
1. Start in Poker Now Lounge (PLO tables if available)
2. Run bot for 100 hands, collect stats
3. Analyze win rate, decision quality

---

## Chip Management

### In Private Games (Testing)
- **Host (Dan) can issue chips** to any player
- Chips are play money (no cost)
- Can pause game, add chips, resume

### In Public Games
- Free 100 chips every 24 hours
- NOW Coins for more (optional purchase)
- No real money involved

### Bot Behavior When Low on Chips
```javascript
if (stackSize < 10 * bigBlind) {
  // Notify: "Low on chips, need rebuy"
  // In testing: Host adds chips
  // In public: Wait for free chips or sit out
}
```

---

## Betting Mechanics

### Already Implemented
- **SPR-based sizing** from Play Advisor
- Bet amounts relative to pot and stack
- Position-aware aggression

### PokerNow Specifics
- **Pot Limit**: Max bet = pot size
- Use `.default-bet-buttons` for presets (½ pot, pot)
- Manual amount entry for precise bets

### Bet Execution Flow
```
1. Advisor recommends: "raise", sizing: { optimal: 150 }
2. Check if 150 <= pot (PLO rule)
3. If yes: Enter 150 in raise input, click raise
4. If no: Use pot-size button instead
```

---

## Execution Tools

### Option A: Playwright (Recommended)
- Multiple browser contexts
- Built-in test framework
- Already in devDependencies

### Option B: Desktop Commander
- Can spawn Puppeteer processes
- Good for long-running sessions

### Option C: MCP Chrome
- Direct browser control
- Limited to existing Chrome

### Decision: Use Playwright
- Create `e2e/pokernow-bot.spec.ts`
- Run via `npm run test:e2e`
- Claude orchestrates via bash commands

---

## Success Metrics

### Phase 1 (Mechanical)
- [ ] Bot joins game successfully
- [ ] Parses 100% of game states correctly
- [ ] Executes all action types
- [ ] Plays 50 hands without crashing

### Phase 2 (Strategy)
- [ ] Makes reasonable preflop decisions
- [ ] Adjusts for position
- [ ] SPR-aware bet sizing

### Phase 3 (Human)
- [ ] Plays 100+ hands vs humans
- [ ] Positive or break-even results
- [ ] No obvious tells/patterns detected

---

## Next Steps

1. [ ] Create Playwright test file
2. [ ] Implement bot joining sequence
3. [ ] Test game state parsing on live page
4. [ ] Execute full mechanical test
5. [ ] Document results
