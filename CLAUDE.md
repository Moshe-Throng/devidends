# CLAUDE.md — Devidends MVP Master Build Guide (v10.1)

> **This file is the single source of truth for building Devidends.**
> Place it in your project root. Claude Code reads it automatically on every session.
> When context limits are hit, start a new session — Claude Code will re-read this file and pick up where you left off.

---

## 🔑 CRITICAL OPERATING RULES

### Context Window Management
- Claude Code has limited context. When it starts forgetting earlier work, **start a new chat session**.
- Claude Code re-reads CLAUDE.md on each new session — that's why everything is here.
- After completing each phase, update the **Progress Tracker** section at the bottom of this file.
- If a phase is too large for one session, break it into sub-tasks and track each one.

### Local Test Before Moving On
- **NEVER move to the next phase until the current phase passes its test.**
- Each phase below has a "✅ TEST" section. Run those tests locally (`npm run dev`) before proceeding.
- If a test fails, fix it before moving on. Paste the full error message if something breaks.

### Learning Loop
- After each phase, note what worked and what didn't in the Progress Tracker.
- If AI matching/scoring quality is poor, note which CVs/requests failed and why — this feeds into prompt tuning.
- If a UI feels wrong, describe what's wrong in business terms, not code terms.

### Frontend Design Standards
- **Brand colors**: Cyan `#27ABD2` (primary), Teal `#24CFD6` (secondary), Dark `#212121`, Black `#000000`, White `#FFFFFF`
- **Typography**: Montserrat — Bold (headings), Semi-bold (subheadings), Regular (body). Professional, not flashy.
- **Logo**: "Dev" in `#27ABD2`, "idends" in `#212121` (light bg) or white (dark bg). "V" embodies a person icon.
- **Tone**: This is for GIZ, World Bank, EU procurement professionals + African development consultants. Conservative, trustworthy design.
- **No generic AI aesthetics**: No purple gradients, no Inter/Roboto defaults, no cookie-cutter layouts.
- **Mobile responsive**: All pages must work on mobile (Telegram users click links on phones).

### Git Discipline
- Commit after every working phase: `git commit -am "Phase X complete: [description]"`
- Before any major change, commit the working state first.
- Use descriptive commit messages — your future self will thank you.

---

## 📋 PROJECT CONTEXT

**Devidends** is an AI-powered intelligence platform for international development consulting in Africa. It aggregates jobs + consulting opportunities from 84+ source portals, scores and improves expert CVs, and progressively builds the richest consultant database in East Africa.

**Built by**: Envest Technologies PLC (Ethiopia) / Devidends network
**Existing assets**:
- 110 vetted consultant profiles (63 senior, 47 marked with (E) suffix = Expert track)
- 845 historical job listings from 84 source domains (analyzed and categorized)
- 150+ active recommender network doing manual matching via WhatsApp/Telegram
**Strategy**: Door B first (experts/job seekers). Intel feed + CV tools create volume and data. Revenue from firms/requesters comes later.

### Who Uses This
- **Job Seekers / Consultants** (largest segment): Looking for opportunities. Will use CV Scorer, intel feed, eligibility checker. Free tier.
- **Bidders / Firms**: Assembling teams for tenders. Will pay for shortlists, templates, team builder. Revenue segment.
- **Requesters**: GIZ/WB/EU program managers needing experts. Will pay for AI shortlists. Revenue segment.
- **Recommenders** (~20 hubs): The trust layer. Simultaneously experts + opportunity sources + connectors.
- **Admin (you)**: Manages platform, reviews matches, monitors scrapers.

### Tech Stack
| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind | Fast, SSR, Claude Code knows it well |
| Database | **Supabase** (Postgres + Auth + Storage + Realtime) | Free tier generous, real SQL, auth built-in, file storage for CVs |
| AI | Claude API (Sonnet 4.5) | CV scoring, matching, classification |
| Messaging | **Telegram Bot API** (node-telegram-bot-api) | No Facebook approval needed, free, your users have it |
| Email | Resend | Digest delivery, auth magic links |
| Documents | docx (npm) | CV formatting, shortlist generation |
| Scraping | Cheerio + Puppeteer + node-cron | HTML parsing, JS-rendered pages, scheduling |
| Hosting | Vercel | Free tier, easy deploy |
| Validation | Zod + react-hook-form | Form validation |

### Monthly Cost: ~$150-250 (Supabase free tier + Claude API + Vercel free + Resend free tier)

---

## 📊 YOUR DATA

### Job Sources: 845 Jobs from 84 Domains (Analyzed)

#### TIER 1: API / Structured Sources (378 jobs, 44%) — SCRAPE FIRST
| Source | Jobs | Method | Priority |
|--------|------|--------|----------|
| unjobs.org | 223 | HTML scrape (Cheerio) | **P0** |
| reliefweb.int | 54 | REST API (api.reliefweb.int/v1/jobs) | **P0** |
| projects.worldbank.org | 49 | REST API (procurement) | **P0** |
| careers.un.org | 20 | HTML scrape | **P0** |
| procurement-notices.undp.org | 8 | API / HTML | P1 |
| jobs.unicef.org | 7 | Workday API | P1 |
| jobs.unops.org | 7 | HTML scrape | P1 |
| ungm.org | 6 | HTML scrape (Puppeteer, JS-rendered) | P1 |

#### TIER 2: ATS Platforms — One Template Per Platform (114 jobs, 13%)
| Source | Jobs | Platform | Priority |
|--------|------|----------|----------|
| fhi.wd1.myworkdayjobs.com | 39 | Workday (hidden JSON API at /wday/cxs/) | **P0** |
| ekum.fa.em2.oraclecloud.com | 19 | Oracle HCM (REST endpoints) | P1 |
| unhcr.wd3.myworkdayjobs.com | 15 | Workday (same template as FHI) | P1 |
| wd3.myworkdaysite.com | 10 | Workday | P1 |
| estm.fa.em2.oraclecloud.com | 9 | Oracle HCM (same template as ekum) | P1 |
| worldbankgroup.csod.com | 7 | Cornerstone OnDemand | P2 |
| mastercardfoundation.wd10... | 7 | Workday | P2 |

#### TIER 3: Custom Career Pages (221 jobs, 26%)
| Source | Jobs | Method | Priority |
|--------|------|--------|----------|
| jobs.au.int + au.int | 64 | HTML scrape | **P0** |
| drc.ngo | 60 | HTML scrape | **P0** |
| kifiya.com | 39 | HTML scrape | P1 |
| careers-sos-kd.icims.com | 14 | iCIMS API | P2 |
| ilri.org | 13 | HTML scrape | P2 |
| jobs.smartrecruiters.com | 9 | SmartRecruiters API | P1 |
| careers.gggi.org | 8 | HTML scrape | P2 |
| afdb.org | 7 | HTML scrape | P1 |

#### TIER 4: Aggregators & Misc (128 jobs, 15%)
- linkedin.com (20 jobs): **SKIP** — cannot scrape. Users link their own LinkedIn alerts.
- devex.com (1 job): Paywalled. Parse free email alerts as fallback.
- 34 domains with 1-3 jobs each: Not worth individual scrapers initially. Add in Phase 1+.

### Existing Profiles: 110 Consultants (Smartsheet CSV)
| Column | Sample | Use |
|--------|--------|-----|
| ID | "003" or "003 (E)" | (E) = **Expert** track |
| Name | "Kedir Mussa" | Display + matching |
| CV | PDF link | Reference |
| Qualifications | "Financial Advisor, Consultant..." | Role seniority |
| Sector | "Consulting, Development Programs..." | Sector matching |
| Entity and Location | "World Bank, Addis Ababa; GIZ, Nairobi" | Donor + country matching |
| Relevant Keyword | "Financial Mgmt, Capacity Building..." | Skill matching |
| Recommended By | "Mussie Tsegaye" | Trust signal |

---

## 🗄️ SUPABASE SETUP

### Project: "Devidends" (Supabase free tier)

#### Table 1: profiles
```sql
create table profiles (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  phone text,
  telegram_id text,
  name text not null,
  cv_url text,
  cv_text text,
  cv_score integer,
  sectors text[] default '{}',
  donors text[] default '{}',
  countries text[] default '{}',
  skills text[] default '{}',
  qualifications text,
  profile_type text check (profile_type in ('Expert', 'Senior', 'Mid', 'Junior')),
  profile_score_pct integer default 0,
  recommended_by text,
  source text default 'web',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### Table 2: opportunities
```sql
create table opportunities (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  deadline timestamptz,
  organization text,
  donor text,
  country text,
  sectors text[] default '{}',
  type text check (type in ('job', 'consulting', 'tender')),
  experience_level text,
  source_domain text not null,
  source_url text unique not null,
  scraped_at timestamptz default now(),
  is_active boolean default true
);
create index idx_opportunities_source on opportunities(source_domain);
create index idx_opportunities_sectors on opportunities using gin(sectors);
create index idx_opportunities_country on opportunities(country);
```

#### Table 3: subscriptions
```sql
create table subscriptions (
  id uuid default gen_random_uuid() primary key,
  email text,
  telegram_id text,
  sectors_filter text[] default '{}',
  donor_filter text[] default '{}',
  country_filter text[] default '{}',
  channel text check (channel in ('telegram', 'email', 'both')) default 'both',
  is_active boolean default true,
  created_at timestamptz default now()
);
```

#### Table 4: cv_scores
```sql
create table cv_scores (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references profiles(id),
  overall_score integer,
  dimensions jsonb,
  improvements jsonb,
  scored_at timestamptz default now()
);
```

#### Storage Buckets
- `cvs` — uploaded CV files (PDF/DOCX)
- `formatted-docs` — AI-formatted output documents

#### Auth
- Email magic link (Supabase Auth built-in)
- No passwords in MVP

---

## 📡 TELEGRAM BOT SETUP

### Create Bot
1. Message @BotFather on Telegram
2. `/newbot` → Name: "Devidends" → Username: `devidends_bot`
3. Save the token in `.env.local` as `TELEGRAM_BOT_TOKEN`

### Create Channel
1. Create channel: @DevidendsJobs (or similar available name)
2. Add the bot as admin
3. Save channel ID in `.env.local` as `TELEGRAM_CHANNEL_ID`

### Bot Commands
```
/start — Welcome + onboarding
/subscribe — Select sectors, donor, country filters → save to subscriptions table
/score — Upload CV → get AI score (calls CV scorer)
/search [keyword] — Search opportunities
/profile — View/edit your profile
/help — List commands
```

### Library: node-telegram-bot-api
```
npm install node-telegram-bot-api
```

### ENV VARS
```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id
```

---

## 🔬 PoC GATE: Technical Proof-of-Concept

> **Run these BEFORE starting the full build. Each is an isolated test script.**

### PoC 1: Scrape Top 5 Sources

#### Prompt for Claude Code:
```
I need to test web scraping for Devidends — an opportunity aggregator for development consulting in East Africa.

Build 5 separate Node.js test scripts in scripts/poc/:

1. scripts/poc/test-reliefweb.js
   - Fetch from: https://api.reliefweb.int/v1/jobs?appname=devidends&filter[field]=country&filter[value][]=Ethiopia&limit=20
   - Extract: title, description (body), deadline (date.closing), organization (source[0].name), country, url
   - This is a REST API — use fetch/axios

2. scripts/poc/test-worldbank.js
   - Fetch from: https://search.worldbank.org/api/v3/wds?format=json&fl=docdt,count,display_title,url&rows=20&os=0&qterm=Ethiopia+consultant
   - Also try procurement: https://projects.worldbank.org API
   - Extract: title, description, deadline, organization, country, url

3. scripts/poc/test-unjobs.js
   - Scrape: https://unjobs.org/duty_stations/ethiopia
   - Use cheerio to parse HTML
   - Extract: title, organization, location, deadline, link
   - Handle pagination if present

4. scripts/poc/test-drc.js
   - Scrape: https://drc.ngo/about-us/careers/ (filter Ethiopia)
   - Use cheerio for HTML parsing
   - If JS-rendered, try puppeteer as fallback
   - Extract: title, location, deadline, link

5. scripts/poc/test-au.js
   - Scrape: https://jobs.au.int/ (African Union careers)
   - Use cheerio or puppeteer
   - Extract: title, department, location, deadline, link

For ALL scripts:
- Output results as JSON array to ./test-output/[source-name].json
- Log count: "Found X opportunities from [source]"
- Handle errors gracefully (log and continue)
- Add a 1-second delay between requests if paginating

INSTALL: npm install cheerio puppeteer axios
RUN: node scripts/poc/test-[source].js
```

#### ✅ TEST: PoC 1
- [ ] Each script runs without crashing
- [ ] Each extracts at least 5 results
- [ ] Output JSON has: title, organization, country, link (minimum)
- [ ] Note which sources need Puppeteer vs Cheerio

---

### PoC 2: CV Score + Live Edit

#### Prompt for Claude Code:
```
I need to test CV scoring and editing for Devidends. Build a single Next.js page at /poc/cv-scorer.

1. FILE UPLOAD: Accept PDF or DOCX
   - PDF: npm install pdf-parse → extract text
   - DOCX: npm install mammoth → extract text
   - Display extracted text in a textarea (confirm extraction worked)

2. AI SCORING: Button "Score My CV" → calls Claude API with this system prompt:

"You are Devidends's CV Scorer for international development consulting (GIZ, World Bank, EU, UNDP, AfDB projects in Africa).

Score this CV on a 0-100 scale across these dimensions:
- Structure & Format (15%): Are standard sections present? Logical flow? Appropriate length?
- Professional Summary (15%): Clear, compelling, sector-relevant? Keywords present?
- Experience Relevance (25%): Donor experience depth? Sector alignment? Quantified impact?
- Skills & Keywords (15%): Technical skills, methodologies, tools, donor-specific terminology?
- Education & Certifications (10%): Relevant qualifications? Certifications? Languages?
- Donor Readiness (20%): Would this CV pass initial screening for a GIZ/World Bank assignment? Formatted appropriately?

For EACH dimension, provide:
- score (0-100)
- gaps (specific missing elements)
- suggestions (actionable improvements, not generic advice)

Return ONLY valid JSON:
{
  \"overall_score\": 65,
  \"dimensions\": [
    {\"name\": \"Structure & Format\", \"score\": 70, \"weight\": 15, \"gaps\": [\"No professional summary section\", \"CV exceeds 4 pages\"], \"suggestions\": [\"Add a 3-line summary highlighting your WASH expertise and 8 years with GIZ\", \"Trim to 3 pages by condensing pre-2018 roles\"]}
  ],
  \"top_3_improvements\": [\"Add donor experience section listing specific GIZ/WB projects\", \"Quantify impact: 'managed $2M budget' not 'managed large budget'\", \"Add a skills matrix with tools: SPSS, LogFrame, MS Project\"],
  \"donor_specific_tips\": {\"GIZ\": \"Add German language level if any. Mention results-based monitoring.\", \"World Bank\": \"Include years of experience prominently. List task TTL names if possible.\"}
}"

3. SCORE DISPLAY:
   - Overall score (big number, color-coded: <50 red, 50-70 amber, 70+ green)
   - Per-dimension breakdown (bar charts or progress bars)
   - Gap list with suggestions
   - Top 3 improvements highlighted

4. SIDE-BY-SIDE EDIT:
   - Left: original CV text
   - Right: AI-suggested improvements (marked by dimension)
   - User can accept/reject each suggestion
   - "Re-score" button after edits

Keep it as one page. No auth. No database. Just prove the scoring + editing concept works.

INSTALL: npm install pdf-parse mammoth @anthropic-ai/sdk
```

#### ✅ TEST: PoC 2
- [ ] PDF upload extracts text correctly
- [ ] DOCX upload extracts text correctly
- [ ] Claude returns meaningful, specific scores (not generic)
- [ ] Scores vary between CVs (not always 65/100)
- [ ] Suggestions reference specific content from the CV
- [ ] Side-by-side view shows original vs improved
- [ ] Compare scoring against your own judgment for 2-3 real CVs

---

### PoC 3: Template Upload + Autofill

#### Prompt for Claude Code:
```
I need to test template autofill for Devidends. Build a single Next.js page at /poc/template-fill.

1. TEMPLATE UPLOAD: Accept DOCX file (most donor templates are DOCX)

2. FIELD DETECTION:
   - Use mammoth to extract text + structure
   - Use docx npm package to parse XML structure
   - Look for: [[placeholder]] patterns, form fields, content controls, blank table cells with labels
   - List all detected fields

3. PROFILE DATA INPUT: Simple form with these fields (simulating a profile):
   - Company/Expert name
   - Email, phone
   - Sectors of expertise
   - Past project: title, donor, country, dates, budget, description
   - Key expert: name, title, qualifications, years of experience

4. AUTO-FILL: Map profile data to detected template fields
   - If using [[placeholder]]: string replace
   - If table with blank cells: fill adjacent blank cells
   - Generate filled DOCX for download

5. DOWNLOAD: "Download Filled Template" button

Test with a GIZ consultant CV template or EU Expression of Interest form.
If auto-detection is unreliable, create a manual field mapping approach as fallback.

INSTALL: npm install mammoth docx
```

#### ✅ TEST: PoC 3
- [ ] DOCX template uploads and parses
- [ ] At least some fields are detected
- [ ] Auto-fill produces a valid, openable DOCX
- [ ] Formatting is preserved (tables, headers, styles)
- [ ] Note: if auto-detection fails, manual mapping is the fallback

---

## 🏗️ PHASE 0A: Intel Feed + Telegram Bot

> Start this AFTER PoC 1 passes. Build scrapers for real.

### Phase 0A-1: Scraper Infrastructure

#### Prompt for Claude Code:
```
Build the scraper infrastructure for Devidends. Read CLAUDE.md for full context.

ARCHITECTURE:
- Each source gets its own scraper module in lib/scrapers/
- All scrapers export a common interface: scrape() → Promise<Opportunity[]>
- Shared type: { title, description, deadline, organization, donor, country, sectors, type, source_domain, source_url }

CREATE lib/scrapers/reliefweb.ts:
- Fetch from ReliefWeb API v1
- Filter: country=Ethiopia, limit=50
- Map response to Opportunity type
- Handle pagination

CREATE lib/scrapers/worldbank.ts:
- Fetch from World Bank procurement API
- Filter: Ethiopia + consulting
- Map to Opportunity type

CREATE lib/scrapers/unjobs.ts:
- Scrape unjobs.org/duty_stations/ethiopia using cheerio
- Parse job listing HTML
- Handle pagination (multiple pages)

CREATE lib/scrapers/drc.ts:
- Scrape drc.ngo career page
- Filter Ethiopia locations
- Use cheerio (try first) or puppeteer (fallback)

CREATE lib/scrapers/au.ts:
- Scrape jobs.au.int
- Parse career listings

CREATE lib/scrapers/workday-template.ts:
- Generic Workday scraper that takes a base URL
- Uses the hidden /wday/cxs/ JSON endpoint
- Configure for: FHI 360 (fhi.wd1.myworkdayjobs.com)
- Easily extensible to UNHCR, MCF, etc. by changing base URL

CREATE lib/scrapers/index.ts:
- Exports runAllScrapers() — runs all scrapers, deduplicates by source_url, returns combined results
- runScraper(name) — run a single scraper
- Error handling: if one scraper fails, log and continue with others

CREATE lib/classify.ts:
- classifyOpportunity(opp) — calls Claude API to:
  - Extract sectors from title + description
  - Determine experience level (Junior/Mid/Senior)
  - Determine type (job/consulting/tender)
  - Extract donor name if present
  - Return enriched opportunity

CREATE scripts/run-scrapers.ts:
- Run all scrapers → classify with AI → upsert to Supabase opportunities table
- Dedup by source_url (upsert, don't duplicate)
- Log: "Scraped X new, Y updated, Z failed"
- Can be triggered manually or via cron

CREATE lib/supabase.ts:
- Initialize Supabase client from env vars
- CRUD helpers for all 4 tables
- Type definitions matching the schema

ENV VARS in .env.local:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=

INSTALL: npm install @supabase/supabase-js cheerio puppeteer @anthropic-ai/sdk
```

#### ✅ TEST: Phase 0A-1
- [ ] `node scripts/run-scrapers.ts` (or tsx) runs without errors
- [ ] Opportunities appear in Supabase dashboard
- [ ] At least 3 sources produce results
- [ ] No duplicate URLs in database
- [ ] AI classification adds sectors and experience level

---

### Phase 0A-2: Opportunity Feed UI + Telegram Bot

#### Prompt for Claude Code:
```
Build the opportunity feed and Telegram bot for Devidends. Read CLAUDE.md.

PART A — OPPORTUNITY FEED:

CREATE /opportunities page (PUBLIC, no auth):
- Fetch all active opportunities from Supabase, ordered by scraped_at desc
- FILTERS (sidebar or top bar):
  - Text search (title + description)
  - Sector chips: Humanitarian Aid, Global Health, Finance, ICT, Agriculture, Project Management, Economic Development, Gender, Environment, M&E, WASH, Education (from your data)
  - Type: All | Jobs | Consulting | Tenders
  - Donor: GIZ, World Bank, EU, UNDP, USAID, AfDB, UNICEF, AU, Other
  - Experience: Junior | Mid | Senior
- Results as cards: title, organization, location, deadline (with countdown), type badge, sector chips, "Apply →" link
- Pagination or infinite scroll
- Each opportunity has a shareable URL: /opportunities/[id]
- "Subscribe for alerts" CTA at top

CREATE /opportunities/[id] page:
- Full opportunity detail
- "Am I a fit?" button (placeholder — wired in Phase 0B)
- Share buttons (Telegram, email, copy link)
- Related opportunities (same sector/donor)

PART B — TELEGRAM BOT:

CREATE lib/telegram.ts:
- Initialize bot using node-telegram-bot-api
- Commands:
  /start → "Welcome to Devidends! I'll help you find development opportunities in East Africa." + inline keyboard to subscribe
  /subscribe → "What sectors interest you?" → inline keyboard with sector buttons (multi-select) → save to subscriptions table
  /search [keyword] → search opportunities by keyword, return top 5 as formatted messages with "Apply →" button
  /help → list commands

CREATE lib/telegram-broadcast.ts:
- broadcastNewOpportunities() — called after scraping:
  1. Get all new opportunities (scraped in last 24h)
  2. For each subscriber, filter by their sector/donor/country preferences
  3. Send personalized Telegram message with matched opportunities
  4. Also post top 5 to the @DevidendsJobs channel (public)

CREATE API route POST /api/telegram/webhook:
- Receives updates from Telegram Bot API
- Routes to appropriate command handler

Also create:
- API route to trigger scraping manually: POST /api/admin/scrape (protected)
- Simple admin page /admin showing: scraper status, opportunity count, subscriber count

INSTALL: npm install node-telegram-bot-api
```

#### ✅ TEST: Phase 0A-2
- [ ] /opportunities shows real scraped opportunities
- [ ] Filters work (sector, type, search)
- [ ] Individual opportunity page loads with full details
- [ ] Telegram bot responds to /start and /subscribe
- [ ] /search returns relevant results
- [ ] Broadcast sends to test subscriber (your own Telegram)

---

### Phase 0A-3: Email Digest + Distribution

#### Prompt for Claude Code:
```
Add email digest and distribution features to Devidends. Read CLAUDE.md.

CREATE /subscribe page (PUBLIC):
- Simple form: Email, optional Telegram username
- Sector preferences (checkboxes)
- Country preference
- Channel preference: Email | Telegram | Both
- Saves to Supabase subscriptions table
- Confirmation message

CREATE lib/digest.ts using Resend:
- generateWeeklyDigest(subscriberId):
  1. Fetch subscriber preferences
  2. Query opportunities from last 7 days matching their filters
  3. Rank by relevance (sector match > donor match > recency)
  4. Generate HTML email: top 10 opportunities with title, org, deadline, apply link
  5. Devidends branding (navy header, orange accents)
  6. "Score Your CV" CTA at bottom

CREATE scripts/send-digest.ts:
- Fetch all active subscribers with channel = 'email' or 'both'
- Generate and send personalized digest to each
- Log: "Sent X digests, Y failed"

CREATE landing page at / (root):
- Hero: "Never miss a development opportunity in East Africa"
- Sub: "845+ jobs and consulting gigs aggregated from 84 sources. Filtered by AI. Delivered to your inbox or Telegram."
- Two CTAs: "Browse Opportunities →" and "Subscribe for Free →"
- Below fold: source logos (World Bank, GIZ, UN, DRC, AU, etc.)
- Stats: "X opportunities this week | Y sectors covered | Z sources monitored"
- Devidends branding, professional, conservative design

INSTALL: npm install resend
ENV: RESEND_API_KEY=
```

#### ✅ TEST: Phase 0A-3
- [ ] Landing page loads, looks professional
- [ ] Subscribe form saves to Supabase
- [ ] Digest email generates and sends (test with your own email)
- [ ] Email looks good on desktop + mobile
- [ ] Opportunity count on landing page is real
- [ ] **MILESTONE**: Share landing page + Telegram channel with your 150+ network

---

## 🏗️ PHASE 0B: CV Scorer + Formatter + Profiles

> Start this in parallel with Phase 0A (around Week 2-3).

### Phase 0B-1: CV Scorer

#### Prompt for Claude Code:
```
Build the CV Scorer for Devidends. Read CLAUDE.md for context.

CREATE /score page (PUBLIC):

1. UPLOAD: Drag-and-drop or click to upload PDF/DOCX
   - pdf-parse for PDF text extraction
   - mammoth for DOCX text extraction
   - Upload file to Supabase Storage (cvs bucket)
   - Show extracted text preview (collapsible)

2. SCORE: "Score My CV" button → loading state → calls /api/cv/score
   API route:
   - Receives extracted text
   - Calls Claude API with the CV scoring system prompt (see CLAUDE.md PoC 2 section for full prompt)
   - Returns JSON scores

3. SCORE DISPLAY:
   - Overall score: big number, color-coded (<50 red, 50-70 amber, 70+ green)
   - Animated circular progress indicator
   - Per-dimension breakdown: 6 bars with scores, expandable for gaps + suggestions
   - "Top 3 Things to Improve" highlighted section
   - Donor-specific tips (GIZ, World Bank tabs)

4. SHARE: "Share your score" button → generates shareable card image or link
   - "My CV scored 78/100 on Devidends for development consulting! Score yours: [link]"
   - This is the viral hook — people share scores on Telegram/LinkedIn

5. CTA: "Want to improve your score? →" leads to CV Formatter (Phase 0B-2)

Design: Professional, feels like a diagnostic tool. Think credit score dashboard.
Mobile-friendly — Telegram users will open this on phones.
```

#### ✅ TEST: Phase 0B-1
- [ ] PDF upload + scoring works
- [ ] DOCX upload + scoring works
- [ ] Scores are specific (reference actual CV content)
- [ ] Scores vary between different CVs
- [ ] Score display looks professional and clear
- [ ] Share link works
- [ ] Test with 3 real CVs from your network — compare AI score to your judgment

---

### Phase 0B-2: CV Formatter + Profile Creation

#### Prompt for Claude Code:
```
Build the CV Formatter and profile creation for Devidends. Read CLAUDE.md.

CREATE /improve page (connected from /score CTA):

1. IMPROVEMENT VIEW:
   - Left panel: original CV text (from /score step)
   - Right panel: AI-suggested improvements, organized by dimension
   - Each suggestion has "Accept" / "Edit" / "Reject" buttons
   - Accepting a suggestion updates the left panel text
   - "Re-score" button to see updated score after accepting suggestions

2. DONOR FORMAT:
   - Selector: "Format for:" GIZ | World Bank | EU | AfDB | General
   - Each format applies donor-specific structure:
     - GIZ: Results-focused, German-style concise CV format
     - WB: Detailed, years-of-experience prominent, task TTL references
     - EU: EuroPass-adjacent, competency-based
   - "Generate Formatted CV" → creates DOCX via docx npm package
   - Download button

3. PROFILE AUTO-CREATION:
   After formatting, prompt: "Save your profile to get matched to opportunities?"
   - AI extracts from CV text: name, sectors, donors, countries, skills, qualifications
   - Show extracted data in editable form (AI WILL get things wrong — user must be able to correct)
   - On confirm: create profile in Supabase profiles table
   - Save CV URL (from Supabase Storage), cv_text, cv_score
   - Send confirmation via Supabase Auth magic link (email)

4. PROFILE PAGE at /profile/[id]:
   - View profile with all fields
   - Edit any field
   - See current CV score + history (from cv_scores table)
   - "Matched Opportunities" section: top 5 from intel feed matching their sectors/donors
   - Profile Score: X% complete (count filled fields / total fields)
   - "Improve Profile Score" nudges for missing fields

Supabase Auth:
- On profile creation, create Supabase auth user (magic link)
- /profile requires auth
- /score and /improve work without auth (reduce barrier)
```

#### ✅ TEST: Phase 0B-2
- [ ] Improvement suggestions display correctly
- [ ] Accept/reject works and updates text
- [ ] Re-score shows updated score
- [ ] Donor formatting produces different outputs for GIZ vs WB
- [ ] DOCX download opens correctly in Word/Google Docs
- [ ] Profile auto-creation extracts reasonable data from CV
- [ ] Profile is editable
- [ ] Auth magic link works
- [ ] Matched opportunities show on profile page

---

### Phase 0B-3: Recommender Seeding + Integration Test

#### Prompt for Claude Code:
```
Seed recommender profiles and run integration tests for Devidends. Read CLAUDE.md.

PART A — SEED PROFILES:
Create scripts/seed-recommenders.ts:
- Manually create 5-10 profiles in Supabase for your core recommenders
- Data from your existing Smartsheet (use names, sectors, qualifications)
- Set profile_type based on (E) suffix
- These are your test users

PART B — TELEGRAM CV SCORING:
Update the Telegram bot:
- /score command: "Send me your CV (PDF or DOCX) and I'll score it!"
- User sends a document → bot downloads it → extracts text → scores → returns result
- Include link: "See full results and improve your CV: [web link]"
- This is the Telegram-native path to the CV scorer

PART C — CONNECT THE DOTS:
- Profile page shows "X opportunities matching your profile this week" (from intel feed)
- Opportunity page shows "You're a X% match" if user is logged in (basic: count overlapping sectors)
- Telegram /subscribe now includes: "You'll also get personalized alerts based on your profile" if they have one

PART D — TEST FLOW:
Create /admin/test page:
- "Test Supabase" → ✅ Connected (X profiles, Y opportunities)
- "Test Claude API" → ✅ Working
- "Test Telegram Bot" → ✅ Connected
- "Test Resend" → ✅ Working
- Env var status (set/not set, never show values)
- Manual scraper trigger button
- Full end-to-end checklist
```

#### ✅ TEST: Phase 0B-3
- [ ] 5-10 recommender profiles exist in Supabase
- [ ] Telegram /score command works (send a real CV)
- [ ] Profile shows matching opportunities
- [ ] Opportunity shows match percentage (basic)
- [ ] All test checks pass on /admin/test
- [ ] **FULL FLOW**: Upload CV via Telegram → score → improve on web → save profile → see matching opportunities → subscribe for alerts
- [ ] **MILESTONE**: Have 5-6 core team members run through the full flow. Collect feedback.

---

## 🏗️ PHASE 1+: Future Phases (Build After 0A + 0B Validated)

### Phase 1: Engagement + Personalization (Month 3-4)
- Eligibility Checker: "Am I a fit for this?" (AI matches profile vs opportunity requirements)
- Personalized Telegram alerts (matched to profile, not just subscription filters)
- Template Autofill (EU/GIZ/WB forms from profile data)
- Add P1 + P2 scrapers (expand source coverage to ~80%)
- Invite/referral system (tracked, reputation credit)
- Rate Benchmarker (daily rate intelligence from scraped data)

### Phase 2: Matching + Monetization (Month 4-6)
- AI matching engine (profiles vs specific requests)
- Door A activates: request form for firms/requesters
- Shortlist generation (branded .docx)
- Payment integration (Stripe + Chapa for Ethiopia)
- Subscription tiers (Free/Pro/Business/Enterprise)
- Team Builder (find complementary experts for bids)
- Service Provider profile type (comms, events, translation)

### Phase 3: Intelligence + Scale (Month 7-12)
- Proposal development tools
- Bid intelligence (donor thresholds, contacts, incumbents)
- Win/loss tracking + analytics
- Geographic expansion (Kenya → East Africa)
- Mobile PWA
- Enterprise features

---

## 📈 PROGRESS TRACKER

> Update this after completing each phase. Claude Code reads this on new sessions.

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| PoC 1: Scraping | ⬜ Not started | | |
| PoC 2: CV Scoring | ⬜ Not started | | |
| PoC 3: Template Fill | ⬜ Not started | | |
| 0A-1: Scraper Infra | ⬜ Not started | | |
| 0A-2: Feed + Telegram | ⬜ Not started | | |
| 0A-3: Digest + Landing | ⬜ Not started | | |
| 0B-1: CV Scorer | ⬜ Not started | | |
| 0B-2: Formatter + Profiles | ⬜ Not started | | |
| 0B-3: Seeding + Testing | ⬜ Not started | | |

### Known Issues
(Add issues here as they come up — Claude Code checks this on new sessions)

### Scraper Health Log
| Source | Status | Last Success | Notes |
|--------|--------|-------------|-------|
| reliefweb.int | ⬜ | | |
| worldbank | ⬜ | | |
| unjobs.org | ⬜ | | |
| drc.ngo | ⬜ | | |
| au.int | ⬜ | | |
| Workday (FHI360) | ⬜ | | |

### CV Scoring Quality Log
| CV | Expected Score Range | AI Score | Accurate? | Notes |
|----|---------------------|----------|-----------|-------|
| | | | | |

---

## 📁 EXPECTED FILE STRUCTURE

```
devidends/
├── CLAUDE.md                        ← THIS FILE
├── .env.local                       ← API keys (never commit)
├── scripts/
│   ├── poc/                         ← PoC test scripts
│   │   ├── test-reliefweb.js
│   │   ├── test-worldbank.js
│   │   ├── test-unjobs.js
│   │   ├── test-drc.js
│   │   └── test-au.js
│   ├── run-scrapers.ts              ← Run all scrapers
│   ├── send-digest.ts               ← Send weekly email digest
│   └── seed-recommenders.ts         ← Seed test profiles
├── app/
│   ├── layout.tsx                   ← Root layout
│   ├── page.tsx                     ← Landing page
│   ├── opportunities/
│   │   ├── page.tsx                 ← Opportunity feed
│   │   └── [id]/page.tsx           ← Single opportunity
│   ├── score/page.tsx               ← CV Scorer (public)
│   ├── improve/page.tsx             ← CV Formatter (public)
│   ├── subscribe/page.tsx           ← Subscribe form
│   ├── profile/
│   │   └── [id]/page.tsx           ← Profile view/edit (auth)
│   ├── admin/
│   │   ├── page.tsx                 ← Admin dashboard
│   │   └── test/page.tsx           ← API connection tests
│   ├── poc/                         ← PoC test pages
│   │   ├── cv-scorer/page.tsx
│   │   └── template-fill/page.tsx
│   └── api/
│       ├── cv/score/route.ts
│       ├── cv/format/route.ts
│       ├── opportunities/route.ts
│       ├── subscriptions/route.ts
│       ├── admin/scrape/route.ts
│       └── telegram/webhook/route.ts
├── lib/
│   ├── supabase.ts                  ← Supabase client + types
│   ├── classify.ts                  ← AI opportunity classification
│   ├── cv-scorer.ts                 ← CV scoring with Claude
│   ├── cv-formatter.ts              ← CV formatting + DOCX generation
│   ├── telegram.ts                  ← Telegram bot handlers
│   ├── telegram-broadcast.ts        ← Broadcast new opportunities
│   ├── digest.ts                    ← Email digest generation
│   └── scrapers/
│       ├── index.ts                 ← Scraper orchestrator
│       ├── reliefweb.ts
│       ├── worldbank.ts
│       ├── unjobs.ts
│       ├── drc.ts
│       ├── au.ts
│       └── workday-template.ts
├── components/
│   └── ui/                          ← Shared UI components
├── middleware.ts                     ← Auth protection
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🔧 WHEN THINGS BREAK

### Error Handling Protocol
1. Copy the FULL error message (terminal + browser console)
2. Paste to Claude Code: "I got this error when I [action]. Error: [paste]. Expected: [what should happen]."
3. If fix doesn't work after 2 attempts: "Let's take a different approach. The goal is [business goal, not code]."
4. If stuck: start a new Claude Code session. It re-reads CLAUDE.md and starts fresh.

### Common Issues
- **Supabase connection error**: Check NEXT_PUBLIC_SUPABASE_URL and keys in .env.local
- **Claude API timeout**: Reduce text length sent to API. Truncate CV text to 4000 chars.
- **Scraper returns 0 results**: Site structure may have changed. Check the source URL manually first.
- **Telegram bot not responding**: Check TELEGRAM_BOT_TOKEN. Ensure webhook is set: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_VERCEL_URL>/api/telegram/webhook`
- **PDF extraction gibberish**: Some PDFs are image-based (scanned). Log as known limitation.
- **Build fails**: Run `npm run build` and paste full error. Usually a TypeScript type issue.
- **Vercel deploy fails**: Check env vars are set in Vercel dashboard (not just .env.local).
