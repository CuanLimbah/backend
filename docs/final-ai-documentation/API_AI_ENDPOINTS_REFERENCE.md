# AI Endpoints Reference

All endpoints below require admin authentication unless stated otherwise. AI endpoints are recommendation and monitoring tools only; they do not auto-approve submissions or directly update wallet/transactions.

## `POST /admin/submissions/:id/quality-check`

Purpose: Run AI Quality Check for a pending submission.

Important params:

- path `id`: submission id

Expected output summary:

- AI quality grade recommendation
- confidence
- visual observation
- SOP RAG metadata
- Multimodal RAG metadata when available

Safety note: AI recommendation does not finalize grade or payout.

## `GET /admin/analytics/quality-ai`

Purpose: Return AI quality analytics.

Query params:

- `startDate`
- `endDate`
- `wasteType`

Expected output summary:

- total AI quality checks
- admin decisions
- agreement/override rates
- RAG and vision usage
- feedback/error patterns
- Multimodal RAG analytics

## `GET /admin/analytics/multimodal-rag/retrieval-quality`

Purpose: Return retrieval quality metrics for Multimodal RAG.

Query params:

- `startDate`
- `endDate`
- `wasteType`

Expected output summary:

- total retrievals
- provider usage
- similarity buckets
- low/high similarity rates
- recommendation

## `GET /admin/analytics/ai-final-report`

Purpose: Return consolidated Final AI Evaluation Report.

Query params:

- `startDate`
- `endDate`
- `wasteType`

Expected output summary:

- readiness status
- AI quality performance
- vision/SOP/Multimodal RAG metrics
- dataset readiness
- recommendations
- risks
- demo readiness checklist

## `GET /admin/quality-dataset/readiness`

Purpose: Show dataset readiness for future retrieval and monitoring.

Query params:

- `wasteType`
- `startDate`
- `endDate`

Expected output summary:

- eligible/ineligible cases
- missing fields
- embedding coverage
- Supabase vector sync coverage

## `GET /admin/quality-dataset/cases`

Purpose: List quality case dataset records for admin review.

Query params:

- `eligibilityStatus`
- `wasteType`
- `finalGrade`
- `limit`

Expected output summary:

- latest dataset cases and eligibility metadata

## `POST /admin/quality-dataset/backfill`

Purpose: Backfill completed/verified submissions into `quality_case_dataset`.

Expected output summary:

- scanned
- upserted
- failed

Safety note: Does not run AI or recalculate pricing.

## `POST /admin/quality-dataset/embeddings/backfill`

Purpose: Generate visual-text embeddings for eligible dataset cases.

Params:

- `limit`
- `force`

Expected output summary:

- scanned
- embedded
- skipped
- failed

## `POST /admin/quality-dataset/vector/backfill`

Purpose: Sync eligible embedded dataset cases to Supabase pgvector.

Params:

- `limit`
- `force`

Expected output summary:

- scanned
- synced
- skipped
- failed

## `GET /admin/quality-dataset/vector/status`

Purpose: Show Supabase vector sync coverage.

Expected output summary:

- provider enabled status
- total eligible cases
- synced/unsynced/failed cases
- sync coverage rate

## `GET /admin/quality-dataset/vector/tuning-config`

Purpose: Show read-only runtime retrieval config.

Expected output summary:

- provider
- topK
- minSimilarity
- backfill limit
- dimensions
- table
- RPC

## `GET /admin/quality-dataset/vector/similar-cases`

Purpose: Retrieve similar historical quality cases for a submission.

Query params:

- `submissionId` required
- `limit`
- `minSimilarity`
- `provider`: `auto`, `supabase_pgvector`, or `application_cosine`

Expected output summary:

- provider used
- whether fallback was used
- cases array
- similarity score
- final admin grade from historical cases
- visual observation text
- admin feedback/error pattern when available

Safety note: Similar cases are supporting context only. Admin still decides final grade and payout.

