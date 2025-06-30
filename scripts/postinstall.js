#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function findPackageJson() {
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
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (
          pkg.name &&
          !pkg.name.includes("sidequest-cqo") &&
          (pkg.dependencies || pkg.devDependencies)
        ) {
          return pkgPath;
        }
      } catch (e) {
        // Skip invalid package.json files
      }
    }
    current = path.dirname(current);
  }

  // Try possible paths as fallback
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
        if (pkg.name && !pkg.name.includes("sidequest-cqo")) {
          return p;
        }
      } catch (e) {
        // Skip invalid package.json files
      }
    }
  }

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
  const pkgPath = findPackageJson();

  if (pkgPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (!pkg.scripts) pkg.scripts = {};

    const pm = detectPackageManager();
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

    let added = [];
    Object.entries(scripts).forEach(([name, cmd]) => {
      if (!pkg.scripts[name]) {
        pkg.scripts[name] = cmd;
        added.push(name);
      }
    });

    if (added.length > 0) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log(
        `\n📦 SideQuest CQO installed!\n✅ Added scripts: ${added.join(", ")}`,
      );
      console.log(
        `\n🚀 Quick start:\n   ${runCmd} sidequest:report\n   ${runCmd} sidequest:watch\n`,
      );
    } else {
      console.log("\n📦 SideQuest CQO installed! Scripts already exist.\n");
    }
  } else {
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
  }
} catch (e) {
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
}
