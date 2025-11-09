-- Migration script to add new fields to existing database
-- Run this in your Supabase SQL Editor if you already have the database set up

-- Add days_per_month to financial_profiles table
ALTER TABLE financial_profiles 
ADD COLUMN IF NOT EXISTS days_per_month INTEGER DEFAULT 20 CHECK (days_per_month >= 1 AND days_per_month <= 31);

-- Add list_name to items table
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS list_name TEXT;

-- Create index for list_name
CREATE INDEX IF NOT EXISTS idx_items_list_name ON items(list_name);

