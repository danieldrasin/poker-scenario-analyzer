# Project Instructions for AI Assistants

This file provides instructions for any AI model (Opus or Sonnet) working on this project.

## Before Starting Any Task

1. **Check the task breakdown**: Read `/sessions/epic-confident-hamilton/mnt/poker/TASK-BREAKDOWN.md`
2. **Identify the current task** in the breakdown
3. **Proceed with the task** - model recommendations are for reference only, not switching triggers

## After Completing Any Task

1. **Update the task breakdown** (`TASK-BREAKDOWN.md`):
   - Mark completed tasks with ✅
   - Add any new tasks discovered during work
   - Adjust complexity ratings if needed

2. **Update the todo list** using the TodoWrite tool

3. **Suggest the next task** from the breakdown

## When to Suggest Switching to Opus

Suggest switching to Opus when:
- Task involves new algorithm design (not just using existing code)
- Task requires deep poker strategy knowledge
- Debugging is complex and root cause isn't obvious after 2-3 attempts
- Architectural decisions with significant tradeoffs
- The task breakdown explicitly recommends Opus

## When Sonnet is Fine

Stay with Sonnet for:
- Running existing scripts
- Configuration file creation
- UI changes with clear requirements
- Integrating well-documented modules
- File operations and standard CRUD
- Following established patterns in the codebase

## Key Project Files

- **Architecture Doc**: `/sessions/epic-confident-hamilton/mnt/poker/Poker-Data-Architecture-Design.docx`
- **Task Breakdown**: `/sessions/epic-confident-hamilton/mnt/poker/TASK-BREAKDOWN.md`
- **Data Manager**: `packages/web/src/public/data-manager.js`
- **Stats Module**: `packages/web/src/public/poker-stats.js`
- **Main App**: `packages/web/src/public/app.js`
- **Data Generation**: `scripts/generate-bundled-data.js`

## Project Context

This is a Poker Scenario Analyzer with:
- Monte Carlo simulation engine (TypeScript)
- Web UI for scenario building and analysis
- AI coaching with BYOK (Anthropic/OpenAI)
- Tiered data storage (Vercel + Cloudflare R2 + IndexedDB)
- Support for 4/5/6-card Omaha variants
