/**
 * Advanced terminal background detection using OSC escape sequences
 * This module provides various methods to detect terminal background color
 */

/**
 * Attempt to detect terminal background color using OSC 11 escape sequence
 * This is an async method that queries the terminal directly
 */
export function detectTerminalBackground(): Promise<
  "light" | "dark" | undefined
> {
  // Skip detection in non-interactive environments
  if (
    !process.stdout.isTTY ||
    process.env["CI"] ||
    process.env["NODE_ENV"] === "test"
  ) {
    // eslint-disable-next-line unicorn/no-useless-undefined
    return Promise.resolve(undefined);
  }

  // Check if terminal supports OSC queries
  const termProgram = process.env["TERM_PROGRAM"] || "";
  const term = process.env["TERM"] || "";

  const supportsOSC =
    termProgram.includes("iTerm") ||
    termProgram.includes("Terminal") ||
    termProgram.includes("Hyper") ||
    termProgram.includes("vscode") ||
    term.includes("xterm") ||
    term.includes("screen") ||
    term.includes("tmux") ||
    process.env["COLORTERM"] === "truecolor";

  if (!supportsOSC) {
    // eslint-disable-next-line unicorn/no-useless-undefined
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    let response = "";

    // Set up timeout (300ms should be enough, shorter for better UX)
    const timeout = setTimeout(() => {
      cleanup();
      // eslint-disable-next-line unicorn/no-useless-undefined
      resolve(undefined);
    }, 300);

    const cleanup = () => {
      try {
        clearTimeout(timeout);
        process.stdin.removeAllListeners("data");
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(false);
        }
      } catch {
        // Ignore cleanup errors
      }
    };

    // Listen for terminal response
    const onData = (data: Buffer) => {
      response += data.toString();

      // Multiple OSC 11 response formats:
      // \x1b]11;rgb:RRRR/GGGG/BBBB\x1b\\  (standard)
      // \x1b]11;#RRGGBB\x1b\\             (some terminals)
      // \x1b]11;rgb:RR/GG/BB\x1b\\        (8-bit format)

      let oscMatch = response.match(
        // eslint-disable-next-line no-control-regex
        /\u001B]11;rgb:([\dA-Fa-f]{4})\/([\dA-Fa-f]{4})\/([\dA-Fa-f]{4})\u001B\\/,
      );
      let r: number = 0,
        g: number = 0,
        b: number = 0;

      if (oscMatch) {
        // 16-bit format: divide by 256 to get 8-bit
        r = Number.parseInt(oscMatch[1] || "0", 16) / 256;
        g = Number.parseInt(oscMatch[2] || "0", 16) / 256;
        b = Number.parseInt(oscMatch[3] || "0", 16) / 256;
      } else {
        // Try hex format #RRGGBB
        // eslint-disable-next-line no-control-regex
        oscMatch = response.match(/\u001B]11;#([\dA-Fa-f]{6})\u001B\\/);
        if (oscMatch && oscMatch[1]) {
          r = Number.parseInt(oscMatch[1].slice(0, 2), 16);
          g = Number.parseInt(oscMatch[1].slice(2, 4), 16);
          b = Number.parseInt(oscMatch[1].slice(4, 6), 16);
        } else {
          // Try 8-bit format rgb:RR/GG/BB
          oscMatch = response.match(
            // eslint-disable-next-line no-control-regex
            /\u001B]11;rgb:([\dA-Fa-f]{2})\/([\dA-Fa-f]{2})\/([\dA-Fa-f]{2})\u001B\\/,
          );
          if (oscMatch && oscMatch[1] && oscMatch[2] && oscMatch[3]) {
            r = Number.parseInt(oscMatch[1], 16);
            g = Number.parseInt(oscMatch[2], 16);
            b = Number.parseInt(oscMatch[3], 16);
          }
        }
      }

      if (oscMatch) {
        clearTimeout(timeout);
        cleanup();

        // Calculate relative luminance using WCAG formula
        const luminance = calculateLuminance(r, g, b);

        // Use a more conservative threshold (0.3 instead of 0.5)
        // This means we need to be more sure it's light before switching
        const isLight = luminance > 0.3;

        resolve(isLight ? "light" : "dark");
      }
    };

    try {
      // Set up raw mode to capture terminal responses
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", onData);

        // Send OSC 11 query (request background color)
        process.stdout.write("\u001B]11;?\u001B\\");
      } else {
        cleanup();
        // eslint-disable-next-line unicorn/no-useless-undefined
        resolve(undefined);
      }
    } catch {
      cleanup();
      // eslint-disable-next-line unicorn/no-useless-undefined
      resolve(undefined);
    }
  });
}

/**
 * Calculate relative luminance according to WCAG guidelines
 */
function calculateLuminance(r: number, g: number, b: number): number {
  // Convert to sRGB
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  // Apply gamma correction
  const rLinear =
    rsRGB <= 0.039_28 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear =
    gsRGB <= 0.039_28 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear =
    bsRGB <= 0.039_28 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Enhanced heuristic detection as fallback
 */
export function detectTerminalModeHeuristic(): "light" | "dark" {
  const term = process.env["TERM"] || "";
  const termProgram = process.env["TERM_PROGRAM"] || "";
  const indexTermProfile = process.env["ITERM_PROFILE"] || "";
  const terminalTheme = process.env["TERMINAL_THEME"] || "";
  const colorscheme = process.env["COLORFGBG"] || ""; // Some terminals set this

  // Check COLORFGBG first (most reliable when present)
  if (colorscheme) {
    const parts = colorscheme.split(";");
    if (parts.length >= 2) {
      const bg = Number.parseInt(parts[1] || "0");
      // Background colors 0-7 are typically dark, 8-15 are light
      if (bg >= 0 && bg <= 7) {
        return "dark";
      }
      if (bg >= 8 && bg <= 15) {
        return "light";
      }
    }
  }

  // Explicit dark theme indicators (high confidence)
  if (
    indexTermProfile.includes("Dark") ||
    indexTermProfile.includes("Solarized Dark") ||
    indexTermProfile.includes("Dracula") ||
    indexTermProfile.includes("Monokai") ||
    indexTermProfile.includes("Tomorrow Night") ||
    indexTermProfile.includes("Basic") || // Terminal.app Basic is dark
    terminalTheme.includes("dark") ||
    term.includes("dark") ||
    process.env["VSCODE_THEME"]?.includes("Dark")
  ) {
    return "dark";
  }

  // Explicit light theme indicators
  if (
    termProgram.includes("Novel") ||
    indexTermProfile.includes("Solarized Light") ||
    indexTermProfile.includes("Paper") ||
    indexTermProfile.includes("Light") ||
    indexTermProfile.includes("Bright") ||
    indexTermProfile.includes("Silver") ||
    indexTermProfile.includes("White") ||
    terminalTheme.includes("light") ||
    terminalTheme.includes("bright") ||
    process.env["TERM_THEME"]?.includes("light") ||
    process.env["VSCODE_THEME"]?.includes("Light") ||
    process.env["TERMINAL_THEME"]?.includes("light")
  ) {
    return "light";
  }

  // Check for Terminal.app default themes that are light
  if (
    (termProgram === "Apple_Terminal" || termProgram.includes("Terminal")) && // Terminal.app "Basic" profile is actually light in newer versions
    (indexTermProfile === "Basic" ||
      indexTermProfile === "" ||
      !indexTermProfile)
  ) {
    // If COLORFGBG suggests light background, use light mode
    if (colorscheme) {
      const parts = colorscheme.split(";");
      if (parts.length >= 2) {
        const bg = Number.parseInt(parts[1] || "0");
        if (bg >= 7) {
          return "light";
        } // Light backgrounds
      }
    }
    // For Terminal.app with no specific dark indicators, assume light
    return "light";
  }

  // Default to dark for safety, but be more balanced
  return "dark";
}

/**
 * Show current terminal environment for debugging
 */
export function debugTerminalEnvironment(): void {
  console.log("=== Terminal Environment Debug ===");
  console.log("TERM:", process.env["TERM"]);
  console.log("TERM_PROGRAM:", process.env["TERM_PROGRAM"]);
  console.log("ITERM_PROFILE:", process.env["ITERM_PROFILE"]);
  console.log("TERMINAL_THEME:", process.env["TERMINAL_THEME"]);
  console.log("COLORFGBG:", process.env["COLORFGBG"]);
  console.log("COLORTERM:", process.env["COLORTERM"]);
  console.log("VSCODE_THEME:", process.env["VSCODE_THEME"]);
  console.log("TTY:", process.stdout.isTTY);
  console.log("CI:", process.env["CI"]);
}
