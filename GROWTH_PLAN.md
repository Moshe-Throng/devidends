# Devidends Virality & Growth Plan

**Last updated:** 2026-03-31

---

## 1. Target User Segments

### Segment A: The Active Consultant (40% of TAM)
Mid-career (5-15 yrs), currently on a contract with GIZ/UNDP/World Bank. Always scanning for the next engagement 3-6 months before current one ends. Has 2-3 CVs tailored to different donors. Active in 5-10 Telegram groups (sector-specific, alumni, procurement tip-sharing). Checks DevEx, ReliefWeb, and UNJobs manually 2-3x/week. Pain: reformatting CVs for each donor system, missing deadlines, no way to know which org is actually hiring vs. posting for compliance.

### Segment B: The Job Seeker (35% of TAM)
1-5 years experience, MA from Addis Ababa University or similar, looking to break into international development. Applies to everything. Has one generic CV. Active on LinkedIn and Telegram job groups (EthioJobs, Vacancy Alert groups with 10K-50K members). Pain: can't tell quality opportunities from spam, doesn't know CV formatting standards for UN/WB, no network to recommend them.

### Segment C: The Hiring Manager / HR (15% of TAM)
Works at INGOs, UN agencies, consulting firms. Needs to find Ethiopian nationals for local positions or short-term consultancies. Currently posts on DevEx ($$$), ReliefWeb, and asks colleagues. Pain: too many unqualified applications, no pre-vetted talent pool, consultant rosters are outdated Excel sheets.

### Segment D: The Recommender Network (10% of TAM)
Senior professionals who refer juniors. University professors, former project managers. They don't job-seek themselves but influence 10-50 people each. Pain: constantly asked "do you know any openings?" and forwarding links manually.

**Where they find jobs today:** Telegram groups (primary), DevEx (paid), ReliefWeb, UNJobs, EthioJobs, LinkedIn, word of mouth, organization websites directly. Telegram is dominant in Ethiopia -- even formal procurement tips circulate in groups.

---

## 2. Data-for-Value Exchange Map

Every interaction should collect something and give something. Here is the exchange at each step:

| Touchpoint | Data Collected | Value Given |
|---|---|---|
| First open (Telegram mini app) | telegram_id, language, city | 845+ live opportunities, no login wall |
| Subscribe to alerts | email, sectors, countries, donor prefs | Filtered daily digest (jobs + news) |
| Upload CV | Full career history, skills, education, employers | CV score (0-100) with specific improvement tips |
| Build CV | Structured data: exact roles, dates, achievements | Donor-formatted CV (Europass, WB, AU, UN PHP) |
| Save a job | Interest signals: which orgs, sectors, seniority levels | Deadline reminders, similar job suggestions |
| Complete profile | years_of_experience, profile_type, qualifications | Match score on each opportunity, visibility to recruiters |
| Refer a friend | Social graph data, influence score | Priority in matching, extended free tier |
| Score CV against job | Fit assessment, gap analysis | Concrete bullets to add, keyword gaps |

**Key insight:** The CV upload is the single highest-value data event. A parsed CV gives you the user's entire professional history, employer network, skill taxonomy, and salary band (inferrable from seniority + org). Gate the best features behind CV upload, not behind payment.

---

## 3. Built-in Sharing Loops

### 3a. CV Score Card (P0 -- build first)
**What:** After scoring a CV, generate a shareable image card showing the score (e.g., "78/100 -- Strong for UN positions, needs work on WB format"). Branded with Devidends colors. Include a QR code / short link to score their own CV.

**Data captured from sharer:** Full CV data. **Data captured from viewer:** telegram_id when they click through.

**Why it works:** Development professionals are competitive about credentials. A score is inherently shareable -- people want to show off a high score or ask peers "what did you get?" This is the TalentCheck certificate pattern adapted to CVs.

**Expected viral coefficient:** 0.3-0.5 (each scorer brings 0.3-0.5 new users)
**Complexity:** Low (PIL image generation, short link)

### 3b. Job Alert Forwarding (P0)
**What:** Every job alert message in Telegram includes a "Share this opportunity" button that forwards the job card WITH a Devidends attribution footer and "See 20 more like this" link. The forwarded message is a mini-ad.

**Data captured:** Which jobs get forwarded most (demand signal), forwarding user's network reach.

**Why it works:** People already forward job links in Telegram groups. Make the forwarded version look better than a raw URL. The attribution footer is free advertising in every group it lands in.

**Expected viral coefficient:** 0.4-0.7 (job alerts are the #1 reason people share)
**Complexity:** Low (Telegram bot formatting)

### 3c. "X people applied" Social Proof (P1)
**What:** Show application/view counts on popular opportunities. "47 professionals viewed this in the last 24 hours." Creates urgency and signals that Devidends is where the action is.

**Data captured:** View counts, time-on-page, scroll depth.
**Complexity:** Low (counter in Supabase, display in UI)

---

## 4. Network Effects

### 4a. Talent Pool for Recruiters (P1)
**What:** Segment C (hiring managers) can search public profiles by sector, country, years of experience, and donor familiarity. Every new profile with `is_public: true` makes the platform more valuable to recruiters. Every recruiter posting makes it more valuable to job seekers.

**Flywheel:** More profiles --> recruiters come --> exclusive opportunities posted --> more profiles.

**Data captured:** Recruiter search queries (reveals unmet demand -- "looking for M&E specialist with GIZ experience in Somali region" tells you exactly what skills the market wants).

**Critical mass needed:** 500 public profiles to be useful to a recruiter. You have 150 recommenders who each know 5-10 people. One campaign gets you there.

### 4b. Sector Intelligence Feed (P1)
**What:** Aggregate anonymized data: "WASH sector had 23% more postings this month vs. last," "Average deadline is 14 days for consultancies vs. 30 for jobs," "World Bank Ethiopia posted 12 new positions this week." This data gets more accurate with more users tracking more jobs.

**Data captured:** Trend engagement (which sectors users care about).
**Complexity:** Medium (analytics on existing opportunity data)

### 4c. "Who's Hiring" Employer Pages (P2)
**What:** Auto-generated org pages showing each organization's hiring velocity, common roles, typical requirements. Built from scraped data. More users = more data on which orgs actually convert applications.

**Complexity:** Medium (aggregation views on existing data)

---

## 5. Referral System Design

### Mechanics
```
Referral code: devidends.vercel.app/?ref=XXXX or t.me/DevidendsBot?start=ref_XXXX
```

### Reward tiers (progressive, not one-time):

| Referrals | Reward |
|---|---|
| 1 | Unlock "Compare CV to Job" feature (score CV against specific posting) |
| 3 | Unlock all 6 CV templates (free tier gets 2: Europass + Professional) |
| 5 | 30 days Pro free (unlimited scoring, priority alerts, advanced analytics) |
| 10 | "Devidends Ambassador" badge on public profile, permanent Pro |
| 25 | Listed as community contributor on landing page |

**Why progressive works:** One-time rewards create a spike then flatline. Progressive rewards turn your most connected users (Segment D recommenders) into permanent growth engines.

**Data captured:** Social graph, influence mapping, which referrers bring the highest-quality users (measured by CV upload rate and return visits).

**Complexity:** Medium (referral tracking table, reward logic, template gating)

### Anti-gaming
- Referred user must complete profile (>40% score) for referral to count
- Same telegram_id can only be referred once
- Rate limit: max 5 referral credits per day

---

## 6. Content Virality

### 6a. Weekly "Market Pulse" Post (P0)
**What:** Auto-generated content every Monday:
- Top 10 new opportunities this week
- Sector hiring trends (up/down arrows)
- "Hot org" of the week (most postings)
- One career tip

Published to a Devidends Telegram channel AND formatted for LinkedIn. Users share because it's genuinely useful intelligence that doesn't exist elsewhere.

**Data captured:** Channel subscriber growth, post engagement, which sections get screenshotted.

**Complexity:** Low (query existing data, format with template)

### 6b. "Opportunity of the Day" (P0)
**What:** Single best opportunity posted daily to the Telegram channel with full analysis: org background, likely salary range (inferred from seniority + donor), application tips, deadline countdown. Make this so good that people forward it.

**Complexity:** Low (curated from existing data, AI-generated analysis)

### 6c. Donor-Specific CV Guides (P1)
**What:** Detailed guides: "How to Write a World Bank CV," "UN PHP Format Explained," "What GIZ Actually Looks For." Gate behind email signup. These are the exact guides that get shared in Telegram groups and WhatsApp.

**Data captured:** Email addresses, donor interests (which guide they downloaded).

**Complexity:** Low (one-time content creation, PDF generation)

---

## 7. Telegram-Native Growth

### 7a. Group Seeding Bot (P0 -- already proven with Guada)
**What:** Identify the top 20 Ethiopian development/jobs Telegram groups (5K-50K members each). Post the "Opportunity of the Day" with Devidends branding. Not spam -- genuinely the best opportunity, well-formatted, with a "See more" link.

**Key groups to target:**
- Ethiopian Jobs / Vacancy Alert groups
- Sector-specific: WASH professionals Ethiopia, Health sector jobs
- University alumni groups (AAU, Jimma, Bahir Dar)
- Consultant networks (informal groups where procurement tips circulate)

**Data captured:** Which groups drive the most conversions (track via ref params per group).

**Complexity:** Low (adapt existing `guada_group_seeder.py` pattern)

### 7b. Inline Query Mode (P1)
**What:** Users type `@DevidendsBot [keyword]` in ANY Telegram chat to search opportunities inline. Results appear as cards they can send directly. Every card sent is free advertising.

**Why it works:** WhatsApp doesn't have this. Telegram inline bots are massively underused in East Africa. When someone asks "any GIZ jobs?" in a group chat, instead of typing a URL, they type `@DevidendsBot GIZ` and boom -- formatted results appear.

**Data captured:** Search queries from external groups (massive demand signal data).

**Complexity:** Medium (Telegram inline mode implementation)

### 7c. Devidends Channel with Discussion Group (P0)
**What:** Public Telegram channel for daily digest + linked discussion group where users discuss opportunities, share tips, ask questions. The channel is the broadcast, the group is the community.

**Growth hack:** Pin a message in the discussion group: "Share your CV score -- what did you get?" Triggers the score card sharing loop.

**Complexity:** Low (channel creation, bot posting schedule)

---

## 8. Lock-in Mechanisms

### 8a. Career Timeline (P1)
**What:** Track every job the user saved, applied to, scored their CV against. Over time, this becomes their personal career search history. "You've tracked 47 opportunities across 8 months. Your average match score improved from 62 to 78." Leaving means losing this history.

**Data captured:** Full application journey, career progression intent.

### 8b. Saved Searches & Smart Alerts (P0)
**What:** Users set up persistent filters ("WASH + Ethiopia + Senior + UNDP/GIZ"). These run daily. Each alert is a reason to open the app. The more filters they set up, the harder it is to leave.

**Data captured:** Precise preference data for matching.

### 8c. CV Version History (P1)
**What:** Store every CV version they build. "Your World Bank CV v3 scored 82. Your UN PHP CV v2 scored 71." Switching platforms means losing all their tailored CVs.

**Data captured:** CV evolution, which formats they prioritize.

### 8d. Recommendation Letters / Endorsements (P2)
**What:** Segment D recommenders can write endorsements visible on public profiles. Once you have 3 endorsements on Devidends, you're not leaving.

**Data captured:** Professional relationship graph, trust signals.

---

## 9. Critical Data to Collect (and How)

| Data Point | Why It Matters | How to Get It Organically |
|---|---|---|
| Current employer | Know which orgs' staff are looking to leave | CV upload (work history section) |
| Salary expectations | Future premium feature for recruiters | "What seniority matches you?" quiz |
| Contract end dates | Predict when they'll job-search intensely | "When does your current role end?" in profile |
| Donor network familiarity | Match quality signal | Multi-select in profile setup (already built) |
| Application outcomes | Train a "likelihood of success" model | "Did you get this job?" follow-up 30 days after deadline |
| Language proficiency | Critical for UN/AU roles | CV parsing (already captured) |
| Willingness to relocate | Expands matching beyond Ethiopia | Toggle in alert settings |
| Professional certifications | PMP, CPA, ACCA -- high-value signals | CV parsing + profile field |

**Most valuable dataset you can build:** A map of "who works where, what they're good at, and when their contract ends." No one in East Africa has this. It's worth more than the job board itself.

---

## 10. Implementation Roadmap

### Phase 1: Viral Primitives (Weeks 1-2)
| Feature | Priority | Complexity | Viral Coefficient |
|---|---|---|---|
| CV Score Card (shareable image) | P0 | Low | 0.3-0.5 |
| Job alert forwarding with branding | P0 | Low | 0.4-0.7 |
| Telegram channel + daily digest | P0 | Low | 0.1-0.2 |
| Opportunity of the Day auto-post | P0 | Low | 0.2-0.3 |
| Referral code system (basic) | P0 | Medium | 0.2-0.4 |

**Combined Phase 1 viral coefficient: ~0.8-1.2** (approaching or exceeding virality threshold of 1.0)

### Phase 2: Depth & Lock-in (Weeks 3-5)
| Feature | Priority | Complexity |
|---|---|---|
| Template gating (2 free, 4 locked) | P1 | Low |
| Inline bot search (@DevidendsBot) | P1 | Medium |
| Talent pool search for recruiters | P1 | Medium |
| Weekly Market Pulse auto-post | P1 | Low |
| Saved searches + smart alerts | P1 | Medium |
| Application outcome tracking | P1 | Low |

### Phase 3: Moat Building (Weeks 6-10)
| Feature | Priority | Complexity |
|---|---|---|
| Career timeline / history | P2 | Medium |
| Employer pages (auto-generated) | P2 | Medium |
| Endorsement system | P2 | High |
| Donor CV guides (gated content) | P2 | Low |
| "Contract ending soon" predictions | P2 | Medium |

---

## 11. Key Metrics to Track

| Metric | Target (Month 1) | Target (Month 3) |
|---|---|---|
| Registered users (profile created) | 500 | 2,000 |
| CVs uploaded | 200 | 1,000 |
| Daily active users | 50 | 200 |
| CV scores generated | 300 | 2,000 |
| Referral conversion rate | 15% | 25% |
| Alert open rate (email) | 40% | 35% |
| Telegram channel subscribers | 1,000 | 5,000 |
| Public profiles (recruiter-visible) | 150 | 600 |
| Score cards shared | 100 | 500 |

---

## 12. One Killer Insight

The development sector in East Africa runs on **reputation and referrals**. A World Bank team lead doesn't post on DevEx and pick the best CV -- they ask their network "who do you know?" Devidends' real moat isn't job aggregation (anyone can scrape ReliefWeb). The moat is **becoming the place where the question "who do you know?" gets answered systematically.**

Every feature above feeds this: profiles make people findable, endorsements make them trustable, CV scores make them comparable, and the referral system turns informal networks into structured data. The job board is the hook. The talent graph is the product.
