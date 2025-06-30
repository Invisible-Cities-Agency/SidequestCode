#!/bin/bash
# SideQuest CQO - Shortcut Installation Script
# For pnpm users who need to manually install package.json shortcuts

echo "🚀 SideQuest CQO - Installing Shortcuts"
echo "======================================="

# Detect package manager
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
    echo "📦 Detected: pnpm"
elif command -v yarn &> /dev/null; then
    PKG_MANAGER="yarn"
    echo "📦 Detected: yarn"
elif command -v bun &> /dev/null; then
    PKG_MANAGER="bun"
    echo "📦 Detected: bun"
else
    PKG_MANAGER="npm"
    echo "📦 Detected: npm"
fi

echo ""
echo "🔧 Running shortcut installation..."

# Run the install shortcuts command
if npx sidequest-cqo --install-shortcuts; then
    echo ""
    echo "✅ SUCCESS! Shortcuts installed."
    echo ""
    echo "🎉 You can now use:"
    case $PKG_MANAGER in
        "pnpm")
            echo "   pnpm sidequest:watch      # ✅ Direct command (no 'run' needed!)"
            echo "   pnpm sidequest:report     # ✅ Direct command"
            echo "   pnpm sidequest:help       # ✅ Direct command"
            ;;
        "yarn")
            echo "   yarn sidequest:watch      # ✅ Direct command (no 'run' needed!)"
            echo "   yarn sidequest:report     # ✅ Direct command"  
            echo "   yarn sidequest:help       # ✅ Direct command"
            ;;
        "bun")
            echo "   bun run sidequest:watch"
            echo "   bun run sidequest:report"
            echo "   bun run sidequest:help"
            ;;
        *)
            echo "   npm run sidequest:watch"
            echo "   npm run sidequest:report"
            echo "   npm run sidequest:help"
            ;;
    esac
    echo ""
    case $PKG_MANAGER in
        "pnpm")
            echo "🚀 Quick start: pnpm sidequest:watch"
            ;;
        "yarn") 
            echo "🚀 Quick start: yarn sidequest:watch"
            ;;
        *)
            echo "🚀 Quick start: ${PKG_MANAGER} run sidequest:watch"
            ;;
    esac
else
    echo ""
    echo "❌ Installation failed. You can add shortcuts manually:"
    echo ""
    echo 'Add to your package.json:'
    echo '{'
    echo '  "scripts": {'
    echo '    "sidequest:report": "sidequest-cqo --verbose",'
    echo '    "sidequest:watch": "sidequest-cqo --watch",'
    echo '    "sidequest:config": "sidequest-cqo --config",'
    echo '    "sidequest:help": "sidequest-cqo --help"'
    echo '  }'
    echo '}'
fi