# How to Get Your Supabase Credentials

## Step 1: Get Your Supabase URL and Anon Key

1. **Go to your Supabase Dashboard**
   - Visit https://app.supabase.com
   - Sign in to your account

2. **Select Your Project**
   - If you haven't created a project yet, click "New Project"
   - Fill in your project details and wait for it to initialize (takes 1-2 minutes)

3. **Navigate to Settings**
   - Click on the gear icon (⚙️) in the left sidebar
   - Or click on "Settings" in the menu

4. **Go to API Settings**
   - In the Settings menu, click on "API"

5. **Copy Your Credentials**
   - **Project URL**: Look for "Project URL" section
     - It will look like: `https://xxxxxxxxxxxxx.supabase.co`
     - Copy this entire URL
   
   - **anon public key**: Look for "Project API keys" section
     - Find the key labeled "anon" or "public"
     - It's a long string starting with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
     - Click the eye icon to reveal it, then copy it

## Step 2: Update app.js

Open `app.js` and replace these lines:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

With your actual values:

```javascript
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

## Step 3: Set Gemini API Key as Supabase Secret

Your Gemini API key should NOT be in the frontend code. It needs to be set as a secret in Supabase Edge Functions.

### Using Supabase CLI:

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link Your Project**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   - Your project ref is in your Supabase URL: `https://YOUR_PROJECT_REF.supabase.co`
   - Or find it in Settings > General > Reference ID

4. **Set the Gemini API Key Secret**:
   ```bash
   supabase secrets set GEMINI_API_KEY=AIzaSyDRkO31dq3n5R5KUFVbLgEXQF9yXrx455c
   ```

5. **Verify the secret was set**:
   ```bash
   supabase secrets list
   ```
   You should see `GEMINI_API_KEY` in the list.

6. **Deploy the Edge Functions**:
   ```bash
   supabase functions deploy scrape-product
   supabase functions deploy generate-spec-summary
   supabase functions deploy find-alternatives
   ```

## Visual Guide

In Supabase Dashboard:
- Settings (⚙️) → API
- You'll see:
  - **Project URL**: `https://xxxxx.supabase.co` ← Copy this
  - **Project API keys**: 
    - `anon` `public` key ← Copy this (click eye icon to reveal)

## Important Security Notes

✅ **DO**: Put Gemini API key in Supabase secrets (Edge Functions only)
✅ **DO**: Put Supabase URL and anon key in app.js (these are safe for frontend)

❌ **DON'T**: Put Gemini API key in app.js or any frontend code
❌ **DON'T**: Commit your Gemini API key to GitHub

## Quick Checklist

- [ ] Created Supabase project
- [ ] Copied Project URL from Settings > API
- [ ] Copied anon public key from Settings > API
- [ ] Updated app.js with Supabase credentials
- [ ] Set GEMINI_API_KEY as Supabase secret
- [ ] Deployed all three Edge Functions

