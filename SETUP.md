# Quick Setup Guide

Follow these steps to get your Smart Wishlist Planner up and running:

## Step 1: Supabase Setup (5 minutes)

1. **Create Supabase Account & Project**
   - Go to https://supabase.com
   - Sign up/login and create a new project
   - Wait for the project to finish initializing

2. **Get Your Credentials**
   - Go to Settings > API
   - Copy your "Project URL" and "anon public" key
   - You'll need these for Step 4

3. **Set Up Database**
   - Go to SQL Editor in Supabase dashboard
   - Open `database-schema.sql` from this project
   - Copy and paste the entire contents
   - Click "Run" to execute
   - You should see "Success. No rows returned"

4. **Enable Anonymous Auth**
   - Go to Authentication > Providers
   - Scroll down to "Anonymous" sign-ins
   - Toggle it ON
   - Save

## Step 2: Gemini API Key (2 minutes)

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key (you'll need it for Step 3)

## Step 3: Deploy Edge Functions (10 minutes)

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```
   (This will open a browser for authentication)

3. **Link Your Project**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   - Find your project ref in Supabase dashboard URL: `https://app.supabase.com/project/YOUR_PROJECT_REF`
   - Or go to Settings > General > Reference ID

4. **Set Gemini API Key Secret**
   ```bash
   supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Deploy Functions**
   ```bash
   supabase functions deploy scrape-product
   supabase functions deploy generate-spec-summary
   supabase functions deploy find-alternatives
   ```

   You should see "Deployed Function [function-name]" for each one.

## Step 4: Configure Frontend (2 minutes)

1. Open `app.js` in a text editor
2. Find these lines at the top:
   ```javascript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```
3. Replace with your actual values from Step 1.2:
   ```javascript
   const SUPABASE_URL = 'https://xxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
   ```

## Step 5: Test Locally (Optional)

1. Open `index.html` in your browser
2. You should see the app interface
3. Try setting up your financial profile
4. Try adding a manual item

## Step 6: Deploy to GitHub Pages (5 minutes)

1. **Create GitHub Repository**
   - Go to github.com and create a new repository
   - Name it something like "smart-wishlist-planner"

2. **Push Your Code**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/your-repo-name.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**
   - Go to your repository on GitHub
   - Click Settings > Pages
   - Under "Source", select "Deploy from a branch"
   - Select "main" branch and "/ (root)" folder
   - Click Save
   - Your site will be live at: `https://yourusername.github.io/your-repo-name`

## Troubleshooting

### Edge Functions Return Errors
- Check function logs: Supabase Dashboard > Edge Functions > Logs
- Verify `GEMINI_API_KEY` is set: `supabase secrets list`
- Make sure you deployed all three functions

### Database Errors
- Verify you ran the SQL schema script completely
- Check that RLS is enabled: Go to Authentication > Policies
- Ensure anonymous auth is enabled

### CORS Issues
- Supabase handles CORS automatically
- If issues persist, check your Supabase project URL is correct

### Items Not Saving
- Check browser console for errors (F12)
- Verify Supabase credentials in `app.js` are correct
- Check that RLS policies are set up correctly

## Next Steps

Once everything is set up:
1. Set up your financial profile
2. Create your first goal
3. Try adding an item by URL (AI scraping)
4. Explore the financial planning features!

Enjoy your Smart Wishlist Planner! 🎉

