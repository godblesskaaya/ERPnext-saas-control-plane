# Frontend Hardening Plan

## Purpose

This document outlines a refactor plan for the SaaS control plane frontend so it becomes easier to navigate, easier to extend, and more robust for production use.

This is **not** a visual polish exercise. The main goal is to improve:

- information architecture
- shell architecture
- separation of concerns
- usability of operational screens
- maintainability and production robustness

---

## Problem Statement

The current frontend already has a strong foundation with route grouping and domain-oriented folders, but it is still behaving too much like **one dashboard with many pages** instead of a **suite of operator workspaces**.

### Current pain points

1. **Monolithic operational screens**
   - Some screens, especially tenant detail flows, contain too much information and too many actions in a single page.
   - This hurts usability, readability, and maintainability.

2. **Thin shell architecture**
   - The shell is not clearly separated from feature content.
   - Layout, navigation, session behavior, and page structure are too tightly coupled.

3. **Overloaded navigation model**
   - Navigation is trying to expose too many concepts in one place.
   - Global navigation and contextual navigation are not sufficiently separated.

4. **Weak page composition boundaries**
   - Pages are carrying too much composition responsibility instead of relying on shell and feature modules.

5. **Inconsistent operator experience**
   - The application does not yet feel like a coherent control plane with distinct workspaces.

---

## Refactor Goal

Refactor the frontend from:

**“a dashboard with many operational pages”**

into:

**“a control plane made of clear workspaces, each with its own shell, navigation, and operational scope.”**

---

## Architectural Direction

The frontend should be redesigned around **workspaces**, not just route groups.

### Proposed workspaces

1. **Overview Workspace**
   - Global KPIs
   - urgent actions
   - incidents summary
   - platform health snapshot

2. **Tenant Operations Workspace**
   - tenant registry
   - tenant lifecycle management
   - tenant search and summaries
   - tenant detail workspaces

3. **Billing Workspace**
   - subscriptions
   - invoices
   - dunning
   - payment recovery
   - billing-related suspensions

4. **Support Workspace**
   - cases
   - notes
   - escalations
   - support workflows

5. **Platform Workspace**
   - provisioning operations
   - background jobs
   - infrastructure health
   - internal operational tooling

6. **Account Workspace**
   - current user profile
   - notifications
   - preferences
   - personal settings

This change should drive both the navigation model and the shell structure.

---

## Target Shell Model

The app should no longer rely on a single generalized dashboard shell. Instead, it should introduce a layered shell architecture.

### Recommended shell layers

- **Root Shell**
  - global providers
  - app-wide theme and baseline structure

- **Authenticated Shell**
  - authentication boundary
  - session handling
  - access protection

- **Workspace Shell**
  - global sidebar
  - workspace header
  - breadcrumbs
  - page title region
  - primary actions region
  - content frame

- **Entity Shells**
  - used for detail workspaces such as tenant detail
  - local tabs or sub-navigation
  - contextual action bar
  - entity-specific layout framing

### Shell responsibilities

The shell layer should own:

- layout frame
- global navigation
- local navigation
- breadcrumbs
- page headers
- action bars
- role-aware visibility
- empty, loading, and error wrappers

The page layer should own:

- only page-specific content
- local data presentation
- local interactions
- feature-specific actions

---

## Navigation Refactor

The current navigation should be redesigned into a multi-level system.

### New navigation model

#### Level 1: Global workspaces
This should remain stable and always visible.

Example:
- Overview
- Tenants
- Billing
- Support
- Platform
- Account

#### Level 2: Workspace-local navigation
This should change depending on the selected workspace.

Example for Tenants workspace:
- Registry
- Lifecycle
- Suspensions
- Activity
- Search

#### Level 3: Entity-local navigation
Used inside detail views such as a tenant workspace.

Example for a tenant detail area:
- Overview
- Members
- Domains
- Billing
- Jobs
- Audit
- Backups
- Support

### Navigation principles

- Do not expose every concern in one sidebar.
- Separate global app movement from local workflow movement.
- Make the default path obvious for operators.
- Use contextual navigation for detail-heavy areas.

---

## Tenant Detail Refactor

The tenant detail screen should be treated as a **mini-application**, not a single page.

### Current issue

The tenant detail experience currently concentrates too many operational concerns in one place, creating information overload and poor usability.

### Proposed route model

```text
/tenants/[id]
/tenants/[id]/overview
/tenants/[id]/members
/tenants/[id]/domains
/tenants/[id]/billing
/tenants/[id]/jobs
/tenants/[id]/audit
/tenants/[id]/backups
/tenants/[id]/support
```

### Default tenant page

The default route should become a concise **tenant overview** page containing:

- tenant status
- plan/subscription snapshot
- domain health
- member count
- recent jobs
- billing status
- recent incidents or support activity
- recommended next actions

All deeper operational concerns should move into focused subroutes.

### Why this matters

This is the single highest-impact usability improvement in the current frontend because it reduces cognitive overload and turns one overloaded page into a clear operational workspace.

---

## Target Folder Structure

A recommended target structure is shown below.

```text
app/
  layout.tsx
  (public)/
  (auth)/
  (workspace)/
    layout.tsx
    overview/
    tenants/
      page.tsx
      [id]/
        layout.tsx
        overview/
        members/
        domains/
        billing/
        jobs/
        audit/
        backups/
        support/
    billing/
    support/
    platform/
    account/

domains/
  shell/
    application/
    components/
      AppFrame.tsx
      WorkspaceSidebar.tsx
      WorkspaceHeader.tsx
      Breadcrumbs.tsx
      ContextRail.tsx
      PageHeader.tsx
      ActionBar.tsx
      EmptyState.tsx
      ErrorState.tsx
      LoadingState.tsx
    model/
      workspace.ts
      nav.ts
  auth/
  overview/
  tenant/
    application/
    model/
    services/
    ui/
      summary/
      members/
      domains/
      billing/
      jobs/
      audit/
      backups/
      support/
  billing/
  support/
  platform/
  shared/
```

### Design principle behind the structure

- `app/` should describe route and layout composition.
- `domains/` should describe business and feature boundaries.
- `shell/` should become a first-class domain, not an incidental wrapper.

---

## Component Responsibility Rules

To improve long-term maintainability, responsibilities should be made explicit.

### Shell components
Responsible for:
- layout framing
- workspace navigation
- page title regions
- breadcrumbs
- action surfaces
- visibility rules
- shared page wrappers

### Feature screen components
Responsible for:
- one operational concern only
- local filters and search
- local tables/forms
- local mutations
- local loading and error states

### Shared UI components
Responsible for:
- cards
- tables
- filter bars
- status badges
- section layouts
- modals/drawers
- empty states
- skeleton states
- confirmation dialogs

### Data layer
Responsible for:
- fetching
- caching
- mutation handling
- invalidation
- retry strategy
- error normalization

---

## State and Data Layer Hardening

The refactor should introduce a clearer client-side data strategy.

### Recommendation

Adopt a query-oriented data layer such as **TanStack Query** for feature data management.

### Why

This will help with:

- caching tenant summaries
- handling tabbed detail routes cleanly
- mutation invalidation
- standardized loading states
- refetch control
- retry logic
- better separation between view and data concerns

Without this, the new multi-route workspace model may still end up with inconsistent and repetitive data-handling logic.

---

## Standard Page Patterns

To reduce reinvention and improve consistency, the app should define reusable page patterns.

### Required patterns

1. **Dashboard / Overview page**
   - KPI strip
   - recent activity
   - urgent actions
   - summary cards

2. **List page**
   - title/header
   - filters
   - search
   - table/grid
   - empty state
   - bulk actions if needed

3. **Detail workspace page**
   - summary rail
   - local tabs/nav
   - contextual actions
   - activity/timeline components

4. **Queue / Operational page**
   - processing status
   - logs
   - job health
   - retry/cancel actions

5. **Settings page**
   - grouped forms
   - save/reset actions
   - validation feedback

These patterns should be encoded through shared building blocks, not recreated from scratch on each page.

---

## Phased Refactor Plan

## Phase 1 — Lock the information architecture

Before touching implementation heavily, define:

- target sitemap
- workspaces
- navigation matrix
- page inventory
- action inventory
- what belongs together
- what should never appear on the same screen

### Deliverables
- workspace map
- navigation map
- page inventory document
- tenant detail decomposition map

### Outcome
Prevents rebuilding the same complexity in cleaner code.

---

## Phase 2 — Extract the shell system

Create a formal shell layer with:

- `AppFrame`
- `WorkspaceSidebar`
- `TopBar`
- `Breadcrumbs`
- `PageHeader`
- `ActionBar`
- `ContentContainer`
- `EmptyState`
- `ErrorState`
- `LoadingState`

### Outcome
Pages stop carrying structural concerns that belong in shared shell infrastructure.

---

## Phase 3 — Refactor the navigation model

Replace the current broad centralized nav model with:

- global workspace navigation
- workspace-local navigation
- entity-local navigation
- role filtering as a separate concern

### Outcome
Improves navigability and reduces cognitive overload.

---

## Phase 4 — Split the tenant detail flow

Refactor the tenant detail screen first.

### Suggested order
1. overview
2. members
3. domains
4. billing
5. jobs
6. support
7. audit
8. backups

### Outcome
Delivers the largest usability gain early.

---

## Phase 5 — Standardize shared page patterns

Create reusable patterns for:

- overview pages
- list pages
- detail pages
- queue pages
- settings pages

### Outcome
Makes the application feel like one product instead of many custom screens.

---

## Phase 6 — Harden production quality

After the architecture and major UX issues are improved, strengthen robustness with:

- component tests
- route-level integration tests
- permission visibility tests
- loading/error state tests
- shell rendering tests
- navigation regression tests

### Outcome
Makes future changes safer and reduces regression risk.

---

## Immediate Priorities

If execution needs to start with the highest-impact steps, use this order:

1. Define the workspace architecture and sitemap
2. Build the new shell primitives
3. Replace the current generalized dashboard shell
4. Refactor the navigation model
5. Split the tenant detail page into nested routes
6. Introduce a query/data layer
7. Standardize page patterns
8. Add UI-level regression protection

---

## What Not To Do

To keep the refactor effective, avoid the following:

- Do not start with visual redesign only.
- Do not begin by changing colors, spacing, or icons.
- Do not simply move files around without redefining the information architecture.
- Do not keep the same overloaded route semantics and just make the UI prettier.
- Do not refactor every page at once.

The first objective is structural clarity, not cosmetic improvement.

---

## Expected Outcome

After this refactor, the frontend should feel like:

- a clear control plane
- a set of operator workspaces
- an application with predictable navigation
- a system where large operational areas are decomposed into focused flows
- a codebase where shells, features, and shared UI each have explicit responsibilities

This will improve:

- usability
- maintainability
- extensibility
- team velocity
- production robustness

---

## Summary

The frontend should stop behaving like a single overloaded dashboard and start behaving like a structured operational platform.

The most important change is not visual; it is architectural.

The refactor should prioritize:

- workspace-driven information architecture
- a proper shell system
- contextual navigation
- decomposition of monolithic operational pages
- stronger data and UI boundaries

This will create a frontend that is easier for operators to use and easier for developers to evolve safely.
