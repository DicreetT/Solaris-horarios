-- Add new columns for shopping item purchase details
ALTER TABLE shopping_items 
ADD COLUMN IF NOT EXISTS delivery_date text,
ADD COLUMN IF NOT EXISTS response_message text;
