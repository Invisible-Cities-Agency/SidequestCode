# Contributing to Code Quality Orchestrator

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## =� Quick Start

1. **Fork and Clone**

   ```bash
   git clone https://github.com/Invisible-Cities-Agency/SidequestCode.git
   cd SideQuestCode
   ```

2. **Setup Development Environment**

   ```bash
   ./setup.sh
   ```

3. **Start Development**
   ```bash
   npm run dev --watch
   npm run test:watch
   ```

## =� Development Workflow

### Code Style Requirements

- **TypeScript Strict Mode**: All code must pass `npm run typecheck`
- **No `any` Types**: Use proper TypeScript types or branded unknown types
- **ESLint Compliance**: All code must pass `npm run lint`
- **Test Coverage**: New features require corresponding tests

### Commit Message Format

Follow conventional commits:

```
type(scope): description

feat(watch): add daily progress tracking
fix(terminal): resolve color detection on Windows
docs(readme): update installation instructions
test(display): add session baseline tests
```

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `test/description` - Test improvements

## <� Architecture Guidelines

### Core Principles

1. **Type Safety First**: Never use `any`, always validate at boundaries
2. **Resource Management**: Always cleanup resources (console capture, timers, etc.)
3. **Performance**: Watch cycles must complete in <300ms
4. **Observability**: Include debug logging for complex operations
5. **Error Handling**: Comprehensive error handling with context

### File Organization

```
/
   shared/           # Shared types and constants
   services/         # Core business logic services
   engines/          # TypeScript/ESLint analysis engines
   database/         # SQLite schema and utilities
   utils/           # Utility functions
   *.ts             # Main CLI and display files
```

### Key Patterns

#### Branded Types for Runtime Safety

```typescript
//  Good
export type ViolationId = BrandedUnknown<"ViolationId">;

// L Bad
export type ViolationId = string;
```

#### Service Interface Pattern

```typescript
//  Good
export interface IAnalysisService {
  calculateStats(timeRange: TimeRange): Promise<ViolationStats>;
}

// L Bad
export class AnalysisService {
  calculateStats(start: any, end: any): any;
}
```

#### Error Handling Pattern

```typescript
//  Good
try {
  const result = await operation();
  return result;
} catch (error) {
  if (process.env.DEBUG) {
    console.error("[Service] Operation failed:", error);
  }
  throw new ServiceError("Operation failed", "OPERATION_ERROR", { operation });
}

// L Bad
try {
  return await operation();
} catch {
  // Silent failure
}
```

## >� Testing Guidelines

### Test Categories

1. **Unit Tests** (`*.test.ts`)
   - Test individual functions and classes
   - Mock external dependencies
   - Fast execution (<100ms per test)

2. **Integration Tests** (`*.integration.test.ts`)
   - Test service interactions
   - Use real SQLite database
   - Test complete workflows

3. **E2E Tests** (`*.e2e.test.ts`)
   - Test CLI commands end-to-end
   - Test watch mode functionality
   - Test terminal color detection

### Test Structure

```typescript
describe("ViolationTracker", () => {
  let tracker: ViolationTracker;
  let mockStorage: jest.Mocked<IStorageService>;

  beforeEach(() => {
    mockStorage = createMockStorageService();
    tracker = new ViolationTracker(mockStorage);
  });

  afterEach(() => {
    tracker.clearCaches();
  });

  describe("processViolations", () => {
    it("should deduplicate violations correctly", async () => {
      // Arrange
      const violations = [
        createMockViolation({ file: "test.ts", line: 1 }),
        createMockViolation({ file: "test.ts", line: 1 }), // duplicate
      ];

      // Act
      const result = await tracker.processViolations(violations);

      // Assert
      expect(result.deduplicated).toBe(1);
      expect(result.processed).toBe(2);
    });
  });
});
```

## =' Development Tools

### Available Scripts

```bash
# Development
npm run dev              # Run CLI in development mode
npm run watch           # Start watch mode
npm run debug-terminal  # Debug color detection

# Testing
npm test               # Run all tests
npm run test:core      # Unit tests only
npm run test:watch     # Watch mode testing

# Quality
npm run lint           # ESLint check
npm run typecheck      # TypeScript validation
npm run build          # Build for production

# Release
npm run alpha-release  # Publish alpha version
npm run beta-release   # Publish beta version
```

### Debug Mode

Enable comprehensive logging:

```bash
DEBUG=1 npm run watch
```

## =� Release Process

### Alpha Releases

1. **Complete Feature Development**

   ```bash
   npm run test
   npm run typecheck
   npm run lint
   ```

2. **Update Documentation**
   - Update `CHANGELOG.md`
   - Update `README.md` if needed
   - Update `package.json` version

3. **Create Alpha Release**
   ```bash
   npm run alpha-release
   ```

### Beta/Stable Releases

1. **Gather Alpha Feedback**
2. **Complete Testing**
3. **Update Documentation**
4. **Release**
   ```bash
   npm run beta-release    # For beta
   npm publish             # For stable
   ```

## = Issue Reporting

### Bug Reports

Include:

- OS and Node.js version
- Terminal type and color scheme
- Complete error output
- Steps to reproduce
- Expected vs actual behavior

### Feature Requests

Include:

- Use case description
- Proposed API/interface
- Implementation considerations
- Alternative solutions considered

## =� Feature Development Guidelines

### Terminal Features

- Test on multiple terminal types (iTerm2, Terminal.app, Windows Terminal)
- Support both light and dark color schemes
- Provide fallback for unsupported terminals

### Performance Features

- Profile with `performance.now()`
- Test with large codebases (1000+ files)
- Maintain <300ms watch cycle times
- Consider memory usage (keep <50MB)

### Display Features

- Design for 80-column terminals
- Support various screen sizes
- Provide clean, scannable output
- Include proper visual hierarchy

## > Code Review Process

### Before Submitting

1.  All tests pass
2.  TypeScript compiles without errors
3.  ESLint passes without warnings
4.  Performance requirements met
5.  Documentation updated
6.  Self-review completed

### Review Criteria

- **Functionality**: Does it work as intended?
- **Performance**: Meets performance requirements?
- **Security**: No security vulnerabilities?
- **Maintainability**: Clear, well-documented code?
- **Testing**: Adequate test coverage?

## =� Getting Help

- =� **Discussions**: Use GitHub Discussions for questions
- = **Bug Reports**: Create GitHub Issues
- =� **Direct Contact**: Reach out to maintainers
- =� **Documentation**: Check README and code comments

---

## Recognition

Contributors will be recognized in:

- `CHANGELOG.md` for significant contributions
- GitHub contributors page
- Special mentions for major features

Thank you for contributing to Code Quality Orchestrator! <�
