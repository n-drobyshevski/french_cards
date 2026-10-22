-- The Claude connector manages the shared custom fields too (create_field, update_field,
-- delete_field, restore_field): insert and update on field_defs, never delete (deletes are soft).
grant insert, update on public.field_defs to service_role;
