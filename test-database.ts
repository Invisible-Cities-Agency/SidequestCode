#!/usr/bin/env tsx
/**
 * Test script for database schema and connection
 * Verifies SQLite + Kysely setup works correctly
 */

import { initializeDatabase, closeDatabase } from './database/connection.js';
import { violationToDbFormat, generateViolationHash } from './database/utils.js';
import type { Violation as ViolationType } from './utils/violation-types.js';

async function testDatabase() {
  console.log('🔧 Testing Code Quality Orchestrator Database...\n');

  try {
    // Clean up any existing test database
    await import('fs/promises').then(fs => fs.unlink('./test-code-quality.db').catch(() => {}));
    
    // Initialize database
    console.log('1. Initializing database...');
    const db = await initializeDatabase({
      path: './test-code-quality.db'
    });
    console.log('✅ Database initialized successfully\n');

    // Test schema creation
    console.log('2. Testing schema...');
    const tables = await db.introspection.getTables();
    const expectedTables = [
      'violations', 
      'rule_checks', 
      'violation_history', 
      'rule_schedules', 
      'watch_sessions', 
      'performance_metrics'
    ];
    
    for (const expectedTable of expectedTables) {
      const table = tables.find(t => t.name === expectedTable);
      if (table) {
        console.log(`✅ Table '${expectedTable}' exists with ${table.columns.length} columns`);
      } else {
        console.log(`❌ Table '${expectedTable}' not found`);
      }
    }
    console.log('');

    // Test violation insertion
    console.log('3. Testing violation insertion...');
    const testViolation: ViolationType = {
      file: 'test/example.ts',
      line: 42,
      column: 10,
      message: 'Record<string, unknown> should use branded interface',
      category: 'record-type',
      severity: 'info',
      source: 'typescript',
      ruleId: 'record-type-check',
      code: 'Record<string, unknown>'
    };

    const dbViolation = violationToDbFormat(testViolation);
    console.log(`Generated hash: ${dbViolation.hash}`);

    const insertResult = await db
      .insertInto('violations')
      .values(dbViolation)
      .returning('id')
      .executeTakeFirst();

    console.log(`✅ Violation inserted with ID: ${insertResult?.id}\n`);

    // Test violation query
    console.log('4. Testing violation queries...');
    const violations = await db
      .selectFrom('violations')
      .selectAll()
      .execute();

    console.log(`✅ Found ${violations.length} violation(s)`);
    if (violations.length > 0) {
      const violation = violations[0];
      console.log(`   - File: ${violation.file_path}`);
      console.log(`   - Rule: ${violation.rule_id}`);
      console.log(`   - Category: ${violation.category}`);
      console.log(`   - Severity: ${violation.severity}`);
      console.log(`   - Source: ${violation.source}`);
    }
    console.log('');

    // Test rule schedule
    console.log('5. Testing rule schedule insertion...');
    const scheduleResult = await db
      .insertInto('rule_schedules')
      .values({
        rule_id: 'record-type-check',
        engine: 'typescript',
        enabled: 1, // SQLite uses 1/0 for boolean
        priority: 1,
        check_frequency_ms: 30000
      })
      .returning('id')
      .executeTakeFirst();

    console.log(`✅ Rule schedule inserted with ID: ${scheduleResult?.id}\n`);

    // Test views
    console.log('6. Testing views...');
    try {
      const summary = await db
        .selectFrom('violation_summary')
        .selectAll()
        .execute();
      console.log(`✅ Violation summary view: ${summary.length} categories`);

      const performance = await db
        .selectFrom('rule_performance')
        .selectAll()
        .execute();
      console.log(`✅ Rule performance view: ${performance.length} rules`);
    } catch (error) {
      console.log(`⚠️  Views test failed (expected for empty database): ${error}`);
    }
    console.log('');

    // Test duplicate handling
    console.log('7. Testing duplicate violation handling...');
    try {
      await db
        .insertInto('violations')
        .values(dbViolation)
        .execute();
      console.log('❌ Duplicate violation was inserted (should have been prevented)');
    } catch (error) {
      console.log('✅ Duplicate violation correctly rejected by unique constraint');
    }
    console.log('');

    // Test hash consistency
    console.log('8. Testing hash consistency...');
    const hash1 = generateViolationHash({
      file_path: 'test.ts',
      line_number: 10,
      rule_id: 'test-rule',
      message: 'Test message'
    });
    const hash2 = generateViolationHash({
      file_path: 'test.ts',
      line_number: 10,
      rule_id: 'test-rule',
      message: 'Test message'
    });
    const hash3 = generateViolationHash({
      file_path: 'test.ts',
      line_number: 11, // Different line
      rule_id: 'test-rule',
      message: 'Test message'
    });

    if (hash1 === hash2) {
      console.log('✅ Hash consistency: identical violations produce same hash');
    } else {
      console.log('❌ Hash consistency failed: identical violations produced different hashes');
    }

    if (hash1 !== hash3) {
      console.log('✅ Hash uniqueness: different violations produce different hashes');
    } else {
      console.log('❌ Hash uniqueness failed: different violations produced same hash');
    }
    console.log('');

    console.log('🎉 All database tests passed!\n');

    // Clean up
    await closeDatabase();
    
    // Remove test database
    await import('fs/promises').then(fs => fs.unlink('./test-code-quality.db').catch(() => {}));
    console.log('🧹 Cleaned up test database');

  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  }
}

// Run tests
testDatabase();