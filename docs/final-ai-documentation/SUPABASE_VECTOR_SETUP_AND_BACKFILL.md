# Supabase Vector Setup and Backfill

Dokumen ini menjelaskan setup Supabase pgvector untuk historical quality case retrieval dan urutan backfill yang aman.

## Required Environment Variables

Jangan menaruh nilai secret di dokumentasi. Pastikan variabel berikut tersedia di backend/server environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMBEDDING_PROVIDER`
- `MISTRAL_API_KEY` atau `OPENAI_API_KEY` atau `GEMINI_API_KEY`
- `QUALITY_CASE_VECTOR_PROVIDER`
- `QUALITY_CASE_VECTOR_TOP_K`
- `QUALITY_CASE_VECTOR_MATCH_THRESHOLD`
- `QUALITY_CASE_VECTOR_BACKFILL_LIMIT`
- `QUALITY_CASE_VECTOR_DIMENSIONS`
- `QUALITY_CASE_VECTOR_TABLE`
- `QUALITY_CASE_VECTOR_RPC`

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh dipakai di backend. Jangan expose ke frontend.

## SQL Setup

SQL setup berada di:

`docs/sql/create_quality_case_embeddings.sql`

SQL tersebut menyiapkan:

- pgvector extension
- table `quality_case_embeddings`
- vector column dengan dimensi runtime yang sama dengan embedding provider
- index metadata
- vector index untuk cosine similarity
- RPC `match_quality_cases`

SQL bersifat idempotent:

- extension memakai `create extension if not exists`
- table memakai `create table if not exists`
- index memakai `create index if not exists`
- function memakai `create or replace function`

## Operational Sequence

1. Apply Supabase SQL.
2. Jalankan dataset backfill agar completed/verified submissions masuk ke `quality_case_dataset`.
3. Jalankan embedding backfill untuk eligible quality cases.
4. Jalankan Supabase vector backfill agar embedding masuk ke `quality_case_embeddings`.
5. Cek vector status.
6. Cek retrieval quality analytics.

## Admin Endpoints

### `GET /admin/quality-dataset/vector/status`

Melihat coverage sync Supabase vector:

- total eligible cases
- synced cases
- unsynced cases
- failed sync cases
- sync coverage rate

### `GET /admin/quality-dataset/vector/tuning-config`

Melihat konfigurasi runtime:

- provider
- topK
- minSimilarity
- backfill limit
- vector dimensions
- table
- RPC

Konfigurasi bersifat read-only melalui endpoint ini. Untuk mengubah threshold/topK, ubah environment backend lalu restart.

### `POST /admin/quality-dataset/vector/backfill`

Melakukan sync eligible embedded cases dari MongoDB `quality_case_dataset` ke Supabase `quality_case_embeddings`.

Parameter:

- `limit`
- `force`

### `GET /admin/quality-dataset/vector/similar-cases`

Mencari historical quality cases yang mirip untuk submission tertentu.

Parameter:

- `submissionId`
- `limit`
- `minSimilarity`
- `provider`: `auto`, `supabase_pgvector`, atau `application_cosine`

## Troubleshooting

### `total_vectors` adalah 0

Kemungkinan penyebab:

- dataset backfill belum dijalankan
- belum ada completed/verified submission yang eligible
- embedding backfill belum dijalankan
- Supabase vector backfill belum dijalankan
- embedding provider key belum tersedia

### Embedding unavailable

Cek:

- `EMBEDDING_PROVIDER`
- provider API key
- visual observation tersedia
- vector dimension sesuai provider

### Supabase RPC not found

Cek:

- SQL migration sudah diterapkan
- function `match_quality_cases` ada di schema public
- env `QUALITY_CASE_VECTOR_RPC` cocok

### Vector dimension mismatch

Cek:

- dimensi embedding provider
- `QUALITY_CASE_VECTOR_DIMENSIONS`
- definisi vector column di SQL

Dimensi query embedding dan stored embedding harus sama.

### No similar cases found

Kemungkinan penyebab:

- dataset eligible masih sedikit
- embedding coverage rendah
- Supabase vector sync coverage rendah
- threshold terlalu tinggi
- visual observation text kurang informatif

