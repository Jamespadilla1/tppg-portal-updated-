-- Paycheck photo per commission release — run ONCE in Supabase: SQL Editor → New query → Run.
-- The image itself goes to the existing "portal-uploads" storage bucket, in a "release-proofs" folder.
alter table commission_receivables add column if not exists proof_url text;
alter table commission_receivables add column if not exists proof_uploaded_at timestamptz;
