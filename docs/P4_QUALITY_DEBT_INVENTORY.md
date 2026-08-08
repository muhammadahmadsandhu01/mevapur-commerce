# P4 Quality-Debt Inventory

Captured before any P4 application-source change on 2026-07-28. This inventory is generated from direct TypeScript and ESLint execution against first-party source. Paths are relative to the named application. Repeated `file:line` entries represent distinct diagnostics on the same line.

## Baseline summary

| Application | Check | Exit | Errors | Warnings | Result |
|---|---|---:|---:|---:|---|
| Backend | First-party `node --check` | 0 | 0 | 0 | 184/184 files valid |
| Storefront | `npx tsc --noEmit --incremental false --pretty false` | 0 | 0 | n/a | PASS |
| Storefront | `npx eslint . --format json` | 1 | 33 | 35 | BLOCKING |
| Admin | `npx tsc --noEmit --incremental false --pretty false` | 2 | 8 | n/a | BLOCKING |
| Admin | `npx eslint . --format json` | 1 | 99 | 103 | BLOCKING |

The ESLint inventory accounts for all 270 baseline diagnostics: storefront 68 and admin 202. The TypeScript inventory accounts for all eight admin diagnostics.

## Remediation classifications

- **Behaviour-preserving mechanical fix:** safe syntax, literal escaping, or module-form change with unchanged runtime meaning.
- **Type-model mismatch:** a meaningful type or component contract must replace an unsafe or incorrect type.
- **React/hooks issue:** state/effect/callback structure requires semantic review.
- **Accessibility issue:** markup or accessible-state semantics require correction.
- **Unused/dead declaration:** declaration has no observed use; side effects must be checked before removal.
- **Import/module issue:** import form or missing import is incorrect.
- **Framework/configuration issue:** framework configuration contains unsupported or quality-bypass behaviour.
- **Potentially business-sensitive:** order, payment, provider, auth, inventory, refund, or admin-control code requires contract-preserving review.
- **Deferred warning:** non-blocking warning retained only with explicit final classification.

## Storefront ESLint diagnostics — complete

| Severity | Rule | Count | Short sanitized description | Likely remediation category | Every location |
|---|---|---:|---|---|---|
| Error | `@typescript-eslint/no-explicit-any` | 14 | Explicit `any` removes meaningful type guarantees. | Type-model mismatch; potentially business-sensitive in cart/checkout/payment-adjacent code | `src/app/cart/page.tsx:173`, `src/app/checkout/backup.tsx:202`, `src/app/checkout/backup.tsx:213`, `src/app/page.tsx:50`, `src/app/search/page.tsx:14`, `src/components/products/ProductCard.tsx:94`, `src/components/products/RecentlyViewed.tsx:9`, `src/components/products/RecommendedProducts.tsx:9`, `src/lib/adminApi.ts:108`, `src/lib/adminApi.ts:113`, `src/lib/adminApi.ts:129`, `src/lib/adminApi.ts:134`, `src/lib/adminApi.ts:150`, `src/lib/adminApi.ts:155` |
| Error | `@typescript-eslint/no-require-imports` | 2 | CommonJS `require()` is used in an ESLint-checked module. | Import/module issue; behaviour-preserving mechanical fix | `tailwind.config.js:16`, `tailwind.config.js:17` |
| Error | `react-hooks/set-state-in-effect` | 5 | Effect synchronously derives React state, causing an avoidable render cascade. | React/hooks issue | `src/app/page.tsx:74`, `src/components/Navbar.tsx:52`, `src/components/SearchAutocomplete.tsx:58`, `src/components/products/ProductCard.tsx:22`, `src/components/products/ProductFilters.tsx:15` |
| Error | `react-hooks/static-components` | 2 | A component is declared during render and loses stable identity. | React/hooks issue | `src/components/products/ProductFilters.tsx:432`, `src/components/products/ProductFilters.tsx:457` |
| Error | `react/no-unescaped-entities` | 10 | JSX text contains unescaped apostrophe or quotation characters. | Behaviour-preserving mechanical fix | `src/app/forgot-password/page.tsx:96`, `src/app/forgot-password/page.tsx:180`, `src/app/forgot-password/page.tsx:191`, `src/app/login/page.tsx:306`, `src/app/page.tsx:357` (two diagnostics), `src/app/products/page.tsx:294`, `src/app/search/page.tsx:194` (two diagnostics), `src/components/Hero.tsx:23` |
| Warning | `@next/next/no-img-element` | 13 | Native image elements bypass Next image optimization. | Deferred warning / performance | `src/app/cart/page.tsx:348`, `src/app/checkout/backup.tsx:523`, `src/app/checkout/page.tsx:567`, `src/app/order-success/page.tsx:322`, `src/app/orders/[id]/page.tsx:220`, `src/app/page.tsx:152`, `src/app/products/[id]/page.tsx:210`, `src/app/products/[id]/page.tsx:247`, `src/app/products/[id]/page.tsx:534`, `src/app/wishlist/page.tsx:61`, `src/components/OrderCard.tsx:150`, `src/components/OrderCard.tsx:171`, `src/components/layout/MegaMenu.tsx:66` |
| Warning | `@typescript-eslint/no-unused-vars` | 19 | Imports, bindings, or callback values are unused. | Unused/dead declaration; verify side effects | `src/app/cart/page.tsx:13` (three diagnostics), `src/app/cart/page.tsx:17`, `src/app/checkout/backup.tsx:14`, `src/app/checkout/backup.tsx:19`, `src/app/forgot-password/page.tsx:12`, `src/app/forgot-password/page.tsx:47`, `src/app/login/page.tsx:61`, `src/app/register/page.tsx:109`, `src/app/search/page.tsx:8` (two diagnostics), `src/app/wishlist/page.tsx:6` (two diagnostics), `src/app/wishlist/page.tsx:9`, `src/components/Footer.tsx:4`, `src/components/OrderCard.tsx:3`, `src/components/PaymentModal.tsx:4`, `src/lib/payments/cod.ts:7` |
| Warning | `jsx-a11y/role-supports-aria-props` | 1 | `aria-expanded` is not supported on the input's implicit textbox role. | Accessibility issue | `src/components/Navbar.tsx:92` |
| Warning | `react-hooks/exhaustive-deps` | 2 | An effect dependency is omitted. | React/hooks issue; potentially business-sensitive search state | `src/app/products/page.tsx:71`, `src/components/products/PromotionalBanner.tsx:36` |

## Admin TypeScript diagnostics — complete

| Severity | Compiler code | Count | Short sanitized description | Likely remediation category | Every location |
|---|---|---:|---|---|---|
| Error | `TS2322` | 4 | `ContentPage` receives `defaultType`, but its component props currently declare no such property. | Type-model mismatch | `src/app/content/banners/page.tsx:6`, `src/app/content/blogs/page.tsx:6`, `src/app/content/pages/page.tsx:6`, `src/app/content/sliders/page.tsx:6` |
| Error | `TS2304` | 3 | Referenced icon identifiers are missing from the module scope. | Import/module issue | `src/components/layout/TopBar.tsx:177` (`Package`), `src/components/layout/TopBar.tsx:178` (`ShoppingCart`), `src/components/layout/TopBar.tsx:180` (`Percent`) |
| Error | `TS2552` | 1 | `Users` is referenced but not imported; the suggested local `user` is not equivalent. | Import/module issue | `src/components/layout/TopBar.tsx:179` |

## Admin ESLint diagnostics — complete

| Severity | Rule | Count | Short sanitized description | Likely remediation category | Every location |
|---|---|---:|---|---|---|
| Error | `@typescript-eslint/ban-ts-comment` | 1 | A broad `@ts-ignore` hides an unsupported framework option. | Framework/configuration issue | `next.config.ts:8` |
| Error | `@typescript-eslint/no-explicit-any` | 66 | Explicit `any` removes meaningful API, form, event, or model guarantees. | Type-model mismatch; potentially business-sensitive where listed in orders, refunds, inventory, coupons, users, and provider-facing API helpers | `src/app/activity-logs/page.tsx:21`, `src/app/activity-logs/page.tsx:47`, `src/app/activity-logs/page.tsx:59`, `src/app/activity-logs/page.tsx:109`, `src/app/content/page.tsx:140`, `src/app/content/page.tsx:142`, `src/app/content/page.tsx:144`, `src/app/content/page.tsx:146`, `src/app/content/page.tsx:203`, `src/app/coupons/page.tsx:281`, `src/app/coupons/page.tsx:624`, `src/app/customers/page.tsx:272`, `src/app/customers/page.tsx:293`, `src/app/inventory/page.tsx:299`, `src/app/inventory/page.tsx:319`, `src/app/inventory/page.tsx:387`, `src/app/notifications/page.tsx:39`, `src/app/notifications/page.tsx:49`, `src/app/orders/[id]/page.tsx:96`, `src/app/orders/page.tsx:75`, `src/app/orders/page.tsx:311`, `src/app/orders/page.tsx:335`, `src/app/orders/page.tsx:356`, `src/app/page.tsx:108`, `src/app/products/[id]/edit/page.tsx:165`, `src/app/products/[id]/edit/page.tsx:288`, `src/app/products/[id]/edit/page.tsx:289`, `src/app/products/[id]/edit/page.tsx:464`, `src/app/products/[id]/edit/page.tsx:518`, `src/app/products/add/page.tsx:164`, `src/app/products/add/page.tsx:284`, `src/app/products/add/page.tsx:285`, `src/app/products/add/page.tsx:383`, `src/app/products/add/page.tsx:434`, `src/app/products/page.tsx:30`, `src/app/products/page.tsx:63`, `src/app/reports/page.tsx:11`, `src/app/reports/page.tsx:64`, `src/app/reports/page.tsx:124`, `src/app/reports/page.tsx:131`, `src/app/reports/page.tsx:138`, `src/app/reports/page.tsx:160`, `src/app/returns/page.tsx:8`, `src/app/returns/page.tsx:14`, `src/app/returns/page.tsx:22`, `src/app/returns/page.tsx:45`, `src/app/returns/page.tsx:116`, `src/app/reviews/page.tsx:53`, `src/app/reviews/page.tsx:271`, `src/app/reviews/page.tsx:292`, `src/app/settings/page.tsx:13`, `src/app/settings/page.tsx:42`, `src/app/settings/page.tsx:84`, `src/app/settings/page.tsx:187`, `src/app/users/page.tsx:60`, `src/app/users/page.tsx:105`, `src/app/users/page.tsx:120`, `src/app/users/page.tsx:133`, `src/app/users/page.tsx:648`, `src/components/layout/Sidebar.tsx:49`, `src/lib/api.ts:113`, `src/lib/api.ts:118`, `src/lib/api.ts:133`, `src/lib/api.ts:138`, `src/lib/api.ts:153`, `src/lib/api.ts:158` |
| Error | `@typescript-eslint/no-require-imports` | 1 | CommonJS `require()` is used in an ESLint-checked module. | Import/module issue; behaviour-preserving mechanical fix | `tailwind.config.js:42` |
| Error | `react-hooks/immutability` | 16 | An effect references a function declared later, preventing stable reactive updates. | React/hooks issue; potentially business-sensitive on orders/inventory/users | `src/app/activity-logs/page.tsx:51`, `src/app/activity-logs/page.tsx:52`, `src/app/brands/page.tsx:51`, `src/app/categories/page.tsx:53`, `src/app/coupons/page.tsx:51`, `src/app/customers/page.tsx:42`, `src/app/inventory/page.tsx:44`, `src/app/notifications/page.tsx:42`, `src/app/notifications/page.tsx:43`, `src/app/orders/[id]/page.tsx:80`, `src/app/orders/page.tsx:69`, `src/app/products/[id]/edit/page.tsx:413`, `src/app/products/add/page.tsx:334`, `src/app/reviews/page.tsx:47`, `src/app/settings/page.tsx:139`, `src/app/users/page.tsx:54` |
| Error | `react-hooks/set-state-in-effect` | 6 | Effect synchronously derives React state, causing an avoidable render cascade. | React/hooks issue; potentially business-sensitive on refund/product forms | `src/app/layout.tsx:20`, `src/app/products/[id]/edit/page.tsx:303`, `src/app/products/[id]/edit/page.tsx:405`, `src/app/products/add/page.tsx:298`, `src/app/products/add/page.tsx:309`, `src/app/refunds/page.tsx:135` |
| Error | `react/no-unescaped-entities` | 9 | JSX text contains unescaped apostrophe or quotation characters. | Behaviour-preserving mechanical fix | `src/app/content/page.tsx:396` (two diagnostics), `src/app/notifications/page.tsx:311`, `src/app/orders/[id]/page.tsx:201` (two diagnostics), `src/app/page.tsx:254` (two diagnostics), `src/app/page.tsx:633`, `src/app/reports/page.tsx:43` |
| Warning | `@next/next/no-img-element` | 13 | Native image elements bypass Next image optimization. | Deferred warning / performance | `src/app/brands/page.tsx:312`, `src/app/inventory/page.tsx:538`, `src/app/inventory/page.tsx:658`, `src/app/orders/[id]/page.tsx:499`, `src/app/orders/page.tsx:727`, `src/app/products/[id]/edit/page.tsx:1320`, `src/app/products/[id]/edit/page.tsx:1785`, `src/app/products/add/page.tsx:1189`, `src/app/products/add/page.tsx:1654`, `src/app/products/page.tsx:468`, `src/app/products/page.tsx:648`, `src/app/reviews/page.tsx:376`, `src/app/reviews/page.tsx:674` |
| Warning | `@typescript-eslint/no-unused-vars` | 78 | Imports, bindings, or helper values are unused. | Unused/dead declaration; verify side effects and incomplete UI intent | `src/app/activity-logs/page.tsx:5`, `src/app/activity-logs/page.tsx:147`, `src/app/brands/page.tsx:6` (two diagnostics), `src/app/categories/page.tsx:6` (three diagnostics), `src/app/categories/page.tsx:7` (two diagnostics), `src/app/coupons/page.tsx:7` (three diagnostics), `src/app/customers/page.tsx:5`, `src/app/customers/page.tsx:6` (two diagnostics), `src/app/customers/page.tsx:7` (four diagnostics), `src/app/customers/page.tsx:37` (two diagnostics), `src/app/inventory/page.tsx:5`, `src/app/inventory/page.tsx:6` (two diagnostics), `src/app/inventory/page.tsx:7` (two diagnostics), `src/app/inventory/page.tsx:8` (two diagnostics), `src/app/notifications/page.tsx:9`, `src/app/notifications/page.tsx:19`, `src/app/orders/[id]/page.tsx:8`, `src/app/orders/[id]/page.tsx:9`, `src/app/orders/page.tsx:5`, `src/app/orders/page.tsx:6`, `src/app/orders/page.tsx:7`, `src/app/products/[id]/edit/page.tsx:3`, `src/app/products/[id]/edit/page.tsx:7`, `src/app/products/[id]/edit/page.tsx:8` (three diagnostics), `src/app/products/[id]/edit/page.tsx:9` (three diagnostics), `src/app/products/[id]/edit/page.tsx:162`, `src/app/products/[id]/edit/page.tsx:525`, `src/app/products/[id]/edit/page.tsx:533`, `src/app/products/[id]/edit/page.tsx:540`, `src/app/products/add/page.tsx:3`, `src/app/products/add/page.tsx:7`, `src/app/products/add/page.tsx:8` (three diagnostics), `src/app/products/add/page.tsx:9` (three diagnostics), `src/app/products/add/page.tsx:11`, `src/app/products/add/page.tsx:161`, `src/app/products/add/page.tsx:287` (two diagnostics), `src/app/products/add/page.tsx:288` (two diagnostics), `src/app/products/add/page.tsx:440`, `src/app/products/add/page.tsx:447`, `src/app/products/add/page.tsx:453`, `src/app/products/page.tsx:9` (two diagnostics), `src/app/returns/page.tsx:13`, `src/app/settings/page.tsx:84`, `src/app/users/page.tsx:21`, `src/components/layout/Sidebar.tsx:13`, `src/components/layout/Sidebar.tsx:17`, `src/components/layout/Sidebar.tsx:24`, `src/components/layout/Sidebar.tsx:29`, `src/components/layout/Sidebar.tsx:32`, `src/components/layout/Sidebar.tsx:35`, `src/components/layout/Sidebar.tsx:37`, `src/components/layout/Sidebar.tsx:39`, `src/components/layout/Sidebar.tsx:40` |
| Warning | `react-hooks/exhaustive-deps` | 12 | An effect or callback dependency is omitted. | React/hooks issue; potentially business-sensitive in orders/refunds/users | `src/app/content/page.tsx:99`, `src/app/notifications/page.tsx:44`, `src/app/orders/[id]/page.tsx:81`, `src/app/orders/page.tsx:70`, `src/app/products/[id]/edit/page.tsx:417`, `src/app/products/add/page.tsx:300`, `src/app/products/add/page.tsx:311`, `src/app/products/add/page.tsx:338`, `src/app/refunds/page.tsx:132`, `src/app/reviews/page.tsx:48`, `src/app/settings/page.tsx:140`, `src/app/users/page.tsx:55` |

## Build observations

- Storefront Pakistan, international, and full baseline builds passed with 16 routes each. The first sandboxed Pakistan attempt failed only because the restricted environment could not fetch the configured Google font; the authorized network-enabled retry and the other editions passed.
- Admin Pakistan, international, and full baseline builds passed with 25 routes each, but each explicitly reported `Skipping validation of types`.
- Each admin build reported that the `eslint` key in `next.config.ts` is unsupported by Next.js 16.2.10. This is a framework/configuration issue, not evidence that admin TypeScript passes.

## Initial remediation decision

All blocking errors are first-party diagnostics. None are generated/vendor findings. The plan is to replace unsafe types with explicit local/API types, correct hook structure based on actual dataflow, use module-compatible imports, escape literal JSX text, repair the four content prop contracts and four missing icon imports, then remove the admin build bypass only after TypeScript is clean. Warnings are non-blocking but will be re-inventoried and individually classified after remediation.

## Final remediation inventory

All blocking diagnostics were remediated without a package or lock-file
change, global rule disable, broad suppression, `@ts-ignore`, `@ts-nocheck`,
first-party exclusion, or generated-output edit.

| Application | Gate | Before | After | Final result |
|---|---|---:|---:|---|
| Storefront | TypeScript errors | 0 | 0 | PASS |
| Storefront | ESLint errors | 33 | 0 | PASS |
| Storefront | ESLint warnings | 35 | 32 | Non-blocking |
| Admin | TypeScript errors | 8 | 0 | PASS |
| Admin | ESLint errors | 99 | 0 | PASS |
| Admin | ESLint warnings | 103 | 101 | Non-blocking |
| Admin | Build type bypass | Enabled | Disabled | PASS |
| Admin | Unsupported Next.js ESLint option | Present | Removed | PASS |

### Retained storefront warnings - every final location

- `@next/next/no-img-element` (13, performance): `src/app/cart/page.tsx:351`,
  `src/app/checkout/backup.tsx:526`, `src/app/checkout/page.tsx:567`,
  `src/app/order-success/page.tsx:322`,
  `src/app/orders/[id]/page.tsx:220`, `src/app/page.tsx:162`,
  `src/app/products/[id]/page.tsx:210`,
  `src/app/products/[id]/page.tsx:247`,
  `src/app/products/[id]/page.tsx:534`,
  `src/app/wishlist/page.tsx:61`, `src/components/OrderCard.tsx:150`,
  `src/components/OrderCard.tsx:171`,
  `src/components/layout/MegaMenu.tsx:66`.
- `@typescript-eslint/no-unused-vars` (19, inactive declarations retained to
  avoid removing incomplete UI intent): `src/app/cart/page.tsx:13` (three),
  `src/app/cart/page.tsx:17`, `src/app/checkout/backup.tsx:14`,
  `src/app/checkout/backup.tsx:19`,
  `src/app/forgot-password/page.tsx:12`,
  `src/app/forgot-password/page.tsx:47`, `src/app/login/page.tsx:61`,
  `src/app/register/page.tsx:109`, `src/app/search/page.tsx:8` (two),
  `src/app/wishlist/page.tsx:6` (two), `src/app/wishlist/page.tsx:9`,
  `src/components/Footer.tsx:4`, `src/components/OrderCard.tsx:3`,
  `src/components/PaymentModal.tsx:4`, `src/lib/payments/cod.ts:7`.

The storefront accessibility warning and both hook-dependency warnings were
fixed. Native image migration and inactive UI cleanup are deferred because
they are non-blocking and would expand P4 into image/performance or feature
cleanup work.

### Retained admin warnings - every final location

- `@next/next/no-img-element` (13, performance):
  `src/app/brands/page.tsx:312`, `src/app/inventory/page.tsx:538`,
  `src/app/inventory/page.tsx:658`,
  `src/app/orders/[id]/page.tsx:505`, `src/app/orders/page.tsx:733`,
  `src/app/products/[id]/edit/page.tsx:1346`,
  `src/app/products/[id]/edit/page.tsx:1811`,
  `src/app/products/add/page.tsx:1217`,
  `src/app/products/add/page.tsx:1682`,
  `src/app/products/page.tsx:472`, `src/app/products/page.tsx:652`,
  `src/app/reviews/page.tsx:385`, `src/app/reviews/page.tsx:683`.
- `react-hooks/exhaustive-deps` (10, follow-up semantic review):
  `src/app/content/page.tsx:121`, `src/app/notifications/page.tsx:50`,
  `src/app/orders/[id]/page.tsx:82`, `src/app/orders/page.tsx:70`,
  `src/app/products/[id]/edit/page.tsx:447`,
  `src/app/products/add/page.tsx:370`,
  `src/app/refunds/page.tsx:132`, `src/app/reviews/page.tsx:48`,
  `src/app/settings/page.tsx:186`, `src/app/users/page.tsx:64`.
- `@typescript-eslint/no-unused-vars` (78, inactive declarations retained to
  avoid deleting incomplete admin behavior): `src/app/activity-logs/page.tsx:5`,
  `src/app/activity-logs/page.tsx:156`, `src/app/brands/page.tsx:6` (two),
  `src/app/categories/page.tsx:6` (three),
  `src/app/categories/page.tsx:7` (two),
  `src/app/coupons/page.tsx:7` (three),
  `src/app/customers/page.tsx:5`, `src/app/customers/page.tsx:6` (two),
  `src/app/customers/page.tsx:7` (four),
  `src/app/customers/page.tsx:37` (two),
  `src/app/inventory/page.tsx:5`, `src/app/inventory/page.tsx:6` (two),
  `src/app/inventory/page.tsx:7` (two),
  `src/app/inventory/page.tsx:8` (two),
  `src/app/notifications/page.tsx:9`,
  `src/app/notifications/page.tsx:19`,
  `src/app/orders/[id]/page.tsx:8`,
  `src/app/orders/[id]/page.tsx:9`, `src/app/orders/page.tsx:5`,
  `src/app/orders/page.tsx:6`, `src/app/orders/page.tsx:7`,
  `src/app/products/[id]/edit/page.tsx:3`,
  `src/app/products/[id]/edit/page.tsx:7`,
  `src/app/products/[id]/edit/page.tsx:8` (three),
  `src/app/products/[id]/edit/page.tsx:9` (three),
  `src/app/products/[id]/edit/page.tsx:175`,
  `src/app/products/[id]/edit/page.tsx:551`,
  `src/app/products/[id]/edit/page.tsx:559`,
  `src/app/products/[id]/edit/page.tsx:566`,
  `src/app/products/add/page.tsx:3`,
  `src/app/products/add/page.tsx:7`,
  `src/app/products/add/page.tsx:8` (three),
  `src/app/products/add/page.tsx:9` (three),
  `src/app/products/add/page.tsx:11`,
  `src/app/products/add/page.tsx:174`,
  `src/app/products/add/page.tsx:300` (two),
  `src/app/products/add/page.tsx:301` (two),
  `src/app/products/add/page.tsx:468`,
  `src/app/products/add/page.tsx:475`,
  `src/app/products/add/page.tsx:481`,
  `src/app/products/page.tsx:9` (two),
  `src/app/returns/page.tsx:30`, `src/app/settings/page.tsx:108`,
  `src/app/users/page.tsx:21`, `src/components/layout/Sidebar.tsx:13`,
  `src/components/layout/Sidebar.tsx:17`,
  `src/components/layout/Sidebar.tsx:24`,
  `src/components/layout/Sidebar.tsx:29`,
  `src/components/layout/Sidebar.tsx:32`,
  `src/components/layout/Sidebar.tsx:35`,
  `src/components/layout/Sidebar.tsx:37`,
  `src/components/layout/Sidebar.tsx:39`,
  `src/components/layout/Sidebar.tsx:40`.

No retained warning is an ESLint error. The ten admin hook warnings remain
visible because changing their fetch/retry semantics requires a separate
behavioral review; they were not suppressed.
