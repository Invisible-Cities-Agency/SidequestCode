# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SideQuest Code Quality Orchestrator** is a configuration-agnostic TypeScript and ESLint orchestrator with real-time watch mode, SQLite persistence, and intelligent terminal detection. It respects existing project configurations while providing advanced code quality monitoring.

## ⚠️ CRITICAL SETUP INFORMATION

### LLM Usage Pattern

**When working with this project, ALWAYS use the LLM-specific commands:**

```bash
# ✅ CORRECT for LLMs - Clean JSON output, no interaction
npm run sidequest:report              # TypeScript violations only
npm run sidequest:precommit            # Clean CI/pre-commit validation
npm run sidequest:report:strict       # Strict mode analysis

# ❌ NEVER use these for LLMs - They require interaction
npm run sidequest:watch               # Watch mode (interactive)
npm run sidequest:config              # Interactive config
```

### Smart Setup Detection (IMPROVED)

The tool now intelligently detects first-run state:

- **First time ever**: Shows setup (no `~/.sidequest-cqo/` AND no `./data/`)
- **Setup completed**: `hasCompletedFirstRun: true` in preferences
- **Database exists**: Skips setup even if preferences missing (existing user)
- **Automation mode**: `sidequest:report*` commands always skip setup

**No more manual `--skip-setup` flags needed!**

### Common User Errors (Fixed with Interception)

1. **npm run sidequest --watch** ❌ → **npm run sidequest:watch** ✅
2. **npm sidequest:watch** ❌ → **npm run sidequest:watch** ✅
3. **Setup running every time** → Check ~/.sidequest-cqo/user-preferences.json

### File Extension Strategy

- **TypeScript files**: `.ts/.tsx`
- **Edge runtime files**: `.mjs` (for API routes, with parallel `.d.ts` types)
- **Config files**: `.json/.js` depending on context

## Essential Development Commands

### Building and Development

```bash
npm run build              # Compile TypeScript to dist/
npm run dev               # Development mode with tsx
npm run typecheck         # TypeScript type checking without compilation
npm run lint              # ESLint with auto-fix
npm run format            # Prettier formatting
npm run clean             # Remove dist/ directory
```

### Testing (Vitest)

```bash
npm test                  # Run all tests
npm run test:core         # Core unit tests only (.vitest/core/)
npm run test:edge         # Edge case tests (.vitest/edge/)
npm run test:integration  # Integration tests (.vitest/integration/)
npm run test:watch        # Watch mode for core tests
npm run test:coverage     # Coverage report
npm run test:ui           # Vitest UI interface
```

### CLI Tool Usage

```bash
# For AI/LLMs - JSON output without interactive prompts
npm run sidequest:report              # TypeScript violations only
npm run sidequest:precommit            # Clean CI/pre-commit validation
npm run sidequest:report:strict       # Strict mode analysis

# For humans - interactive/visual modes
npm run sidequest:watch               # Real-time watch mode
npm run sidequest:config              # Configuration management
```

## Architecture Overview

### Core Services Architecture

The codebase follows a service-oriented architecture with clear separation of concerns:

- **OrchestratorService** (`services/orchestrator-service.ts`) - Main coordinator that manages all other services
- **AnalysisService** (`services/analysis-service.ts`) - Handles TypeScript/ESLint analysis orchestration
- **StorageService** (`services/storage-service.ts`) - SQLite persistence layer with WAL mode
- **ViolationTracker** (`services/violation-tracker.ts`) - Tracks violations across sessions with historical data
- **PollingService** (`services/polling-service.ts`) - File system watching and change detection
- **ConfigManager** (`services/config-manager.ts`) - User preferences and configuration management

### Analysis Engines

- **BaseAuditEngine** (`engines/base-engine.ts`) - Abstract base class for all analysis engines
- **TypeScriptEngine** (`engines/typescript-engine.ts`) - TypeScript compilation and type checking
- **ESLintEngine** (`engines/eslint-engine.ts`) - ESLint rule violations

### Key Design Patterns

1. **Service Locator Pattern** - Services are accessed through `services/index.ts` factory functions
2. **Observer Pattern** - EventEmitter-based communication between services
3. **Strategy Pattern** - Different engines for TypeScript vs ESLint analysis
4. **Repository Pattern** - Database abstraction through StorageService

### Database Schema

Uses SQLite with Kysely query builder. Key tables:

- `violations` - Current and historical violation records
- `analysis_sessions` - Session metadata and baseline tracking
- `config_cache` - Cached configuration data for performance

### Terminal Integration

- **Terminal Detection** (`terminal-detector.ts`) - OSC escape sequence detection for light/dark mode
- **Watch Display** (`watch-display-v2.ts`) - Real-time violation display with color themes
- Smart color fallback using TERM_COLOR_MODE environment variable

## Development Practices

### Type Safety

- Uses TypeScript strict mode with no `any` types allowed
- Comprehensive type definitions in `utils/types.ts` and `shared/types.ts`
- Interface segregation principle in `services/interfaces.ts`

### Error Handling

- Graceful degradation when tools (TypeScript/ESLint) are missing
- Comprehensive error recovery in all analysis engines
- Database connection resilience with retry logic

### Testing Strategy

- **Core Tests** (`.vitest/core/`) - Unit tests for services and utilities
- **Edge Tests** (`.vitest/edge/`) - Edge cases and error conditions
- **Integration Tests** (`.vitest/integration/`) - Full workflow testing
- Uses Vitest with Node.js environment and proper mocking

## Configuration Management

### User Preferences

Stored in `~/.sidequest-cqo/user-preferences.json` with schema validation:

- Analysis scope (errors-only, warnings, complete)
- Terminal color preferences (auto, light, dark)
- Tool separation warnings and educational hints

### CLI Flags Support

The CLI supports extensive flags for different use cases:

- `--watch` - Real-time monitoring mode
- `--include-eslint` - Add ESLint analysis to TypeScript
- `--verbose` - JSON output for automation/LLMs
- Setup is now automatically detected based on existing preferences
- `--config` - Configuration management commands

## Important Implementation Notes

### SQLite Performance

- Uses WAL mode for concurrent access during watch mode
- Implements connection pooling and prepared statement caching
- Historical data cleanup with configurable retention periods

### Memory Management

- Services are lazily initialized and can be reset
- Watch mode uses efficient file system polling with debouncing
- Violation tracking includes memory-efficient diff algorithms

### Cross-Platform Compatibility

- Terminal detection works across macOS, Linux, and Windows
- File path handling uses Node.js path utilities
- Database file location respects OS conventions

### Node.js Compatibility

**Supported Versions:**

- Node.js 18.x LTS (Hydrogen) - Maintenance LTS until April 2025
- Node.js 20.x LTS (Iron) - Active LTS until April 2026
- Node.js 22.x LTS (Jod) - Active LTS until April 2027

**Compatibility Features:**

- Automatic compatibility checking on startup with helpful warnings
- Fallback implementations for newer features (replaceAll, Array.at)
- Graceful degradation for older Node versions
- Uses `node:` prefix imports (available since Node 16.0.0)

**Feature Compatibility:**

- `String.prototype.replaceAll()` - Native in Node 15+, fallback provided
- `Array.prototype.at()` - Native in Node 16.6+, fallback provided
- ESM modules with dynamic imports - Node 12.20.0+
- AbortController - Native in Node 16+

The tool will display compatibility warnings if running on unsupported versions and provide upgrade recommendations.

### AI/LLM Integration

- Report commands (`sidequest:report*`) provide clean JSON output
- No interactive prompts in automation-friendly modes
- Structured violation data with file paths and line numbers for easy navigation

## 🚨 CRITICAL BUGS FIXED - LLM AWARENESS

### Setup Loop Bug (FIXED)

**Previous Issue**: Interactive setup would run on every command due to `hasCompletedFirstRun` being reset.
**Root Cause**: `applyChoices()` called `resetToDefaults()` after setting `hasCompletedFirstRun = true`
**Fix Applied**: Added `updateUserChoice()` method to PreferencesManager for safe state updates
**Verification**: Check that `~/.sidequest-cqo/user-preferences.json` contains `"hasCompletedFirstRun": true`

### Error Interception System (NEW)

**Added**: `interceptCommonErrors()` function in `cli.ts` that:

- Detects `npm run sidequest --watch` attempts and suggests `npm run sidequest:start`
- Provides helpful guidance for first-time users
- Explains command syntax errors before they cause confusion

### Command Aliasing (NEW)

**Added**: `npm run sidequest` as alias for `npm run sidequest:report` (LLM-friendly)
**Purpose**: Provides convenient access for users who expect basic command structure

## 🎯 SELF-ANALYSIS WORKFLOW

When running SideQuest on itself to fix violations:

1. **Initial Analysis**:

   ```bash
   npm run sidequest:report
   ```

   Outputs clean JSON with all TypeScript violations

2. **With ESLint** (if needed):

   ```bash
   npm run sidequest:precommit
   ```

3. **Fix Patterns to Look For**:
   - Import path errors (`.js` vs `.ts` extensions)
   - Missing type annotations
   - Unused variables/imports
   - Type safety improvements (`unknown` vs `any`)
   - JSDoc documentation gaps

4. **Verification Commands**:

   ```bash
   npm run typecheck              # TypeScript compilation
   npm run lint                   # ESLint validation
   npm run test                   # Test suite
   npm run sidequest:report       # Final clean check
   ```

5. **Success Criteria**:
   - Zero violations in final `sidequest:report` output
   - All tests passing
   - TypeScript compilation clean

## 📁 PROJECT STRUCTURE GUIDE

```
SideQuestCode/
├── cli.ts                     # Main CLI entry point
├── services/                  # Core service layer
│   ├── index.ts              # Service factory/locator
│   ├── orchestrator-service.ts
│   ├── preferences-manager.ts # User preferences (CRITICAL)
│   ├── interactive-setup.ts   # First-run setup
│   └── [other services]
├── engines/                   # Analysis engines
│   ├── typescript-engine.ts   # TypeScript compilation
│   └── eslint-engine.ts      # ESLint analysis
├── utils/                     # Type definitions & utilities
├── .vitest/                   # Test suites
│   ├── core/                 # Unit tests
│   ├── edge/                 # Edge case tests
│   └── integration/          # Integration tests
└── database/                  # SQLite schema and migrations
```

## 🔧 DEVELOPMENT TROUBLESHOOTING

### TypeScript Compilation Issues

- Check import paths use `.js` extensions for ESM compatibility
- Verify all exported functions have proper type annotations
- Look for `any` types that should be `unknown` with validation

### Test Failures

- Run individual test suites: `npm run test:core`, `npm run test:edge`
- Check for async timing issues in violation tracking tests
- Verify mock implementations match service interfaces

### Service Architecture Issues

- Services use singleton pattern - check initialization order
- SQLite connections may need cleanup in tests
- EventEmitter communication requires proper cleanup

### Preferences/Setup Issues

- Delete `~/.sidequest-cqo/` to reset preferences
- Check `PreferencesManager.getInstance()` singleton behavior
- Verify `updateUserChoice()` method saves correctly
