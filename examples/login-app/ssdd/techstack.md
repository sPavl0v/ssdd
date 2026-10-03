# Tech stack

## Runtime and languages
TypeScript on Node 20+.
## Project structure (where things go)
- src/form.ts: login form state and validation
- src/auth.ts: auth service (sessions, lockout)
## Commands
- Build: npx tsc --noEmit
- Type check: npx tsc --noEmit
- Lint: none
## Testing
- Unit: Vitest, src/**/*.test.ts; run: npx vitest run -t "<name filter>"
