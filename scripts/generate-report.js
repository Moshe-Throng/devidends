const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  convertInchesToTwip,
  PageBreak,
} = require("docx");
const fs = require("fs");
const path = require("path");

/* ─── Helpers ─────────────────────────────────────────────── */

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 400 : 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: "Montserrat",
        color: level === HeadingLevel.HEADING_1 ? "27ABD2" : "212121",
      }),
    ],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: 22,
        ...opts,
      }),
    ],
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: 22,
        ...opts,
      }),
    ],
  });
}

function subBullet(text) {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { after: 40 },
    children: [
      new TextRun({ text, font: "Calibri", size: 20, color: "555555" }),
    ],
  });
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: convertInchesToTwip(0.3) },
    children: [
      new TextRun({
        text,
        font: "Consolas",
        size: 18,
        color: "2D2D2D",
      }),
    ],
    shading: { type: ShadingType.SOLID, color: "F5F5F5" },
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "27ABD2" },
    },
    children: [],
  });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map(
      (text) =>
        new TableCell({
          shading: isHeader
            ? { type: ShadingType.SOLID, color: "27ABD2" }
            : undefined,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  font: "Calibri",
                  size: 20,
                  bold: isHeader,
                  color: isHeader ? "FFFFFF" : "212121",
                }),
              ],
            }),
          ],
          width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
        })
    ),
  });
}

/* ─── Document ────────────────────────────────────────────── */

async function main() {
  const doc = new Document({
    creator: "Devidends / Claude Code",
    title: "Devidends Platform — Development Report",
    description: "Comprehensive report of all development phases",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1.2),
            },
          },
        },
        children: [
          // ═══════════════ COVER PAGE ═══════════════
          new Paragraph({ spacing: { before: 2000 }, children: [] }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: "DEVIDENDS",
                font: "Montserrat",
                size: 56,
                bold: true,
                color: "27ABD2",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: "Platform Development Report",
                font: "Montserrat",
                size: 32,
                color: "212121",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "Empowering Your Ventures in International Development",
                font: "Calibri",
                size: 24,
                italics: true,
                color: "24CFD6",
              }),
            ],
          }),
          divider(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `Date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
                font: "Calibri",
                size: 22,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: "Prepared by: Claude Code (AI Development Agent)",
                font: "Calibri",
                size: 22,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Organization: Envest Technologies PLC",
                font: "Calibri",
                size: 22,
                color: "666666",
              }),
            ],
          }),

          // ═══════════════ PAGE BREAK ═══════════════
          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ TABLE OF CONTENTS ═══════════════
          heading("Table of Contents"),
          body("1. Executive Summary"),
          body("2. Platform Overview"),
          body("3. Phase 1: Data Quality Layer"),
          body("4. Phase 2: Opportunities UI Updates"),
          body("5. Phase 3: Animations + Landing Page Redesign"),
          body("6. Phase 4: CV Scorer Visual Upgrade"),
          body("7. Phase 5: CV Builder Visual Upgrade"),
          body("8. Phase 6: Subscribe Page"),
          body("9. Phase 7: Description Enrichment"),
          body("10. Phase 8: Mobile Polish"),
          body("11. Phase 9: SEO & Meta Tags"),
          body("12. Phase 10: Authentication & Saved Jobs"),
          body("13. Technical Architecture"),
          body("14. Files Summary"),
          body("15. Next Steps"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ 1. EXECUTIVE SUMMARY ═══════════════
          heading("1. Executive Summary"),
          body(
            "The Devidends platform is an AI-powered intelligence platform for international development professionals. Over the course of 10 development phases, the platform was transformed from a basic prototype into a production-ready application featuring:"
          ),
          bullet("A visually distinctive landing page with the 'Two Doors' concept"),
          bullet("An AI-powered CV Scorer analyzing CVs across 6 dimensions"),
          bullet("A CV Builder that transforms CVs into donor-ready format (World Bank/UN)"),
          bullet("An Opportunities feed aggregating 845+ jobs from 84+ sources"),
          bullet("A data quality layer filtering spam, wrong-country entries, and expired listings"),
          bullet("A description enrichment pipeline (Puppeteer-based) that enriched 144+ opportunities"),
          bullet("Full Supabase authentication with Google OAuth and email/password"),
          bullet("A saved jobs feature for bookmarking opportunities"),
          bullet("SEO optimization with per-page metadata, Open Graph, and sitemap"),
          bullet("Mobile-first responsive design with polish across all pages"),

          body(""),
          body("Technology Stack:", { bold: true }),
          bullet("Frontend: Next.js 15, React 18, TypeScript, Tailwind CSS"),
          bullet("Backend: Next.js API Routes, Supabase PostgreSQL"),
          bullet("AI: Claude Sonnet 4 (CV scoring + extraction)"),
          bullet("Auth: Supabase Auth (email/password + Google OAuth)"),
          bullet("Icons: Lucide React"),
          bullet("Document Generation: PptxGenJS, Docxtemplater"),
          bullet("Scraping: Puppeteer, Cheerio"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ 2. PLATFORM OVERVIEW ═══════════════
          heading("2. Platform Overview"),
          body("The Devidends platform serves development professionals across East Africa with two core value propositions:"),
          body(""),

          body("Door 1: Strengthen Your Profile (CV Tools)", { bold: true, color: "27ABD2" }),
          bullet("CV Scorer — Upload a CV, get scored across 6 dimensions with AI-powered feedback tailored for World Bank, GIZ, UNDP screening processes"),
          bullet("CV Builder — Upload any CV format, AI extracts content, outputs donor-ready DOCX in World Bank/UN template"),

          body(""),
          body("Door 2: Find Your Next Assignment (Opportunities)", { bold: true, color: "24CFD6" }),
          bullet("Aggregated feed from 84+ sources (World Bank, GIZ, UN agencies, NGOs, AfDB, etc.)"),
          bullet("Quality-scored, deduplicated, filtered by country and type"),
          bullet("Seniority detection, experience years extraction"),
          bullet("Save/bookmark functionality with user accounts"),

          body(""),
          body("Brand Identity:", { bold: true }),
          bullet("Primary Color: Cyan #27ABD2"),
          bullet("Secondary Color: Teal #24CFD6"),
          bullet("Dark: #212121"),
          bullet("Typography: Montserrat (Bold headings, Regular body)"),
          bullet('Tagline: "Empowering Your Ventures in International Development"'),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 1 ═══════════════
          heading("3. Phase 1: Data Quality Layer"),
          body("The foundation phase that cleaned up the opportunity data pipeline. Raw scraped data contained significant quality issues: spam entries, wrong-country listings, missing descriptions, and duplicates."),
          body(""),

          body("3.1 Type Extensions", { bold: true }),
          body("File: lib/types/cv-score.ts"),
          body("Extended the SampleOpportunity interface with quality-aware fields:"),
          bullet("quality_score (0-100) — composite data completeness score"),
          bullet("seniority — Director / Senior / Mid-level / Junior / Entry (extracted from title)"),
          bullet("experience_years — parsed from title/description regex"),
          bullet("is_expired — boolean flag from deadline comparison"),
          bullet("classified_type — normalized type (job/tender/consulting/internship/grant)"),

          body(""),
          body("3.2 Quality Processing Module", { bold: true }),
          body("File: lib/opportunity-quality.ts (NEW)"),
          body("A 4-layer processing pipeline:"),

          body("Layer 1 — Hard Filters:", { bold: true }),
          bullet("Excluded Oracle HCM source (38 spam entries like 'About UN Women', 'Governance')"),
          bullet("Spam title regex catching generic pages"),
          bullet("Ethiopia-only enforcement for Workday and DRC sources"),

          body("Layer 2 — Quality Scoring:", { bold: true }),
          bullet("Title present: +20pts, Organization: +10pts, Description: +20pts"),
          bullet("Deadline: +15pts, Country: +10pts, Source URL: +10pts"),
          bullet("Title length >10 chars: +5pts, Description >50 chars: +10pts"),

          body("Layer 3 — Enrichment:", { bold: true }),
          bullet("Experience years extraction via regex"),
          bullet("Seniority detection from title keywords"),
          bullet("Type classification from title analysis"),
          bullet("Expiry flag calculation"),

          body("Layer 4 — Deduplication:", { bold: true }),
          bullet("Title normalization (lowercase, strip location suffixes)"),
          bullet("Character-level similarity check (85% threshold)"),
          bullet("Higher quality score wins on duplicates"),

          body(""),
          body("3.3 API Integration", { bold: true }),
          body("File: app/api/opportunities/sample/route.ts"),
          bullet("Processes raw JSON from 9 source files through quality pipeline"),
          bullet("Query params: ?hideExpired=true&minQuality=40 (defaults)"),
          bullet("Single opportunity lookup by ID"),
          body(""),
          body("Results: 300 raw items → ~140-150 quality items after processing", { bold: true, color: "27ABD2" }),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 2 ═══════════════
          heading("4. Phase 2: Opportunities UI Updates"),
          body("Enhanced the opportunities pages to leverage the new quality fields."),
          body(""),

          body("4.1 List Page (app/opportunities/page.tsx)", { bold: true }),
          bullet("Search by title, organization, or description keywords"),
          bullet("Filter by: Type (job/tender/consulting/internship/grant), Seniority, Source, Country"),
          bullet("Sort by: Deadline, Quality score, Title A-Z, Organization A-Z"),
          bullet("Show/hide expired toggle"),
          bullet("Quality dot indicators: green (70+), amber (50-70), gray (<50)"),
          bullet("Seniority badges with color coding"),
          bullet("Experience years display on cards"),
          bullet('Empty description fallback: "Details on source site →" link'),
          bullet("Pagination (20 items per page)"),

          body(""),
          body("4.2 Detail Page (app/opportunities/[id]/page.tsx)", { bold: true }),
          bullet("4-column info card grid: Deadline, Location, Level/Seniority, Source"),
          bullet("Quality badge in hero (Complete / Partial / Limited)"),
          bullet("Expired banner with warning"),
          bullet("Related opportunities section (same org, up to 4 cards)"),
          bullet("CTA buttons hidden for expired listings"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 3 ═══════════════
          heading("5. Phase 3: Animations + Landing Page Redesign"),
          body("The visual transformation phase — the most impactful change to the platform's look and feel."),
          body(""),

          body("5.1 CSS Animations (app/globals.css)", { bold: true }),
          body("8 new keyframe animations added:"),
          bullet("staggerFadeUp — fade in with upward translation (0.6s)"),
          bullet("float — gentle floating effect (4s infinite)"),
          bullet("pulseGlow — cyan box-shadow pulse (2.5s infinite)"),
          bullet("slideInLeft / slideInRight — horizontal slide entries (0.6s)"),
          bullet("scaleReveal — scale-up entrance (0.5s)"),
          bullet("gradientShift — animated gradient background (6s infinite)"),
          bullet("spinSlow — 20s rotation"),
          bullet("blobMove — organic blob movement (8s infinite)"),

          body(""),
          body('5.2 Landing Page — "Two Doors" Concept (app/page.tsx)', { bold: true }),
          body("Complete rewrite as a 'use client' component with IntersectionObserver scroll reveals."),
          body(""),
          body("Section 1 — Hero:", { bold: true }),
          bullet("Full-impact headline with animated gradient text"),
          bullet("Floating geometric elements (circles, lines, blobs)"),
          bullet("Dot-grid background pattern"),
          bullet('Eyebrow badge: "84+ Sources Monitored Daily"'),

          body("Section 2 — Two Doors (centerpiece):", { bold: true }),
          bullet("Left Door (Cyan): 'Strengthen Your Profile' → CV Scorer + CV Builder"),
          bullet("Right Door (Teal): 'Find Your Next Assignment' → Opportunities"),
          bullet("Each door: gradient border on hover, scale+shadow effect, slide-in animation"),
          bullet("Tool sub-cards with gradient icon boxes"),

          body("Section 3 — How It Works:", { bold: true }),
          bullet("3-step flow: Discover → Prepare → Succeed"),
          bullet("Connecting gradient line between steps (desktop)"),
          bullet("Staggered entrance animations"),

          body("Section 4 — Animated Stats:", { bold: true }),
          bullet("AnimatedStat component with counting animation"),
          bullet("845+ Opportunities, 84 Sources, 30 Sectors, 150 Experts"),

          body("Section 5 — Source Badges:", { bold: true }),
          bullet("12 source names with staggered fade-in"),
          bullet("World Bank, GIZ, United Nations, EU, AfDB, UNDP, etc."),

          body("Section 6 — Dark CTA:", { bold: true }),
          bullet("Dark background with animated gradient blobs"),
          bullet("Subscribe via Email + Join Telegram buttons"),

          body(""),
          body("5.3 SiteHeader Updates (components/SiteHeader.tsx)", { bold: true }),
          bullet("Top gradient accent line (cyan → teal → cyan)"),
          bullet("Active link uses gradient underline bar instead of background highlight"),
          bullet("Subscribe button with gradient background"),

          body(""),
          body("5.4 SiteFooter Updates (components/SiteFooter.tsx)", { bold: true }),
          bullet("Changed to dark variant (bg-dark-900)"),
          bullet("Gradient divider line at top"),
          bullet('Light logo variant, "development sector" gradient text'),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 4 ═══════════════
          heading("6. Phase 4: CV Scorer Visual Upgrade"),
          body("File: app/score/page.tsx — targeted visual enhancements to make the CV Scorer more engaging."),
          body(""),

          body("Upload Phase:", { bold: true }),
          bullet("Floating geometric accents around hero"),
          bullet("Blob animations in background"),
          bullet("Enhanced drop zone with better shadow effects on hover/drag"),
          bullet("Staggered dimension badge entrance with animation delays"),
          bullet("Pulse glow on CTA button when file is selected"),

          body(""),
          body("Scoring Phase:", { bold: true }),
          bullet("Multi-ring concentric spinner (3 rings, different speeds/directions)"),
          bullet("Counting-up percentage (0→100%) in center"),
          bullet("Step progress cards with animated checkmarks"),
          bullet("Animated gradient background"),

          body(""),
          body("Results Phase:", { bold: true }),
          bullet("Score ring entrance with scaleReveal animation"),
          bullet("Staggered dimension card slide-ins with delays"),
          bullet("Icon rotation on accordion expand"),
          bullet("Sliding tab indicator with gradient background for donor tips"),
          bullet("Fade animation on tab content change"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 5 ═══════════════
          heading("7. Phase 5: CV Builder Visual Upgrade"),
          body("File: app/cv-builder/page.tsx — visual enhancements matching the Scorer's polish."),
          body(""),

          body("Entry Phase:", { bold: true }),
          bullet("Floating decorative elements with blob animation"),
          bullet("Staggered text entrance animations"),
          bullet("Entry cards with slideInLeft/slideInRight animations"),
          bullet("Enhanced drop zone shadow effects"),
          bullet("Pulse glow on Extract CTA when file selected"),

          body(""),
          body("Extracting Phase:", { bold: true }),
          bullet("Multi-ring teal-focused spinner (3 rings, different speeds)"),
          bullet("Step timeline with numbered indicators"),

          body(""),
          body("Editing Phase:", { bold: true }),
          bullet("Enhanced input focus glow (shadow-cyan)"),
          bullet("Animated section checkmarks (scaleReveal)"),
          bullet("Icon color change when section is expanded"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 6 ═══════════════
          heading("8. Phase 6: Subscribe Page"),
          body("A conversion-focused subscription page with two channels: email alerts and Telegram."),
          body(""),

          body("8.1 Subscribe Page (app/subscribe/page.tsx)", { bold: true }),
          body("Full page with 6 sections:"),
          bullet("Dark hero with gradient blobs, animated stats ribbon, wave SVG bottom edge"),
          bullet("Two subscription cards side by side:"),
          subBullet("Email Card (Cyan): Working form → POST /api/subscribe, success/error/already-subscribed states"),
          subBullet("Telegram Card (Teal): Join channel button, mock channel preview, external link"),
          bullet("'What You'll Get' feature grid: Curated Opportunities, Smart Filtering, Early Access"),
          bullet("Trusted Sources badge bar (10 source names)"),
          bullet("FAQ accordion (4 expandable items)"),
          bullet("Bottom CTA with scroll-to-top"),

          body(""),
          body("8.2 Subscribe API (app/api/subscribe/route.ts)", { bold: true }),
          bullet("POST endpoint accepting email, telegram_id, channel, filters"),
          bullet("Client-side and server-side email validation"),
          bullet("Duplicate detection — returns 'already subscribed' message"),
          bullet("Reactivation for previously unsubscribed users"),
          bullet("Supabase insert with country_filter default to ['Ethiopia']"),

          body(""),
          body("8.3 SEO Layout (app/subscribe/layout.tsx)", { bold: true }),
          bullet("Per-page metadata for search engines"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 7 ═══════════════
          heading("9. Phase 7: Description Enrichment"),
          body("Addressed the critical data gap: 51% of opportunities had no descriptions. Built a dual-strategy enrichment system."),
          body(""),

          body("9.1 Enrichment Module (lib/enrich-descriptions.ts)", { bold: true }),
          body("Two extraction strategies:"),
          bullet("Cheerio (fast) — for static HTML sites, tries site-specific selectors"),
          bullet("Puppeteer (slower, JS-rendered) — for dynamic sites like UNJobs, DRC, AU"),
          body(""),
          body("Site-specific selector rules for:"),
          bullet("unjobs.org, drc.ngo, jobs.au.int, kifiya.com, careers.un.org, reliefweb.int"),
          body("Features: 15s timeout, 3000-char truncation, text cleaning, concurrent batch processing."),

          body(""),
          body("9.2 Enrichment API (app/api/opportunities/enrich/route.ts)", { bold: true }),
          bullet("POST endpoint with query params: ?source=unjobs&limit=20&dryRun=true"),
          bullet("Processes source files, fetches empty descriptions, saves results"),

          body(""),
          body("9.3 CLI Script (scripts/enrich-opportunities.js)", { bold: true }),
          bullet("Standalone Node.js script using Puppeteer for batch enrichment"),
          bullet("Usage: node scripts/enrich-opportunities.js --source unjobs --limit 30"),
          bullet("Rate-limited (800ms between requests), concurrent workers"),

          body(""),
          body("9.4 Results:", { bold: true, color: "27ABD2" }),
          bullet("UNJobs: 124/124 enriched (100% success rate)"),
          bullet("DRC: 20/59 enriched (first batch)"),
          bullet("Total: 144 opportunities gained full descriptions"),
          bullet("Quality scores improved significantly (description adds +20-30 points)"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 8 ═══════════════
          heading("10. Phase 8: Mobile Polish"),
          body("A dedicated pass to improve mobile experience across all pages."),
          body(""),

          body("10.1 Global CSS Fixes (app/globals.css)", { bold: true }),
          bullet("Removed -webkit-tap-highlight-color for clean touch feedback"),
          bullet("Added text-size-adjust: 100% for consistent text sizing"),
          bullet("overflow-x: hidden on body to prevent horizontal scroll"),
          bullet("Minimum touch target size: 44x44px on buttons and links"),
          bullet("iOS input zoom prevention: font-size: 16px on inputs (mobile only)"),
          bullet("Safe area inset padding for notched devices"),

          body(""),
          body("10.2 Opportunities Page Fixes", { bold: true }),
          bullet("Filter bar buttons: flex-wrap with compact padding on mobile"),
          bullet("Sort dropdown: smaller padding on small screens"),
          bullet("Expired toggle: tighter gap and padding"),

          body(""),
          body("10.3 Header Animation", { bold: true }),
          bullet("Mobile menu slides in with fadeInUp animation"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 9 ═══════════════
          heading("11. Phase 9: SEO & Meta Tags"),
          body("Comprehensive SEO optimization for search visibility and social sharing."),
          body(""),

          body("11.1 Root Layout (app/layout.tsx)", { bold: true }),
          bullet("Viewport meta with theme-color #27ABD2"),
          bullet("Title template: '%s | Devidends' for per-page titles"),
          bullet("Rich description with keywords"),
          bullet("Open Graph: type, locale, siteName, 1200x630 image reference"),
          bullet("Twitter Card: summary_large_image"),
          bullet("Robots: index, follow, googleBot optimizations"),
          bullet("Canonical URL, author, creator metadata"),
          bullet("Favicon and apple-touch-icon links"),

          body(""),
          body("11.2 Per-Page Layouts", { bold: true }),
          bullet("app/score/layout.tsx — 'CV Scorer — AI-Powered CV Analysis'"),
          bullet("app/cv-builder/layout.tsx — 'CV Builder — Transform to Donor-Ready Format'"),
          bullet("app/opportunities/layout.tsx — 'Opportunities — Jobs, Tenders & Grants'"),
          bullet("app/subscribe/layout.tsx — 'Subscribe — Weekly Development Opportunities'"),

          body(""),
          body("11.3 Sitemap & Robots", { bold: true }),
          bullet("app/sitemap.ts — dynamic sitemap with 5 routes, priorities, change frequencies"),
          bullet("public/robots.txt — allows all crawlers, blocks /api/ and /admin/, links sitemap"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ PHASE 10 ═══════════════
          heading("12. Phase 10: Authentication & Saved Jobs"),
          body("Full user authentication system with Supabase Auth and a saved jobs feature."),
          body(""),

          body("12.1 Supabase Auth Setup", { bold: true }),
          bullet("lib/supabase-server.ts — Server-side client with cookie handling"),
          bullet("lib/supabase-browser.ts — Browser-side client"),
          bullet("middleware.ts — Auth session refresh on every request"),
          bullet("app/auth/callback/route.ts — OAuth callback handler (code → session exchange)"),

          body(""),
          body("12.2 Auth Provider (components/AuthProvider.tsx)", { bold: true }),
          bullet("React context providing: user, session, loading state"),
          bullet("Methods: signInWithEmail, signUpWithEmail, signInWithGoogle, signOut"),
          bullet("Auto-refreshes on auth state changes"),
          bullet("Wrapped around entire app in root layout"),

          body(""),
          body("12.3 Login Page (app/login/page.tsx)", { bold: true }),
          bullet("Google OAuth button with official SVG logo"),
          bullet("Email/password form with show/hide password toggle"),
          bullet("Login/signup mode toggle"),
          bullet("Error and success message display"),
          bullet("Redirect to /opportunities on successful login"),
          bullet("Client-side validation"),

          body(""),
          body("12.4 Saved Jobs API (app/api/saved-jobs/route.ts)", { bold: true }),
          bullet("GET — list user's saved opportunities"),
          bullet("POST — save a new opportunity (with duplicate check)"),
          bullet("DELETE — unsave by opportunity ID"),
          bullet("All endpoints require authentication"),

          body(""),
          body("12.5 SaveButton Component (components/SaveButton.tsx)", { bold: true }),
          bullet("Two variants: icon (for cards) and button (for detail pages)"),
          bullet("Checks saved state on mount, toggles save/unsave"),
          bullet("Redirects to /login if not authenticated"),
          bullet("Integrated into opportunity list cards"),

          body(""),
          body("12.6 Saved Jobs Page (app/saved/page.tsx)", { bold: true }),
          bullet("Protected route — redirects to login if not authenticated"),
          bullet("Lists all saved opportunities with org, deadline, saved date"),
          bullet("Remove button with loading state"),
          bullet("Empty state with CTA to browse opportunities"),

          body(""),
          body("12.7 Header Integration (components/SiteHeader.tsx)", { bold: true }),
          bullet("User avatar (first letter of email) with gradient background"),
          bullet("Dropdown menu: email display, Saved Jobs link, Sign Out"),
          bullet("Mobile menu: Saved Jobs + Sign In/Out links"),
          bullet("Sign In link shown when logged out"),

          body(""),
          body("12.8 Database Migration (supabase/migrations/001_saved_opportunities.sql)", { bold: true }),
          bullet("saved_opportunities table with UUID primary key"),
          bullet("Unique constraint on (user_id, opportunity_id)"),
          bullet("Row-Level Security: users can only access their own saved items"),
          bullet("Index on user_id for fast lookups"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ ARCHITECTURE ═══════════════
          heading("13. Technical Architecture"),
          body(""),

          body("Application Structure:", { bold: true }),
          codeBlock("devidends/"),
          codeBlock("├── app/                          # Next.js 15 App Router"),
          codeBlock("│   ├── layout.tsx                # Root layout + AuthProvider"),
          codeBlock("│   ├── page.tsx                  # Landing (Two Doors)"),
          codeBlock("│   ├── globals.css               # Tailwind + animations"),
          codeBlock("│   ├── sitemap.ts                # Dynamic sitemap"),
          codeBlock("│   ├── score/page.tsx             # CV Scorer"),
          codeBlock("│   ├── cv-builder/page.tsx        # CV Builder"),
          codeBlock("│   ├── opportunities/page.tsx     # Opportunities feed"),
          codeBlock("│   ├── opportunities/[id]/page.tsx # Opportunity detail"),
          codeBlock("│   ├── subscribe/page.tsx         # Subscription page"),
          codeBlock("│   ├── login/page.tsx             # Auth page"),
          codeBlock("│   ├── saved/page.tsx             # Saved jobs"),
          codeBlock("│   ├── auth/callback/route.ts     # OAuth callback"),
          codeBlock("│   └── api/"),
          codeBlock("│       ├── subscribe/route.ts     # Subscription API"),
          codeBlock("│       ├── saved-jobs/route.ts    # Saved jobs CRUD"),
          codeBlock("│       └── opportunities/"),
          codeBlock("│           ├── sample/route.ts    # Opportunities API"),
          codeBlock("│           └── enrich/route.ts    # Enrichment API"),
          codeBlock("├── components/"),
          codeBlock("│   ├── AuthProvider.tsx           # Auth context"),
          codeBlock("│   ├── SaveButton.tsx             # Bookmark component"),
          codeBlock("│   ├── SiteHeader.tsx             # Header + user menu"),
          codeBlock("│   ├── SiteFooter.tsx             # Footer (dark variant)"),
          codeBlock("│   └── DevidendsLogo.tsx          # Brand logo"),
          codeBlock("├── lib/"),
          codeBlock("│   ├── opportunity-quality.ts     # Quality processing pipeline"),
          codeBlock("│   ├── enrich-descriptions.ts     # Cheerio + Puppeteer enrichment"),
          codeBlock("│   ├── supabase.ts                # Supabase clients (legacy)"),
          codeBlock("│   ├── supabase-server.ts         # SSR Supabase client"),
          codeBlock("│   ├── supabase-browser.ts        # Browser Supabase client"),
          codeBlock("│   ├── database.types.ts          # TypeScript DB types"),
          codeBlock("│   └── types/cv-score.ts          # CV + Opportunity types"),
          codeBlock("├── scripts/"),
          codeBlock("│   └── enrich-opportunities.js    # Batch enrichment CLI"),
          codeBlock("├── middleware.ts                  # Auth session refresh"),
          codeBlock("└── test-output/                   # Raw opportunity JSON data"),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ FILES SUMMARY ═══════════════
          heading("14. Files Summary"),
          body(""),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              tableRow(["File", "Action", "Phase"], true),
              tableRow(["lib/types/cv-score.ts", "Modified — extended SampleOpportunity", "1"]),
              tableRow(["lib/opportunity-quality.ts", "Created — quality pipeline", "1"]),
              tableRow(["app/api/opportunities/sample/route.ts", "Modified — quality integration", "1"]),
              tableRow(["app/opportunities/page.tsx", "Rewritten — filters, quality UI", "2"]),
              tableRow(["app/opportunities/[id]/page.tsx", "Rewritten — detail enhancements", "2"]),
              tableRow(["app/globals.css", "Modified — 8 new animations + mobile fixes", "3, 8"]),
              tableRow(["app/page.tsx", "Rewritten — Two Doors landing", "3"]),
              tableRow(["components/SiteHeader.tsx", "Rewritten — gradient, auth menu", "3, 10"]),
              tableRow(["components/SiteFooter.tsx", "Modified — dark variant", "3"]),
              tableRow(["app/score/page.tsx", "Modified — visual upgrade", "4"]),
              tableRow(["app/cv-builder/page.tsx", "Modified — visual upgrade", "5"]),
              tableRow(["app/subscribe/page.tsx", "Rewritten — full subscribe page", "6"]),
              tableRow(["app/api/subscribe/route.ts", "Created — subscription API", "6"]),
              tableRow(["lib/enrich-descriptions.ts", "Created — enrichment module", "7"]),
              tableRow(["app/api/opportunities/enrich/route.ts", "Created — enrichment API", "7"]),
              tableRow(["scripts/enrich-opportunities.js", "Created — batch CLI", "7"]),
              tableRow(["app/layout.tsx", "Modified — SEO meta + AuthProvider", "9, 10"]),
              tableRow(["app/score/layout.tsx", "Created — page SEO", "9"]),
              tableRow(["app/cv-builder/layout.tsx", "Created — page SEO", "9"]),
              tableRow(["app/opportunities/layout.tsx", "Created — page SEO", "9"]),
              tableRow(["app/subscribe/layout.tsx", "Created — page SEO", "9"]),
              tableRow(["app/sitemap.ts", "Created — dynamic sitemap", "9"]),
              tableRow(["public/robots.txt", "Created — robots file", "9"]),
              tableRow(["lib/supabase-server.ts", "Created — SSR auth client", "10"]),
              tableRow(["lib/supabase-browser.ts", "Created — browser auth client", "10"]),
              tableRow(["middleware.ts", "Rewritten — auth middleware", "10"]),
              tableRow(["components/AuthProvider.tsx", "Created — auth context", "10"]),
              tableRow(["components/SaveButton.tsx", "Created — bookmark button", "10"]),
              tableRow(["app/login/page.tsx", "Created — login/signup page", "10"]),
              tableRow(["app/saved/page.tsx", "Created — saved jobs page", "10"]),
              tableRow(["app/api/saved-jobs/route.ts", "Created — saved jobs API", "10"]),
              tableRow(["app/auth/callback/route.ts", "Created — OAuth callback", "10"]),
              tableRow(["lib/database.types.ts", "Modified — SavedOpportunity type", "10"]),
              tableRow(["supabase/migrations/001_saved_opportunities.sql", "Created — DB migration", "10"]),
            ],
          }),

          new Paragraph({ children: [new PageBreak()] }),

          // ═══════════════ NEXT STEPS ═══════════════
          heading("15. Next Steps"),
          body("The following items are recommended for the next development cycle:"),
          body(""),

          body("Immediate (Deployment):", { bold: true }),
          bullet("Deploy to Vercel — push to GitHub, connect Vercel, set environment variables"),
          bullet("Run Supabase migration — apply saved_opportunities table + RLS policies"),
          bullet("Enable Google OAuth in Supabase dashboard"),
          bullet("Generate OG image (1200x630) for social sharing"),

          body(""),
          body("Short-term (Data & Content):", { bold: true }),
          bullet("Complete description enrichment for remaining sources (AU, Kifiya, DRC remainder)"),
          bullet("Connect subscribe API to send_alerts.py for automated weekly email digests"),
          bullet("Use Claude API to classify opportunities into sectors (WASH, Finance, Health, etc.)"),

          body(""),
          body("Medium-term (Features):", { bold: true }),
          bullet("Analytics — Vercel Analytics or Plausible for visitor tracking"),
          bullet("Application tracking — let users mark opportunities as 'Applied' with dates"),
          bullet("Sector filtering for subscribers — personalized digest based on preferences"),
          bullet("Push notifications via Telegram bot for instant alerts"),

          body(""),
          body("Long-term (Growth):", { bold: true }),
          bullet("Expert Network — directory of development professionals"),
          bullet("Organization profiles — donor pages with current and past opportunities"),
          bullet("AI job matching — score user profile against opportunities automatically"),
          bullet("Multi-country expansion beyond Ethiopia"),

          divider(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
            children: [
              new TextRun({
                text: "— End of Report —",
                font: "Montserrat",
                size: 20,
                color: "999999",
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [
              new TextRun({
                text: "Generated by Claude Code • Devidends © 2026 Envest Technologies PLC",
                font: "Calibri",
                size: 18,
                color: "AAAAAA",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, "..", "Devidends_Development_Report.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("Report generated:", outPath);
}

main().catch(console.error);
