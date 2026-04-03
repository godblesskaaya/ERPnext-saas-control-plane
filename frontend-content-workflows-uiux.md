# UI Direction Spec

## Goal

Refine the SaaS control-plane frontend into a clearer, more intuitive, production-grade web app with a calmer shell, stronger hierarchy, better contrast, and a more restrained visual language inspired by Kinsta.

This is not a full redesign from scratch. It is a **UI hardening and polish pass** focused on:

* app shell clarity
* navigation simplicity
* stronger visual hierarchy
* higher contrast and better readability
* less decorative, more operational styling
* more consistent page structure

---

## Core Design Direction

The interface should feel:

* technical
* calm
* premium
* operational
* high-trust
* restrained

It should **not** feel:

* playful
* bubbly
* overly colorful
* overly soft
* overly rounded
* like a generic dashboard template

The product should communicate:

* control
* clarity
* reliability
* confidence
* focus

---

## Primary Problems in the Current UI

### 1. The shell is too weak

The current layout does not create a strong sense of orientation. The app frame is not doing enough work to guide the user.

### 2. The sidebar feels too heavy

Too many concepts are visible at once, and the navigation model is carrying too much information.

### 3. The visual style is too soft

The current use of rounded corners, warm colors, and Material-like defaults makes the app feel less like a serious control plane.

### 4. Contrast is not strong enough

Text, surfaces, and action hierarchy need clearer separation.

### 5. Pages do not have strong zones

Many screens feel like continuous blocks of UI instead of clearly structured sections.

---

## Design Inspiration

Kinsta should be used as inspiration for:

* restrained color usage
* premium simplicity
* clean page framing
* strong hierarchy
* minimal noise
* focused navigation
* clear sections

Do **not** copy Kinsta literally.
Use it as a directional benchmark for tone and structure.

---

# 1. App Shell Specification

## Required App Frame

Every authenticated screen should follow a consistent app shell:

1. **Top Header**
2. **Left Sidebar / Navigation Rail**
3. **Main Content Area**
4. **Light Footer / Status Strip**

---

## 1.1 Top Header

### Purpose

The top header should provide global orientation and lightweight utility access.

### It should contain

* product logo / brand mark
* current workspace name
* optional global search
* notifications
* help / docs shortcut
* user menu

### It should not contain

* large page-specific action sets
* long descriptive text
* deep navigation trees
* cluttered controls

### Style direction

* fixed/sticky at the top
* slim height
* white or near-white background
* subtle bottom border
* minimal shadow
* dark text/icons
* clear active state for search or utilities

### Behavioral rules

* remains visible while content scrolls
* should not visually dominate the page
* page-specific actions belong in the page header, not here

---

## 1.2 Sidebar / Navigation Rail

### Purpose

The sidebar should provide only top-level workspace navigation.

### The sidebar should be minimal

Recommended top-level items:

* Overview
* Tenants
* Billing
* Support
* Platform
* Account

### Sidebar rules

* icon + short label only
* no long helper text by default
* no verbose descriptions
* keep item count low
* avoid long scrolling
* keep hierarchy shallow

### Do not place these as primary sidebar items

These should move into local tabs or workspace-level sub-navigation:

* incidents
* suspensions
* billing recovery
* provisioning jobs
* onboarding workflows
* activity logs
* tenant subfunctions

### Sidebar visual style

* visually quiet
* neutral background
* active item highlighted with subtle fill or border accent
* hover state understated
* small spacing rhythm
* compact but not cramped

### Responsive behavior

* desktop: persistent compact sidebar
* tablet: collapsible sidebar
* mobile: temporary drawer

---

## 1.3 Main Content Area

### Purpose

The main content area should be structured and easy to scan.

### Every page should follow this order

1. Breadcrumbs
2. Page header
3. Summary / KPI strip if needed
4. Primary work area
5. Secondary supporting sections
6. Utility footer/status area if relevant

### Content area rules

* generous whitespace
* clear section separation
* strong heading hierarchy
* no giant uninterrupted pages
* primary task should be visually obvious

---

## 1.4 Footer / Status Strip

### Purpose

A lightweight footer can provide utility information, not primary interaction.

### Appropriate content

* app version
* environment badge
* system/API status
* background job indicator
* small legal/meta links

### Should not contain

* core navigation
* important actions
* major summaries

### Style direction

* very subtle
* compact
* quiet typography
* border-top instead of strong styling

---

# 2. Navigation Model

## Principle

The UI should move from a “big dashboard with many destinations” to a “suite of workspaces with local navigation”.

---

## 2.1 Global Navigation

Global navigation should only represent major workspaces.

Recommended:

* Overview
* Tenants
* Billing
* Support
* Platform
* Account

---

## 2.2 Local Workspace Navigation

Inside each workspace, use tabs or local sub-navigation.

### Examples

**Tenants**

* Registry
* Active
* Suspended
* Search
* Imports / Bulk Actions

**Billing**

* Invoices
* Recovery
* Payments
* Plans
* Exceptions

**Platform**

* Health
* Provisioning
* Jobs
* Incidents
* Capacity

**Support**

* Queue
* Escalations
* Notes
* SLA / Metrics

---

## 2.3 Entity-Level Navigation

For complex objects like tenants, use sub-routes or local tabs.

Recommended tenant navigation:

* Overview
* Members
* Domains
* Billing
* Jobs
* Audit
* Backups
* Support

The tenant default page should be **Overview**, not an all-in-one operational dump.

---

# 3. Page Layout Standards

## 3.1 Page Header Pattern

Every page should have a dedicated header block.

### Page header contains

* breadcrumbs
* page title
* short subtitle / context line
* page-level actions
* optional filters/search aligned cleanly

### Page header rules

* title must be obvious
* subtitle must be brief and useful
* keep actions focused
* do not overload with buttons
* primary action should be visually distinct

---

## 3.2 Section Layout Pattern

Each page should be broken into clear sections.

### Recommended section anatomy

* section title
* optional short description
* section content
* local actions if relevant

### Section rules

* use spacing to separate sections
* avoid stacking too many cards without grouping
* prefer fewer, stronger blocks
* long pages should be segmented clearly

---

## 3.3 KPI / Summary Strip

Use summary cards only when they support decision making.

### Good KPI usage

* status
* plan
* unpaid balance
* active members
* recent failures
* storage / usage signals

### Avoid

* decorative metrics
* too many equal-weight cards
* dashboards with no clear next action

---

## 3.4 Tables and Dense Information

Operational apps often need tables, but they must remain easy to scan.

### Table rules

* strong headers
* adequate row height
* restrained zebra or border treatment
* clear status cells
* compact action menus
* sticky header if needed
* filters above table, not mixed into title

### Dense content rule

When information is dense, use:

* tabs
* drawers
* expanders
* split views
* details panels

Do not dump all secondary information into one page.

---

# 4. Visual System Direction

## 4.1 Color Philosophy

Move away from the current warm, soft palette.

Target a system based on:

* neutral surfaces
* deep text contrast
* one primary accent color
* semantic colors only for meaning

### Desired feel

* crisp
* cool-neutral
* professional
* low-noise

---

## 4.2 Suggested Color Token Strategy

### Neutrals

* background canvas: very light neutral
* panel/card surface: white
* elevated overlay: white
* subtle border: cool light gray
* muted surface: pale gray

### Text

* primary text: deep charcoal / ink
* secondary text: medium neutral gray
* muted text: lighter but still accessible

### Accent

* one strong blue for:

  * primary buttons
  * active nav state
  * focused inputs
  * selected tabs
  * links when appropriate

### Semantic colors

* success: controlled green
* warning: amber
* error: red
* info: blue variant

### Rules

* do not use brand colors everywhere
* do not use multiple colorful fills in one screen
* semantic colors must communicate state, not decoration

---

## 4.3 Contrast Requirements

All text and UI boundaries must have strong contrast.

### Requirements

* body text must be clearly readable on all backgrounds
* helper text should still remain legible
* active states must be obvious
* borders on cards, inputs, and separators must be visible enough
* avoid low-contrast gray-on-gray styling

### Outcome

The interface should feel sharper and more trustworthy immediately.

---

# 5. Shape, Radius, and Elevation

## 5.1 Radius Strategy

Current styling is too rounded.

### Recommended radius scale

* base radius: 8px
* cards/panels: 10px
* buttons/inputs: 8px
* overlays/drawers/modals: 12px
* chips/status pills: fully rounded allowed

### Rules

* keep rounding restrained
* do not make every element feel pill-like
* larger radius should be reserved for overlays or special emphasis

---

## 5.2 Shadows and Borders

Use less decorative elevation.

### Preferred approach

* use borders first
* use shadows lightly
* reserve stronger elevation for overlays

### Good defaults

* cards: subtle border + minimal shadow or no shadow
* modals/drawers: elevated but clean
* hover: slight lift or border accent, not dramatic effect

---

# 6. Typography Standards

## Typography goals

* stronger hierarchy
* less visual softness
* better scanability
* clearer distinction between title, section, and metadata

## Recommended hierarchy

* page title: strong and concise
* page subtitle: smaller, muted, informative
* section heading: clear and consistent
* card title: compact and readable
* metadata/helper text: subdued but accessible

## Rules

* avoid oversized marketing-style type inside the app
* use compact spacing for operational content
* keep labels crisp and short
* reduce unnecessary decorative text

---

# 7. Component Styling Direction

## 7.1 Buttons

### Direction

* less bubbly
* more solid
* cleaner shape
* stronger hierarchy

### Rules

* primary button: strong accent fill
* secondary button: neutral surface with border
* tertiary/text action: low emphasis
* avoid too many equal-strength buttons in one header

---

## 7.2 Cards and Panels

### Direction

Cards should feel structural, not decorative.

### Rules

* use cards to group meaningfully related content
* avoid card soup
* keep padding consistent
* use titles and spacing to establish meaning
* avoid colorful card backgrounds unless semantic

---

## 7.3 Inputs and Forms

### Direction

Forms should feel crisp and controlled.

### Rules

* high-contrast input borders
* clear focus state using accent color
* labels always visible
* helper/error text legible
* avoid oversized rounded fields

---

## 7.4 Tabs

### Direction

Tabs should handle local complexity cleanly.

### Rules

* use tabs for local section switching
* keep labels short
* selected state must be obvious
* tabs belong below page header or entity header

---

## 7.5 Status Indicators

### Direction

Status needs fast readability.

### Rules

* use semantic colors sparingly and consistently
* pair color with text label
* avoid relying on color alone
* make status chips compact and scannable

---

## 7.6 Drawers and Modals

### Direction

Use overlays for focused tasks, not as a substitute for structure.

### Use for

* confirmations
* editing forms
* focused review tasks
* secondary details

### Avoid using for

* major navigation
* huge workflows that should be routed pages

---

# 8. Workspace-Specific Layout Guidance

## 8.1 Overview Workspace

Should provide:

* platform snapshot
* urgent alerts
* recent activity highlights
* billing/support/platform health summaries
* quick links to major areas

It should feel like a command overview, not a noisy analytics wall.

---

## 8.2 Tenants Workspace

Should prioritize:

* tenant registry/search
* status visibility
* lifecycle operations
* bulk actions
* quick drill-down into tenant details

The tenant detail experience must be split across sub-routes/tabs.

---

## 8.3 Billing Workspace

Should prioritize:

* invoices
* overdue states
* payment failures
* recovery workflows
* plan/subscription state

This area should be financially clear and low-noise.

---

## 8.4 Support Workspace

Should prioritize:

* support queue
* recent unresolved items
* escalations
* support notes and history
* SLA visibility

---

## 8.5 Platform Workspace

Should prioritize:

* platform health
* provisioning jobs
* incidents
* infrastructure-related status
* operational timeline / logs

---

# 9. Specific Rules for Improving Intuitiveness

## Rule 1

Every screen must answer immediately:

* where am I?
* what is this page for?
* what should I do next?

## Rule 2

Only one primary action should dominate at a time.

## Rule 3

Reduce sidebar choices and move complexity inward.

## Rule 4

Use progressive disclosure:

* summary first
* deeper detail second
* advanced actions last

## Rule 5

Never let one page represent too many operational concerns equally.

## Rule 6

Use sections and local tabs instead of long unbroken pages.

## Rule 7

Design for scanability before decoration.

---

# 10. Recommended Theme Changes

## Keep Material UI as an engine, not as the visual identity

Do not rush to remove MUI.

Instead:

* heavily customize the theme
* override defaults aggressively
* create your own wrappers for shell and page-level components
* reduce the obvious “default MUI” appearance

## Immediate theme changes

* replace warm beige background with neutral/cool canvas
* replace teal/amber-heavy feel with one restrained primary accent
* reduce border radius globally
* increase text contrast
* reduce colorful surfaces
* rely more on borders than shadows

---

# 11. Rollout Plan

## Phase 1 — App Shell Polish

* build top header
* simplify sidebar
* add page header pattern
* add footer/status strip
* standardize content container

## Phase 2 — Theme Hardening

* new color tokens
* new typography hierarchy
* new radius scale
* updated buttons/cards/inputs/tabs

## Phase 3 — Page Structure Cleanup

* refactor high-density pages into clearer sections
* introduce local tabs where needed
* reduce long vertical stacks

## Phase 4 — Workspace Cleanup

* align each workspace with a clear task model
* remove misplaced items from global navigation
* improve consistency across workspaces

## Phase 5 — Tenant Experience Cleanup

* overview-first tenant screen
* move secondary operational concerns into sub-routes or tabs
* reduce cognitive overload significantly

---

# 12. Definition of Success

The redesign is successful when:

* the app shell feels obvious and calm
* the sidebar is short and easy to understand
* the interface has stronger contrast and readability
* the product feels more premium and less template-like
* pages are clearly divided into meaningful sections
* complex areas become easier to navigate
* the UI feels closer to a mature infrastructure/control product

---

# 13. Summary

The frontend should move away from a soft, generic dashboard feel and toward a more structured, premium, and production-ready control-plane experience.

The key moves are:

* simplify the shell
* shorten the sidebar
* strengthen page hierarchy
* reduce roundness
* improve contrast
* use calmer colors
* structure content into strong sections
* use Kinsta as inspiration for restraint and clarity

This is not just aesthetic polish. It is a usability improvement through better layout, hierarchy, and interface discipline.
