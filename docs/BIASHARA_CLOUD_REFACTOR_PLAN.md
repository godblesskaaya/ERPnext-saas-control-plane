# Biashara Cloud — SaaS Control Plane Refactor Plan
## Agent Execution Document
### Repository: godblesskaaya/ERPnext-saas-control-plane

---

## Part 1: Context and Principles

### Why This Refactor Exists

Biashara Cloud is a deployed, revenue-generating product that provisions ERPNext instances for Tanzanian SMEs. It works. The refactor is not about fixing what is broken — it is about making the system easier to extend as complexity grows: more plans, more tenants, more payment providers, more infrastructure options.

The reference architecture is ARC SaaS (sourcefuse/arc-saas). We are not copying it, not porting it, and not constrained to its tech stack. We are applying its domain-driven thinking — how it separates concerns, names boundaries, and manages lifecycle — to our own system, in our own language, at our own scale.

### What We Are Moving Toward

The current system works but conflates concerns. Plan logic lives on the tenant row. Billing state lives alongside infrastructure state. Provisioning behaviour is conditional on plan strings rather than on declared infrastructure models. The frontend reflects the database rather than the user's workflow.

The target is a system where each concern has a home, each component has a clear contract, and adding a new plan tier or payment provider or infrastructure type does not require touching unrelated code.

### Guiding Principles the Agent Must Apply

**Simplicity where possible.** Do not introduce abstraction unless it removes coupling or enables a concrete future extension that is already planned. A plain function is better than a class hierarchy if the hierarchy has only one implementation.

**Structure where necessary.** When a concern appears in more than two places, or when a future phase depends on a clean boundary existing, introduce the structure. The subscription domain and the provisioning strategy dispatch are both examples where structure is necessary because the existing approach will not scale to the next planned phase.

**Avoid overengineering early.** We do not need microservices. We do not need a message bus. We do not need a workflow engine. We need clean internal module boundaries inside the existing monolith, with interfaces that would allow extraction later if scale demands it.

**Build for clarity and extensibility.** Every new file should be readable by someone who has not seen the rest of the codebase. Every new interface should make the extension case obvious.

**Never break what works.** The existing provisioning pipeline — bench commands, runner, validators, worker tasks — is the core of the product. It must not be modified during structural refactors. Behaviour changes to provisioning happen only in Phase 4, and only by wrapping the existing logic, not replacing it.

**We are not copying ARC.** When in doubt, apply ARC's thinking, not ARC's code. The subscription domain model is inspired by ARC's Subscription Service. The feature flag system is inspired by ARC's Feature Toggle Service. The provisioning strategy dispatch is inspired by ARC's isolation model concept. In every case, the implementation is ours, shaped by our constraints.

---

## Part 2: Agent Operating Rules

These rules apply across every phase. The agent must not deviate from them.

### File Protection

The following files and directories must never be modified during structural refactor phases. They may only be modified during Phase 4 (provisioning strategy dispatch) and only in the specific ways described in that phase.

- All files under `provisioning-api/app/bench/`
- All files under `provisioning-api/app/bench/pod/` if they exist
- The worker tasks file at `provisioning-api/app/workers/tasks.py` until Phase 4
- All files under `provisioning-api/alembic/versions/` — existing migration files are immutable; only new files may be added
- All files under `scripts/`
- The root `docker-compose.yml` — environment variable keys may be added but structure must not change

### Migration Rules

Every database change requires a new Alembic migration file. Migration files are named with the date prefix format `YYYYMMDD_00NN_description.py`. The current chain ends at revision `0006` or later depending on what has been merged from Phase 2 work. The agent must read the existing chain before writing a new migration to identify the correct `down_revision`. Every migration must include both `upgrade()` and `downgrade()` functions. Migrations that include data changes must document in comments what the data transformation does and why.

### Test Rules

The full test suite must pass before any phase is considered complete. If existing tests break during a refactor phase, the agent must fix the tests before proceeding — the refactor has broken a contract, not the test. Every new module must have a corresponding test file. New tests must cover at minimum: the happy path, one error case, and one edge case. The coverage threshold of 70% must be maintained across the codebase.

### Commit Rules

Each phase produces exactly one commit when complete, after all acceptance criteria pass. Commit messages follow the format: `type: description (Phase N)` where type is one of `refactor`, `feat`, or `chore`. No phase may produce a commit that breaks the import graph or causes a running instance to fail.

### Shim Pattern

During refactor phases, when existing code is moved to a new location, the old location must remain as a re-export shim until the cleanup phase. This ensures that code not yet updated to the new import path continues to work. Shims are deleted in Phase 7 and only Phase 7.

### Naming Conventions

All new Python modules follow the path `provisioning-api/app/modules/{domain}/`. Each domain directory contains at minimum: a models file, a service or logic file, a schemas file for Pydantic input/output types, and a router file for HTTP endpoints. Shared utilities that serve multiple domains live in the domain that owns them, with the other domains importing from there.

### Behaviour During Ambiguity

When the agent encounters a decision point not explicitly covered by this document, it must apply the guiding principles from Part 1. It must add a comment in the code using the tag `AGENT-NOTE:` explaining what it decided and why, so a human reviewer can evaluate the decision.

---

## Part 3: Repository and System Context

### Current Architecture

The provisioning API is a FastAPI monolith with a single RQ worker. PostgreSQL is the primary datastore. Redis handles rate limiting, token revocation, job pub/sub, and the RQ queue. All tenant ERPNext instances share a single ERPNext bench in Starter and Business tiers. Enterprise tenants will have isolated Docker Compose stacks once Phase 4 is complete.

The Alembic migration chain currently covers: users and tenants (0001), audit logs (0002), billing columns (0003), backups (0004). Migrations 0005 and 0006 add `chosen_app` to tenants and payment provider columns respectively, and may or may not be present depending on the branch state. The agent must read the existing chain before writing any new migration.

### Current Module Layout (Pre-Refactor)

The existing code is organised around HTTP routers rather than domains. The auth router, tenant router, admin router, billing router, and WebSocket router are in `app/routers/`. Business logic lives in `app/services/`. The bench execution layer is in `app/bench/`. Models are consolidated in a single `app/models.py`. This layout works at the current scale but makes it difficult to reason about which code owns which domain.

### Target Module Layout

After all phases complete, the codebase will be organised by domain:

The identity module owns everything related to users, authentication, JWT token lifecycle, and password management. It is the only module that knows about token creation and verification.

The tenant module owns the tenant entity, the tenant status state machine, and the tenant lifecycle operations (create, suspend, delete). It does not own billing state or subscription state — it depends on the subscription module for those.

The subscription module owns plans, plan entitlements, and subscriptions. A plan is a named configuration object that declares infrastructure model, app entitlements, backup policy, pricing, and support tier. A subscription is the live contract between a tenant and a plan. The billing status of a tenant lives here, not on the tenant row.

The features module owns feature flags and per-tenant feature overrides. It provides a dependency that any router can use to gate an endpoint behind a named capability. Plan-level features are derived from the plan's configuration. Per-tenant overrides allow the operator to grant or revoke features for individual tenants regardless of their plan.

The provisioning module wraps the existing bench execution layer behind a strategy interface. It does not change the bench commands or the runner. It introduces a dispatch layer that selects the correct execution strategy based on the tenant's plan isolation model, then delegates to the existing code. This module is the product's competitive moat and must be treated with corresponding care.

The billing module owns payment gateway integrations and the webhook router. It translates provider-specific events into canonical payment outcomes that the subscription module can act on. It knows about Stripe and DPO Pay. Adding a future provider requires only a new gateway file and one line in the registry.

The notifications module owns all outbound communication. It supports email via MailerSend and SMS via Africa's Talking. It does not know about tenants directly — callers pass the recipient address and message content.

The audit module owns the append-only audit log. All state-changing operations across all modules record an audit event. This module has no outbound dependencies on any other domain module.

The observability module owns Sentry initialisation, Prometheus metrics exposure, and the structured logging configuration.

---

## Part 4: Phase Execution Plan

### Phase 0 — Preparation

**Purpose**: Establish the skeleton of the target layout before moving any logic. This phase makes no behaviour changes.

**What the agent does**: Creates the empty directory structure for all modules under `app/modules/`. Creates an `__init__.py` in each directory. Verifies that all existing tests pass with the skeleton in place. Makes no other changes.

**Acceptance criteria**: The full test suite passes unchanged. The application starts and its health endpoint responds. The new directories exist but are empty of logic.

**Commit**: `chore: scaffold module directory skeleton (Phase 0)`

---

### Phase 1 — Structural Refactor (Move Without Changing)

**Purpose**: Move existing code into the correct module homes without changing any logic, any function signatures, or any behaviour. Every moved component gets a shim at its old location.

**What the agent does**:

The audit module receives the `AuditLog` model and the `record_audit_event` function. The old locations become shims.

The observability module receives the Sentry initialisation function, the metrics initialisation function, and the logging configuration. The old locations become shims.

The identity module receives the JWT token functions (create, decode, verify, revocation check), the password hashing functions, and the auth router. The old locations become shims.

The tenant module receives the `Tenant` model, the status state machine (transitions table, transition function, transition error class), and the tenant service functions (create, enqueue provisioning, enforce backup limits, enqueue backup, enqueue delete). The old locations become shims.

The `app/models.py` file retains `User`, `Job`, and `BackupManifest` for now and re-exports everything that was moved. It will be further reduced in Phase 2.

**Acceptance criteria**: Every test that passed in Phase 0 passes identically. The application starts cleanly. Import paths through shims resolve without circular dependencies. No logic has changed — grep for function names confirms they exist in their new locations and are re-exported from the old ones.

**Commit**: `refactor: move existing code into module boundaries (Phase 1)`

---

### Phase 2 — Subscription Domain

**Purpose**: Replace the plan string column and billing status column on the tenant row with a proper domain model. This is a hard cutover — after this phase, plan and billing state live exclusively in the subscription domain. All existing tenant data is migrated automatically.

**What the agent does**:

The subscription module gains three new models. The Plan model represents a named tier configuration. It declares: a unique slug identifier, display name, isolation model (one of: pooled, silo\_compose, silo\_k3s), maximum number of extra apps allowed (null means unlimited), monthly prices in both USD cents and TZS, Stripe price identifier, DPO product code, backup frequency, backup retention in days, whether S3 offsite backup is included, support channel type, SLA flag, and custom domain eligibility flag. Plans are seeded by the migration — they are not created via API.

The PlanEntitlement model represents which apps are included in a plan. Each entitlement belongs to a plan and names an app slug. It has two boolean flags: mandatory (always installed) and selectable (the customer can choose this app as their one Business-tier pick). The combination of these two flags allows the system to express: erpnext is mandatory on all plans; CRM is selectable for Business but mandatory for Enterprise.

The Subscription model represents the live contract between a tenant and a plan. It belongs to one tenant and one plan. It carries: status (pending, trialing, active, past\_due, cancelled, paused), trial end timestamp, current billing period start and end timestamps, cancellation timestamp, selected app (for Business tier customers who chose one selectable entitlement), payment provider name, and the provider's own identifiers for the subscription, customer, and checkout session.

The migration that introduces these tables also seeds the three plans with their correct configurations. The Starter plan is pooled, weekly backup, seven day retention, no S3, email support, no SLA. The Business plan is pooled, daily backup, thirty day retention, no S3, priority email support, no SLA. The Enterprise plan is silo\_compose, daily backup, ninety day retention, S3 included, WhatsApp support, SLA included.

The migration also creates a Subscription row for every existing Tenant. The plan slug on the tenant row determines which Plan the subscription references. The billing status on the tenant row determines the subscription status: paid becomes active, failed becomes past\_due, cancelled becomes cancelled, anything else becomes pending. The existing Stripe and DPO identifiers on the tenant row are copied to the corresponding subscription columns. The old columns on the tenant row are not dropped yet — they remain as a safety net until Phase 5.

The Tenant model gains a relationship to Subscription. It also gains a computed property that returns the plan slug by reading from the subscription when available, falling back to the legacy column if not. All new code must use this property rather than reading the legacy column directly.

The tenant creation flow is updated to look up the Plan by slug, validate that any provided selected\_app is a selectable entitlement on that plan, and create a Subscription row alongside the Tenant row. The billing price used for checkout is read from the plan's Stripe price identifier, not from environment variables.

The billing webhook handler is updated to write subscription status changes to the Subscription row. It continues to write to the legacy tenant columns as a dual-write safety measure until Phase 5.

The backup enforcement logic is updated to derive the daily backup limit from the subscription's plan configuration rather than from a hardcoded dictionary.

A new public endpoint allows unauthenticated callers to list active plans and retrieve a plan by slug with its entitlements. This endpoint powers the pricing page.

A new authenticated endpoint returns a tenant's current subscription with full plan detail.

**Acceptance criteria**: All existing tests pass. The migration runs cleanly on a fresh database and on a database with existing tenant rows. After migration, every existing tenant has exactly one subscription row. The three plan rows exist with correct configurations. Creating a new tenant via API creates both a tenant row and a subscription row. The billing webhook updates the subscription status. The plan listing endpoint returns three plans without authentication.

**Commit**: `feat: subscription domain — plans, entitlements, subscriptions (Phase 2)`

---

### Phase 3 — Feature Flags

**Purpose**: Replace scattered plan-string comparisons throughout the codebase with a declarative, per-feature gate system. After this phase, adding a new plan-gated capability requires adding one entry to the feature registry, not hunting through router files for conditional logic.

**What the agent does**:

The features module gains two models. The FeatureFlag model is a registry of every named capability the platform knows about. Each flag has a unique string key and a default enabled state. The TenantFeature model records per-tenant overrides — an operator can grant or revoke any feature for any tenant regardless of their plan. An override takes precedence over the plan-level determination.

A feature registry maps plan slugs to sets of feature keys. The Starter plan includes: weekly\_backup. The Business plan includes: daily\_backup and one\_extra\_app. The Enterprise plan includes: daily\_backup, s3\_backup, all\_apps, custom\_domain, sla\_support, whatsapp\_support, independent\_upgrades, and dedicated\_infra. Future features — sso\_login, advanced\_reporting — are defined in the registry but not assigned to any plan yet.

A FastAPI dependency factory is introduced. Callers pass a feature key to the factory; it returns a dependency that, when evaluated, checks whether the current request's tenant has access to that feature. The check order is: first consult the TenantFeature table for an override; if no override exists, check whether the tenant's plan includes the feature. If access is denied, a 403 response is returned with a message naming the missing feature and the current plan.

The migration seeds the FeatureFlag table with one row per entry in the feature registry.

The backup endpoint is updated to use the feature gate dependency for daily\_backup. The admin feature management endpoints allow operators to set, view, and remove per-tenant feature overrides.

**Acceptance criteria**: All existing tests pass. A tenant on the Starter plan cannot trigger a daily backup — the feature gate returns 403. An Enterprise tenant can trigger a daily backup. An admin can grant daily\_backup to a Starter tenant via the override endpoint, after which that tenant can trigger a daily backup. An admin can revoke a feature from an Enterprise tenant, after which that tenant cannot access it.

**Commit**: `feat: feature flag system with per-tenant overrides (Phase 3)`

---

### Phase 4 — Provisioning Strategy Dispatch

**Purpose**: Introduce a strategy interface in front of the existing bench execution layer. The existing bench code does not change. The worker tasks become dispatchers that select the correct strategy based on the tenant's plan isolation model, then delegate to it.

**What the agent does**:

The provisioning module gains a strategy interface. The interface declares three operations: provision (given a job, tenant, admin password, and list of apps to install), deprovision (given a job and tenant), and backup (given a job and tenant, returns a backup artifact). The interface also declares a property that names the isolation model it handles.

The first implementation is the Pooled Bench Strategy. It handles the pooled isolation model. Its provision operation contains exactly the logic currently in the provision\_tenant worker task: create a new bench site, install ERPNext, install any additional apps in order. Its deprovision operation contains the logic currently in the delete\_tenant task. Its backup operation contains the logic currently in the backup\_tenant task. None of this logic changes — it is relocated from the task functions into the strategy methods.

The second implementation is the Silo Compose Strategy. It handles the silo\_compose isolation model. Its provision operation renders a Jinja2 template into a Docker Compose file, writes it to the tenant's pod directory, starts the stack, waits for the site to become healthy, then installs apps. Its deprovision operation stops and removes the stack. Its backup operation executes the bench backup command inside the tenant's dedicated container. The template must declare Traefik routing labels, resource limits, and the standard ERPNext service set.

A registry maps isolation model names to strategy classes. A factory function looks up the correct strategy for a given tenant by reading the isolation model from the tenant's plan. It raises a clear error if the isolation model is unknown.

The worker task functions are rewritten as pure dispatchers. Each task function loads the job and tenant, calls the factory to get the correct strategy, and delegates the operation to the strategy. Error handling, audit logging, status transitions, and notifications remain in the task functions — these are cross-cutting concerns that do not belong inside a strategy.

A helper method on the strategy interface derives the app installation list from the tenant's subscription: mandatory entitlements are always included; the selected app is appended for Business-tier tenants if it is not already mandatory.

**Acceptance criteria**: All existing tests pass. A test with a Starter plan tenant confirms the pooled strategy is selected and the existing bench mock commands are invoked. A test with an Enterprise plan tenant in mock mode confirms the silo\_compose strategy is selected. The strategy\_for\_tenant factory returns the pooled strategy as a safe default when a tenant has no subscription.

**Commit**: `feat: provisioning strategy dispatch — pooled and silo\_compose (Phase 4)`

---

### Phase 5 — Billing Module Promotion

**Purpose**: Complete the payment provider abstraction. Promote the billing service into a proper module. Drop the legacy billing columns that were kept as a safety net since Phase 2.

**What the agent does**:

The existing payment provider code (base interface, Stripe gateway, DPO gateway, factory) is moved from `app/services/payment/` into `app/modules/billing/payment/`. The old location becomes a shim.

The billing router is moved into `app/modules/billing/router.py`. The webhook endpoint path is updated from `/billing/webhook` to `/billing/webhook/{provider}` where the path parameter names the gateway. The handler validates that the named provider matches the active provider configured in settings. This change requires updating the webhook URL registered in the Stripe dashboard and the DPO merchant portal.

The configuration is extended with DPO Pay credentials: company token, service type, API URL, and payment redirect URL. The active payment provider setting defaults to stripe. Adding a future provider requires one new gateway file and one registry entry — nothing else changes.

The migration drops from the tenants table: billing\_status, stripe\_checkout\_session\_id, stripe\_subscription\_id. It drops stripe\_customer\_id from the users table. It retains platform\_customer\_id on tenants because that is an ERPNext business relationship identifier, not a payment identifier. The plan and chosen\_app columns are retained one more phase.

**Acceptance criteria**: All existing tests pass with updated import paths. The Stripe webhook endpoint receives a checkout.session.completed event and updates the subscription status. The unknown provider path returns a 400 error. The legacy billing columns no longer exist in the schema.

**Commit**: `feat: billing module promotion and legacy billing column removal (Phase 5)`

---

### Phase 6 — Notification Channels

**Purpose**: Add SMS as a second notification channel alongside email. Structure the notification service so that adding a third channel in future requires only a new channel file.

**What the agent does**:

The notifications module gains a channel interface with three members: channel name, enabled flag (derived from configuration), and a send method that accepts recipient address, subject, and body. An email channel wraps the existing MailerSend implementation. An SMS channel calls the Africa's Talking API, which supports Vodacom Tanzania, Tigo, Airtel, and Zantel.

The notification service is refactored to hold a list of channels and dispatch to whichever channels are enabled. When a phone number is available on the recipient, the SMS channel is included in the dispatch alongside email. When no phone number is available, only email is used. SMS failures are logged but do not raise exceptions — email is the authoritative channel.

A phone column is added to the users table. It is optional. The signup flow accepts it but does not require it.

Africa's Talking configuration is added: API key, account username, and optional sender identifier. When the API key is absent, the SMS channel reports itself as disabled and is silently skipped.

**Acceptance criteria**: All existing tests pass. Provisioning complete notification with a phone number triggers both channels. Without a phone number, only email is triggered. Africa's Talking key absent means SMS channel is skipped without error. Africa's Talking API error is logged but does not fail the notification call.

**Commit**: `feat: multi-channel notifications with Africa's Talking SMS (Phase 6)`

---

### Phase 7 — Final Cleanup

**Purpose**: Remove all shim files. Drop the remaining legacy columns. Confirm the migration chain is clean and the codebase has no dead imports.

**What the agent does**:

All shim files created during Phases 1 through 6 are deleted. These are files that contain only re-export statements pointing to their new module locations.

The migration drops the plan and chosen\_app columns from the tenants table. By this point, all code reads plan information through the subscription relationship.

The `app/services/` directory should be empty or contain only files that were not moved (such as `backup_service.py` if it was not absorbed into the provisioning module). If empty, it is removed.

The `app/models.py` file is reduced to only the models that have not yet been moved (User, Job, BackupManifest) or is removed entirely if all models now live in their domain modules.

A final import verification confirms that no file imports from a shim path. A final test run confirms full suite passage at or above the coverage threshold.

**Acceptance criteria**: No file in `app/` contains an import from a path that no longer exists. All tests pass. Alembic check confirms no pending migrations and no drift between models and schema. Coverage is at or above 70%.

**Commit**: `chore: remove legacy shims and deprecated columns (Phase 7)`

---

## Part 5: Frontend Refactor Plan

### Principles for the Frontend

The current frontend reflects the database — it shows tables of records and forms that map to API fields. The target frontend reflects workflows — it guides the user through what they are trying to accomplish.

The three primary user workflows are: getting started (onboarding), managing an existing tenant (dashboard), and understanding account and billing state (account). Every page exists in service of one of these workflows.

The system is not a generic SaaS dashboard. It is a product for Tanzanian SMEs. The language defaults are Swahili with English fallback. Pricing is shown in TZS as the primary denomination. The aesthetic is professional and approachable — not enterprise-cold, not startup-playful. The design system must reflect Biashara Cloud's brand identity, not a generic SaaS template.

### Design System

Before any page is built, the design token layer must exist. Tokens define: brand colours (primary deep green, accent warm amber, surface off-white), semantic colours for success, warning, error, and info states, status colours that map directly to tenant status values (provisioning to amber, active to green, suspended to red, failed to dark red, pending to grey), typography scale with a distinctive display font and a clean body font, spacing scale, border radius values, and shadow levels.

Every UI component is built from these tokens. No component hardcodes a colour value — all visual state is expressed through the token system so that future rebranding or dark mode support requires only token changes.

Core UI primitives to build first: Button with loading state and variants, Badge for general labelling, StatusBadge that maps tenant status strings to the correct status colour tokens automatically, Card as a surface container, Input with error and help text support, Spinner, and Modal with keyboard accessibility. These seven components are the building blocks for every page.

### API Client

A typed API client module must be built before any page that fetches data. The client handles: base URL configuration from environment, JWT injection from the token store, automatic token refresh when an access token is near expiry or when a 401 is received, and retry on the refreshed token. The client exports typed functions for every backend endpoint, grouped by domain. Response types match the backend Pydantic schemas exactly.

A WebSocket hook handles the job progress stream. It accepts a job ID, opens a connection to the job stream endpoint, emits received log lines, and calls a completion callback when the done sentinel is received. It reconnects once on unexpected disconnection and closes cleanly when the component unmounts.

### Public Pages

The landing page has five sections: hero with headline and primary CTA, how-it-works with three steps, pricing with live plan data from the API, feature highlights, and a closing CTA. The pricing section must render dynamically from the plans endpoint — plan names, prices in TZS, included features, and app entitlements are all read from the API, not hardcoded. The page must be statically renderable for SEO.

The authentication pages are login, signup, and forgot password. All three redirect to the dashboard if the user is already authenticated. The signup form collects email, password, and optionally phone number.

### Onboarding Flow

The onboarding flow is a five-step linear sequence. No step is skippable. State persists across steps so that a page refresh does not lose progress.

Step one collects the company name and desired subdomain. The subdomain shows a live preview of the full domain as the user types. Client-side validation rejects reserved names and invalid characters immediately.

Step two presents the plan selection. Plans are fetched from the API and rendered as selectable cards showing TZS price, backup policy, support tier, and included apps. When the Business plan is selected, an additional picker appears listing the selectable app entitlements for that plan. The user must choose one before proceeding.

Step three is payment. It shows an order summary with plan name and price in TZS. It offers two payment paths: card via Stripe Checkout, and mobile money or bank transfer via DPO Pay or a manual flow. Submitting this step calls the tenant creation endpoint and redirects to the provider's checkout page. Return from checkout with success or cancellation query parameters is handled here.

Step four shows provisioning progress. It connects to the job stream WebSocket and displays log output in a terminal-style panel. It also shows human-readable progress steps derived from the log content. When the done sentinel arrives, it advances to step five automatically.

Step five is the success screen. It shows the tenant's ERP URL, username, a note to check email for the password, and two buttons: open the ERP (external link) and go to dashboard.

### Dashboard

The dashboard layout has a sidebar navigation covering: tenants, settings, and account. The header shows the user's email and a logout button. An auth guard on the layout redirects unauthenticated users to login, preserving the intended destination as a query parameter for post-login redirect.

The tenant list page shows all of the user's tenants in a table. Columns show company name, subdomain as a link, plan badge, status badge, creation date, and action buttons. The status badge uses the StatusBadge component and the status colour tokens. Empty state for a user with no tenants shows an encouraging message and a button to start the onboarding flow.

The tenant detail page is the operational hub for a single tenant. It shows the tenant's current status and plan prominently, the full ERP URL as a clickable link, a subscription card with billing period and next renewal date, a recent jobs list with type and status, a recent backups list with size and expiry, and action buttons for backup now, reset admin password, and delete tenant. When a job is running, a job progress panel occupies a visible area of the page and streams live log output via WebSocket. The delete action requires a confirmation modal that shows the tenant's domain and warns that the action is irreversible.

The settings page covers notification preferences and phone number management for SMS notifications.

### Frontend Phase Sequencing

Phase F1 builds the design system and API client only. No pages exist yet. Acceptance: design tokens are defined, all seven core components render correctly in isolation, the API client module compiles with no type errors.

Phase F2 builds the public pages: landing and auth. Acceptance: landing page renders with live plan data from the API, auth pages redirect correctly when authenticated, forms validate and submit.

Phase F3 builds the onboarding flow. Acceptance: all five steps render, state persists across steps, payment redirect works in test mode, WebSocket panel connects and displays mock log lines, success screen shows correct tenant data.

Phase F4 builds the dashboard. Acceptance: tenant list shows live data, status badges display correct colours, tenant detail page shows subscription and job data, WebSocket panel connects when a job is active, backup and delete actions work end to end.

---

## Part 6: Quality and Delivery Standards

### Definition of Done for Each Phase

A phase is done when: all tests pass, the migration chain is clean, the application starts without errors, the specific acceptance criteria listed for that phase are met, and the commit has been made with the correct message format.

### Sequencing Constraints

Phases 1 through 7 must execute in order. Phase 2 depends on Phase 1 because the module boundaries established in Phase 1 determine where the new subscription code lives. Phase 3 depends on Phase 2 because the feature flag system reads plan slugs from the subscription. Phase 4 depends on Phase 2 because the strategy selection reads the isolation model from the plan. Phase 5 depends on Phase 2 because it drops columns that Phase 2 replaced. Phase 6 has no hard dependency on Phase 5 and may run in parallel if resources allow. Phase 7 must run after all other phases are complete.

Frontend phases may begin after Phase 2 is merged, since the subscription domain provides the plan and entitlement data the pricing page needs. Frontend phases proceed in order F1 through F4.

### Migration Chain Reference

The agent must read the existing migration chain before writing any new migration. The expected chain after all phases is: 0001 initial, 0002 audit logs, 0003 billing columns, 0004 backups, 0005 chosen app, 0006 payment provider columns, 0007 subscription domain, 0008 feature flags, 0009 drop legacy billing columns, 0010 drop legacy plan columns, 0011 user phone. If any of 0005 or 0006 are absent from the chain (they may already be present from earlier sprint work), the agent adjusts the numbering and down\_revision accordingly.

### What Success Looks Like

At the end of all phases, the system: provisions ERPNext instances correctly for all three plan tiers using the correct strategy for each, gates plan features declaratively rather than through plan-string conditionals, handles billing events from both Stripe and DPO Pay through a unified webhook interface, sends notifications via email and SMS, and presents users with a workflow-oriented interface in their language with prices in their currency.

The codebase: has one module per domain with clear ownership, has no plan-string literals outside the subscription and features modules, has no billing provider specifics outside the billing module, has no bench execution logic outside the provisioning module, and passes its full test suite at or above the coverage threshold.

---

## Appendix: Domain Ownership Map

This map defines which module owns which concern. When the agent is unsure where a new piece of code belongs, it consults this map.

The identity module owns: user authentication, password hashing and verification, JWT creation and decoding, access token and refresh token lifecycle, token revocation, login audit events.

The tenant module owns: the tenant entity, tenant status transitions, tenant creation (the part that creates the database row), tenant suspension and deletion lifecycle, the state machine that governs valid status transitions.

The subscription module owns: plan definitions, plan entitlements, subscription lifecycle, billing status as expressed through subscription status, the mapping from plan slug to capabilities, the API that exposes plans to the public.

The features module owns: the named feature registry, the plan-to-feature mapping, per-tenant overrides, the dependency factory that gates endpoints.

The provisioning module owns: the strategy interface, the pooled bench strategy, the silo compose strategy, the strategy registry and factory, the Compose template for dedicated stacks, the app installation list derivation from plan entitlements.

The billing module owns: payment gateway interfaces, the Stripe gateway implementation, the DPO Pay gateway implementation, the gateway registry and factory, the webhook router, the translation of provider-specific events to canonical payment outcomes.

The notifications module owns: the channel interface, the email channel, the SMS channel, the notification service that dispatches to enabled channels, all message templates.

The audit module owns: the audit log model, the function that writes audit events, all audit event type constants.

The observability module owns: Sentry initialisation, Prometheus metrics exposure, structured logging configuration.
