# Code Quality Orchestrator

A sophisticated TypeScript/ESLint monitoring system with real-time watch mode, intelligent terminal color detection, and comprehensive violation tracking.

## ✨ Features

- **Real-time Monitoring** - Live watch mode with smooth, non-scrolling updates
- **Intelligent Terminal Detection** - Automatic light/dark mode detection using OSC escape sequences
- **Advanced Violation Tracking** - SQLite persistence with historical analysis
- **Developer-Focused Display** - Clean metrics showing session progress and daily trends
- **Comprehensive CLI** - Extensive command-line interface with multiple analysis modes
- **Performance Optimized** - Sub-second response times with smart caching

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start watching with auto-detected colors
npm run :watch

# Force dark mode for black terminals
npm run watch:dark

# Force light mode for white terminals  
npm run watch:light

# Include ESLint analysis
npm run watch:enhanced

# One-time analysis
npx tsx cli.ts --include-eslint
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

### Watch Mode
```bash
npm run :watch           # Auto-detected colors
npm run watch:light      # Light terminals (Novel/Man Page)
npm run watch:dark       # Dark terminals (Pro theme)
npm run watch:enhanced   # Include ESLint analysis
```

### Analysis Options
```bash
--include-eslint         # Include ESLint violations
--include-any            # Include TypeScript 'any' violations  
--path <dir>             # Target directory (default: app)
--color-scheme <mode>    # Color mode: auto, light, dark
```

### Output Options
```bash
--json                   # JSON output format
--burndown               # Show burndown analysis
```

### Examples
```bash
# Watch with auto-detected colors
npm run :watch

# One-time analysis with ESLint
npx tsx cli.ts --include-eslint --path src

# Debug terminal color detection
npx tsx cli.ts --debug-terminal

# Show historical trends
npm run burndown
```

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

### Color Issues
If colors appear wrong:
```bash
# Force dark mode
npm run watch:dark

# Force light mode  
npm run watch:light

# Debug detection
npx tsx cli.ts --debug-terminal
```

### Performance Issues
```bash
# Check watch cycle performance
npm run :watch --debug

# Reduce target scope
npx tsx cli.ts --path specific/folder
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

## 🙏 Acknowledgments

- Terminal color detection inspired by modern terminal capabilities
- Architecture patterns from production monitoring systems
- Community feedback from TypeScript and Node.js developers

---

Built with ❤️ for developers who care about code quality.