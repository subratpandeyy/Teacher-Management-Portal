-- Add edited_at column to chat_messages for edit tracking
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Update existing messages: edited_at = updated_at where updated_at > created_at
UPDATE public.chat_messages SET edited_at = updated_at WHERE updated_at IS NOT NULL AND updated_at > created_at;
