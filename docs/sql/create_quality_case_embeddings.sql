-- Supabase pgvector setup for CuanLimbah quality case retrieval.
-- Apply this file in the Supabase SQL Editor.
--
-- Vector dimension is 1024 because the backend default EMBEDDING_PROVIDER is
-- mistral and ImageEmbeddingService uses mistral-embed for visual-text
-- embeddings. If you switch embedding providers, update both this SQL vector
-- dimension and QUALITY_CASE_VECTOR_DIMENSIONS consistently.

create extension if not exists vector with schema extensions;

create table if not exists public.quality_case_embeddings (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null unique,
  user_id text,
  waste_type text not null,
  image_url text,

  visual_observation_text text not null,
  embedding extensions.vector(1024) not null,
  embedding_model text not null,
  embedding_source text not null default 'visual_text_embedding',

  final_quality_grade text,
  ai_quality_grade text,
  ai_quality_confidence double precision,
  ai_visual_source text,
  ai_quality_rag_source text,

  override_primary_reason text,
  ai_error_pattern text,
  admin_quality_notes text,

  quality_feedback jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,

  source_created_at timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint quality_case_embeddings_waste_type_check
    check (waste_type in ('food', 'oil')),
  constraint quality_case_embeddings_final_grade_check
    check (final_quality_grade is null or final_quality_grade in ('A', 'B', 'C')),
  constraint quality_case_embeddings_ai_grade_check
    check (ai_quality_grade is null or ai_quality_grade in ('A', 'B', 'C')),
  constraint quality_case_embeddings_embedding_source_check
    check (embedding_source in ('visual_text_embedding', 'fallback_visual_text', 'image_embedding_model'))
);

create index if not exists idx_quality_case_embeddings_waste_type
on public.quality_case_embeddings (waste_type);

create index if not exists idx_quality_case_embeddings_final_grade
on public.quality_case_embeddings (final_quality_grade);

create index if not exists idx_quality_case_embeddings_synced_at
on public.quality_case_embeddings (synced_at desc);

-- For small/empty tables Supabase may recommend creating this after data exists.
create index if not exists idx_quality_case_embeddings_embedding_ivfflat
on public.quality_case_embeddings
using ivfflat (embedding extensions.vector_cosine_ops)
with (lists = 100);

create or replace function public.set_quality_case_embeddings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quality_case_embeddings_updated_at
on public.quality_case_embeddings;

create trigger trg_quality_case_embeddings_updated_at
before update on public.quality_case_embeddings
for each row execute function public.set_quality_case_embeddings_updated_at();

create or replace function public.match_quality_cases(
  query_embedding extensions.vector(1024),
  filter_waste_type text,
  match_threshold double precision default 0.72,
  match_count integer default 5,
  exclude_submission_id text default null
)
returns table (
  submission_id text,
  waste_type text,
  image_url text,
  final_quality_grade text,
  ai_quality_grade text,
  ai_quality_confidence double precision,
  visual_observation_text text,
  ai_visual_source text,
  ai_quality_rag_source text,
  override_primary_reason text,
  ai_error_pattern text,
  admin_quality_notes text,
  quality_feedback jsonb,
  metadata jsonb,
  similarity double precision,
  created_at timestamptz,
  synced_at timestamptz
)
language sql
stable
as $$
  select
    q.submission_id,
    q.waste_type,
    q.image_url,
    q.final_quality_grade,
    q.ai_quality_grade,
    q.ai_quality_confidence,
    q.visual_observation_text,
    q.ai_visual_source,
    q.ai_quality_rag_source,
    q.override_primary_reason,
    q.ai_error_pattern,
    q.admin_quality_notes,
    q.quality_feedback,
    q.metadata,
    1 - (q.embedding <=> query_embedding) as similarity,
    q.created_at,
    q.synced_at
  from public.quality_case_embeddings q
  where q.waste_type = filter_waste_type
    and (exclude_submission_id is null or q.submission_id <> exclude_submission_id)
    and 1 - (q.embedding <=> query_embedding) >= match_threshold
  order by q.embedding <=> query_embedding asc
  limit match_count;
$$;
