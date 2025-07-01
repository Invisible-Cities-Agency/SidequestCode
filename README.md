# SideQuest Code Quality Orchestrator

Configuration-agnostic TypeScript and ESLint orchestrator that respects your project setup with real-time watch mode, interactive first-run setup, and intelligent separation of concerns guidance.

## 📦 Installation

### npm & yarn (automatic)

```bash
npm install --save-dev @invisiblecities/sidequest-cqo
# OR
yarn add -D @invisiblecities/sidequest-cqo
```

### pnpm (one extra step)

```bash
pnpm add -D @invisiblecities/sidequest-cqo
npx sidequest-cqo --install-shortcuts  # Adds shortcuts to package.json

# Now you can use without "run":
pnpm sidequest:watch     # ✅ Direct command (no "run" needed!)
pnpm sidequest:report    # ✅ Direct command
pnpm sidequest:help      # ✅ Direct command
```

> **Why the extra step?** pnpm 10+ executes postinstall before writing package.json, so shortcuts need manual installation. The `--install-shortcuts` command is only needed once per project.

## 🚀 Common Commands

### 🤖 For LLMs/AI Assistants (Machine-Readable JSON Output)

```bash
# RECOMMENDED FOR LLMS: Clean JSON output, no interactive prompts
npm run sidequest:report             # TypeScript violations (JSON)
npm run sidequest:precommit           # Clean CI/pre-commit validation (JSON)
npm run sidequest:report:strict      # Strict mode analysis (JSON)

# Technical debt analysis (Code Archaeology)
npm run sidequest:archaeology                    # Dead code + duplication analysis (JSON)
npm run sidequest:debt                           # Combined analysis with technical debt (JSON)
npm run sidequest:archaeology:watch             # Watch mode with technical debt tracking
```

> **Note for LLMs**: Use `sidequest:report*` commands - they provide clean JSON output without interactive prompts or watch modes that LLMs cannot handle.

### 👨‍💻 For Human Developers (Interactive & Visual)

```bash
# Real-time monitoring (most common for humans)
npm run sidequest:watch              # Auto-detected colors with watch mode
npm run sidequest:watch:eslint       # Include ESLint analysis
npm run sidequest:watch:strict       # Strict mode with watch

# One-time analysis (human-friendly output)
npm run sidequest:analyze            # TypeScript only (formatted)
npm run sidequest:analyze:eslint     # Include ESLint (formatted)
npm run sidequest:analyze:strict     # Strict mode (formatted)

# Configuration management
npm run sidequest:config             # Show current settings
npm run sidequest:config:edit        # Edit preferences
npm run sidequest:config:reset       # Reset to defaults

# Help & context
npm run sidequest:help               # Standard CLI help
npm run sidequest:help:markdown      # Formatted documentation
npm run sidequest:help:quick         # One-liner summary
npm run sidequest:ai-context         # LLM context & guidance

# Technical debt analysis (Code Archaeology)
npm run sidequest:archaeology                    # Dead code + duplication analysis (JSON)
npm run sidequest:debt                           # Combined analysis with technical debt (JSON)
npm run sidequest:archaeology:watch             # Watch mode with technical debt tracking

# Project insights
npm run sidequest:prd                # Generate PRD for task management

# Debugging & troubleshooting
npm run sidequest:debug:terminal     # Fix color issues
npm run sidequest:session:reset      # Fresh start
```

## ✨ Features

- **🎯 Configuration-Agnostic** - Uses your exact `tsconfig.json` and `.eslintrc` without imposing opinions
- **🚀 Interactive First-Run Setup** - Friendly onboarding that teaches best practices (auto-detected, no more setup loops!)
- **🔧 ESLint/Prettier Integration** - Industry-standard configuration with eslint-config-prettier for conflict-free styling
- **👁️ Real-time Monitoring** - Live watch mode with smooth, non-scrolling updates (no more hanging on analysis!)
- **🎨 Intelligent Terminal Detection** - Automatic light/dark mode detection using OSC escape sequences
- **📊 Advanced Violation Tracking** - SQLite persistence with historical analysis and configuration caching
- **⚙️ User Preferences System** - Customizable defaults and behavior with `--config` management
- **🏺 Code Archaeology Engine** - Comprehensive technical debt analysis with dead code detection and duplication analysis
- **📝 JSDoc Annotation Control** - Developer-managed exclusions with permanent and temporary options
- **📋 PRD Generation** - Creates task-master compatible PRD files for automated project planning
- **🤖 LLM-Optimized Output** - Clean JSON output modes for AI assistants and automation
- **⚡ Performance Optimized** - Sub-second response times with smart caching and database optimization
- **📂 Flexible Data Storage** - Project-scoped or global data directory options
- **🔍 Systems Thinking Approach** - See interconnected violations and cascade effects in real-time

## 🏺 Code Archaeology Features

SideQuest's **Code Archaeology Engine** provides comprehensive technical debt analysis to help you maintain a clean, maintainable codebase:

### 💀 Dead Code Detection

- **Unused Exports** - Finds exports that are never imported or used
- **Unreachable Code** - Identifies code blocks that can never be executed
- **Unused Imports** - Locates import statements that aren't being used
- **Confidence Scoring** - Smart pattern detection reduces false positives

### 🔄 Code Duplication Analysis

- **Exact Duplicates** - Finds identical code blocks across files
- **Structural Duplicates** - Detects similar patterns with minor variations
- **Similarity Metrics** - Percentage-based duplication scoring
- **Refactoring Suggestions** - Actionable recommendations for cleanup

### 🎯 False Positive Control

- **Pattern Recognition** - Automatically recognizes CLI functions, public APIs, and utilities
- **Confidence Levels** - Risk assessment for each potential removal
- **JSDoc Annotations** - Developer-controlled exclusions with reasoning

### 📝 JSDoc Annotation System

Control archaeology analysis with structured JSDoc comments:

```typescript
/**
 * @archaeology-exclude permanent "CLI entry point used by npm scripts"
 * @since 0.2.0
 */
export function generatePRD() { ... }

/**
 * @archaeology-exclude temporary "Will be replaced by Zod validation"
 * @archaeology-recheck-after 0.3.0
 * @since 0.2.0
 */
export function legacyFunction() { ... }
```

**Annotation Types:**

- **Permanent** - Never flag this code (CLI functions, public APIs)
- **Temporary** - Exclude until specified version, then recheck
- **Version-Aware** - Automatically triggers rechecks after version bumps

## 🔧 ESLint & Prettier Integration (New in Alpha 3)

SideQuest now includes industry-standard ESLint/Prettier integration that eliminates configuration conflicts:

### ✅ What's Fixed

- **Zero Configuration Conflicts** - Uses `eslint-config-prettier` to automatically disable conflicting style rules
- **Clean Watch Mode** - No more 8,000+ style violation noise overwhelming real issues
- **Proper Separation of Concerns** - Prettier handles formatting, ESLint handles code quality
- **Stream Handling** - Fixed EPIPE errors during automation and piped output

### 🎯 Smart Rule Management

- **Preserved Quality Rules** - 82 useful unicorn ESLint rules for legitimate code improvements
- **Disabled Style Rules** - Automatically disables indent, quotes, comma-dangle, and other formatting rules
- **Actionable Focus** - Watch mode now shows only meaningful violations (errors + warnings)

## 🔗 Systems Thinking: The SideQuest Advantage

> **"Systems are in balance. A change in one may cause an error in another. SideQuest lets you see all of that happening as near to real-time as an LLM is capable of handling."**

Unlike basic linting tools that analyze code in isolation, SideQuest provides **comprehensive interconnected analysis** that reveals how changes propagate across your entire codebase:

- **🔄 Real-Time Cascade Effects** - See how fixing one violation immediately impacts related violations across multiple files
- **🎯 Multi-Engine Coordination** - TypeScript, ESLint, and unused exports analysis work together, not in isolation
- **📊 Systematic Improvement** - Track violation reductions systematically (e.g., 362 → 112 violations = 69% improvement) rather than fixing random individual issues
- **🧠 Intelligent Prioritization** - Understand which fixes will have the highest impact across interconnected systems
- **⚡ Live Feedback Loops** - Watch your entire system's health improve in real-time as you make changes

This systems approach enables **dramatic efficiency gains** in code quality improvement - fixing 250+ violations systematically rather than hunting individual linting errors one by one.

## 🚀 Quick Start

```bash
# Install as dev dependency (recommended)
npm install --save-dev @invisiblecities/sidequest-cqo

# Or run directly with npx
npx @invisiblecities/sidequest-cqo --help

# First run triggers interactive setup
npm run sidequest:watch

# For LLMs - clean JSON output
npm run sidequest:report

# Configuration management
npm run sidequest:config        # Show current preferences
npm run sidequest:config:edit   # Edit preferences file
npm run sidequest:config:reset  # Reset to defaults

# Analysis modes
npm run sidequest:watch         # TypeScript compilation checking (default)
npm run sidequest:watch:eslint  # Add ESLint analysis
npm run sidequest:watch:strict  # Strict mode analysis

# Terminal themes
sidequest --watch --color-scheme auto   # Auto-detect (default)
sidequest --watch --color-scheme dark   # Force dark theme
sidequest --watch --color-scheme light  # Force light theme

# Output formats
npm run sidequest:report        # Detailed JSON output
npm run sidequest:prd           # Generate PRD for task management
```

## 📊 Watch Mode Display

The watch mode provides a clean, developer-focused display:

```
🔍 Code Quality Monitor
────────────────────────────────────────────────────────────

Current Issues: 42 (+3)
Last check: 14:30:15 | Session: 120s | Checks: 8

By Source:
  📝 typescript: 28 (+2)
  🔍 eslint: 14 (+1)

Top Issues:
  ❌ 📝 type-alias: 12 (+1)
  ⚠️ 🔍 code-quality: 8 (+2)
  ℹ️ 📝 annotation: 6 (-1)

Session Summary:
  📈 +5 new issues found
  📉 -2 issues resolved
  🔺 Net: +3

Today's Progress:
  📅 Total issues processed: 247
  📁 Files affected: 45
  📊 Avg per file: 5.5

Press Ctrl+C to stop monitoring...
```

## ⚙️ Configuration System

### Interactive First-Run Setup

On first use, the tool guides you through configuration:

1. **Analysis Scope**: Choose errors-only, warnings-and-errors, or complete analysis
2. **Tool Separation**: Learn about TypeScript vs ESLint separation of concerns
3. **Terminal Colors**: Auto-detect or manual light/dark theme selection
4. **Output Detail**: Concise summaries vs verbose JSON output
5. **Helpful Hints**: Enable/disable educational warnings and tips

### Preferences Management

```bash
# View current configuration
sidequest --config

# Edit preferences file
sidequest --config edit

# Reset to defaults
sidequest --config reset

# Skip first-run setup
sidequest --watch
```

### Configuration File

Stored at `~/.sidequest-cqo/user-preferences.json`:

```json
{
  "preferences": {
    "analysis": {
      "defaultMode": "errors-only",
      "strictMode": false,
      "includePatternChecking": false,
      "defaultPath": "app"
    },
    "warnings": {
      "showTscEslintSeparationWarning": true,
      "showPerformanceWarnings": true,
      "showConfigurationHints": true
    },
    "display": {
      "colorScheme": "auto",
      "verboseOutput": false,
      "showProgressIndicators": true
    }
  }
}
```

## 🎨 Terminal Color Support

Automatic detection and fallback support:

- **Dark Mode**: Replicates macOS Terminal "Pro" theme colors
- **Light Mode**: Replicates macOS Terminal "Man Page" theme colors
- **Auto-Detection**: Uses OSC escape sequences with heuristic fallback
- **Manual Override**: `--color-scheme light|dark|auto`

## 📁 Architecture

```
code-quality-orchestrator/
├── cli.ts                 # Main CLI interface
├── watch-display-v2.ts    # Clean developer display system
├── terminal-detector.ts   # Sophisticated color detection
├── services/              # Core orchestrator services
│   ├── orchestrator-service.ts
│   ├── violation-tracker.ts
│   └── storage-service.ts
├── shared/                # Shared types and constants
│   ├── types.ts
│   └── constants.ts
└── database/              # SQLite persistence layer
```

## 🛠 CLI Commands

### Core Analysis

```bash
# Watch modes (Real-time monitoring)
npm run sidequest:watch             # TypeScript compilation checking (default)
npm run sidequest:watch:eslint      # Add ESLint analysis
npm run sidequest:watch:strict      # Strict mode analysis

# One-time analysis
npm run sidequest:analyze           # TypeScript only (formatted output)
npm run sidequest:analyze:eslint    # Include ESLint (formatted output)
npm run sidequest:analyze:strict    # Strict mode (formatted output)

# Machine-readable output (for LLMs/CI)
npm run sidequest:report            # TypeScript violations (JSON)
npm run sidequest:precommit         # Clean CI/pre-commit validation (JSON)
npm run sidequest:report:strict     # Strict mode analysis (JSON)
```

### Configuration Management

```bash
npm run sidequest:config            # Show current preferences
npm run sidequest:config:edit       # Edit preferences file
npm run sidequest:config:reset      # Reset to defaults
# Setup is now automatically detected - no manual flags needed!
```

### Terminal & Display

```bash
npm run sidequest:watch             # Auto-detect colors (default)
npm run sidequest:report            # Detailed JSON output format
```

### Code Archaeology (Technical Debt Analysis)

```bash
# Dead code detection & duplication analysis
npm run sidequest:archaeology                    # Comprehensive technical debt analysis (JSON)
npm run sidequest:debt                           # Combined analysis with technical debt (JSON)
npm run sidequest:archaeology:watch             # Watch mode with technical debt tracking

# Analysis targeting
npm run sidequest:archaeology -- --include-eslint # Include ESLint with archaeology
npm run sidequest:archaeology -- --strict         # Strict mode archaeology analysis
```

### Advanced Features

```bash
npm run sidequest:prd               # Generate PRD file for task master
npm run sidequest:debug:terminal    # Debug color detection
npm run sidequest:session:reset     # Reset session baseline
npm run sidequest:ai-context        # LLM context & guidance
```

### Examples

```bash
# First run with interactive setup
npm run sidequest:watch

# TypeScript-only analysis (recommended)
npm run sidequest:watch

# Full analysis with ESLint (optional)
npm run sidequest:watch:eslint

# Technical debt analysis (Code Archaeology)
npm run sidequest:archaeology                    # Find dead code and duplicates
npm run sidequest:debt                           # Combined code quality + technical debt
npm run sidequest:archaeology:watch             # Real-time technical debt monitoring

# Machine-readable output for LLMs/CI
npm run sidequest:report                         # Clean JSON output
npm run sidequest:precommit                      # CI-friendly validation

# Generate PRD for Claude Task Master
npm run sidequest:prd

# Advanced troubleshooting
npm run sidequest:debug:terminal                 # Debug color detection
npm run sidequest:ai-context                     # Get LLM-specific guidance
```

## 📋 PRD Generation for Task Management

SideQuest can generate comprehensive Product Requirements Documents (PRDs) for automatic task breakdown and project planning.

### Claude Task Master Integration

Generate PRD files optimized for [Claude Task Master](https://github.com/eyaltoledano/claude-task-master):

```bash
# Generate PRD in project root
npm run sidequest:prd

# Creates: CODE_QUALITY_PRD.md
```

### PRD Contents

The generated PRD includes:

- **Executive Summary** with violation metrics
- **Problem Statement** with current state analysis
- **Detailed Requirements** prioritized by impact
- **Technical Approach** with phased implementation
- **Success Metrics** with specific targets
- **Resource Requirements** and timeline estimates

### Example PRD Structure

```markdown
# Code Quality Improvement PRD

Generated: 2025-06-29
Target: ./src

## Executive Summary

This codebase requires systematic improvements to address 127 violations across 23 files...

## Priority 1: Critical Errors (5 items)

- **type-annotation**: Missing return type (src/utils.ts:45)
- **no-explicit-any**: Unsafe any usage (src/types.ts:12)

## Priority 2: High-Impact Categories

- **type-annotation**: 45 violations (35.4% of total)
- **eslint-style**: 32 violations (25.2% of total)
```

### Integration Workflow

1. **Analysis**: `npm run sidequest:watch` to identify all code quality issues
2. **PRD Generation**: `npm run sidequest:prd` to create structured requirements document
3. **Task Master**: Import `CODE_QUALITY_PRD.md` for automatic task breakdown
4. **Implementation**: Follow generated project plan with priorities
5. **Validation**: `npm run sidequest:report` to verify improvements

## 🏗 Development

### Setup

```bash
git clone <repository>
cd code-quality-orchestrator
npm install
```

### Testing

```bash
npm test              # Run all tests
npm run test:core     # Core unit tests
npm run test:edge     # Edge runtime tests
npm run test:watch    # Watch mode for TDD
```

### Code Quality

```bash
npm run lint          # ESLint check
npm run typecheck     # TypeScript validation
```

## 🔧 Configuration

### Environment Variables

```bash
# Terminal color override
TERM_COLOR_MODE=dark|light

# Debug logging
DEBUG=1

# Database configuration
CQO_DB_PATH=./quality.db
CQO_MAX_HISTORY_DAYS=30
```

### Command Line Flags

Most command line flags are handled through npm scripts. Use:

- `npm run sidequest:watch` - Real-time watch mode
- `npm run sidequest:watch:eslint` - Include ESLint violations
- `npm run sidequest:watch:strict` - Strict mode analysis
- `npm run sidequest:report` - JSON output format
- `npm run sidequest:session:reset` - Reset session baseline
- `npm run sidequest:debug:terminal` - Debug color detection

## 📈 Performance

- **Watch Cycle**: < 300ms typical execution time
- **Memory Usage**: < 50MB for large codebases
- **Database**: SQLite with WAL mode for concurrent access
- **Cache Hit Rate**: > 90% for violation tracking

## 🎯 Supported Violations

### TypeScript

- Type aliases and annotations
- Generic constraints
- Unknown type usage
- Branded types
- Type casting

### ESLint

- Code quality rules
- Style violations
- Architecture issues
- Modernization opportunities
- Unused variables

## 🐛 Troubleshooting

### Common Command Issues

```bash
# ❌ Don't use (will fail)
npm sidequest:watch
npm run sidequest --watch

# ✅ Use these instead
npm run sidequest:watch
npm run sidequest:report
```

### Setup Issues

**Setup running every time?**

This should NOT happen with the new smart detection. If it does:

```bash
# Check if preferences exist
ls ~/.sidequest-cqo/user-preferences.json

# Check if database exists
ls ./data/

# Reset corrupted preferences
npm run sidequest:config:reset

# For automation (always skips setup)
npm run sidequest:report
```

**Smart Setup Logic:**

- ✅ **First time ever**: Shows setup (no preferences, no database)
- ✅ **Setup completed**: Never shows again (`hasCompletedFirstRun: true`)
- ✅ **Database exists**: Skips setup (assumes existing user)
- ✅ **Automation mode**: `sidequest:report*` always skips setup

### Color Issues

**Colors look wrong or unreadable?**

```bash
# Auto-detect colors (default)
npm run sidequest:watch

# Debug automatic detection
npm run sidequest:debug:terminal
```

### Performance Issues

**Analysis taking too long?**

```bash
# Reduce scope to specific folder
npm run sidequest:analyze -- --path src/specific-folder

# Use TypeScript-only mode (faster)
npm run sidequest:analyze
```

### For LLMs/Automation

**Need clean JSON output?**

```bash
# Use report commands - no interactive prompts
npm run sidequest:report             # TypeScript only
npm run sidequest:precommit           # Clean CI/pre-commit validation
npm run sidequest:report:strict      # Strict mode
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style

- TypeScript strict mode
- No `any` types allowed
- Comprehensive error handling
- JSDoc for public APIs

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ for developers who care about code quality.
