# Infrastructure Research — Update Machine v2

> Researched April 2026 by ScoutClaw 🔭
> All pricing verified against official pricing pages as of April 1, 2026.

---

## Executive Summary (TL;DR)

**Recommended stack: Vercel Pro + Neon Free (or Launch) + Cloudflare R2**

- **App hosting:** Vercel Pro ($20/mo) — best-in-class Next.js support, zero config, preview deployments, cron jobs, cold start prevention. At our traffic level, the $20 credit covers all usage.
- **Database:** Neon Free tier to start, upgrade to Launch when needed ($0–5/mo realistic) — same tech as Vercel Postgres but without the Vercel markup, `@neondatabase/serverless` driver already in use, scale-to-zero keeps costs near zero for our traffic.
- **Object storage:** Stay on Cloudflare R2 (already using it, $0–1/mo at our scale, zero egress fees).

Total estimated monthly cost: **$20–25/mo** for production + staging.

Why not Vercel Postgres? It's Neon under the hood but you pay Vercel's markup and lose direct Neon features. Why not all-in Cloudflare? Next.js on Workers is still rough — `@opennextjs/cloudflare` works but has compatibility gaps and you lose the deploy-and-forget simplicity of Vercel. Why not Railway/Fly.io? More ops burden for no real cost savings at this scale.

---

## App Hosting Comparison

### Vercel ⭐ RECOMMENDED

| Aspect | Details |
|--------|---------|
| **Plan** | Pro ($20/user/mo, includes $20 usage credit) |
| **Next.js compatibility** | 10/10 — Vercel literally builds Next.js. Zero-config deployment. |
| **Cold starts** | Fluid compute keeps functions warm. Pro includes "Cold start prevention." |
| **Deployment** | `git push` → deployed. Preview URLs on every PR. Instant rollback. |
| **Cron** | Built-in `vercel.json` cron support. Included in all plans. |
| **Bandwidth** | 1 TB/mo Fast Data Transfer included on Pro. More than enough. |
| **Functions** | 4 hrs Active CPU/mo included (Hobby), Pro is usage-based at $0.128/hr. |
| **Gotchas** | $20/user/mo adds up with teams — but we're 1 developer seat. |

**Cost at our scale:** $20/mo flat. The included $20 credit covers all compute/bandwidth for <1000 req/day. Essentially $0 in overages.

### Cloudflare Pages/Workers

| Aspect | Details |
|--------|---------|
| **Plan** | Free (100K req/day) or Workers Paid ($5/mo for 10M req/mo) |
| **Next.js compatibility** | 6/10 — Requires `@opennextjs/cloudflare` adapter. App Router works but edge cases exist. Some Next.js features (middleware, ISR, image optimization) may behave differently or not work. Active development but not first-class. |
| **Cold starts** | Near-zero — V8 isolates, not containers. Fastest cold starts of any option. |
| **Deployment** | `wrangler deploy` or git integration. Good but more config than Vercel. |
| **Cron** | Cron Triggers built into Workers (free). |
| **Bandwidth** | Unlimited (free egress on all plans). |
| **Gotchas** | Workers runtime ≠ Node.js. CPU time limits (10ms free / 30s paid per invocation). Bundle size limit (10MB paid). Some npm packages won't work. Can't use Node.js APIs directly without compatibility flags. |

**Cost at our scale:** $0–5/mo. Cheapest option by far.

**Verdict:** Tempting on paper but the Next.js compatibility tax is real. You'd spend time debugging adapter issues instead of building features. Not worth it unless you're willing to go all-in on Cloudflare's runtime model.

### Railway

| Aspect | Details |
|--------|---------|
| **Plan** | Hobby ($5/mo with $5 credit) or Pro ($20/mo with $20 credit) |
| **Next.js compatibility** | 9/10 — Runs Node.js natively in containers. Full Next.js support. |
| **Cold starts** | None — always-on container. But you pay for idle time. |
| **Deployment** | Git push or CLI. Docker-based. Slightly more config than Vercel. |
| **Cron** | Built-in cron jobs. Up to 50 on Hobby. |
| **Compute pricing** | CPU: $0.000463/min (~$0.028/hr). RAM: $0.000231/min/GB. |
| **Gotchas** | Container model means you pay 24/7 even for idle apps. A small Next.js app (0.5 vCPU, 512MB RAM) running 24/7 ≈ $7–10/mo in compute alone. |

**Cost at our scale:** $5–15/mo depending on resource usage. The Hobby $5 credit likely covers a small always-on container.

**Verdict:** Solid option if you want container-based hosting. But for a low-traffic serverless-friendly app, you're paying for idle compute. Vercel's serverless model is better suited.

### Fly.io

| Aspect | Details |
|--------|---------|
| **Plan** | Pay-as-you-go (no free tier anymore, credit card required) |
| **Next.js compatibility** | 8/10 — Runs in containers. Works fine but requires Dockerfile setup. |
| **Cold starts** | Can scale to zero with Fly Machines, but restart takes 1-3 seconds. |
| **Deployment** | `fly deploy` — Dockerfile-based. More ops than Vercel/Railway. |
| **Pricing** | shared-cpu-1x / 256MB: $1.94/mo. shared-cpu-1x / 512MB: $3.19/mo. |
| **Postgres** | Managed Postgres available (separate pricing). |
| **Gotchas** | More DevOps-oriented. You manage health checks, scaling, regions. No built-in preview deployments. |

**Cost at our scale:** $3–7/mo for a small Machine. Add Postgres and it's $10–15/mo.

**Verdict:** Great for container workloads where you want regional control. Overkill for our use case. More knobs to turn = more to babysit.

### Self-hosted VPS (Hetzner/DigitalOcean)

| Aspect | Details |
|--------|---------|
| **Cost** | Hetzner: €4.51/mo (CX22: 2 vCPU, 4GB RAM). DigitalOcean: $6/mo (1 vCPU, 1GB). |
| **Next.js compatibility** | 10/10 — It's just Node.js. Run whatever you want. |
| **Cold starts** | None — always on. |
| **Deployment** | Manual: SSH + PM2/Docker + reverse proxy (Caddy/nginx). Or set up CI/CD. |
| **Gotchas** | YOU manage everything: SSL, updates, backups, monitoring, security patches, uptime. No preview deployments without additional tooling (Coolify, Dokku, etc.). |

**Cost at our scale:** $4–6/mo for the VM. Cheapest in raw compute.

**Verdict:** Cheapest hardware cost but highest ops cost. For a 1-human team with AI agents, babysitting a VPS is the wrong tradeoff. The time spent on DevOps > the $15/mo saved vs Vercel.

---

## Database Comparison (The Key Decision)

### Traffic Profile Context
- ~50-100 WordPress sites polling every 12 hours = ~100-200 update checks/day
- Each check: 1-2 SELECT queries (plugin version lookup)
- Admin dashboard: <50 page views/day
- Plugin releases: batch of UPSERTs + INSERTs (infrequent)
- Daily cron: 1 batch query for digest

**Total DB load: ~500-1000 queries/day. This is extremely light.**

### Neon (Direct) ⭐ RECOMMENDED

| Aspect | Details |
|--------|---------|
| **Free tier** | 0.5 GB storage, 100 compute-hours/month per project, 10 branches |
| **Launch plan** | Pay-per-use: $0.106/CU-hour compute, $0.35/GB-month storage |
| **Scale-to-zero** | Yes, after 5 minutes. Suspended compute = $0. |
| **Cold start** | ~500ms to wake from zero (first query after idle). Subsequent queries instant. |
| **Connection pooling** | Built-in PgBouncer. Also supports HTTP API for serverless. |
| **Serverless driver** | `@neondatabase/serverless` — already in your codebase. Perfect fit. |
| **Branching** | Database branches for staging/preview (10 included free). Game-changer. |
| **Backups** | Point-in-time restore: 6 hours (free), 7 days (Launch), 30 days (Scale). |
| **Region** | US East (aws-us-east-1, aws-us-east-2), US West available. |
| **Egress** | 5 GB free, 100 GB on Launch. |

**Cost at our scale:**
- Free tier: $0/mo. 100 compute-hours is ~133 hours of 0.75 CU (a beefy config). With scale-to-zero, our light traffic would use maybe 5-10 CU-hours/month. **Free tier is MORE than enough.**
- If we outgrow free: Launch plan ≈ $1-3/mo (5-10 CU-hours × $0.106 + 0.5GB × $0.35).

**Why it wins:** Already using `@neondatabase/serverless`. Scale-to-zero means near-$0 cost. Branching gives us free staging databases. Free tier is genuinely generous for our workload.

### Vercel Postgres (Managed Neon)

| Aspect | Details |
|--------|---------|
| **What it is** | Neon under the hood, managed through Vercel dashboard |
| **Pricing** | Bundled into Vercel plans. Pro includes some usage credit. |
| **Integration** | Tight Vercel integration — env vars auto-configured, dashboard in Vercel |
| **Gotchas** | Less control than direct Neon. Pricing is opaque (wrapped into Vercel billing). Can't use Neon branching directly. Feature parity lags behind Neon direct. |

**Cost at our scale:** Included in Vercel Pro $20 credit — but eats into your compute credit.

**Verdict:** Convenient but unnecessary. Direct Neon gives you more features (branching!), transparent pricing, and the driver is already the same. The "tight integration" is just auto-configured env vars — you can do that yourself in 30 seconds.

### Supabase

| Aspect | Details |
|--------|---------|
| **Free tier** | 500 MB database, 1 GB file storage, 50K monthly active users |
| **Pro plan** | $25/mo — 8 GB database, 100 GB storage, daily backups |
| **Connection pooling** | Built-in (Supavisor). |
| **Cold starts** | Free tier pauses after 7 days inactivity. Pro is always-on. |
| **Extras** | Auth, Realtime, Edge Functions, Storage — lots of features you won't use. |
| **Serverless** | Works with serverless but designed more for always-on. Connection string + pooler. |

**Cost at our scale:** $0 (free) or $25/mo (Pro). The free tier pausing after 7 days is a dealbreaker for a production update server — WordPress sites check every 12 hours, so your DB would never actually pause, but if there's a quiet week during vacation, it could.

**Verdict:** Over-engineered for our needs. You'd pay for Auth, Realtime, Storage, etc. that you don't use. The $25/mo Pro plan is pricier than Neon Launch for the same Postgres. Go Supabase if you want a full backend platform; go Neon if you just want Postgres.

### Railway Postgres

| Aspect | Details |
|--------|---------|
| **What it is** | Standard Postgres in a Railway container |
| **Pricing** | Compute + storage from your Railway credit. ~$3-5/mo for a small always-on Postgres. |
| **Connection pooling** | You'd add PgBouncer yourself or handle it in app code. |
| **Cold starts** | None — always-on container. But costs money 24/7. |
| **Backups** | Built-in volume backups. |
| **Serverless fit** | Not ideal — always-on Postgres with connection limits. Fine for Railway-hosted apps but awkward with Vercel serverless functions. |

**Cost at our scale:** ~$3-5/mo (small container running 24/7).

**Verdict:** Makes sense if the app is also on Railway. Awkward pairing with Vercel due to connection pooling concerns.

### PlanetScale (MySQL)

| Aspect | Details |
|--------|---------|
| **Status** | Removed free tier in 2024. Scaler plan starts at $39/mo. |
| **Migration** | Would require rewriting all SQL to MySQL. Different ORM, different driver. |

**Verdict:** Hard no. Too expensive for our scale, requires MySQL migration, and the free tier is gone. Not worth considering.

### Self-hosted Postgres on VPS

| Aspect | Details |
|--------|---------|
| **Cost** | $4-6/mo for a VPS that also runs the app |
| **Management** | YOU handle: backups, upgrades, security patches, monitoring, connection pooling, failover |
| **Backups** | Manual cron + pg_dump or WAL archiving |
| **Connection pooling** | Install and configure PgBouncer yourself |

**Cost at our scale:** $0 additional if co-located on app VPS.

**Verdict:** Cheapest but most ops burden. One missed backup + one disk failure = total data loss. Not worth the risk for the $3/mo saved vs Neon.

### Cloudflare D1 (SQLite)

| Aspect | Details |
|--------|---------|
| **What it is** | Serverless SQLite on Cloudflare's edge |
| **Free tier** | 5 million reads/day, 100K writes/day, 5 GB storage |
| **Paid** | $0.75/million reads, $1.00/million writes beyond free tier |
| **Gotchas** | SQLite, not Postgres. Would require rewriting all queries, no Drizzle/Prisma Postgres adapters, limited SQL features. Row size limits. No JOINs across databases. |

**Cost at our scale:** $0 (free tier covers everything).

**Verdict:** Free is great but this is a step backward from Postgres. You'd lose jsonb, complex queries, and the `@neondatabase/serverless` driver. Only makes sense if you go all-in Cloudflare AND the schema is simple enough for SQLite.

---

## Cloudflare Consolidation Analysis

### The Case For All-In Cloudflare
- **Already using R2** for object storage
- **Workers/Pages** free tier is insanely generous (100K req/day free)
- **D1** free tier covers our query volume easily
- **Hyperdrive** can proxy to external Postgres (Neon) from Workers
- **Zero egress** on everything
- **Single dashboard** for all infrastructure
- **Total cost: $0-5/mo**

### The Case Against
- **Next.js on Workers is not first-class.** `@opennextjs/cloudflare` is functional but:
  - Not all Next.js features work (image optimization, some middleware patterns)
  - Debugging is harder (Workers runtime ≠ Node.js)
  - Build tooling is more complex
  - Community is smaller — fewer Stack Overflow answers
- **D1 is SQLite, not Postgres.** Schema migration from Postgres → SQLite is non-trivial. Lose advanced Postgres features.
- **Hyperdrive + external Neon** works but adds latency vs co-located Vercel + Neon.
- **Vendor lock deeper** into Cloudflare's runtime model.
- **Time cost:** Fighting compatibility issues > the $15-20/mo saved.

### Hybrid Approach (What We're Doing)
**Use Cloudflare for what it's great at (R2 storage), use Vercel for what IT'S great at (Next.js hosting).**

R2 costs ~$0/mo at our scale (free 10GB storage, free egress). There's no reason to move off it. But there's also no reason to force the app into Workers just because the storage is on Cloudflare.

**Verdict: Don't consolidate. Cherry-pick the best of each platform.**

---

## Staging Strategy

### Recommended: Vercel Preview Deployments + Neon Database Branching

This is the killer combo that makes the Vercel + Neon stack shine for staging:

#### App Staging
- **Vercel Preview Deployments** — every git branch gets a unique URL automatically. Free on all plans. No separate project needed.
- **Production:** `main` branch → `update-machine.yourdomain.com`
- **Staging:** `staging` branch → `update-machine-git-staging-yourteam.vercel.app`
- **Feature previews:** any branch → auto-generated URL

#### Database Staging
- **Neon Database Branching** — create a branch of your prod database for staging. It's a copy-on-write fork, so it starts with prod data but changes are isolated.
- Free tier: 10 branches included
- Branch creation: instant (< 1 second)
- Storage: only charged for the delta (changes from parent)
- **Cost: effectively $0** for a staging branch with minimal writes

#### R2 Staging
- **Separate R2 bucket** for staging (`update-machine-staging`)
- R2 free tier: 10 GB storage, 1 million Class B requests/month
- Two buckets both under free tier = $0 additional cost

#### Environment Variables
```
# Production (main branch)
DATABASE_URL=postgres://...@ep-prod-xxx.us-east-2.aws.neon.tech/neondb
R2_BUCKET=update-machine-prod

# Staging (staging branch)  
DATABASE_URL=postgres://...@ep-staging-xxx.us-east-2.aws.neon.tech/neondb
R2_BUCKET=update-machine-staging
```

Vercel supports per-branch environment variables natively. Set once, forget forever.

#### Cost of Staging
| Component | Staging Cost |
|-----------|-------------|
| Vercel preview deployment | $0 (included) |
| Neon database branch | $0 (included in free tier) |
| R2 staging bucket | $0 (within free tier) |
| **Total staging overhead** | **$0** |

---

## Cost Estimates

### Option A: Vercel Pro + Neon Free + R2 ⭐ RECOMMENDED

| Component | Monthly Cost |
|-----------|-------------|
| Vercel Pro (1 seat) | $20.00 |
| Neon Free tier | $0.00 |
| Cloudflare R2 (< 10 GB, < 1M req) | $0.00 |
| **Total** | **$20.00** |

Notes: Vercel's $20 includes $20 usage credit. At <1000 req/day, compute stays well under. If DB outgrows free tier, Neon Launch adds ~$1-3/mo.

### Option B: Vercel Hobby (Free) + Neon Free + R2

| Component | Monthly Cost |
|-----------|-------------|
| Vercel Hobby | $0.00 |
| Neon Free tier | $0.00 |
| Cloudflare R2 | $0.00 |
| **Total** | **$0.00** |

Notes: Hobby limits — 1 team member, no cold start prevention, 100 GB bandwidth (plenty), 4 hrs Active CPU (tight but probably fine). **Start here and upgrade to Pro if you hit limits.** Hobby is "Free forever" per Vercel's pricing page.

### Option C: Cloudflare Workers + Neon + R2

| Component | Monthly Cost |
|-----------|-------------|
| CF Workers Free / $5 Paid | $0–5.00 |
| Neon Free tier | $0.00 |
| Cloudflare R2 | $0.00 |
| **Total** | **$0–5.00** |

Notes: Cheapest but pay with your time debugging Next.js compatibility.

### Option D: Railway Hobby + Railway Postgres + R2

| Component | Monthly Cost |
|-----------|-------------|
| Railway Hobby ($5 credit) | $5.00 |
| App compute (~0.5 vCPU, 512MB 24/7) | ~$7/mo (may exceed $5 credit) |
| Postgres (~256MB 24/7) | ~$3/mo |
| Cloudflare R2 | $0.00 |
| **Total** | **$8–12.00** |

Notes: Always-on containers cost more than serverless for low-traffic apps.

### Option E: Fly.io + Neon + R2

| Component | Monthly Cost |
|-----------|-------------|
| Fly.io shared-cpu-1x/512MB | $3.19 |
| Neon Free tier | $0.00 |
| Cloudflare R2 | $0.00 |
| **Total** | **$3–5.00** |

Notes: More ops than Vercel. No preview deployments. Manual scaling/health check config.

### Option F: Hetzner VPS + Self-hosted Postgres + R2

| Component | Monthly Cost |
|-----------|-------------|
| Hetzner CX22 (2 vCPU/4GB) | €4.51 (~$5) |
| Self-hosted Postgres | $0 (on same VPS) |
| Cloudflare R2 | $0.00 |
| **Total** | **~$5.00** |

Notes: Cheapest but you're the sysadmin. No preview deployments, no auto-scaling, no managed backups.

---

## Recommendation

### 🏆 Start with Vercel Hobby + Neon Free + Cloudflare R2 = $0/mo

For a project that serves <1000 requests/day with 1-2 admin users, **start on free tiers** and upgrade when you actually need to:

1. **Vercel Hobby** (free) — deploy Next.js with zero config. Preview deployments work. Cron works. 4 hrs Active CPU/mo is plenty for our load. Cold starts are the only concern, but with <1000 req/day, fluid compute keeps things responsive enough.

2. **Neon Free** ($0) — 0.5 GB storage and 100 CU-hours/month. Our ~500-1000 queries/day barely scratches this. Scale-to-zero means idle time costs nothing. `@neondatabase/serverless` driver already works. 10 branches = free staging DBs.

3. **Cloudflare R2** ($0) — already using it. 10 GB free storage, zero egress. Plugin zips + manifests easily fit.

### 📈 Upgrade Path: Vercel Pro = $20/mo

When you need any of:
- Cold start prevention (Pro feature — eliminates ~500ms first-request latency)
- More than 100 GB bandwidth/month
- Team collaboration features
- Webhook triggers for CI/CD

This is the natural upgrade. The $20/mo includes enough credit to cover all overages at our scale.

### Why Not Neon Launch Immediately?

Free tier gets 100 CU-hours/month. Our workload uses maybe 5-10 CU-hours. There's zero reason to pay for Launch until we hit the 0.5 GB storage limit (which means thousands of plugin records — unlikely soon).

### Why Not Vercel Postgres?

Same Neon tech, but:
- Neon direct: transparent pricing, database branching, more control, broader feature set
- Vercel Postgres: convenience wrapper that eats into your $20 usage credit
- Since you're already using `@neondatabase/serverless`, there's literally no integration benefit

### The Stack
```
┌─────────────────────────────┐
│  Vercel (Hobby → Pro)       │  App hosting, serverless, preview deploys
│  Next.js 15 App Router      │
├─────────────────────────────┤
│  Neon (Free → Launch)       │  Postgres, serverless driver, branching
│  @neondatabase/serverless   │
├─────────────────────────────┤
│  Cloudflare R2              │  Plugin zips, update manifests
│  S3-compatible API          │
├─────────────────────────────┤
│  Slack Bot API              │  Magic links, error digests
└─────────────────────────────┘
```

**Total cost: $0/mo to start → $20/mo when you upgrade → unlikely to exceed $25/mo even with growth.**

This is the sweet spot of "cheap but not self-managed headaches." You get best-in-class Next.js hosting, a genuinely serverless database, free staging via branching, and zero egress storage — all managed, all with free tiers that actually cover your workload.
