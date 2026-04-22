-- Migration script to add new fields to existing database
-- Run this in your Supabase SQL Editor if you already have the database set up

-- Add days_per_month to financial_profiles table
ALTER TABLE financial_profiles 
ADD COLUMN IF NOT EXISTS days_per_month INTEGER DEFAULT 20 CHECK (days_per_month >= 1 AND days_per_month <= 31);

-- Add list_name to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS list_name TEXT;

-- Add purchase_link to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS purchase_link TEXT;

-- Add price tracking fields to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS current_price DECIMAL(10, 2);

ALTER TABLE items 
ADD COLUMN IF NOT EXISTS last_price_check TIMESTAMP WITH TIME ZONE;

-- Create index for list_name
CREATE INDEX IF NOT EXISTS idx_items_list_name ON items(list_name);

-- Create Budgets Table
CREATE TABLE IF NOT EXISTS list_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    list_name TEXT NOT NULL,
    budget_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, list_name)
);

-- Create indexes for budgets
CREATE INDEX IF NOT EXISTS idx_list_budgets_user_id ON list_budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_list_budgets_list_name ON list_budgets(list_name);

-- Enable RLS for budgets
ALTER TABLE list_budgets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for list_budgets
-- Drop policies if they exist to avoid errors on re-run
DROP POLICY IF EXISTS "Users can view their own list budgets" ON list_budgets;
DROP POLICY IF EXISTS "Users can insert their own list budgets" ON list_budgets;
DROP POLICY IF EXISTS "Users can update their own list budgets" ON list_budgets;
DROP POLICY IF EXISTS "Users can delete their own list budgets" ON list_budgets;

CREATE POLICY "Users can view their own list budgets"
    ON list_budgets FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own list budgets"
    ON list_budgets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own list budgets"
    ON list_budgets FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own list budgets"
    ON list_budgets FOR DELETE
    USING (auth.uid() = user_id);

-- Trigger for budgets updated_at
DROP TRIGGER IF EXISTS update_list_budgets_updated_at ON list_budgets;
CREATE TRIGGER update_list_budgets_updated_at
    BEFORE UPDATE ON list_budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

