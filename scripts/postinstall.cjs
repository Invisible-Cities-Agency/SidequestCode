#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Create a log file for debugging real-world installations
const logPath = path.join(require("os").tmpdir(), "sidequest-postinstall.log");

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;

  try {
    fs.appendFileSync(logPath, logMessage);
  } catch (e) {
    // Ignore logging errors - don't want to break installation
  }

  console.log(message);
}

function findPackageJson() {
  log(`🔍 Starting package.json search from: ${process.cwd()}`);
  log(`🔍 Environment: ${process.env.npm_config_user_agent || "unknown"}`);

  // Try common paths first
  const possiblePaths = [
    path.join(process.cwd(), "../../../package.json"),
    path.join(process.cwd(), "../../../../package.json"),
    path.join(process.cwd(), "../../package.json"),
    path.join(process.cwd(), "../package.json"),
    path.join(process.cwd(), "package.json"),
  ];

  // Walk up directory tree
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, "package.json");
    log(`🔍 Checking: ${pkgPath}`);

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        log(`📦 Found package: ${pkg.name || "unnamed"}`);

        if (
          pkg.name &&
          !pkg.name.includes("sidequest-cqo") &&
          (pkg.dependencies || pkg.devDependencies)
        ) {
          log(`✅ Selected target package.json: ${pkgPath}`);
          return pkgPath;
        }
      } catch (e) {
        log(`⚠️ Invalid package.json: ${e.message}`);
      }
    }
    current = path.dirname(current);
  }

  // Try possible paths as fallback
  log(`🔍 Trying fallback paths...`);
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
        if (pkg.name && !pkg.name.includes("sidequest-cqo")) {
          log(`✅ Found fallback package.json: ${p}`);
          return p;
        }
      } catch (e) {
        log(`⚠️ Invalid fallback package.json: ${e.message}`);
      }
    }
  }

  log(`❌ No suitable package.json found`);
  return null;
}

function detectPackageManager() {
  // Check environment variable first (most reliable)
  if (process.env.npm_config_user_agent) {
    const agent = process.env.npm_config_user_agent;
    if (agent.includes("pnpm")) return "pnpm";
    if (agent.includes("yarn")) return "yarn";
    if (agent.includes("bun")) return "bun";
  }

  // Fallback: check for lock files in current directory and parent directories
  const fs = require("fs");
  const path = require("path");

  let currentDir = process.cwd();

  // Walk up to find package manager lock files
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(currentDir, "yarn.lock"))) {
      return "yarn";
    }
    if (fs.existsSync(path.join(currentDir, "bun.lockb"))) {
      return "bun";
    }
    currentDir = path.dirname(currentDir);
  }

  return "npm";
}

function isPnpmProject() {
  const pm = detectPackageManager();
  log(`🔍 Detected package manager: ${pm}`);
  return pm === "pnpm";
}

function getBoxedMessage() {
  const border = "═".repeat(62);
  const nextCommand = "npx sidequest-cqo --install-shortcuts";

  return `
╔${border}╗
║                    🚀 PNPM USERS: ONE MORE STEP!                    ║
╠${border}╣
║  pnpm timing requires manual shortcut installation.                 ║
║                                                                     ║
║  📋 COPY & RUN THIS COMMAND:                                        ║
║                                                                     ║
║      ${nextCommand}                     ║
║                                                                     ║
║  ✅ Then use direct commands (no "run" needed!):                    ║
║      pnpm sidequest:watch                                           ║
║      pnpm sidequest:report                                          ║
║                                                                     ║
║  💡 Only needed once per project                                    ║
║  📖 Full guide: docs/PNPM-INSTALL.md                               ║
╚${border}╝

💬 pnpm 10+ blocks postinstall by default - this is normal!
`;
}

try {
  log(`🚀 SideQuest CQO postinstall started`);
  log(`📍 Working directory: ${process.cwd()}`);
  log(`🔍 Process args: ${process.argv.join(" ")}`);

  const pkgPath = findPackageJson();

  if (pkgPath) {
    log(`📦 Processing package.json: ${pkgPath}`);

    const pkgContent = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent);

    log(`📦 Original package name: ${pkg.name}`);
    log(`📦 Has scripts section: ${!!pkg.scripts}`);

    if (!pkg.scripts) pkg.scripts = {};

    const pm = detectPackageManager();
    log(`📦 Detected package manager: ${pm}`);

    const runCmd =
      pm === "npm"
        ? "npm run"
        : pm === "yarn"
          ? "yarn"
          : pm === "bun"
            ? "bun run"
            : `${pm} run`;

    const scripts = {
      "sidequest:report":
        'if [ "$VERCEL" != "1" ]; then sidequest-cqo --verbose; else echo \'Skipping Sidequest (a node dev tool) in the Vercel environment\'; fi',
      "sidequest:watch":
        'if [ "$VERCEL" != "1" ]; then sidequest-cqo --watch; else echo \'Skipping Sidequest (a node dev tool) in the Vercel environment\'; fi',
      "sidequest:config":
        'if [ "$VERCEL" != "1" ]; then sidequest-cqo --config; else echo \'Skipping Sidequest (a node dev tool) in the Vercel environment\'; fi',
      "sidequest:help":
        'if [ "$VERCEL" != "1" ]; then sidequest-cqo --help; else echo \'Skipping Sidequest (a node dev tool) in the Vercel environment\'; fi',
      "sidequest:ai-context":
        'if [ "$VERCEL" != "1" ]; then sidequest-cqo --ai-context; else echo \'Skipping Sidequest (a node dev tool) in the Vercel environment\'; fi',
    };

    log(`📦 Existing scripts: ${Object.keys(pkg.scripts).join(", ")}`);

    let added = [];
    Object.entries(scripts).forEach(([name, cmd]) => {
      if (!pkg.scripts[name]) {
        pkg.scripts[name] = cmd;
        added.push(name);
        log(`✅ Added script: ${name} = ${cmd}`);
      } else {
        log(`⚠️ Script already exists: ${name}`);
      }
    });

    if (added.length > 0) {
      log(`💾 Writing updated package.json with ${added.length} new scripts`);

      // Create backup
      const backupPath = pkgPath + ".sidequest-backup";
      fs.writeFileSync(backupPath, pkgContent);
      log(`💾 Created backup: ${backupPath}`);

      // Write updated package.json preserving formatting style
      // Read original to detect indentation style
      const originalLines = pkgContent.split("\n");
      const indentMatch = originalLines.find((line) => line.match(/^[ ]+"/));
      const indentSize = indentMatch ? indentMatch.match(/^( +)/)[1].length : 2;

      const updatedContent = JSON.stringify(pkg, null, indentSize);
      fs.writeFileSync(pkgPath, updatedContent);

      // Also write with delay to survive formatter overwrites
      setTimeout(() => {
        try {
          const recheckContent = fs.readFileSync(pkgPath, "utf8");
          const recheckPkg = JSON.parse(recheckContent);
          const hasAllScripts = Object.keys(scripts).every(
            (name) => recheckPkg.scripts[name],
          );

          if (!hasAllScripts) {
            log(`⚠️ Scripts were overwritten by formatter, re-adding...`);
            Object.entries(scripts).forEach(([name, cmd]) => {
              if (!recheckPkg.scripts[name]) {
                recheckPkg.scripts[name] = cmd;
              }
            });
            fs.writeFileSync(
              pkgPath,
              JSON.stringify(recheckPkg, null, indentSize),
            );
            log(`✅ Re-added scripts after formatter conflict`);
          }
        } catch (e) {
          log(`⚠️ Could not recheck/fix scripts: ${e.message}`);
        }
      }, 100);

      // Verify the write succeeded
      const verifyContent = fs.readFileSync(pkgPath, "utf8");
      const verifyPkg = JSON.parse(verifyContent);
      const hasAllScripts = Object.keys(scripts).every(
        (name) => verifyPkg.scripts[name],
      );

      log(`✅ Verification: All scripts present = ${hasAllScripts}`);
      log(`📦 Final scripts: ${Object.keys(verifyPkg.scripts).join(", ")}`);

      console.log(
        `\n📦 SideQuest CQO installed!\n✅ Added scripts: ${added.join(", ")}`,
      );

      // Show appropriate quick start based on package manager
      if (pm === "pnpm") {
        console.log(
          `\n🚀 Quick start:\n   pnpm sidequest:watch\n   pnpm sidequest:report\n`,
        );
      } else {
        console.log(
          `\n🚀 Quick start:\n   ${runCmd} sidequest:report\n   ${runCmd} sidequest:watch\n`,
        );
      }
      console.log(`\n🔍 Debug log: ${logPath}`);
    } else {
      log(`ℹ️ All scripts already exist, no changes needed`);
      console.log("\n📦 SideQuest CQO installed! Scripts already exist.\n");
    }
  } else {
    log(`❌ No package.json found, providing fallback instructions`);
    const pm = detectPackageManager();
    const execCmd =
      pm === "npm"
        ? "npx"
        : pm === "yarn"
          ? "yarn dlx"
          : pm === "bun"
            ? "bunx"
            : `${pm}x`;
    console.log(
      `\n📦 SideQuest CQO installed!\n💡 Use: ${execCmd} sidequest-cqo --help\n`,
    );
    console.log(`\n🔍 Debug log: ${logPath}`);
  }

  // Only show pnpm-specific messaging for pnpm projects
  if (isPnpmProject()) {
    console.log(`\n${getBoxedMessage()}`);

    // Write a local file with the next command for easy access
    try {
      const nextCommand = "npx sidequest-cqo --install-shortcuts";
      const helpFile = `# SideQuest CQO - Next Steps

## For pnpm users, run this command to add shortcuts:

\`\`\`bash
${nextCommand}
\`\`\`

## This will add these shortcuts to your package.json:

- \`pnpm sidequest:report\` - TypeScript analysis (JSON output)
- \`pnpm sidequest:watch\` - Real-time watch mode  
- \`pnpm sidequest:config\` - Configuration management
- \`pnpm sidequest:help\` - Show help
- \`pnpm sidequest:ai-context\` - LLM context & guidance

## Quick start after setup (no "run" needed!):
\`\`\`bash
pnpm sidequest:watch        # ✅ Direct command
pnpm sidequest:report       # ✅ Direct command  
pnpm sidequest:help         # ✅ Direct command
pnpm sidequest:ai-context   # ✅ Direct command
\`\`\`

## Why this is needed:
pnpm 10+ blocks postinstall scripts by default for security. This is normal behavior.

Generated: ${new Date().toISOString()}
`;

      fs.writeFileSync("SIDEQUEST-NEXT-STEPS.md", helpFile);
      log(`📄 Created SIDEQUEST-NEXT-STEPS.md with copy-paste commands`);
      console.log(
        `\n📄 Created: ./SIDEQUEST-NEXT-STEPS.md (contains copy-paste commands)`,
      );
    } catch (e) {
      log(`⚠️ Could not create help file: ${e.message}`);
    }
  } else {
    // For non-pnpm users, show simpler success message
    const pm = detectPackageManager();
    const runCmd = pm === "yarn" ? "yarn" : `${pm} run`;
    console.log(`\n✅ SideQuest CQO ready! Try: ${runCmd} sidequest:watch`);
  }

  log(`✅ Postinstall completed successfully`);
} catch (e) {
  log(`❌ Error in postinstall: ${e.message}`);
  log(`❌ Stack trace: ${e.stack}`);

  const pm = detectPackageManager();
  const execCmd =
    pm === "npm"
      ? "npx"
      : pm === "yarn"
        ? "yarn dlx"
        : pm === "bun"
          ? "bunx"
          : `${pm}x`;
  console.log(
    `\n📦 SideQuest CQO installed!\n💡 Use: ${execCmd} sidequest-cqo --help\n`,
  );
  console.log(`\n🔍 Debug log: ${logPath}`);
}
