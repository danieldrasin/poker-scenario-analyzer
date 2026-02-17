# Hand Journal — Future Feature Design Notes

## Status: Coming Soon (tab placeholder added, no functionality yet)

## Core Concept
Transform "Saved Simulations" into a poker study tool that saves Play Advisor analyses.

## Use Cases

### 1. Post-Session Review
Player saves interesting hands from a live session to review later.
- Save Play Advisor analysis with one click
- Add notes: "I actually folded here but advisor said raise — was I too tight?"
- Tag hands: #bluff #river-decision #multiway #nut-flush-draw

### 2. Study Spots
Build a library of tricky situations to drill.
- "Flush draws on paired boards" — save 5-10 examples
- Re-analyze with different styles to see how approach changes
- Compare nit vs LAG recommendations side-by-side

### 3. Strategy Lab (longer term)
Use simulation data to test strategy tweaks.
- "What if I tighten my 3-bet range from CO?"
- Save parameter sets as named strategies
- Compare strategies against simulation outcomes
- Track which tweaks improve expected value

## Data Model (proposed)
```json
{
  "id": "uuid",
  "savedAt": "ISO timestamp",
  "source": "play-advisor | scenario-builder",
  "hand": {
    "holeCards": ["As", "Ks", "Qh", "Jh"],
    "board": ["Ts", "9s", "2s"],
    "gameVariant": "omaha4",
    "street": "flop"
  },
  "situation": {
    "position": "BTN",
    "players": 3,
    "potSize": 100,
    "toCall": 50,
    "stackSize": 1000,
    "heroStyle": "lag",
    "villainActions": ["raise"]
  },
  "recommendation": { /* full API response snapshot */ },
  "userNotes": "I folded but should have raised — villain was weak here",
  "userDecision": "fold",  // what the user actually did
  "tags": ["river", "missed-value"],
  "isFavorite": false
}
```

## Storage
IndexedDB (already used for simulation data). Could later sync to a backend.

## UI Sketch
- List view with filters (by tag, date, style, action)
- Card view showing the hand visually
- "Replay" button to re-open in Play Advisor with all fields pre-filled
- "Compare" mode to see same hand analyzed under different styles
- Export to CSV or JSON for external analysis
