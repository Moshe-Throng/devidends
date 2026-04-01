#!/bin/bash
# ============================================================
# Devidends Crawler Setup for VPS (Hostinger srv867871)
# Run this once on the VPS to set up the crawl pipeline
# Usage: bash setup-vps-crawler.sh
# ============================================================

set -e

REPO_DIR="/root/devidends-crawler"
ENV_FILE="$REPO_DIR/.env.local"

echo "=== Setting up Devidends Crawler on VPS ==="

# 1. Clone or pull repo
if [ -d "$REPO_DIR" ]; then
    echo "Repo exists, pulling latest..."
    cd "$REPO_DIR" && git pull origin main
else
    echo "Cloning repo..."
    git clone https://github.com/Moshe-Throng/devidends.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 2. Install Node.js if not present
if ! command -v node &> /dev/null || [[ $(node --version | cut -d. -f1 | tr -d v) -lt 20 ]]; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 3. Install Chromium for Puppeteer
if ! command -v chromium-browser &> /dev/null && ! command -v chromium &> /dev/null; then
    echo "Installing Chromium..."
    apt-get install -y chromium-browser || apt-get install -y chromium
fi

# 4. Install npm deps
echo "Installing dependencies..."
cd "$REPO_DIR"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# 5. Install Puppeteer browser
npx puppeteer browsers install chrome 2>/dev/null || true

# 6. Create .env.local if not exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env.local — YOU MUST FILL IN THE VALUES"
    cat > "$ENV_FILE" << 'ENVEOF'
# Devidends Crawler Environment Variables
# Fill these in!
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_GROUP_ID=
TELEGRAM_JOBS_TOPIC_ID=
RESEND_API_KEY=
NEXT_PUBLIC_SITE_URL=https://devidends-eta-delta.vercel.app
ENVEOF
    echo "!!! IMPORTANT: Edit $ENV_FILE with your actual keys !!!"
fi

# 7. Create the crawl script
cat > /root/run-devidends-crawl.sh << 'CRAWLEOF'
#!/bin/bash
# Daily Devidends crawl pipeline
# Called by cron at 5:00 UTC (8:00 EAT)

set -e
cd /root/devidends-crawler

LOG="/root/devidends-crawl.log"
echo "=== Crawl started at $(date -u) ===" >> "$LOG"

# Pull latest source configs
git pull origin main --quiet 2>> "$LOG" || true

# Run crawl engine
echo "Running crawl engine..." >> "$LOG"
npx tsx scripts/crawl-engine/engine.ts --concurrency 3 >> "$LOG" 2>&1 || echo "Crawl engine had errors" >> "$LOG"

# Publish to Supabase (so web feed has data)
echo "Publishing to Supabase..." >> "$LOG"
npx tsx scripts/publish-to-supabase.ts >> "$LOG" 2>&1 || echo "Publish had errors" >> "$LOG"

# Crawl news
echo "Running news crawl..." >> "$LOG"
npx tsx scripts/crawl-news.ts >> "$LOG" 2>&1 || echo "News crawl had errors" >> "$LOG"

# Send email alerts
echo "Sending email alerts..." >> "$LOG"
npx tsx scripts/send-alerts-email.ts >> "$LOG" 2>&1 || echo "Email alerts had errors" >> "$LOG"

# Broadcast to Telegram
echo "Broadcasting to Telegram..." >> "$LOG"
npx tsx scripts/broadcast-group.ts >> "$LOG" 2>&1 || echo "Telegram broadcast had errors" >> "$LOG"

# Commit and push updated data
cd /root/devidends-crawler
git add test-output/*.json 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
    git config user.name "devidends-vps-bot"
    git config user.email "bot@devidends.net"
    git commit -m "Update opportunity + news data [$(date -u '+%a %m/%d/%Y')]" >> "$LOG" 2>&1
    git push origin main >> "$LOG" 2>&1 || echo "Git push failed" >> "$LOG"
fi

echo "=== Crawl finished at $(date -u) ===" >> "$LOG"
echo "" >> "$LOG"
CRAWLEOF

chmod +x /root/run-devidends-crawl.sh

# 8. Set up cron job (5:00 UTC = 8:00 AM EAT, daily)
CRON_LINE="0 5 * * * /root/run-devidends-crawl.sh"
(crontab -l 2>/dev/null | grep -v "run-devidends-crawl"; echo "$CRON_LINE") | crontab -

echo ""
echo "=== Setup Complete ==="
echo "Repo: $REPO_DIR"
echo "Crawl script: /root/run-devidends-crawl.sh"
echo "Cron: Daily at 05:00 UTC (08:00 EAT)"
echo "Log: /root/devidends-crawl.log"
echo ""
echo "NEXT STEPS:"
echo "1. Edit $ENV_FILE with your API keys"
echo "2. Test manually: bash /root/run-devidends-crawl.sh"
echo "3. Check log: tail -f /root/devidends-crawl.log"
