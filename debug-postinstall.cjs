#!/usr/bin/env node

// Debug version of postinstall script with verbose logging

const fs = require("node:fs");
const path = require("node:path");

console.log("🔍 Debug: Starting postinstall script...");
console.log("🔍 Debug: Current working directory:", process.cwd());
console.log("🔍 Debug: Process argv:", process.argv);
console.log("🔍 Debug: Environment variables:");
console.log(
  "  - npm_config_user_agent:",
  process.env.npm_config_user_agent || "undefined",
);
console.log("  - npm_command:", process.env.npm_command || "undefined");
console.log(
  "  - npm_lifecycle_event:",
  process.env.npm_lifecycle_event || "undefined",
);

function findPackageJson() {
  console.log("🔍 Debug: Searching for package.json...");

  // Try common paths first
  const possiblePaths = [
    path.join(process.cwd(), "../../../package.json"),
    path.join(process.cwd(), "../../../../package.json"),
    path.join(process.cwd(), "../../package.json"),
    path.join(process.cwd(), "../package.json"),
    path.join(process.cwd(), "package.json"),
  ];

  console.log("🔍 Debug: Trying possible paths:", possiblePaths);

  // Walk up directory tree
  let current = process.cwd();
  console.log("🔍 Debug: Walking up directory tree starting from:", current);

  while (current !== path.dirname(current)) {
    const packagePath = path.join(current, "package.json");
    console.log("🔍 Debug: Checking:", packagePath);

    if (fs.existsSync(packagePath)) {
      console.log("🔍 Debug: Found package.json at:", packagePath);

      try {
        const package_ = JSON.parse(fs.readFileSync(packagePath, "utf8"));
        console.log("🔍 Debug: Package name:", package_.name);
        console.log(
          "🔍 Debug: Has dependencies:",
          !!(package_.dependencies || package_.devDependencies),
        );
        console.log(
          "🔍 Debug: Contains sidequest-cqo:",
          package_.name && package_.name.includes("sidequest-cqo"),
        );

        if (
          package_.name &&
          !package_.name.includes("sidequest-cqo") &&
          (package_.dependencies || package_.devDependencies)
        ) {
          console.log("✅ Debug: Found target package.json:", packagePath);
          return packagePath;
        }
      } catch (error) {
        console.log(
          "⚠️  Debug: Invalid package.json, skipping:",
          error.message,
        );
      }
    }
    current = path.dirname(current);
  }

  console.log("🔍 Debug: Trying fallback paths...");

  // Try possible paths as fallback
  for (const p of possiblePaths) {
    console.log("🔍 Debug: Checking fallback:", p);

    if (fs.existsSync(p)) {
      try {
        const package_ = JSON.parse(fs.readFileSync(p, "utf8"));
        console.log("🔍 Debug: Fallback package name:", package_.name);

        if (package_.name && !package_.name.includes("sidequest-cqo")) {
          console.log("✅ Debug: Found fallback package.json:", p);
          return p;
        }
      } catch (error) {
        console.log("⚠️  Debug: Invalid fallback package.json:", error.message);
      }
    }
  }

  console.log("❌ Debug: No suitable package.json found");
  return null;
}

function detectPackageManager() {
  if (process.env.npm_config_user_agent) {
    const agent = process.env.npm_config_user_agent;
    if (agent.includes("pnpm")) {
      return "pnpm";
    }
    if (agent.includes("yarn")) {
      return "yarn";
    }
    if (agent.includes("bun")) {
      return "bun";
    }
  }
  return "npm";
}

try {
  const packagePath = findPackageJson();

  if (packagePath) {
    console.log("📦 Debug: Processing package.json at:", packagePath);

    const package_ = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (!package_.scripts) {
      package_.scripts = {};
    }

    const pm = detectPackageManager();
    console.log("📦 Debug: Detected package manager:", pm);

    const runCmd =
      pm === "npm"
        ? "npm run"
        : pm === "yarn"
          ? "yarn"
          : pm === "bun"
            ? "bun run"
            : `${pm} run`;

    console.log("📦 Debug: Run command will be:", runCmd);

    const scripts = {
      "sidequest:report": "sidequest-cqo --verbose",
      "sidequest:watch": "sidequest-cqo --watch",
      "sidequest:config": "sidequest-cqo --config",
      "sidequest:help": "sidequest-cqo --help",
    };

    console.log("📦 Debug: Existing scripts:", Object.keys(package_.scripts));

    const added = [];
    Object.entries(scripts).forEach(([name, cmd]) => {
      if (package_.scripts[name]) {
        console.log("⚠️  Debug: Script already exists:", name);
      } else {
        package_.scripts[name] = cmd;
        added.push(name);
        console.log("✅ Debug: Added script:", name);
      }
    });

    if (added.length > 0) {
      console.log("📦 Debug: Writing updated package.json...");
      fs.writeFileSync(packagePath, JSON.stringify(package_, null, 2));
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
} catch (error) {
  console.log("❌ Debug: Error occurred:", error);
  console.log("❌ Debug: Stack trace:", error.stack);

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
