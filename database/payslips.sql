-- Pay slips: one uploaded pay slip per sale (run once in the Supabase SQL editor).
-- The file itself goes to the existing "portal-uploads" storage bucket, in a "payslips" folder.
alter table buyers add column if not exists payslip_url text;
alter table buyers add column if not exists payslip_note text;
alter table buyers add column if not exists payslip_uploaded_at timestamptz;
