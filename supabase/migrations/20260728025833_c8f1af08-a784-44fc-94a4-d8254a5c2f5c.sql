CREATE TABLE public.inv_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','transfer','adjustment')),
  item_code text NOT NULL,
  item_name text,
  uom_code text,
  warehouse_code text,
  counterpart_warehouse_code text,
  qty numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  value numeric NOT NULL DEFAULT 0,
  ref_type text,
  ref_id uuid,
  ref_number text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inv_movements TO authenticated;
GRANT ALL ON public.inv_movements TO service_role;

ALTER TABLE public.inv_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view stock movements" ON public.inv_movements
FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Writers can insert stock movements" ON public.inv_movements
FOR INSERT TO authenticated WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "Writers can update stock movements" ON public.inv_movements
FOR UPDATE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()))
WITH CHECK (public.can_write_workspace(workspace_id, auth.uid()));

CREATE POLICY "Writers can delete stock movements" ON public.inv_movements
FOR DELETE TO authenticated USING (public.can_write_workspace(workspace_id, auth.uid()));

CREATE INDEX idx_inv_movements_ws_item ON public.inv_movements (workspace_id, item_code, movement_date);
CREATE INDEX idx_inv_movements_ws_date ON public.inv_movements (workspace_id, movement_date);

CREATE TRIGGER update_inv_movements_updated_at
BEFORE UPDATE ON public.inv_movements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();