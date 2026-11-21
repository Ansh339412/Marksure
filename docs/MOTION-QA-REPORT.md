# MarkSure motion QA report

## Executed checks

| Check | Result / evidence |
| --- | --- |
| Frontend production build + TypeScript | Passed `npm.cmd run build --prefix client` |
| Backend build | Passed `npm.cmd run build --prefix server` |
| Existing backend regression suite | 43 tests passed across 6 files |
| New verification feedback tests | 4 tests passed: no stale success during pending request, empty idle state, separate failed subchecks, five completed stages |
| Editor diagnostics | No errors reported |
| Whitespace validation | `git diff --check` passed; Git emitted normal Windows line-ending notices |
| Mobile hero | 390 px viewport: no document horizontal overflow; scenario selection and menu open/Escape close passed |
| Responsive hero | 390, 768, 1280 and 1440 px viewports: no document horizontal overflow |
| Reduced motion | CSS pseudo-element animation disabled; content visible; active animations reach zero after preference-change event |
| Public route during slow session restore | Passed with isolated browser fetch fixture: public heading/loading visible before delayed 401 session response |
| Missing record feedback | Fixture HTTP 404 displayed immediately with retry; no premature successful pipeline |
| Protected route / browser history | Fixture unauthenticated registry redirected to login; back/forward between home and verifier passed |
| Dialog | Fixture admin registry: initial focus inside, Shift+Tab trapped, Escape closed, focus restored |
| Dashboard tab / logout | Fixture tab selected state updated; logout removed private registry content |
| Real backend public directory | Read-only local backend connected to configured Supabase; directory returned records |
| Real public verification | Existing record returned `CORRECTED`; all five stages and proof disclosure rendered after response |
| Real verification refresh / disclosure / mobile | Direct URL refresh passed, proof inspector opened, all five stages rendered, no document overflow at 390 px |

Browser fixtures were test-only overrides in an isolated tab, not application data or backend substitutions in source. Initial route-interception attempts timed out; fetch fixtures supplied the later successful checks. Native Escape handling initially failed in the embedded browser; an explicit dialog handler was added and the workflow then passed.

The real backend was started with existing configuration after confirming `autoSeedDemoData=false`. No academic records were created, changed or deleted. Anonymous session restoration returned expected HTTP 401 responses. Earlier browser runs before backend startup reported connection-refused errors. One browser page became unavailable; the follow-up real-record refresh/proof-toggle/mobile checks were subsequently rerun successfully in a fresh page.

## Performance observations

The final frontend build measured 489.59 kB JavaScript (139.13 kB gzip) and 47.99 kB CSS (10.01 kB gzip). No animation package, image, video or WebGL dependency was added. Motion mostly uses transform/opacity; selection dimensions are assigned at state/layout changes. Tables animate as groups rather than per row.

A 60-frame sample in the embedded browser at 4x CPU throttling measured a 33 ms median and approximately 1001 ms p95 interval. This does **not** establish smooth lower-powered-device performance. Host/background scheduling may contribute, but was not isolated. CPU throttling was reset. No formal CLS benchmark, React Profiler recording, heap/leak measurement or large-table load test was completed.

## Commands and reproduction

From the repository root:

```powershell
npm.cmd run build --prefix client
npm.cmd run build --prefix server
npm.cmd run test --prefix server
.\server\node_modules\.bin\vitest.cmd run client/tests/motion.test.tsx
npm.cmd run dev --prefix client -- --host 127.0.0.1
git diff --check
```

The local backend was launched with `npm.cmd start` from `server`. PowerShell blocked the `npm.ps1` shim; using `npm.cmd` worked without changing execution policy. Editor task tools were unavailable (`No invocation context`), so commands were run in the terminal.

For a manual review, open the local preview, switch landing scenarios, navigate to public verification, open a published record, reverify, expand proof details, test reduced motion, then inspect registry filters and the registration dialog with a permitted test account. Test keyboard navigation and mobile widths as well as pointer interaction.

## Remaining validation and implementation limits

- Real credential login, registration, batch publication, two-approver signing, all role combinations, and mutation failure/retry paths were not executed against the configured database. Use a disposable staging dataset for these tests.
- Browser tests covered Chromium through the integrated browser, not Safari, Firefox, physical mobile devices or screen readers.
- Full screenshot-based visual QA, print preview, all page/status color contrasts and full notification lifecycle coverage remain outstanding.
- Animated outgoing route exits, toast exits and mobile disclosure exits are not implemented. No new interactive Merkle tree was built.
- Existing backend behavior and roadmap claims were not audited or certified by this motion work.
- No production deployment occurred. Complete staging workflow/performance review before requesting production approval.
