-- 🛒 SHOPPING LIST DEMO ACCOUNT & DATA SCRIPT
-- Run this script in the Supabase SQL Editor.
-- It will automatically create a Demo User and fill it with sample data!

DO $$ 
DECLARE
    demo_user_id UUID;
    goal_tech UUID;
    goal_vacation UUID;
BEGIN
    -- 1. Check if demo user already exists, if not create them
    SELECT id INTO demo_user_id FROM auth.users WHERE email = 'demo@example.com' LIMIT 1;
    
    IF demo_user_id IS NULL THEN
        demo_user_id := uuid_generate_v4();
        
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            demo_user_id,
            'authenticated',
            'authenticated',
            'demo@example.com',
            crypt('demoPassword123', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now(),
            '', '', '', ''
        );
        
        -- Create identity for the user (required in newer Supabase versions)
        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            demo_user_id,
            'demo@example.com',
            format('{"sub":"%s","email":"demo@example.com"}', demo_user_id)::jsonb,
            'email',
            now(),
            now(),
            now()
        );
    END IF;

    -- 2. Create a Financial Profile
    INSERT INTO financial_profiles (user_id, income_type, income_amount, monthly_expenses, days_per_month)
    VALUES (demo_user_id, 'monthly', 4500.00, 2100.00, 30)
    ON CONFLICT (user_id) DO NOTHING;

    -- 3. Create some Goals
    INSERT INTO goals (id, user_id, name, description)
    VALUES (uuid_generate_v4(), demo_user_id, 'Tech Upgrades', 'Saving up for productivity tools')
    RETURNING id INTO goal_tech;
    
    INSERT INTO goals (id, user_id, name, description)
    VALUES (uuid_generate_v4(), demo_user_id, 'Summer Vacation', 'Trip to Japan')
    RETURNING id INTO goal_vacation;

    -- 4. Create List Budgets
    INSERT INTO list_budgets (user_id, list_name, budget_amount)
    VALUES 
        (demo_user_id, 'Electronics', 3000.00),
        (demo_user_id, 'Travel Gear', 500.00)
    ON CONFLICT (user_id, list_name) DO NOTHING;

    -- 5. Insert Demo Items
    INSERT INTO items (user_id, title, price, image_url, category, priority, goal_id, list_name)
    VALUES 
        (demo_user_id, 'MacBook Pro M3 Max', 3499.00, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8', 'Electronics', 'high', goal_tech, 'Electronics'),
        (demo_user_id, 'Sony WH-1000XM5 Headphones', 348.00, 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb', 'Electronics', 'medium', goal_tech, 'Electronics'),
        (demo_user_id, 'Osprey Travel Backpack', 180.00, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62', 'Travel', 'high', goal_vacation, 'Travel Gear'),
        (demo_user_id, 'Mirrorless Camera', 1200.00, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32', 'Electronics', 'low', goal_vacation, 'Travel Gear');

END $$;
