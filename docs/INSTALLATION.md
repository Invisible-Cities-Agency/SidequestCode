# Installation and Data Directory Behavior

## Overview

The Code Quality Orchestrator creates a local SQLite database to store violation history, analytics, and performance metrics. This document explains the data directory behavior and provides installation recommendations.

## Default Behavior

By default, the application creates a `./data/` directory in the **current working directory** where the CLI is run:

```bash
# If you run the CLI from /home/user/my-project/
npx sidequest

# Creates: /home/user/my-project/data/code-quality.db
```

## Data Directory Control

### Environment Variable (Global)
```bash
export CQO_DB_PATH="/path/to/custom/database.db"
npx sidequest
```

### CLI Flag (Per-run)
```bash
# Project-scoped storage
npx sidequest --data-dir ./project-data

# Global user storage
npx sidequest --data-dir ~/.cqo-data

# Temporary analysis
npx sidequest --data-dir /tmp/cqo-analysis
```

## Installation Modes

### 1. Project Mode (Recommended for most users)
Store data alongside your project for project-specific analytics:

```bash
# In your project directory
cd /path/to/your/project
npx sidequest --watch
# Creates: ./data/code-quality.db
```

**Benefits:**
- Project-specific violation history
- Analytics tied to specific codebase
- Easy to `.gitignore` if needed
- Natural cleanup when project is removed

### 2. Global Mode (For cross-project analysis)
Store data in a central location for analyzing multiple projects:

```bash
# Set up global data directory
export CQO_DB_PATH="$HOME/.cqo-data/code-quality.db"

# Or use CLI flag
npx sidequest --data-dir ~/.cqo-data --watch
```

**Benefits:**
- Cross-project trend analysis
- Centralized violation database
- Useful for consultants analyzing multiple codebases

### 3. CI/CD Mode (Temporary analysis)
Use temporary storage for build systems:

```bash
npx sidequest --data-dir /tmp/cqo-ci --json
```

**Benefits:**
- No persistent storage
- Clean environment for each run
- Suitable for build pipelines

## File Structure

The application creates these files in the data directory:

```
data/
├── code-quality.db          # Main SQLite database
├── code-quality.db-wal      # Write-Ahead Log (WAL mode)
└── code-quality.db-shm      # Shared memory file (WAL mode)
```

## Configuration Examples

### Project .gitignore
```gitignore
# Code Quality Orchestrator data
/data/
*.db-wal
*.db-shm
```

### Package.json Scripts
```json
{
  "scripts": {
    "quality:watch": "sidequest --watch",
    "quality:global": "sidequest --data-dir ~/.cqo-data --watch",
    "quality:temp": "sidequest --data-dir /tmp/cqo --verbose"
  }
}
```

### Global Configuration
```bash
# In your shell profile (.bashrc, .zshrc, etc.)
export CQO_DB_PATH="$HOME/.cqo-data/code-quality.db"
alias cqo-global="sidequest --data-dir ~/.cqo-data"
```

## Clean Installation

The application follows these principles:

✅ **CLEAN:** Only creates directories explicitly specified  
✅ **SAFE:** Uses relative paths by default (./data/)  
✅ **CONFIGURABLE:** Multiple options to control location  
✅ **PREDICTABLE:** Clear documentation of file creation  
✅ **RESPECTFUL:** No global files without explicit permission  

❌ **AVOIDS:** Creating files in unexpected system locations  
❌ **AVOIDS:** Polluting user home directory by default  
❌ **AVOIDS:** Hidden configuration files without consent  

## Troubleshooting

### Permission Issues
```bash
# If permission denied, check directory permissions
ls -la $(dirname ~/.cqo-data)

# Create directory first if needed
mkdir -p ~/.cqo-data
```

### Database Corruption
```bash
# Remove corrupted database (will recreate)
rm -rf ./data/

# Or for global database
rm -rf ~/.cqo-data/
```

### Disk Space
```bash
# Check database size
du -h ./data/code-quality.db

# Clean old data (keeps last 30 days by default)
npx sidequest --maintenance
```

## Security Considerations

- Database files contain code analysis results only
- No sensitive credentials or secrets are stored
- SQLite files are local-only (no network transmission)
- WAL mode provides better concurrency and crash recovery
- Database is optimized with performance pragmas