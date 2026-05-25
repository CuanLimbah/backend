# Demo Script: AI Quality Check and Multimodal RAG

## Demo Steps

1. Login sebagai admin.
2. Buka submitted waste item di Verification Queue.
3. Klik AI Quality Check.
4. Tunjukkan hasil observasi visual AI.
5. Tunjukkan konteks SOP RAG yang dipakai AI.
6. Buka panel similar historical cases.
7. Tunjukkan similarity score dan final admin grade dari kasus historis.
8. Jelaskan rekomendasi AI dan confidence.
9. Admin memilih final grade secara manual.
10. Dynamic Pricing menghitung payout dari final admin grade.
11. Tunjukkan audit log atau analytics.
12. Buka AI Analytics dashboard.
13. Buka AI Report tab.
14. Jelaskan readiness status, risks, recommendations, dan demo checklist.

## Speaker Script Bahasa Indonesia

"Pada demo ini, AI membantu admin menilai kualitas limbah dari foto. Pertama, admin menjalankan AI Quality Check. Sistem membaca foto melalui vision model, lalu mengambil kriteria kualitas dari SOP RAG di Supabase."

"Setelah observasi visual tersedia, sistem membuat visual-text embedding dari hasil observasi tersebut. Embedding ini dipakai untuk mencari kasus historis yang mirip di Supabase pgvector. Jika Supabase tidak tersedia atau hasilnya kosong, sistem masih punya fallback application-level cosine similarity."

"Di panel admin, kita bisa melihat kasus historis mirip, similarity score, grade final admin pada kasus lama, grade AI sebelumnya, dan feedback admin. Ini membantu admin memahami konteks rekomendasi AI."

"Namun keputusan final tidak otomatis. Kasus historis hanya referensi tambahan. Admin tetap memilih final grade, dan Dynamic Pricing menghitung payout berdasarkan grade final admin tersebut."

"Setelah verifikasi, keputusan AI dan admin dicatat di Quality Audit Log. Dashboard analytics dan Final AI Evaluation Report kemudian memperlihatkan agreement rate, override rate, performa Multimodal RAG, kesiapan dataset, risiko, dan rekomendasi perbaikan."

## Safety Points to Mention

- AI tidak auto-approve submission.
- AI tidak auto-reject submission.
- AI tidak mengubah wallet.
- AI tidak membuat transaksi otomatis.
- Admin tetap validator akhir.
- Dynamic Pricing memakai final admin grade.

