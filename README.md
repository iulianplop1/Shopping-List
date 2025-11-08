# Smart Wishlist Planner

An intelligent web app that helps you manage your purchase wishlists, leveraging AI to simplify adding and analyzing items, and a built-in financial planner to map out exactly how you'll afford them.

## Features

### 🎯 Core Features
- **AI-Powered Product Scraping**: Paste a product URL and let AI extract product details automatically
- **Manual Item Entry**: Add items manually with full control over details
- **Smart Item Display**: Beautiful card-based layout with hover details
- **Categories & Tags**: Organize items with categories and custom tags
- **Priority Levels**: Mark items as High, Medium, or Low priority
- **Sorting & Filtering**: Sort by price, name, priority, or date. Filter by category, goal, or priority

### 🤖 AI-Powered Features
- **Smart Spec Summaries**: AI-generated 3-5 bullet point summaries of key features
- **Find Alternatives**: Discover cheaper or similar alternative products using AI

### 💰 Financial Planning
- **Hours-to-Afford Calculator**: See how many hours of work each item costs
- **Financial Profile**: Set up your income and expenses
- **Goals/Collections**: Group items into goals (e.g., "New PC Build", "Apartment Furnishings")
- **Savings Planner**: Calculate how long it will take to afford your wishlist based on savings rate
- **What-If Scenarios**: Explore how changes to income or expenses affect your timeline

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Backend**: Supabase (PostgreSQL database)
- **AI**: Google Gemini 2.5 Flash API
- **Serverless**: Supabase Edge Functions
- **Hosting**: GitHub Pages (static site)

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings > API

### 2. Set Up the Database

1. In your Supabase dashboard, go to SQL Editor
2. Copy and paste the contents of `database-schema.sql`
3. Run the SQL script to create all tables, indexes, and RLS policies

### 3. Configure Supabase Edge Functions

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Set your Gemini API key as a secret:
   ```bash
   supabase secrets set GEMINI_API_KEY=your-gemini-api-key
   ```

   To get a Gemini API key:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy it and set it as the secret above

5. Deploy the Edge Functions:
   ```bash
   supabase functions deploy scrape-product
   supabase functions deploy generate-spec-summary
   supabase functions deploy find-alternatives
   ```

### 4. Configure the Frontend

1. Open `app.js` in the root directory
2. Replace the placeholder values at the top:
   ```javascript
   const SUPABASE_URL = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```
   - `YOUR_SUPABASE_URL`: Found in Supabase Settings > API > Project URL
   - `YOUR_SUPABASE_ANON_KEY`: Found in Supabase Settings > API > anon/public key

### 5. Enable Anonymous Authentication

1. In Supabase dashboard, go to Authentication > Providers
2. Enable "Anonymous" sign-ins (this allows users to use the app without creating an account)

### 6. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push all files to the repository
3. Go to Settings > Pages
4. Select your branch (usually `main` or `master`)
5. Select the root folder
6. Save - your site will be available at `https://yourusername.github.io/repository-name`

## Project Structure

```
.
├── index.html              # Main HTML file
├── styles.css              # All styling
├── app.js                  # Main application logic
├── database-schema.sql     # Database schema for Supabase
├── README.md              # This file
└── supabase/
    └── functions/
        ├── scrape-product/
        │   └── index.ts    # Edge function for AI product scraping
        ├── generate-spec-summary/
        │   └── index.ts    # Edge function for AI spec summaries
        └── find-alternatives/
            └── index.ts    # Edge function for finding alternatives
```

## Usage

### Adding Items

**By Link (AI Scraping):**
1. Click "Add by Link" tab
2. Paste a product URL from any retail site
3. Click "Scrape with AI"
4. Review and edit the extracted information
5. Add category, priority, tags, and assign to a goal
6. Click "Save Item"

**Manual Entry:**
1. Click "Manual Entry" tab
2. Fill in all the details
3. Click "Add Item"

### Managing Goals

1. Click "+ New Goal" to create a goal
2. Give it a name and optional description
3. When adding items, assign them to a goal
4. View goal statistics in the Goals section

### Financial Planning

1. Set up your Financial Profile with income type, amount, and monthly expenses
2. View "hours-to-afford" for each item
3. Use the Savings Planner to calculate timelines
4. Use What-If Scenarios to explore different financial situations

### AI Features

- **Spec Summaries**: Automatically generated when viewing item details (if not already generated)
- **Find Alternatives**: Click "Find Alternatives" on any item to see AI-suggested alternatives

## Troubleshooting

### Edge Functions Not Working

- Ensure you've deployed all three functions
- Check that `GEMINI_API_KEY` secret is set correctly
- Check function logs in Supabase dashboard: Edge Functions > Logs

### Database Errors

- Ensure you've run the `database-schema.sql` script
- Check that RLS policies are enabled
- Verify anonymous authentication is enabled

### CORS Issues

- Supabase handles CORS automatically for Edge Functions
- If issues persist, check your Supabase project settings

## License

This project is open source and available for personal use.

## Contributing

Feel free to fork this project and customize it for your needs!

