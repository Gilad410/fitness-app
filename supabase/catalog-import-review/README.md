# Food catalog import review files

These SQL files are preserved in Git for audit and review. They are deliberately
kept outside `supabase/sql` so migration tooling cannot execute them by accident.

- `050`–`054` are obsolete draft batches and must never be applied.
- `055` is the consolidated 880-row import candidate. It remains review-only and
  must not be applied to production until its final data review is explicitly
  approved.
- `049_food_reference_catalog_multi_source_infrastructure.sql` remains in
  `supabase/sql` because it is the additive schema prerequisite and the catalog
  audit records it as already applied.
- `056_owner_coach_administration.sql` is already present in `supabase/sql` and
  is unrelated to the catalog import.

The complete audit trail and reproducible import tooling live in
`supabase/audits` and `scripts/food-catalog-import`.
