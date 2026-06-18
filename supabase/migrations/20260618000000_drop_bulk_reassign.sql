-- Drop bulk_reassign_coordinator RPC and assignment_audit_logs table
-- Bulk reassignment removed from codebase (PGRST202 errors)

DROP FUNCTION IF EXISTS public.bulk_reassign_coordinator(UUID[], TEXT, UUID);

DROP TABLE IF EXISTS public.assignment_audit_logs;
