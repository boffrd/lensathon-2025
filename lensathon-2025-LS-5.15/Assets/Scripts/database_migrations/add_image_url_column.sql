-- Migration: Add image_url column to test_agent_info table
-- Purpose: Store filenames for historic monument images in Supabase Storage
-- Date: 2025

-- Add image_url column (nullable, will be populated gradually)
ALTER TABLE test_agent_info 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN test_agent_info.image_url IS 'Filename of the monument image in Supabase Storage (e.g., eiffel-tower-historic.jpg)';

-- Example: Update existing monuments with image filenames
-- Uncomment and modify these after uploading images to the storage bucket

-- UPDATE test_agent_info SET image_url = 'eiffel-tower-historic.jpg' WHERE name = 'Eiffel Tower';
-- UPDATE test_agent_info SET image_url = 'statue-of-liberty-historic.jpg' WHERE name = 'Statue of Liberty';
-- UPDATE test_agent_info SET image_url = 'big-ben-historic.jpg' WHERE name = 'Big Ben';
