# Cloudflare R2 Setup for Tier 2 Data Storage

This guide walks you through setting up Cloudflare R2 for the Poker Simulator's Tier 2 cached data.

## Overview

- **Tier 1**: Bundled JSON data (~500KB) - Already working
- **Tier 2**: Cloudflare R2 storage for extended datasets - This guide
- **Tier 3**: Live Monte Carlo simulation - API endpoint

## Step 1: Create a Cloudflare Account

1. Go to [cloudflare.com](https://cloudflare.com)
2. Click **Sign Up** (top right)
3. Enter your email and create a password
4. Verify your email

> **Already have an account?** Skip to Step 2.

## Step 2: Enable R2 Storage

1. Log into the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the left sidebar, click **R2 Object Storage**
3. If prompted, accept the R2 terms (no credit card required for free tier)

### R2 Free Tier Includes:
- 10 GB storage
- 10 million Class A operations (writes) / month
- 10 million Class B operations (reads) / month
- No egress fees!

## Step 3: Create an R2 Bucket

1. On the R2 page, click **Create bucket**
2. Enter bucket name: `poker-sim-data`
3. Location: **Automatic** (or choose a region near you)
4. Click **Create bucket**

## Step 4: Create API Tokens

1. On the R2 page, click **Manage R2 API Tokens** (right side)
2. Click **Create API token**
3. Configure the token:
   - **Token name**: `poker-simulator-upload`
   - **Permissions**: Select **Object Read & Write**
   - **Specify bucket(s)**: Select `poker-sim-data`
   - **TTL**: Leave as default (no expiration) or set as desired
4. Click **Create API Token**
5. **IMPORTANT**: Copy and save these values immediately (they won't be shown again):
   - **Access Key ID**: Starts with something like `a1b2c3...`
   - **Secret Access Key**: Longer string

## Step 5: Get Your Account ID

1. Go to any page in the Cloudflare dashboard
2. Look at the URL: `https://dash.cloudflare.com/XXXXXXXX/...`
3. The `XXXXXXXX` part is your **Account ID**
4. Or: Click your profile (top right) → **My Profile** → scroll down to see Account ID

## Step 6: Set Environment Variables

### For Local Development

Create a `.env.local` file in the project root:

```bash
# Cloudflare R2 Configuration
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_BUCKET_NAME=poker-sim-data
```

### For Vercel Deployment

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your `poker-simulator` project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - `R2_ACCOUNT_ID` → your account ID
   - `R2_ACCESS_KEY_ID` → your access key
   - `R2_SECRET_ACCESS_KEY` → your secret key
   - `R2_BUCKET_NAME` → `poker-sim-data`
5. Click **Save** for each

## Step 7: Generate and Upload Data

### Install Dependencies

```bash
cd /path/to/poker-simulator
npm install
```

### Generate Tier 2 Data Locally

```bash
npm run tier2:generate
```

This creates simulation data in `data/tier2/` for all game variants and player counts.

### Upload to R2

```bash
# Set environment variables first
export R2_ACCOUNT_ID=your_account_id
export R2_ACCESS_KEY_ID=your_access_key
export R2_SECRET_ACCESS_KEY=your_secret_key
export R2_BUCKET_NAME=poker-sim-data

# Upload
npm run tier2:upload
```

### Or Do Both at Once

```bash
npm run tier2:all
```

### Verify Upload

```bash
npm run tier2:list
```

## Step 8: Deploy to Vercel

After setting environment variables in Vercel:

```bash
vercel --prod
```

## Step 9: Test the API

```bash
# Test the data endpoint
curl "https://poker-simulator-gamma.vercel.app/api/data?game=omaha4&players=6"
```

Should return:
```json
{
  "source": "tier2-r2",
  "key": "omaha4/6p/all.json",
  "data": { ... }
}
```

## Troubleshooting

### "R2 not configured" error
- Check that all 4 environment variables are set in Vercel
- Redeploy after adding variables

### "Access Denied" error
- Verify your API token has "Object Read & Write" permissions
- Check the token is scoped to the correct bucket

### "Bucket not found" error
- Verify bucket name matches exactly: `poker-sim-data`
- Check R2_BUCKET_NAME environment variable

## Data Structure

The R2 bucket contains:
```
poker-sim-data/
├── omaha4/
│   ├── 2p/all.json
│   ├── 3p/all.json
│   ├── ...
│   └── 9p/all.json
├── omaha5/
│   ├── 2p/all.json
│   └── ...
└── omaha6/
    ├── 2p/all.json
    └── ...
```

Each file contains pre-computed simulation results with 100,000 iterations.

## Cost Estimate

For typical usage:
- Storage: ~5 MB → **Free** (under 10 GB)
- Reads: ~1000/day → **Free** (under 10M/month)
- Writes: ~50/month → **Free** (under 10M/month)
- Egress: **Always free** (R2 has no egress fees!)

**Expected monthly cost: $0**
