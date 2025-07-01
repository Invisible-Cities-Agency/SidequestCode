/**
 * Analysis Service for Code Quality Orchestrator
 * Provides historical analysis and delta computation
 */

import type {
  IAnalysisService,
  IStorageService,
  TimeRange,
  ViolationTrend,
  RulePerformanceAnalysis,
  FileQualityTrend,
  ViolationStats,
  ProblemFile,
  FlakyRule,
  ViolationPrediction,
  RuleFrequencyRecommendation,
  QualityReport,
  RuleEfficiencyReport,
} from "./interfaces.js";
import { arrayAt } from "../utils/node-compatibility.js";

// import type {
//   ViolationHistory,
//   HistoryQueryParams
// } from '../database/types.js';

// ============================================================================
// Analysis Service Implementation
// ============================================================================

export class AnalysisService implements IAnalysisService {
  private storageService: IStorageService;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  // ========================================================================
  // Delta Analysis
  // ========================================================================

  computeViolationDeltas(
    previousViolations: string[],
    currentViolations: string[],
  ): {
    added: string[];
    removed: string[];
    unchanged: string[];
  } {
    const previousSet = new Set(previousViolations);
    const currentSet = new Set(currentViolations);

    const added = currentViolations.filter((hash) => !previousSet.has(hash));
    const removed = previousViolations.filter((hash) => !currentSet.has(hash));
    const unchanged = currentViolations.filter((hash) => previousSet.has(hash));

    return { added, removed, unchanged };
  }

  // ========================================================================
  // Historical Analysis
  // ========================================================================

  async getViolationTrends(timeRange: TimeRange): Promise<ViolationTrend[]> {
    const violations = await this.storageService.getViolations({
      since: timeRange.start.toISOString(),
    });

    // Group violations by date, category, and severity
    const trendsMap = new Map<string, ViolationTrend>();

    for (const violation of violations) {
      const date =
        violation.last_seen_at?.split("T")?.[0] ??
        new Date().toISOString().split("T")[0]!; // Extract date part
      const key = `${date}:${violation.category}:${violation.severity}`;

      if (trendsMap.has(key)) {
        trendsMap.get(key)!.count++;
      } else {
        trendsMap.set(key, {
          date,
          count: 1,
          severity: violation.severity,
          category: violation.category,
        });
      }
    }

    return [...trendsMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  getRulePerformanceAnalysis(ruleId?: string): RulePerformanceAnalysis[] {
    // const rulePerformance = await this.storageService.getRulePerformance();
    const rulePerformance: unknown[] = []; // TODO: Implement getRulePerformance on IStorageService

    let filteredPerformance = rulePerformance;
    if (ruleId) {
      filteredPerformance = rulePerformance.filter(
        (rule: unknown) => (rule as { rule_id: string }).rule_id === ruleId,
      );
    }

    return filteredPerformance.map((rule: unknown) => {
      const ruleData = rule as {
        rule_id: string;
        engine: string;
        avg_execution_time_ms?: number;
        avg_violations_found?: number;
        total_runs: number;
        successful_runs: number;
        last_run_at?: string;
        consecutive_zero_count?: number;
      };
      return {
        rule: ruleData.rule_id,
        engine: ruleData.engine,
        avgExecutionTime: ruleData.avg_execution_time_ms || 0,
        avgViolationsFound: ruleData.avg_violations_found || 0,
        successRate:
          ruleData.total_runs > 0
            ? ruleData.successful_runs / ruleData.total_runs
            : 0,
        lastRun: ruleData.last_run_at || "Never",
        trend: this.calculateTrend(
          ruleData.avg_violations_found ?? 0,
          ruleData.consecutive_zero_count ?? 0,
        ),
      };
    });
  }

  async getFileQualityTrends(filePath?: string): Promise<FileQualityTrend[]> {
    const violations = await this.storageService.getViolations(
      filePath ? { file_paths: [filePath] } : {},
    );

    // Group by file path
    const fileMap = new Map<
      string,
      { count: number; categories: Set<string> }
    >();

    for (const violation of violations) {
      if (!fileMap.has(violation.file_path)) {
        fileMap.set(violation.file_path, { count: 0, categories: new Set() });
      }

      const fileData = fileMap.get(violation.file_path)!;
      fileData.count++;
      fileData.categories.add(violation.category);
    }

    return [...fileMap.entries()].map(([path, data]) => ({
      filePath: path,
      violationCount: data.count,
      trend: this.calculateFileTrend(data.count), // Simplified trend calculation
      categories: [...data.categories],
    }));
  }

  // ========================================================================
  // Statistical Analysis
  // ========================================================================

  async calculateViolationStats(
    _timeRange: TimeRange,
  ): Promise<ViolationStats> {
    // For now, get all active violations to show meaningful stats
    // TODO: Fix timestamp filtering when database schema is properly updated
    const violations = await this.storageService.getViolations();

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const uniqueFiles = new Set<string>();

    for (const violation of violations) {
      // Count by category
      byCategory[violation.category] =
        (byCategory[violation.category] || 0) + 1;

      // Count by severity
      bySeverity[violation.severity] =
        (bySeverity[violation.severity] || 0) + 1;

      // Count by source
      bySource[violation.source] = (bySource[violation.source] || 0) + 1;

      // Track unique files
      uniqueFiles.add(violation.file_path);
    }

    return {
      total: violations.length,
      byCategory,
      bySeverity,
      bySource,
      avgPerFile:
        uniqueFiles.size > 0 ? violations.length / uniqueFiles.size : 0,
      filesAffected: uniqueFiles.size,
    };
  }

  async identifyProblemFiles(threshold: number = 10): Promise<ProblemFile[]> {
    const fileQualityTrends = await this.getFileQualityTrends();

    return fileQualityTrends
      .filter((file) => file.violationCount >= threshold)
      .map((file) => ({
        filePath: file.filePath,
        violationCount: file.violationCount,
        severityScore: this.calculateSeverityScore(file.violationCount),
        categories: file.categories,
        lastModified: new Date().toISOString(), // Simplified - would need file system access
      }))
      .sort((a, b) => b.severityScore - a.severityScore);
  }

  detectRuleFlakyness(minRuns: number = 10): FlakyRule[] {
    // const rulePerformance = await this.storageService.getRulePerformance();
    const rulePerformance: unknown[] = []; // TODO: Implement getRulePerformance

    return rulePerformance
      .filter(
        (rule: unknown) =>
          (rule as { total_runs: number }).total_runs >= minRuns,
      )
      .map((rule: unknown) => {
        const ruleData = rule as {
          rule_id: string;
          engine: string;
          avg_violations_found?: number;
          total_runs: number;
        };
        const variance = this.calculateVariance(
          ruleData.avg_violations_found ?? 0,
          ruleData.total_runs,
        );
        const stdDeviation = Math.sqrt(variance);

        return {
          rule: ruleData.rule_id,
          engine: ruleData.engine,
          varianceScore: variance,
          runCount: (rule as { total_runs: number }).total_runs,
          avgViolations:
            (rule as { avg_violations_found?: number }).avg_violations_found ||
            0,
          stdDeviation,
        };
      })
      .filter((rule) => rule.stdDeviation > 2) // High variance threshold
      .sort((a, b) => b.varianceScore - a.varianceScore);
  }

  // ========================================================================
  // Predictive Analysis
  // ========================================================================

  async predictViolationGrowth(
    timeRange: TimeRange,
  ): Promise<ViolationPrediction> {
    const trends = await this.getViolationTrends(timeRange);

    if (trends.length < 2) {
      return {
        projectedGrowth: 0,
        confidence: 0,
        timeframe: "30 days",
        factors: ["Insufficient historical data"],
      };
    }

    // Simple linear regression for growth prediction
    const totalByDate = this.groupTrendsByDate(trends);
    const growthRate = this.calculateGrowthRate(totalByDate);

    return {
      projectedGrowth: growthRate * 30, // 30-day projection
      confidence: Math.min(trends.length / 30, 1), // Confidence based on data points
      timeframe: "30 days",
      factors: this.identifyGrowthFactors(trends),
    };
  }

  recommendRuleFrequencies(): RuleFrequencyRecommendation[] {
    // const rulePerformance = await this.storageService.getRulePerformance();
    const rulePerformance: unknown[] = []; // TODO: Implement getRulePerformance

    return rulePerformance.map((rule: unknown) => {
      const currentFrequency = 30_000; // Default 30 seconds
      let recommendedFrequency = currentFrequency;
      let reasoning = "No change recommended";

      // Rules that consistently find violations should run more frequently
      if (
        (rule as { avg_violations_found?: number }).avg_violations_found &&
        (rule as { avg_violations_found?: number }).avg_violations_found! > 5
      ) {
        recommendedFrequency = currentFrequency / 2;
        reasoning = "High violation rate - increase frequency";
      }
      // Rules that rarely find violations can run less frequently
      else if (
        ((rule as { avg_violations_found?: number }).avg_violations_found ??
          0) < 1 &&
        ((rule as { consecutive_zero_count?: number }).consecutive_zero_count ??
          0) > 5
      ) {
        recommendedFrequency = currentFrequency * 2;
        reasoning = "Low violation rate - decrease frequency";
      }
      // Rules with high execution time should run less frequently
      else if (
        ((rule as { avg_execution_time_ms?: number }).avg_execution_time_ms ??
          0) > 1000
      ) {
        recommendedFrequency = currentFrequency * 1.5;
        reasoning = "High execution time - decrease frequency";
      }

      return {
        rule: (rule as { rule_id: string }).rule_id,
        engine: (rule as { engine: string }).engine,
        currentFrequency,
        recommendedFrequency: Math.max(
          5000,
          Math.min(300_000, recommendedFrequency),
        ), // 5s to 5min bounds
        reasoning,
      };
    });
  }

  // ========================================================================
  // Report Generation
  // ========================================================================

  async generateQualityReport(timeRange: TimeRange): Promise<QualityReport> {
    const [summary, trends, problemFiles, rulePerformance] = await Promise.all([
      this.calculateViolationStats(timeRange),
      this.getViolationTrends(timeRange),
      this.identifyProblemFiles(5),
      this.getRulePerformanceAnalysis(),
    ]);

    const recommendations = this.generateRecommendations(
      summary,
      problemFiles,
      rulePerformance,
    );

    return {
      timeRange,
      summary,
      trends,
      problemFiles,
      rulePerformance,
      recommendations,
    };
  }

  async generateRuleEfficiencyReport(): Promise<RuleEfficiencyReport> {
    // const rulePerformance = await this.storageService.getRulePerformance();
    const rulePerformance: unknown[] = []; // TODO: Implement getRulePerformance
    const recommendations = await this.recommendRuleFrequencies();

    const totalRules = rulePerformance.length;
    const activeRules = rulePerformance.filter(
      (rule: unknown) => (rule as { enabled?: boolean }).enabled,
    ).length;
    const avgExecutionTime =
      rulePerformance.reduce(
        (sum: number, rule: unknown) =>
          sum +
          ((rule as { avg_execution_time_ms?: number }).avg_execution_time_ms ||
            0),
        0,
      ) / totalRules;

    return {
      totalRules,
      activeRules,
      avgExecutionTime,
      resourceUtilization: this.calculateResourceUtilization(rulePerformance),
      recommendations,
    };
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private calculateTrend(
    avgViolations: number,
    consecutiveZeroCount: number,
  ): "improving" | "stable" | "degrading" {
    if (consecutiveZeroCount > 3) {
      return "improving";
    }
    if (avgViolations < 1) {
      return "stable";
    }
    if (avgViolations > 10) {
      return "degrading";
    }
    return "stable";
  }

  private calculateFileTrend(
    violationCount: number,
  ): "improving" | "stable" | "degrading" {
    // Simplified trend calculation - in practice would compare historical data
    if (violationCount < 3) {
      return "improving";
    }
    if (violationCount > 15) {
      return "degrading";
    }
    return "stable";
  }

  private calculateSeverityScore(violationCount: number): number {
    // Simple scoring algorithm - could be more sophisticated
    return violationCount * 1.5;
  }

  private calculateVariance(avgValue: number, sampleSize: number): number {
    // Simplified variance calculation - would need actual data points
    return avgValue * (1 / Math.sqrt(sampleSize));
  }

  private groupTrendsByDate(trends: ViolationTrend[]): Map<string, number> {
    const dateMap = new Map<string, number>();

    for (const trend of trends) {
      const current = dateMap.get(trend.date) || 0;
      dateMap.set(trend.date, current + trend.count);
    }

    return dateMap;
  }

  private calculateGrowthRate(totalByDate: Map<string, number>): number {
    const values = [...totalByDate.values()];
    if (values.length < 2) {
      return 0;
    }

    const first = values[0];
    const last = arrayAt(values, -1);

    if (first === undefined || last === undefined) {
      return 0;
    }

    return (last - first) / values.length;
  }

  private identifyGrowthFactors(trends: ViolationTrend[]): string[] {
    const factors: string[] = [];

    // Analyze category distribution
    const categoryCount = new Map<string, number>();
    for (const trend of trends) {
      categoryCount.set(
        trend.category,
        (categoryCount.get(trend.category) || 0) + trend.count,
      );
    }

    // Find dominant categories
    const sortedCategories = [...categoryCount.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    for (const [category] of sortedCategories) {
      factors.push(`High activity in ${category} violations`);
    }

    return factors;
  }

  private calculateResourceUtilization(rulePerformance: any[]): number {
    // Simplified resource utilization calculation
    const totalExecutionTime = rulePerformance.reduce(
      (sum, rule) => sum + (rule.avg_execution_time_ms || 0),
      0,
    );
    const maxPossibleTime = rulePerformance.length * 1000; // Assume 1s max per rule

    return Math.min(totalExecutionTime / maxPossibleTime, 1);
  }

  private generateRecommendations(
    summary: ViolationStats,
    problemFiles: ProblemFile[],
    rulePerformance: RulePerformanceAnalysis[],
  ): string[] {
    const recommendations: string[] = [];

    // High violation count recommendations
    if (summary.total > 100) {
      recommendations.push(
        "Consider implementing stricter code review processes",
      );
    }

    // Problem files recommendations
    if (problemFiles.length > 5) {
      recommendations.push(
        `Focus refactoring efforts on ${problemFiles.length} high-violation files`,
      );
    }

    // Rule performance recommendations
    const slowRules = rulePerformance.filter(
      (rule: RulePerformanceAnalysis) => (rule.avgExecutionTime || 0) > 500,
    );
    if (slowRules.length > 0) {
      recommendations.push(
        `Optimize ${slowRules.length} slow-performing rules`,
      );
    }

    // Category-specific recommendations
    if ((summary.byCategory?.["record-type"] || 0) > summary.total * 0.3) {
      recommendations.push(
        "High number of record-type violations - consider TypeScript configuration updates",
      );
    }

    return recommendations;
  }
}

// ============================================================================
// Service Factory
// ============================================================================

let analysisServiceInstance: AnalysisService | undefined;

/**
 * Get or create analysis service instance
 */
export function getAnalysisService(
  storageService: IStorageService,
): AnalysisService {
  if (!analysisServiceInstance) {
    analysisServiceInstance = new AnalysisService(storageService);
  }
  return analysisServiceInstance;
}

/**
 * Reset analysis service instance (useful for testing)
 */
export function resetAnalysisService(): void {
  analysisServiceInstance = undefined;
}
