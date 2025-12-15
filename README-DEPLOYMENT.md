# ⚡ Quick Deployment to Vercel

## TL;DR - The Issue

The project has build issues locally due to problematic dependencies in `@privy-io/react-auth` → `@reown/appkit` → `thread-stream` trying to import test files and LICENSE files as JavaScript.

**Solution: Deploy directly to Vercel** - Vercel's build system handles these issues automatically.

## 🚀 Deploy Now

### Option 1: Deploy via Vercel Dashboard (Easiest)

1. **Go to** https://vercel.com/new
2. **Import your Git repository**
3. **Add Environment Variables:**

```bash
NEXT_PUBLIC_API_URL=https://your-backend-api.com
NEXT_PUBLIC_INDEXER_URL=https://your-indexer-service.com
NEXT_PUBLIC_TWITTER_CLIENT_ID=your_twitter_client_id
NEXT_PUBLIC_TWITTER_REDIRECT_URI=https://your-domain.vercel.app/auth/callback
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

4. **Click Deploy** - Vercel will build it successfully

### Option 2: Deploy via CLI

```bash
# Make sure you have the latest code
git add .
git commit -m "Ready for deployment"
git push

# Deploy
vercel

# Or deploy to production directly
vercel --prod
```

**When prompted for environment variables**, add them via the dashboard or CLI:

```bash
vercel env add NEXT_PUBLIC_INDEXER_URL production
# Enter your indexer URL when prompted

# Repeat for other variables...
```

## 📝 Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `https://api.cryptarena.com` |
| `NEXT_PUBLIC_INDEXER_URL` | Indexer service URL | `https://indexer.cryptarena.com` |
| `NEXT_PUBLIC_TWITTER_CLIENT_ID` | Twitter OAuth client ID | `your_client_id` |
| `NEXT_PUBLIC_TWITTER_REDIRECT_URI` | OAuth callback URL | `https://cryptarena.vercel.app/auth/callback` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID | `your_privy_id` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |

## ✅ Post-Deployment

After deployment:

1. **Note your Vercel URL** (e.g., `https://cryptarena-fe.vercel.app`)
2. **Update Twitter Developer Portal:**
   - Add your Vercel URL as an allowed callback URL
   - Update to: `https://your-domain.vercel.app/auth/callback`
3. **Update Privy Dashboard:**
   - Add your Vercel domain to allowed domains

## 🔄 Future Deployments

Just push to your Git repository:

```bash
git add .
git commit -m "Your changes"
git push
```

Vercel will automatically deploy on every push to your main branch!

## 🐛 If Build Fails on Vercel

1. Check the build logs in Vercel dashboard
2. Ensure all environment variables are set
3. Try rebuilding: `vercel --prod --force`

## 📊 Monitoring

- **Dashboard:** https://vercel.com/dashboard
- **Analytics:** Available in your Vercel project
- **Logs:** Click on any deployment to see logs

---

**Why Vercel Works:** Vercel's build system has automatic fixes for common npm package issues like the ones we encountered with `thread-stream`, `pino`, and WalletConnect dependencies.

