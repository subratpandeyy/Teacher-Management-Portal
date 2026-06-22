-- Migration: Standardize admin_assign_document_to_target and fix parameter conflict
-- Root Cause: Multiple function overloads with p_target_type as TEXT vs document_target_type
-- Resolution: Add 'coordinator' and 'student' to public.document_target_type enum, drop text overload, standardize on a single function taking the enum type.

-- 1. Safely extend the document_target_type enum
ALTER TYPE public.document_target_type ADD VALUE IF NOT EXISTS 'coordinator';
ALTER TYPE public.document_target_type ADD VALUE IF NOT EXISTS 'student';

-- 2. Drop obsolete overloads of admin_assign_document_to_target to resolve ambiguity
DROP FUNCTION IF EXISTS public.admin_assign_document_to_target(UUID, TEXT, UUID, UUID[], UUID[]);
DROP FUNCTION IF EXISTS public.admin_assign_document_to_target(UUID, public.document_target_type, UUID, UUID[], UUID[]);

-- 3. Recreate the standardized function using public.document_target_type
CREATE OR REPLACE FUNCTION public.admin_assign_document_to_target(
  p_document_id UUID,
  p_target_type public.document_target_type,
  p_target_id UUID DEFAULT NULL,
  p_teacher_ids UUID[] DEFAULT NULL,
  p_group_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_ids UUID[];
  v_inserted INTEGER := 0;
  tid UUID;
  v_uploaded_by UUID;
  v_caller_role public.user_role;
BEGIN
  -- Get document uploader
  SELECT uploaded_by INTO v_uploaded_by FROM public.documents WHERE id = p_document_id;
  IF v_uploaded_by IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  -- Check if caller is admin OR the one who uploaded the document
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() <> v_uploaded_by AND v_caller_role <> 'admin'::public.user_role THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Resolve target IDs using public.resolve_teacher_ids (casting target_type to broadcast_target_type)
  v_ids := public.resolve_teacher_ids(
    p_target_type::TEXT::public.broadcast_target_type, 
    p_target_id, 
    p_teacher_ids, 
    p_group_ids
  );

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No recipients matched the selected target';
  END IF;

  -- Update target info in documents table
  UPDATE public.documents
  SET target_type = p_target_type,
      target_id = CASE WHEN p_target_type = 'group' THEN p_target_id ELSE NULL END
  WHERE id = p_document_id;

  -- Insert recipients into document_recipients
  FOREACH tid IN ARRAY v_ids LOOP
    INSERT INTO public.document_recipients (document_id, teacher_id)
    VALUES (p_document_id, tid)
    ON CONFLICT (document_id, teacher_id) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION public.admin_assign_document_to_target(UUID, public.document_target_type, UUID, UUID[], UUID[]) TO authenticated;
