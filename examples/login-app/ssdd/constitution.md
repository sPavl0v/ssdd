# Constitution

## Principles
- The server is the source of truth for auth state.
- Error messages never reveal whether an email exists.

## Code quality
TypeScript strict mode. Pure functions for form logic; side effects live in the auth service.

## Testing
Every leaf has a unit test. Time is injected, never read from the clock in tests.

## Commits
Conventional Commits, "type(scope): summary", max 72 characters, body lists changed spec paths.

## Never
No new runtime dependencies.
