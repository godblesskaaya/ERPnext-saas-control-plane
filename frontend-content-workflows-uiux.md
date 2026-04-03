# Frontend Content Analysis, Workflows, and UI/UX Refactor Plan

## Purpose

This document extends the structural frontend hardening plan with a product-facing refactor plan focused on:

- content hierarchy and information density
- operator workflows
- UI/UX interaction patterns
- navigability and usability
- screen-level decomposition for production robustness

The goal is to move the control plane from a route-rich dashboard into a **clear operator product** with guided flows, better cognitive load management, and stronger task completion.

---

## Reference Repositories

Benchmark reference:
- https://github.com/sourcefuse/arc-react-sass-ui

Current frontend under review:
- https://github.com/godblesskaaya/ERPnext-saas-control-plane/tree/main/saas-ui

---

## 1. Current Product Diagnosis

The current frontend already has meaningful domain separation at the repository level. The `saas-ui` app is split into route groups and domains, including `app`, `domains`, and domain modules such as `tenant-ops` and `shared`. The dashboard route tree already includes many operational areas such as `account`, `active`, `activity`, `audit`, `billing-details`, `billing-ops`, `billing-recovery`, `billing`, `incidents`, `onboarding`, `overview`, `platform-health`, `provisioning`, `registry`, `settings`, `support-overview`, `support`, and `suspensions`. This proves the problem is **not lack of functionality coverage**; it is primarily a **content, workflow, and product experience problem**.

### What is currently working

- Good route coverage for control-plane concerns
- Good early domain decomposition in the codebase
- Useful queue-oriented operational thinking
- A real attempt at journey-first routing and admin/workspace separation

### What is currently breaking the experience

1. **Too many concepts are visible at the same level.**
   The dashboard navigation currently mixes workspace pages, workflow queues, billing routing, support routing, account routing, and platform routing inside one navigation model. That makes the app feel broad but not guided.

2. **The app is overly queue-centric without enough task framing.**
   The `WorkspaceQueuePage` is being reused across several dashboard pages. That helps implementation speed, but it also causes pages to feel structurally similar even when their operator intent is different.

3. **Tenant detail is overloaded.**
   The tenant detail page is carrying tenant data, members, domains, support notes, audit logs, backups, recent jobs, subscription state, restore actions, and admin actions in one page. That is the clearest source of usability strain.

4. **The shell does not do enough product work.**
   The current dashboard shell is very thin, and `UserShell` is still handling auth/session logic and dashboard layout concerns in one place. The shell is not yet acting like a full application frame with strong hierarchy, context, and flow guidance.

5. **The content hierarchy is weak.**
   Important content, urgent content, contextual content, and historical content are too close together. Operators are asked to interpret too much before they can act.

---

## 2. Core UX Problem Statement

The current UI has enough features to operate the SaaS control plane, but the product experience still behaves like:

> “a dashboard containing many operational views”

It needs to become:

> “a suite of focused operator workspaces with clear next actions, progressive disclosure, and low-friction task completion.”

That means the refactor should not only move files or routes. It should redesign:

- what content appears first
- what content is deferred
- how the operator moves between contexts
- where actions are initiated
- how the app communicates urgency and system state

---

## 3. Content Analysis: What the App Should Contain

The frontend should be redesigned around **content layers**.

### Layer A — Decision content
This is the content needed to decide what to do next.

Examples:
- number of failed workspaces
- pending payments
- provisioning queue backlog
- incidents by severity
- suspended tenants
- tenants requiring support follow-up

This content belongs on:
- overview workspace
- billing workspace home
- support workspace home
- platform workspace home
- tenant overview pages

### Layer B — Action content
This is the content needed to perform the next task.

Examples:
- retry provisioning
- reset admin login
- change plan
- invite member
- verify domain
- restore backup
- suspend / unsuspend tenant
- open invoice

This content should sit **close to the relevant object**, not inside giant general pages.

### Layer C — Context content
This helps an operator understand the case before acting.

Examples:
- tenant plan
- billing status
- payment channel
- chosen app
- owner or support contact
- current tenant status
- service health context
- recent notes

This should appear in side panels, summary cards, subheaders, and entity overview pages.

### Layer D — Historical content
This supports auditability but should not dominate primary flows.

Examples:
- audit logs
- job logs
- support note history
- backup history
- billing history

This belongs in dedicated tabs, drawers, timelines, or expandable sections — not mixed into the top of primary action pages.

---

## 4. Recommended Product Workspaces

The app should be redesigned into six primary workspaces.

## 4.1 Overview Workspace
**Purpose:** executive and operator command center

### Primary user questions
- What needs attention right now?
- What has changed today?
- What is blocking growth or service quality?
- Which queue should I enter first?

### Required content
- KPI strip: total tenants, active tenants, failed tenants, pending payments, suspended tenants
- action center cards
- urgent alert stack
- service health summary
- recent jobs pulse
- support pressure summary
- billing recovery summary

### UI recommendations
- keep it light and directional
- no dense tables on the first screen
- use cards and ranked priority blocks
- show no more than 5–7 key numbers
- emphasize “next best actions” over raw data

---

## 4.2 Tenant Operations Workspace
**Purpose:** search, inspect, and operate on tenant accounts

### Primary user questions
- Which tenant am I looking for?
- What state is this tenant in?
- What action should I take next?
- Is this a billing, provisioning, support, or domain issue?

### Required content
- tenant registry/search
- filter bar (status, plan, app, payment state, support state)
- list/table of tenants
- tenant summary cards
- tenant detail workspace

### UX recommendations
- registry should optimize for search and triage
- keep bulk scanning easy
- reduce visual noise in row actions
- move destructive actions behind menus/drawers
- reserve the detail route for deep work, not list screens

---

## 4.3 Billing Workspace
**Purpose:** recover revenue, explain payment state, and complete billing actions

### Primary user questions
- Who has unpaid or failed billing?
- Who is blocked because of billing?
- What should the operator or customer do next?

### Required content
- billing recovery queue
- unpaid invoices
- payment blockers
- billing status breakdown
- open invoice links
- direct customer recovery actions

### UX recommendations
- billing pages should be simpler than ops pages
- lead with status + next action
- keep invoice detail readable and skimmable
- distinguish “operator action needed” from “customer action needed”

---

## 4.4 Support Workspace
**Purpose:** resolve customer issues and coordinate follow-up

### Primary user questions
- Which cases are urgent?
- Who owns this issue?
- What is the latest note or promised follow-up?
- What can I do immediately?

### Required content
- support queue
- case ownership / assignee visibility
- due date and SLA indicators
- support notes
- escalations
- linkage to tenant detail

### UX recommendations
- support needs timeline thinking
- use status + owner + due date as first-class elements
- make note capture fast
- surface unresolved items before verbose history

---

## 4.5 Platform Workspace
**Purpose:** monitor the internal health of the control plane and provisioning systems

### Primary user questions
- Is the platform healthy?
- Which jobs are failing?
- Is provisioning delayed?
- Is an issue local to a tenant or systemic?

### Required content
- platform health summary
- queue sizes
- failed jobs
- retries and incident routing
- service dependency health

### UX recommendations
- platform views can be denser
- but should still separate alerting from deep diagnostics
- show systemic issues first
- avoid mixing platform health into customer-facing workspaces unless it directly affects the user’s task

---

## 4.6 Account Workspace
**Purpose:** operator profile, preferences, notification readiness

### Required content
- current user profile
- session and security settings
- email verification state
- notification preferences
- account metadata

### UX recommendations
- keep this boring and small
- do not over-invest here early
- this workspace should reduce friction, not compete with operational workspaces

---

## 5. Tenant Detail: Recommended Content Model

The tenant detail route should become a **mini-application** instead of a mega-page.

## 5.1 Route breakdown

```text
/tenants/[id]/overview
/tenants/[id]/members
/tenants/[id]/domains
/tenants/[id]/billing
/tenants/[id]/jobs
/tenants/[id]/audit
/tenants/[id]/backups
/tenants/[id]/support
```

## 5.2 Content by subpage

### Overview
Purpose: operator snapshot and next action

Include:
- tenant status
- plan
- app/focus
- billing state
- latest invoice summary
- latest backup summary
- recent jobs summary
- support note summary
- recommended next action

Do **not** include full tables for every subsystem.

### Members
Include:
- members table
- invite teammate flow
- role change actions
- remove member actions
- member status or recent join state

### Domains
Include:
- domain list
- primary domain indication
- verification state
- add domain flow
- verify domain action
- remove domain action

### Billing
Include:
- current subscription
- invoice history
- payment state
- links to invoice / portal
- billing notes or hold reasons

### Jobs
Include:
- recent jobs
- live job status
- retry options where relevant
- job logs and timestamps

### Audit
Include:
- audit log list
- filters by action type / actor / date
- export later if needed

### Backups
Include:
- latest backup state
- backup history
- restore actions
- restore confirmations

### Support
Include:
- support notes
- open follow-ups
- owner
- due date
- next promised action

---

## 6. Workflow Analysis

The app should prioritize a small number of high-frequency workflows.

## 6.1 Workflow: New tenant onboarding

### Current intent
The app already includes onboarding, provisioning, payment, and registry routes.

### Desired operator flow
1. open onboarding queue
2. review tenant/payment readiness
3. confirm next setup state
4. move into provisioning or recovery path
5. land on tenant overview when setup completes

### UX issues to solve
- too much same-layout repetition across queues
- status is visible, but action path is not guided strongly enough
- handoff between payment and provisioning needs stronger UI cues

### Recommended UI pattern
- queue list on left / center
- selected tenant preview on right or in drawer
- explicit “next recommended action” module
- action outcomes shown inline

---

## 6.2 Workflow: Provisioning failure recovery

### Desired operator flow
1. open incidents queue
2. identify failed tenant(s)
3. inspect recent job/log context
4. retry or escalate
5. confirm tenant returns to provisioning / active state

### UX recommendations
- incidents queue should rank by severity and recency
- use red state sparingly but clearly
- make retry path visible without opening giant details first
- deep logs should be expandable, not always visible

---

## 6.3 Workflow: Billing recovery

### Desired operator flow
1. open billing recovery queue
2. identify blocked or unpaid accounts
3. view invoice/payment context
4. notify or direct customer to payment action
5. confirm billing state recovery and reactivation

### UX recommendations
- keep payment center and operator billing views clearly separated
- show customer-facing next action separately from internal ops note
- invoice state should be scannable from list pages

---

## 6.4 Workflow: Tenant support follow-up

### Desired operator flow
1. open support queue
2. inspect owner, due date, and latest note
3. open linked tenant
4. add note / update case / escalate
5. close or reschedule follow-up

### UX recommendations
- prioritize open and overdue work
- timeline/ticket pattern is better than giant forms
- note creation should be fast and lightweight

---

## 6.5 Workflow: Routine tenant maintenance

### Desired operator flow
1. search tenant in registry
2. open tenant overview
3. branch into members / domains / billing / backups / jobs
4. complete one task
5. return to tenant overview or previous queue

### UX recommendations
- tenant overview should act as the stable home
- use secondary tabs for sub-sections
- do not force repeated reorientation across pages

---

## 7. UI/UX Recommendations

## 7.1 Reduce cognitive load through progressive disclosure

Currently, too much operational data is gathered into single experiences. The redesign should enforce:

- summary first
- detail on demand
- history last

### Rule
A page should answer this order:
1. what is this thing?
2. what state is it in?
3. what should I do next?
4. where do I go deeper?

---

## 7.2 Distinguish between overview pages and working pages

### Overview pages
- metrics
- priorities
- alerts
- high-level summaries
- next actions

### Working pages
- tables
- filters
- forms
- task execution
- detailed records

Do not mix both heavily on one screen.

---

## 7.3 Improve navigation clarity

### Global navigation should show only workspaces
Recommended global nav:
- Overview
- Tenants
- Billing
- Support
- Platform
- Account

### Local navigation should appear inside workspaces
Examples:
- Tenant workspace tabs: Overview / Members / Domains / Billing / Jobs / Audit / Backups / Support
- Billing workspace tabs: Recovery / Invoices / Summary
- Support workspace tabs: Queue / Overdue / Escalations

This is cleaner than exposing too many top-level route concepts at once.

---

## 7.4 Reduce action clutter in tables

The current tenant table exposes many actions directly in the row. That is useful, but it can become visually noisy.

### Recommendation
Use a priority model:
- primary row action: open details
- one high-frequency quick action if justified
- remaining actions under an actions menu or drawer

### Example row actions
Visible:
- Details
- Retry provisioning (only if failed)

Overflow menu:
- Backup now
- Reset admin login
- Change plan
- Delete workspace

---

## 7.5 Use clearer state design

Statuses already exist in the app, but they should be visually structured around meaning, not just color.

### State groups
- Healthy: active, ready
- Transitional: pending, provisioning, upgrading, restoring
- Needs attention: failed, overdue, unpaid
- Restricted: suspended_admin, suspended_billing, suspended
- Archived/final: deleted, pending_deletion

### Recommendation
Each state presentation should include:
- status label
- one-line explanation
- next recommended action

---

## 7.6 Introduce better empty, loading, and degraded states

The current code already accounts for unsupported endpoints and unavailable metrics in places. That is good operationally.

The UX should go further:

### Empty states
- explain what is missing
- explain why it matters
- provide one primary action

### Loading states
- use section-level skeletons
- preserve page structure while loading
- avoid blank screens after auth checks

### Degraded states
- explain whether the issue is backend capability, temporary outage, or permission problem
- preserve the rest of the workspace when possible

---

## 7.7 Use page archetypes consistently

Create a small set of page patterns and reuse them.

### Archetype A — Command center page
Used for: Overview, platform health, support overview

Layout:
- page title + actions
- KPI row
- alert stack
- priority cards
- recent activity summary

### Archetype B — Queue page
Used for: onboarding, incidents, billing recovery, support queue

Layout:
- page title + filters
- queue summary strip
- table/list
- row detail preview or quick action drawer

### Archetype C — Entity overview page
Used for: tenant overview

Layout:
- entity header
- summary cards
- recommended actions
- recent critical history
- deep-link cards to subpages

### Archetype D — Detail management page
Used for: members, domains, billing, backups, audit

Layout:
- header + scoped actions
- focused table/list/form
- secondary insights in side panel or footer region

---

## 8. Content Prioritization Rules

Use these rules when deciding what belongs on each page.

### Must be top-level on page
- current state
- urgency
- next best action
- summary metrics
- immediate blockers

### Should be secondary
- related context
- short recent history
- supporting metadata

### Should be tertiary or hidden by default
- verbose historical logs
- destructive actions
- dense diagnostics
- long note history

---

## 9. Recommended Design Principles for This Product

1. **Action over exposition**
   Operators should immediately know what they can do next.

2. **One dominant purpose per screen**
   Every page should feel like it exists for one main job.

3. **Summary before depth**
   Show the answer before showing the evidence.

4. **Context without crowding**
   Keep enough context visible to act confidently, but avoid full-system dumps.

5. **Consistent wayfinding**
   Keep workspace, entity, and queue navigation predictable.

6. **Operational calm**
   The UI should make urgent issues obvious without making the whole app feel alarming.

---

## 10. Implementation Priorities

## Priority 1 — redesign content hierarchy
Do first:
- define workspace content contracts
- define tenant overview content contract
- decide what moves out of giant pages

## Priority 2 — refactor tenant detail UX
Do next:
- split into nested sections
- create tenant overview as the default landing page
- move historical subsystems into dedicated tabs/routes

## Priority 3 — redesign navigation experience
Do next:
- replace broad route-style navigation with workspace navigation
- introduce local subnavigation inside workspaces
- add breadcrumb and entity context layers

## Priority 4 — standardize page archetypes
Do next:
- overview page pattern
- queue page pattern
- entity overview pattern
- detail management pattern

## Priority 5 — refine action surfaces
Do next:
- reduce row action clutter
- move destructive actions behind confirmations/drawers
- surface recommended actions near status

---

## 11. Suggested Deliverables for Developer Execution

### Strategy deliverables
- workspace sitemap
- content inventory by page
- workflow inventory by operator role
- navigation map
- page archetype map

### UX deliverables
- low-fidelity wireframes for each workspace home
- tenant overview wireframe
- queue page wireframe
- tenant subpage wireframes
- action drawer patterns

### Engineering deliverables
- new route structure
- shell refactor
- tenant detail decomposition
- shared page components for queue/entity/detail patterns
- new navigation model

---

## 12. Final Position

The frontend does not mainly need more screens; it needs **better product choreography**.

The current app already proves the backend/control-plane concepts are present. The next leap in quality will come from:

- reducing information density
- separating work by operator intent
- turning giant operational pages into guided sub-workspaces
- moving history and low-frequency functions away from the main decision path

The result should feel less like a collection of admin routes and more like a reliable production control plane.

---

## Repo-Specific Evidence Used

This analysis is based on the current `saas-ui` repo structure and selected frontend files, including:

- dashboard route tree under `app/(dashboard)/dashboard`
- dashboard navigation configuration in `domains/dashboard/domain/navigation.ts`
- current shell implementation in `app/(dashboard)/layout.tsx` and `domains/dashboard/components/UserShell.tsx`
- queue reuse in `domains/dashboard/components/WorkspaceQueuePage.tsx`
- tenant table and action density in `domains/dashboard/components/TenantTable.tsx`
- tenant detail complexity in `app/(dashboard)/tenants/[id]/page.tsx`
- SourceFuse ARC React SaaS UI positioning as a production-ready multi-tenant SaaS control plane

