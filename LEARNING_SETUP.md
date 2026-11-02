# Learning update: focused studies and template reimport

For an existing learning installation, run the complete contents of `supabase/migrations/202611030001_learning_focus_and_template_trash.sql` in the Supabase SQL Editor, then refresh the app. Apply it after `202610240003_learning_inline.sql`.

This upgrade permits a new import when an earlier copy is in the trash. The deleted copy, its topics, private progress, and Undo version remain intact. Restoring it later creates an independent study if a newer template copy exists. Reimporting the active template remains idempotent.

The migration runs in a transaction and can be reapplied. It retains the existing collection access checks, import validation, and authenticated RPC permissions. No environment variables or new services are required.
