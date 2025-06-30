# pnpm Installation Guide

Due to pnpm's lifecycle timing, the automatic postinstall script may not add shortcuts to your package.json. Here are the solutions:

## Option 1: Manual Script Installation (Recommended)

After installing the package, run:

```bash
# For pnpm users - run this after installing @invisiblecities/sidequest-cqo
npx sidequest-cqo --install-shortcuts

# This adds shortcuts so you can use direct commands (no "run" needed!):
pnpm sidequest:watch     # ✅ Direct command
pnpm sidequest:report    # ✅ Direct command  
pnpm sidequest:help      # ✅ Direct command
```

## Option 2: Manual Package.json Addition

Add these scripts to your package.json manually:

```json
{
  "scripts": {
    "sidequest:report": "sidequest-cqo --verbose",
    "sidequest:watch": "sidequest-cqo --watch",
    "sidequest:config": "sidequest-cqo --config",
    "sidequest:help": "sidequest-cqo --help"
  }
}
```

## Why This Happens

pnpm executes postinstall scripts **before** writing the final package.json, causing any modifications to be overwritten. This is a known pnpm timing issue affecting packages that modify package.json during installation.

## Verification

Check if shortcuts were added:

```bash
# Should show sidequest commands
pnpm run | grep sidequest

# Test a command
pnpm run sidequest:help
```

## Alternative Usage

You can always use the package directly without shortcuts:

```bash
# Without shortcuts
npx sidequest-cqo --verbose
npx sidequest-cqo --watch

# With shortcuts (after installation)
pnpm run sidequest:report
pnpm run sidequest:watch
```
