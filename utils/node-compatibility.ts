/**
 * Node.js Compatibility Utilities
 * Provides fallbacks for newer Node.js features to support LTS versions 18, 20, 22
 */

/**
 * Safe replaceAll implementation with fallback for older Node versions
 * String.prototype.replaceAll is available in Node 15.0.0+
 * Since we support Node 18+, this is mostly future-proofing
 */
export function replaceAll(
  string_: string,
  searchValue: string | RegExp,
  replaceValue: string
): string {
  if (typeof string_ !== 'string') {
    throw new TypeError('First argument must be a string');
  }

  // Use native replaceAll if available (Node 15.0.0+)
  if (typeof string_.replaceAll === 'function') {
    return string_.replaceAll(searchValue, replaceValue);
  }

  // Fallback implementation for older versions
  if (typeof searchValue === 'string') {
    // Handle empty string edge case - native replaceAll inserts between every character
    if (searchValue === '') {
      return [...string_].join(replaceValue) + replaceValue;
    }
    // For string search values, use split-join approach
    return string_.split(searchValue).join(replaceValue);
  }

  if (searchValue instanceof RegExp) {
    // For regex search values, ensure global flag is set
    const globalRegex = searchValue.global
      ? searchValue
      : new RegExp(searchValue.source, `${searchValue.flags}g`);
    return string_.replace(globalRegex, replaceValue);
  }

  throw new TypeError('searchValue must be a string or RegExp');
}

/**
 * Safe array.at() implementation with fallback for older Node versions
 * Array.prototype.at is available in Node 16.6.0+
 * Since we support Node 18+, this is mostly future-proofing
 */
export function arrayAt<T>(array: T[], index: number): T | undefined {
  if (!Array.isArray(array)) {
    throw new TypeError('First argument must be an array');
  }

  // Use native at() if available (Node 16.6.0+)
  if (typeof array.at === 'function') {
    return array.at(index);
  }

  // Fallback implementation for older versions
  if (index >= 0) {
    return array[index];
  }

  // Handle negative indices
  const normalizedIndex = array.length + index;
  return normalizedIndex >= 0 ? array[normalizedIndex] : undefined;
}

/**
 * Node.js version detection utilities
 */
export const NodeVersion = {
  /**
   * Get the current Node.js version as a number for easy comparison
   * e.g., "18.17.1" becomes 18.17
   */
  getMajorMinor(): number {
    const version = process.version.replace(/^v/, '');
    const parts = version.split('.').map(Number);
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    return major + minor / 100;
  },

  /**
   * Get the major version number
   */
  getMajor(): number {
    const version = process.version.replace(/^v/, '');
    const firstPart = version.split('.')[0];
    return Number.parseInt(firstPart || '0', 10);
  },

  /**
   * Check if current Node version supports a feature
   */
  supports: {
    replaceAll: (): boolean => NodeVersion.getMajorMinor() >= 15,
    arrayAt: (): boolean => NodeVersion.getMajorMinor() >= 16.6,
    nodePrefix: (): boolean => NodeVersion.getMajorMinor() >= 16,
    abortController: (): boolean => NodeVersion.getMajorMinor() >= 16,
    structuredClone: (): boolean => NodeVersion.getMajorMinor() >= 17
  },

  /**
   * Check if running on a supported LTS version
   */
  isLTS(): boolean {
    const major = NodeVersion.getMajor();
    // Supported LTS versions: 18, 20, 22
    return [18, 20, 22].includes(major);
  },

  /**
   * Get compatibility warnings if running on unsupported version
   */
  getCompatibilityWarnings(): string[] {
    const warnings: string[] = [];
    const major = NodeVersion.getMajor();
    const majorMinor = NodeVersion.getMajorMinor();

    if (major < 18) {
      warnings.push(
        `Node.js ${process.version} is not supported. Please upgrade to Node.js 18+ LTS.`
      );
    }

    if (major === 18 && majorMinor < 18) {
      warnings.push(
        `Node.js ${process.version} may have compatibility issues. Recommend Node.js 18.0.0+.`
      );
    }

    if (!NodeVersion.isLTS()) {
      warnings.push(
        `Node.js ${process.version} is not an LTS version. Consider using 18.x, 20.x, or 22.x LTS.`
      );
    }

    return warnings;
  }
};

/**
 * Safe dynamic import with fallback error handling
 * Provides consistent behavior across Node versions
 */
export async function safeDynamicImport<T = any>(
  specifier: string
): Promise<T> {
  try {
    return await import(specifier);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to import ${specifier}: ${errorMessage}`);
  }
}

/**
 * Environment compatibility checker
 * Reports potential issues with the current Node.js environment
 */
export function checkEnvironmentCompatibility(): {
  compatible: boolean;
  version: string;
  warnings: string[];
  recommendations: string[];
  } {
  const version = process.version;
  const warnings = NodeVersion.getCompatibilityWarnings();
  const recommendations: string[] = [];

  // Generate recommendations based on version
  const major = NodeVersion.getMajor();
  if (major < 18) {
    recommendations.push(
      'Upgrade to Node.js 18.x LTS or higher',
      'Consider using Node Version Manager (nvm) for easy version switching'
    );
  } else if (major === 18) {
    recommendations.push(
      'Consider upgrading to Node.js 20.x or 22.x LTS for latest features'
    );
  }

  return {
    compatible: warnings.length === 0,
    version,
    warnings,
    recommendations
  };
}
