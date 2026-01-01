# RegulatoryOS Design Guidelines

## Design Approach
**System**: Custom design system inspired by Linear's precision + Notion's flexibility, tailored for enterprise regulatory compliance workflows. This is a data-intensive productivity application requiring clarity, trust, and efficiency.

## Core Design Principles
1. **Clinical Precision**: Clean, structured layouts that convey professionalism and accuracy
2. **Progressive Disclosure**: Complex workflows revealed progressively to avoid overwhelming users
3. **Status Transparency**: Always-visible system state and agent activity
4. **Trust Through Clarity**: Explicit data lineage and audit trails

## Typography

**Font Families**:
- Primary: Inter (system interface, data tables, metrics)
- Monospace: JetBrains Mono (technical details, IDs, dates, audit logs)

**Hierarchy**:
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-semibold  
- Data Labels: text-sm font-medium
- Body Text: text-sm font-normal
- Captions/Metadata: text-xs text-gray-600

## Layout System

**Spacing Units**: Consistent use of Tailwind spacing - 2, 4, 6, 8, 12, 16, 24 units
- Component padding: p-6
- Section gaps: gap-8
- Card spacing: space-y-4
- Dense data views: gap-2

**Grid Patterns**:
- Metrics Dashboard: 3-4 column grid (grid-cols-3 lg:grid-cols-4)
- Device Portfolio: 2-column responsive cards (grid-cols-1 md:grid-cols-2)
- Agent Status: Single-column timeline with expanding details
- Data Tables: Full-width with fixed header and scrollable body

## Component Library

### Navigation
- **Top Navigation Bar**: Company selector, process tabs, user profile
- **Sidebar**: Collapsible navigation with icons and labels for main sections (Dashboard, Companies, Agents, Documents, Knowledge Base)
- **Breadcrumbs**: Show navigation path in complex workflows

### Data Display
- **Metric Cards**: Large number with label, delta indicator (↑↓), trend sparkline
- **Status Badges**: Pill-shaped with semantic states (Active/Processing/Complete/Error)
- **Data Tables**: Sticky headers, row hover states, inline actions, multi-select checkboxes
- **Progress Indicators**: Multi-step progress bars for agent workflows with checkmarks for completed steps

### Agent Orchestration
- **Workflow Visualization**: Vertical timeline showing agent execution steps with animated progress dots
- **Agent Cards**: Agent name, status badge, assigned tasks, execution metrics
- **Log Stream**: Terminal-style scrolling log with timestamp, agent identifier, and action description

### Forms & Input
- **Configuration Panels**: Grouped fields with clear labels, helper text, and validation states
- **File Upload**: Drag-and-drop zones with file preview and mapping configuration
- **Multi-Step Wizards**: Step indicator at top, form content, navigation buttons at bottom

### Overlays
- **Modal Dialogs**: Centered, max-w-2xl, with header, scrollable content, and action footer
- **Slide-Out Panels**: Right-side panels for detailed views and configurations
- **Toast Notifications**: Bottom-right corner for success/error feedback

### Document Generation
- **Document Preview**: Split view with configuration on left, live preview on right
- **Download Cards**: Document metadata, file size, generation timestamp, download button
- **Review Checklist**: Interactive checkbox list with expandable sections

## Animations

**Minimal & Purposeful**:
- Agent execution: Pulsing dots during processing, checkmark fade-in on completion
- Data updates: Subtle highlight flash when table rows update
- Status changes: Smooth badge transitions between states
- Panel transitions: Slide-in/out for sidebars and slide-out panels
- Loading states: Skeleton screens for data grids, spinner for agent execution

## Visual Language

**Professional Medical Aesthetic**:
- Clean white backgrounds with subtle gray borders (border-gray-200)
- Card-based layouts with subtle shadows (shadow-sm)
- Generous whitespace in data-dense areas
- Clear visual separation between sections
- Monospaced fonts for technical identifiers (TD numbers, PSUR codes, dates)

**Status Indicators**:
- Processing: Animated pulsing outline
- Success: Solid with checkmark icon
- Error: Solid with alert icon
- Pending: Outlined with clock icon

## Key Screens

### Dashboard
- Hero metrics row: Documents generated, time saved, cost savings, agent uptime
- Active processes cards (2-column grid)
- Recent activity timeline
- Quick actions: "Generate PSUR", "Upload Data", "Configure Device"

### Company Configuration
- Company selector dropdown at top
- Device portfolio grid with cards showing device name, class, jurisdictions, status
- Add device button prominent in top-right
- Data source configuration cards showing connected systems

### Agent Orchestration
- Large status panel showing active agent workflow
- Real-time log stream in terminal-style panel
- Step-by-step progress indicator
- Execution metrics sidebar (time elapsed, tokens used, cost)
- Pause/resume controls

### Document Generation
- Three-column layout: Configuration form (left), agent execution status (center), output preview (right)
- Download section with document metadata and audit trail
- Review checklist with expandable compliance sections

### Data Layer
- Upload interface with drag-drop zones for multiple file types
- Data mapping table showing raw → normalized transformation
- Preview grid of normalized data
- Data quality indicators and validation warnings

## Images
**Usage**: Minimal - this is a data-driven application
- Empty states: Subtle illustrations for "No devices configured" or "No documents generated"
- Onboarding: Diagram showing agent architecture and workflow
- No hero images - this is an enterprise productivity tool