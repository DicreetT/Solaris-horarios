-- Canet and Huarte are independent inventories.
-- Transfers should be explicit paired movements, not a background mirror.

drop trigger if exists trg_sync_canet_movs_to_huarte_shared_state on public.shared_json_state;
drop function if exists public.sync_canet_movs_to_huarte_shared_state();
