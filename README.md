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
```

> **Note for LLMs**: Use `sidequest:report*` commands - they provide clean JSON output without interactive prompts or watch modes that LLMs cannot handle.

### 👨‍💻 For Human Developers (Interactive & Visual)

```bash
# Real-time monitoring (most common for humans)
npm run sidequest:start              # Auto-detected colors
npm run sidequest:watch:dark         # Force dark theme
npm run sidequest:watch:light        # Force light theme
npm run sidequest:watch:eslint       # Include ESLint analysis

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

# Project insights
npm run sidequest:burndown           # Historical trends
npm run sidequest:prd                # Generate PRD for task management

# Debugging & troubleshooting
npm run sidequest:debug:terminal     # Fix color issues
npm run sidequest:session:reset      # Fresh start
```

## ✨ Features

- **🎯 Configuration-Agnostic** - Uses your exact `tsconfig.json` and `.eslintrc` without imposing opinions
- **🚀 Interactive First-Run Setup** - Friendly onboarding that teaches best practices
- **🔧 Separation of Concerns Guidance** - Helps avoid TypeScript/ESLint rule overlap
- **👁️ Real-time Monitoring** - Live watch mode with smooth, non-scrolling updates
- **🎨 Intelligent Terminal Detection** - Automatic light/dark mode detection using OSC escape sequences
- **📊 Advanced Violation Tracking** - SQLite persistence with historical analysis and configuration caching
- **⚙️ User Preferences System** - Customizable defaults and behavior with `--config` management
- **📋 PRD Generation** - Creates task-master compatible PRD files for automated project planning
- **⚡ Performance Optimized** - Sub-second response times with smart caching and database optimization
- **📂 Flexible Data Storage** - Project-scoped or global data directory options

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
# Install globally
npm install -g @sidequest/code-quality-orchestrator

# Or run directly with npx
npx @sidequest/code-quality-orchestrator --help

# First run triggers interactive setup
sidequest --watch

# Skip setup for quick runs
sidequest --watch

# Configuration management
sidequest --config              # Show current preferences
sidequest --config edit         # Edit preferences file
sidequest --config reset        # Reset to defaults

# Analysis modes
sidequest --watch               # TypeScript compilation checking (default)
sidequest --watch --include-eslint  # Add ESLint analysis (optional)
sidequest --include-any         # Include 'any' pattern checking (optional)

# Terminal themes
sidequest --watch --color-scheme auto   # Auto-detect (default)
sidequest --watch --color-scheme dark   # Force dark theme
sidequest --watch --color-scheme light  # Force light theme

# Output formats
sidequest --verbose             # Detailed JSON output
sidequest --prd                 # Generate PRD for task management
sidequest --burndown            # Show historical trends
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
sidequest --watch                   # TypeScript compilation checking (default)
sidequest --watch --include-eslint  # Add ESLint analysis (optional)
sidequest --include-any             # Include 'any' pattern checking (optional)
sidequest --path <dir>              # Target directory (default: app)
```

### Configuration Management

```bash
sidequest --config                  # Show current preferences
sidequest --config edit             # Edit preferences file
sidequest --config reset            # Reset to defaults
# Setup is now automatically detected - no manual flags needed!
```

### Terminal & Display

```bash
sidequest --color-scheme auto        # Auto-detect (default)
sidequest --color-scheme light       # Light terminals (Novel/Man Page)
sidequest --color-scheme dark        # Dark terminals (Pro theme)
sidequest --verbose                  # Detailed JSON output format
```

### Advanced Features

```bash
sidequest --burndown                 # Show historical violation trends
sidequest --prd                      # Generate PRD file for task master
sidequest --data-dir <dir>           # Custom database directory
sidequest --debug-terminal           # Debug color detection
sidequest --reset-session            # Reset session baseline
```

### Examples

```bash
# First run with interactive setup
sidequest --watch

# TypeScript-only analysis (recommended)
sidequest --watch --color-scheme auto

# Full analysis with ESLint (optional)
sidequest --watch --include-eslint --include-any

# One-time analysis with custom path
sidequest --include-eslint --path src

# Generate PRD for Claude Task Master
sidequest --prd --path ./src

# Project-scoped data directory
sidequest --data-dir ./project-quality --watch

# Debug color issues
sidequest --debug-terminal
sidequest --data-dir ~/.cqo-data --verbose

# Debug terminal color detection
sidequest --debug-terminal

# Show historical trends
sidequest --burndown
```

## 📋 PRD Generation for Task Management

SideQuest can generate comprehensive Product Requirements Documents (PRDs) for automatic task breakdown and project planning.

### Claude Task Master Integration

Generate PRD files optimized for [Claude Task Master](https://github.com/eyaltoledano/claude-task-master):

```bash
# Generate PRD in project root
sidequest --prd

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

1. **Analysis**: `sidequest --watch` to identify all code quality issues
2. **PRD Generation**: `sidequest --prd` to create structured requirements document
3. **Task Master**: Import `CODE_QUALITY_PRD.md` for automatic task breakdown
4. **Implementation**: Follow generated project plan with priorities
5. **Validation**: `sidequest --verbose` to verify improvements

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

- `--watch` - Enable real-time watch mode
- `--include-eslint` - Include ESLint violations
- `--include-any` - Include TypeScript 'any' violations
- `--path <dir>` - Target directory (default: app)
- `--color-scheme <mode>` - Color mode: auto, light, dark
- `--json` - JSON output format
- `--burndown` - Show burndown analysis
- `--reset-session` - Reset session baseline
- `--debug-terminal` - Debug color detection

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
npm sidequest:start
npm run sidequest --watch

# ✅ Use these instead
npm run sidequest:start
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
# Force dark mode (for black terminals)
npm run sidequest:watch:dark

# Force light mode (for white terminals)
npm run sidequest:watch:light

# Debug automatic detection
npm run sidequest:debug:terminal
```

### Performance Issues

**Analysis taking too long?**

```bash
# Check performance with debug info
npm run sidequest:debug:verbose

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
