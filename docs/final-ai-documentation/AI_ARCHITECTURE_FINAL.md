# CuanLimbah Final AI Architecture

Dokumen ini menjelaskan arsitektur AI final yang sudah diimplementasikan untuk AI Quality Check, Multimodal RAG, audit, analytics, dan evaluasi akhir.

## Ringkasan

CuanLimbah memakai AI sebagai sistem rekomendasi kualitas limbah, bukan sebagai pengambil keputusan final. AI membantu admin membaca foto, membandingkan SOP, mengambil referensi kasus historis, dan memberi rekomendasi grade A/B/C beserta confidence. Grade final tetap ditentukan admin.

## Lapisan Data

### MongoDB / Mongoose

MongoDB adalah operational database untuk data aplikasi utama:

- waste submissions
- user/admin/driver data
- transaksi dan wallet
- quality audit log
- quality case dataset
- metadata AI recommendation
- metadata Multimodal RAG
- status sync Supabase vector

### Supabase

Supabase digunakan sebagai AI retrieval layer:

- SOP RAG untuk konteks kriteria kualitas
- pgvector table `quality_case_embeddings` untuk historical quality case retrieval
- RPC `match_quality_cases` untuk similarity search

MongoDB tetap menjadi sumber operasional utama. Supabase tidak mengubah payout, wallet, transaksi, atau status final submission.

## AI Quality Check Flow

1. User membuat waste submission dan mengunggah foto limbah.
2. Admin membuka submission dan menjalankan AI Quality Check.
3. Vision model membuat observasi visual dari foto.
4. Backend mengambil konteks SOP dari Supabase RAG.
5. Backend membuat visual-text embedding dari observasi visual.
6. Backend mencari kasus historis mirip di Supabase pgvector.
7. Jika Supabase tidak tersedia atau tidak menemukan hasil, backend memakai application-level cosine fallback.
8. LLM menerima observasi visual, SOP RAG, dan similar historical cases sebagai konteks.
9. LLM merekomendasikan grade kualitas A/B/C dan confidence.
10. Admin meninjau rekomendasi AI dan menentukan final grade.
11. Dynamic Pricing menghitung payout memakai final admin-approved quality grade.
12. Quality Audit Log menyimpan keputusan AI dan admin.
13. Analytics, Retrieval Quality Tuning, dan Final AI Evaluation Report memantau performa.

## Multimodal RAG MVP

Multimodal RAG pada sistem ini memakai visual-text embedding dari observasi visual, bukan raw image embedding production. Query embedding dibuat dari informasi seperti jenis limbah, warna, kejernihan, endapan, air, sisa makanan, kontaminasi non-organik, kondisi wadah, dan catatan visual.

Historical retrieval hanya mengambil kasus yang tervalidasi admin dan eligible di dataset. Kasus historis adalah konteks tambahan, bukan keputusan otomatis.

## Human-in-the-loop Safety

Prinsip keselamatan utama:

- AI hanya memberi rekomendasi kualitas.
- Admin tetap validator akhir.
- AI tidak melakukan auto-approve atau auto-reject.
- AI tidak mengubah wallet.
- AI tidak membuat atau mengubah transaksi.
- Dynamic Pricing memakai final grade admin, bukan AI grade.
- Similar cases dan SOP RAG hanya supporting context.
- Audit log menjaga traceability.
- Override feedback loop membantu evaluasi pola kesalahan AI.

## Monitoring

Sistem memantau:

- agreement rate AI/admin
- override rate
- RAG usage
- vision usage
- Multimodal RAG usage
- provider usage Supabase pgvector vs application cosine
- embedding unavailable
- no similar cases found
- retrieval quality buckets
- dataset readiness
- embedding coverage
- Supabase vector sync coverage
- AI error patterns
- final demo readiness

