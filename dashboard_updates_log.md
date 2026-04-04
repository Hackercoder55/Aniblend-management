# Dashboard Updates Log

**Date:** April 4, 2026

## Overview of Changes

1. **Progress Tracker Enhancements (`app/manager/page.tsx`)**
   - **Date Range Filter:** Replaced per-column month dropdown filters with a global `dateFrom` and `dateTo` picker to selectively filter projects cleanly across all stages based on specific date ranges.
   - **Clickable Project Links:** Modified the Kanban `ProjectCard` component to use the full `Project_title` inside an `<a>` tag referencing the database's `Project_link`, dropping the CSS truncation so titles are fully visible.
   - **STL Column Injection:** Added a pseudo-stage column called "STL" (`TRACKER_STAGES`).
     - Logic was modified within the `.map(stage)` renderer to divert any active/pending project with a duration of >= 180 seconds into this STL column exclusively.
     - The original exact status (e.g. 'Viewport' or 'Render QA') is still visually rendered inside the STL card for context.

2. **Payout Calculator - Month Filter Accuracy (`app/manager/page.tsx`)**
   - **Issue:** March filters were bleeding into April because the calculation merely checked if an animator existed in that month, but then subsequently summed *all* of their historic approved projects.
   - **Fix:** Injected accurate `(selectedMonth === 'All' || p['Date Approved'].includes(selectedMonth))` bounds checking at the exact loops where durations are accumulated array-wide (`approvedSecondsByEmpId`).

3. **Animator Month-wise Earning Summary (`app/manager/page.tsx`)**
   - **Feature:** An animator earnings track record mapped per month.
   - **Implementation:** Added an `Earnings` tab directly inside the `AnimatorModal`. When clicked, it queries the `invoices` Supabase table specifically for that `employee_id`.
   - Displays Gross Pay, TDS collected, extra Bonuses, and the actual absolute Net Payable grouped neatly by the finalized `month_label` generated internally during their automated invoice creation.

## Required Database/SQL Operations

**No manual database schema changes were required for this update.** 
All logic modifications perfectly utilized previously existing schemas (`projects`, `payments`, `invoices`, `animators`) and only expanded on frontend React-side parsing maps to dynamically route UI elements (e.g. the STL column filtering out >=180s videos). 

*(Keep this document for next time as a reference point for how STL or Invoice aggregations were constructed!)*
