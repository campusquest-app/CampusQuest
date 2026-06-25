-- Safe add parent_comment_id for nested Quad comment replies (idempotent).

ALTER TABLE public.quad_post_comments
ADD COLUMN IF NOT EXISTS parent_comment_id uuid NULL;

ALTER TABLE public.quad_post_comments
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quad_post_comments_parent_comment_id_fkey'
  ) THEN
    ALTER TABLE public.quad_post_comments
    ADD CONSTRAINT quad_post_comments_parent_comment_id_fkey
    FOREIGN KEY (parent_comment_id)
    REFERENCES public.quad_post_comments(id)
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quad_post_comments_parent_comment_id
ON public.quad_post_comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_quad_post_comments_post_parent_created
ON public.quad_post_comments(post_id, parent_comment_id, created_at);
