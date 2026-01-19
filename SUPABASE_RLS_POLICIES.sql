-- ========================================
-- Supabase RLS Policies for IP Law Office
-- ========================================
-- This file contains Row Level Security policies that need to be applied
-- to the Supabase database to fix "Permission denied" errors.
--
-- HOW TO APPLY:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to: SQL Editor
-- 3. Copy and paste this entire file
-- 4. Click "RUN" to execute
--
-- ========================================

-- ========================================
-- 1. CLIENT TABLE POLICIES
-- ========================================

-- Enable RLS on Client table
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all clients
CREATE POLICY "Allow authenticated users to read clients"
ON "Client"
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to create clients
CREATE POLICY "Allow authenticated users to create clients"
ON "Client"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update clients
CREATE POLICY "Allow authenticated users to update clients"
ON "Client"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow authenticated users to soft delete clients (update is_active)
-- Note: We're using soft delete, not hard delete
CREATE POLICY "Allow authenticated users to delete clients"
ON "Client"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 2. CASE TABLE POLICIES
-- ========================================

-- Enable RLS on Case table
ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all cases
CREATE POLICY "Allow authenticated users to read cases"
ON "Case"
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to create cases
CREATE POLICY "Allow authenticated users to create cases"
ON "Case"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update cases
CREATE POLICY "Allow authenticated users to update cases"
ON "Case"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow authenticated users to delete cases
CREATE POLICY "Allow authenticated users to delete cases"
ON "Case"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 3. TASK TABLE POLICIES
-- ========================================

-- Enable RLS on Task table
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read tasks
CREATE POLICY "Allow authenticated users to read tasks"
ON "Task"
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to create tasks
CREATE POLICY "Allow authenticated users to create tasks"
ON "Task"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to update tasks
CREATE POLICY "Allow authenticated users to update tasks"
ON "Task"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow authenticated users to delete tasks
CREATE POLICY "Allow authenticated users to delete tasks"
ON "Task"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 4. DEADLINE TABLE POLICIES
-- ========================================

-- Enable RLS on Deadline table
ALTER TABLE "Deadline" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage deadlines
CREATE POLICY "Allow authenticated users to read deadlines"
ON "Deadline"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to create deadlines"
ON "Deadline"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update deadlines"
ON "Deadline"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete deadlines"
ON "Deadline"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 5. TIME ENTRY TABLE POLICIES
-- ========================================

-- Enable RLS on TimeEntry table
ALTER TABLE "TimeEntry" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage time entries
CREATE POLICY "Allow authenticated users to read time entries"
ON "TimeEntry"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to create time entries"
ON "TimeEntry"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update time entries"
ON "TimeEntry"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete time entries"
ON "TimeEntry"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 6. INVOICE TABLE POLICIES
-- ========================================

-- Enable RLS on Invoice table
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage invoices
CREATE POLICY "Allow authenticated users to read invoices"
ON "Invoice"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to create invoices"
ON "Invoice"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update invoices"
ON "Invoice"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete invoices"
ON "Invoice"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 7. MAIL TABLE POLICIES
-- ========================================

-- Enable RLS on Mail table
ALTER TABLE "Mail" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage mail
CREATE POLICY "Allow authenticated users to read mail"
ON "Mail"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to create mail"
ON "Mail"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update mail"
ON "Mail"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete mail"
ON "Mail"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 8. ACTIVITY TABLE POLICIES
-- ========================================

-- Enable RLS on Activity table
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage activities
CREATE POLICY "Allow authenticated users to read activities"
ON "Activity"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to create activities"
ON "Activity"
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update activities"
ON "Activity"
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete activities"
ON "Activity"
FOR DELETE
TO authenticated
USING (true);

-- ========================================
-- 9. AUTOMATION RULE TABLE POLICIES
-- ========================================

-- Enable RLS on AutomationRule table
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read automation rules
CREATE POLICY "Allow authenticated users to read automation rules"
ON "AutomationRule"
FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can create/update/delete automation rules
CREATE POLICY "Allow admins to manage automation rules"
ON "AutomationRule"
FOR ALL
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
  OR
  auth.jwt() ->> 'user_metadata' ->> 'role' = 'admin'
);

-- ========================================
-- 10. USER TABLE POLICIES
-- ========================================

-- Enable RLS on User table
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read users
CREATE POLICY "Allow authenticated users to read users"
ON "User"
FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can create/update/delete users
CREATE POLICY "Allow admins to manage users"
ON "User"
FOR ALL
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
  OR
  auth.jwt() ->> 'user_metadata' ->> 'role' = 'admin'
);

-- ========================================
-- 11. INTEGRATION CONNECTION TABLE POLICIES
-- ========================================

-- Enable RLS on IntegrationConnection table
ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to manage integrations
CREATE POLICY "Allow authenticated users to read integrations"
ON "IntegrationConnection"
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to manage integrations"
ON "IntegrationConnection"
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- ========================================
-- VERIFICATION QUERIES
-- ========================================
-- Run these to verify the policies were created successfully:

-- Check Client policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'Client';

-- Check Case policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'Case';

-- ========================================
-- NOTES:
-- ========================================
-- 1. These policies grant full access to authenticated users
-- 2. For production, you may want to restrict based on:
--    - assigned_lawyer_id (only see cases assigned to you)
--    - Organization/firm membership
--    - Role-based restrictions
-- 3. The automation rules and user management are admin-only
-- 4. Soft delete is implemented (is_active = false) instead of hard delete
--
-- ========================================
