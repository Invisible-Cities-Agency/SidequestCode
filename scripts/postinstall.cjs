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
  log(`🔍 Environment: ${process.env.npm_config_user_agent || 'unknown'}`);
  
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
        log(`📦 Found package: ${pkg.name || 'unnamed'}`);
        
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
  if (process.env.npm_config_user_agent) {
    const agent = process.env.npm_config_user_agent;
    if (agent.includes("pnpm")) return "pnpm";
    if (agent.includes("yarn")) return "yarn";
    if (agent.includes("bun")) return "bun";
  }
  return "npm";
}

try {
  log(`🚀 SideQuest CQO postinstall started`);
  log(`📍 Working directory: ${process.cwd()}`);
  log(`🔍 Process args: ${process.argv.join(' ')}`);
  
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
      "sidequest:report": "sidequest-cqo --verbose",
      "sidequest:watch": "sidequest-cqo --watch",
      "sidequest:config": "sidequest-cqo --config",
      "sidequest:help": "sidequest-cqo --help",
    };

    log(`📦 Existing scripts: ${Object.keys(pkg.scripts).join(', ')}`);

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
      const backupPath = pkgPath + '.sidequest-backup';
      fs.writeFileSync(backupPath, pkgContent);
      log(`💾 Created backup: ${backupPath}`);
      
      // Write updated package.json
      const updatedContent = JSON.stringify(pkg, null, 2);
      fs.writeFileSync(pkgPath, updatedContent);
      
      // Verify the write succeeded
      const verifyContent = fs.readFileSync(pkgPath, "utf8");
      const verifyPkg = JSON.parse(verifyContent);
      const hasAllScripts = Object.keys(scripts).every(name => verifyPkg.scripts[name]);
      
      log(`✅ Verification: All scripts present = ${hasAllScripts}`);
      log(`📦 Final scripts: ${Object.keys(verifyPkg.scripts).join(', ')}`);
      
      console.log(
        `\n📦 SideQuest CQO installed!\n✅ Added scripts: ${added.join(", ")}`,
      );
      console.log(
        `\n🚀 Quick start:\n   ${runCmd} sidequest:report\n   ${runCmd} sidequest:watch\n`,
      );
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
