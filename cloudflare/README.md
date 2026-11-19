# Cloudflare Edge CDN & Reverse Proxy for Drabyashree NEPSE

This Cloudflare Worker provides a **100% Free Forever** Edge CDN shield in front of your Render backend.

### What it does:
1. **0 MB Outbound Bandwidth on Render**: Caches public API responses (market data, charts, ledger, dividends) at Cloudflare edge nodes right in Nepal/India. Repeat requests are served from Cloudflare's edge cache without touching Render.
2. **Unlimited Free Bandwidth**: Cloudflare does not charge for egress bandwidth or cap your data at 5 GB.
3. **100,000 Free Requests / Day**: Ample headroom for thousands of daily active users.
4. **Cold-Start Shield**: When Render goes to sleep, Cloudflare returns stale cached responses so mobile and web users never experience 502/503 errors.
5. **Full CORS Support**: Handles OPTIONS preflight directly in <1ms.

---

## Method 1: Deploy in 60 Seconds via Cloudflare Web Dashboard (Easiest)

1. Log into your **[Cloudflare Dashboard](https://dash.cloudflare.com/)**.
2. In the left navigation, click **Workers & Pages** -> **Overview**.
3. Click **Create application** -> **Create Worker**.
4. Name the worker (e.g. `drabyashree-nepse-cdn`) and click **Deploy**.
5. Once deployed, click **Edit code** (Quick Edit).
6. Replace all existing code in the editor with the entire content of [`cloudflare/worker.js`](./worker.js).
7. Click **Save and Deploy**.
8. Cloudflare will give you a public URL like:
   `https://drabyashree-nepse-cdn.<your-subdomain>.workers.dev`

---

## Method 2: Deploy via CLI (Wrangler)

From your local machine terminal:
```bash
cd cloudflare
npx wrangler login
npx wrangler deploy
```

---

## Testing Your New Edge CDN

Test any endpoint via your new Cloudflare Worker URL:
```bash
curl -i https://drabyashree-nepse-cdn.<your-subdomain>.workers.dev/health
```
In the response headers, look for:
* `X-Edge-Cache: HIT` (served directly from Cloudflare memory in <10ms!)
* `X-Edge-Node: Cloudflare-CDN`

---

## Updating Frontend Configs

Once your Worker URL is live:
1. Update `VITE_PROXY_URL` in `.env` to your worker URL.
2. Update `brand.config.json` -> `"viteProxyUrl": "https://drabyashree-nepse-cdn.<your-subdomain>.workers.dev"`.
3. In `vercel.json`, update the `destination` rewrites to point to your Cloudflare Worker URL.
