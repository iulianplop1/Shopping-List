# Data Migration Guide - Keep Your Current Data

## Important: How to Keep Your Data When Switching to Email Login

Right now, you're using **anonymous authentication**, which means:
- Each device/browser creates a different user
- Your data is stored separately on each device
- Data doesn't sync across devices

To sync your data across devices (PC, phone, tablet), you need to use **email/password authentication**.

## Step 1: Sign Up with Email (On Your PC Where You Have Data)

1. Open your app on your PC (where you have all your current data)
2. Click the **"Login/Sign Up"** button at the top
3. Click **"Sign Up"**
4. Enter your email and password (password must be at least 6 characters)
5. Click **"Sign Up"**
6. Check your email and click the verification link
7. **Important:** After signing up, your current data will be linked to this email account

## Step 2: Verify Your Email

1. Check your email inbox (and spam folder)
2. Look for an email from Supabase
3. Click the verification link
4. You'll be redirected back to your app

## Step 3: Access on Your Phone

1. Go to your GitHub Pages URL on your phone
2. Click **"Login/Sign Up"**
3. Click **"Login"**
4. Enter the same email and password you used on PC
5. You'll see all your data!

## What Happens to Your Data?

### When You Sign Up:
- Your current anonymous user data stays in the database
- A new email user is created
- **New data** you add will be linked to your email account

### To Migrate Your Existing Data:

Unfortunately, Supabase doesn't automatically transfer data between users. Here are your options:

#### Option 1: Start Fresh (Recommended if you don't have much data)
- Just sign up with email
- Start adding items with your email account
- All new data will sync across devices

#### Option 2: Manual Migration (If you have important data)
1. Export your data manually (copy items, goals, financial profile)
2. Sign up with email
3. Re-enter your data (it will now sync across devices)

#### Option 3: Database Migration (Advanced)
If you have access to your Supabase database, you can:
1. Find your anonymous user ID (check browser console or Supabase dashboard)
2. Find your new email user ID
3. Update all records to use the new user ID

**Note:** This requires SQL knowledge and database access.

## Troubleshooting

**I signed up but don't see my old data:**
- This is expected - anonymous data stays with the anonymous user
- New data you add will sync across devices
- You can manually re-enter important items

**I can't verify my email:**
- Check spam folder
- Make sure email provider is enabled in Supabase
- Try resending verification email

**I'm logged in but data doesn't sync:**
- Make sure you're using the same email on both devices
- Check that you verified your email
- Try logging out and back in

## Best Practice

For the best experience:
1. Sign up with email on your main device (PC)
2. Verify your email
3. Start using the app - all new data will sync
4. On your phone, just login with the same email
5. Everything will be in sync!

## Need Help?

- Check Supabase dashboard → Authentication → Users to see your accounts
- Check browser console (F12) for any errors
- Verify your Supabase project settings

