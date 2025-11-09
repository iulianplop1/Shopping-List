# Deployment Guide - GitHub Pages

This guide will help you deploy your Shopping List app to GitHub Pages so you can access it from any device (phone, tablet, PC) and keep your data synced.

## Step 1: Enable Email Authentication in Supabase

**IMPORTANT:** To sync your data across devices, you need to use email/password authentication instead of anonymous.

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **Authentication** → **Providers**
4. Make sure **Email** provider is enabled (it should be by default)
5. Keep **Anonymous** enabled as well (for fallback)

## Step 2: Create a GitHub Account (if you don't have one)

1. Go to https://github.com
2. Sign up for a free account

## Step 3: Create a New Repository

1. Click the **+** icon in the top right → **New repository**
2. Name it something like `shopping-list` or `wishlist-planner`
3. Make it **Public** (required for free GitHub Pages)
4. **Don't** initialize with README, .gitignore, or license
5. Click **Create repository**

## Step 4: Upload Your Files to GitHub

### Option A: Using GitHub Web Interface

1. In your new repository, click **uploading an existing file**
2. Drag and drop all your files:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `database-schema.sql`
   - `migration.sql`
   - All other files
3. Scroll down and click **Commit changes**

### Option B: Using Git (Recommended)

1. Open terminal/command prompt in your project folder
2. Run these commands:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and repository name.

## Step 5: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Scroll down to **Pages** (left sidebar)
4. Under **Source**, select **Deploy from a branch**
5. Select **main** branch and **/ (root)** folder
6. Click **Save**
7. Wait 1-2 minutes, then your site will be live at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`

## Step 6: Access Your Data Across Devices

### To Keep Your Current Data:

1. **On your PC (where you have data):**
   - Open the app
   - Click **Login/Sign Up** button
   - Click **Sign Up**
   - Enter your email and password
   - Check your email and verify your account
   - Your data will now be linked to this email account

2. **On your phone:**
   - Go to your GitHub Pages URL
   - Click **Login/Sign Up**
   - Click **Login**
   - Enter the same email and password
   - You'll see all your data!

### Important Notes:

- **Anonymous sessions** create different users on each device
- **Email/password login** syncs data across all devices
- Once you sign up with email, all new data will be synced
- Your old anonymous data will stay on the device where it was created

## Step 7: Mobile Optimization

The app is already mobile-friendly! The viewport meta tag is set, and the CSS is responsive. Just make sure:

1. Your GitHub Pages site is accessible
2. You're logged in with the same email on all devices
3. Your Supabase project allows requests from your GitHub Pages domain

## Troubleshooting

**Can't see my data on phone:**
- Make sure you're logged in with the same email on both devices
- Check that you verified your email address
- Try logging out and back in

**GitHub Pages not loading:**
- Wait 2-3 minutes after enabling Pages
- Check that all files are in the repository
- Make sure you selected the correct branch (main)

**Authentication errors:**
- Verify Email provider is enabled in Supabase
- Check that your Supabase URL and keys are correct in `app.js`
- Make sure your Supabase project allows requests from your GitHub Pages domain

## Security Note

Your Supabase anon key is safe to use in frontend code - it's designed for public use. However, make sure:
- Your RLS (Row Level Security) policies are set up correctly
- Users can only access their own data
- The database schema was created successfully

## Need Help?

- Check Supabase logs: Dashboard → Logs
- Check browser console (F12) for errors
- Verify all files are uploaded to GitHub

