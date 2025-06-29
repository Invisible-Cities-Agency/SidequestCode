#!/bin/bash

# Code Quality Orchestrator Installation Script
# Supports both global and local installation

set -e

echo "🚀 Code Quality Orchestrator Installer"
echo "======================================"

# Check if we're in a project directory
if [ -f "package.json" ]; then
    echo "📦 Detected package.json - offering project installation options"
    INSTALL_TYPE=""
    
    echo ""
    echo "Installation options:"
    echo "1) Global installation (available system-wide as 'code-quality')"
    echo "2) Local project installation (available via 'pnpm code-quality')" 
    echo "3) Symlink current development version globally"
    echo ""
    
    read -p "Choose installation type (1-3): " choice
    
    case $choice in
        1)
            INSTALL_TYPE="global"
            ;;
        2)
            INSTALL_TYPE="local"
            ;;
        3)
            INSTALL_TYPE="symlink"
            ;;
        *)
            echo "❌ Invalid choice. Exiting."
            exit 1
            ;;
    esac
else
    echo "📁 No package.json found - installing globally"
    INSTALL_TYPE="global"
fi

echo ""

case $INSTALL_TYPE in
    "global")
        echo "🌍 Installing Code Quality Orchestrator globally..."
        
        # Check if we have the package files locally
        if [ -f "package.json" ] && [ -f "cli.ts" ]; then
            echo "📦 Building package from current directory..."
            npm pack
            PKG_FILE=$(ls *.tgz | head -1)
            npm install -g "$PKG_FILE"
            rm "$PKG_FILE"
        else
            echo "📥 Installing from npm registry..."
            npm install -g @stepsaway/code-quality-orchestrator
        fi
        
        echo "✅ Global installation complete!"
        echo "Usage: code-quality --help"
        ;;
        
    "local")
        echo "📁 Installing Code Quality Orchestrator locally..."
        
        # Add to package.json if scripts don't exist
        if ! grep -q "code-quality" package.json; then
            echo "📝 Adding scripts to package.json..."
            
            # Backup package.json
            cp package.json package.json.backup
            
            # Use node to add scripts safely
            node -e "
                const fs = require('fs');
                const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                
                pkg.scripts = pkg.scripts || {};
                pkg.scripts['code-quality'] = 'npx tsx scripts/build/code-quality-orchestrator/cli.ts';
                pkg.scripts['code-quality:eslint'] = 'npx tsx scripts/build/code-quality-orchestrator/cli.ts --include-eslint';
                pkg.scripts['code-quality:watch'] = 'npx tsx scripts/build/code-quality-orchestrator/cli.ts --watch --include-eslint';
                pkg.scripts['code-quality:json'] = 'npx tsx scripts/build/code-quality-orchestrator/cli.ts --include-eslint --json';
                pkg.scripts['code-quality:help'] = 'npx tsx scripts/build/code-quality-orchestrator/cli.ts --help';
                
                fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
            "
            
            echo "✅ Scripts added to package.json"
        else
            echo "ℹ️  Scripts already exist in package.json"
        fi
        
        echo "✅ Local installation complete!"
        echo "Usage: pnpm code-quality --help"
        ;;
        
    "symlink")
        echo "🔗 Creating global symlink to development version..."
        
        # Make sure we're in the right directory
        if [ ! -f "cli.ts" ]; then
            echo "❌ cli.ts not found. Make sure you're in the code-quality-orchestrator directory."
            exit 1
        fi
        
        # Create symlink
        npm link
        
        echo "✅ Development symlink created!"
        echo "Usage: code-quality --help"
        echo "Note: This links to your development version. Changes will be reflected immediately."
        ;;
esac

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "  • Run 'code-quality --help' to see all options"
echo "  • Try 'code-quality --include-eslint' for full analysis"  
echo "  • Use 'code-quality --watch --include-eslint' for real-time monitoring"
echo ""
echo "For more information, see: https://github.com/stepsaway/code-quality-orchestrator"