-- Drop orphaned trigger and function that reference the removed assignment_audit_logs table
-- The table was intentionally dropped in 20260618000000_drop_bulk_reassign.sql
-- but the trigger and function were left behind, causing:
--   "relation 'public.assignment_audit_logs' does not exist"
-- on every INSERT to coordinator_assignments.

DROP TRIGGER IF EXISTS trigger_log_coordinator_assignment_change ON public.coordinator_assignments;

DROP FUNCTION IF EXISTS public.log_coordinator_assignment_change();
