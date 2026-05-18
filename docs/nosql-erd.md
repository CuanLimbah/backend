# CuanLimbah NoSQL ERD

Dokumen ini memakai ERD logical untuk MongoDB. Relasi tidak dienforce sebagai foreign key oleh database; relasi dijaga oleh aplikasi memakai field ID string seperti `user_id`, `driver_id`, dan `submission_id`.

## Diagram

```mermaid
erDiagram
  USERS ||--o{ SUBMISSIONS : submits
  USERS ||--o{ TRANSACTIONS : owns
  USERS ||--o{ PAYMENTS : creates
  USERS ||--o{ PICKUP_ROUTES : requester
  USERS ||--o{ PICKUP_ROUTES : driver
  SUBMISSIONS ||--o| PICKUP_ROUTES : scheduled_for
  SUBMISSIONS ||--o{ TRANSACTIONS : creates_deposit
  USERS ||--o{ PRICES : updates
  ACTIVITY_EVENTS }o--|| USERS : entity_id_when_entity_type_users
  ACTIVITY_EVENTS }o--|| SUBMISSIONS : entity_id_when_entity_type_submissions
  ACTIVITY_EVENTS }o--|| PAYMENTS : entity_id_when_entity_type_payments
  ACTIVITY_EVENTS }o--|| PICKUP_ROUTES : entity_id_when_entity_type_pickup_routes

  USERS {
    string id PK
    string email UK
    string full_name
    string business_name
    string password_hash
    enum role "admin|user|driver"
    enum status "active|inactive"
    string created_at
    string avatar_url
    string phone_number
    string vehicle_number
  }

  SUBMISSIONS {
    string id PK
    string user_id FK
    enum waste_type "food|oil"
    number estimated_weight
    number actual_weight
    string image_url
    enum status "pending|verified|completed|rejected"
    string created_at
    string verified_at
    string completed_at
    string notes
    number earnings
    enum storage_provider "inline|cloudinary"
    enum storage_status "pending|ready|failed"
    string cloudinary_public_id
  }

  PICKUP_ROUTES {
    string id PK
    string submission_id FK
    string user_id FK
    string driver_id FK
    string address
    number latitude
    number longitude
    string scheduled_at
    enum status "assigned|on_the_way|picked_up|completed|cancelled"
    string created_at
    string started_at
    string picked_up_at
    string completed_at
    string notes
  }

  TRANSACTIONS {
    string id PK
    string user_id FK
    enum type "deposit|withdrawal"
    number amount
    enum status "pending|completed|rejected"
    string created_at
    string completed_at
    string submission_id FK
    enum withdrawal_method "gopay|ovo|dana|bank"
    string withdrawal_account
    string notes
  }

  PAYMENTS {
    string id PK
    string user_id FK
    number amount
    enum method "qris|virtual_account|ewallet"
    enum status "pending|paid|expired|failed"
    string provider
    string purpose
    string checkout_url
    string external_reference
    string created_at
    string paid_at
    string expires_at
    string notes
  }

  PRICES {
    string id PK
    enum waste_type "food|oil"
    number price_per_kg
    string updated_at
    string updated_by FK
  }

  DROP_POINTS {
    string id PK
    string name
    string address
    number latitude
    number longitude
    string operating_hours
    string contact
    object location "GeoJSON Point"
  }

  ACTIVITY_EVENTS {
    string id PK
    string event
    string entity_type
    string entity_id
    object payload
    string created_at
  }
```

## Relasi Logical

| Dari koleksi | Field | Ke koleksi | Field target | Kardinalitas |
| --- | --- | --- | --- | --- |
| `submissions` | `user_id` | `users` | `id` | many-to-one |
| `transactions` | `user_id` | `users` | `id` | many-to-one |
| `transactions` | `submission_id` | `submissions` | `id` | many-to-one, optional |
| `payments` | `user_id` | `users` | `id` | many-to-one |
| `pickup_routes` | `submission_id` | `submissions` | `id` | one-to-one logical |
| `pickup_routes` | `user_id` | `users` | `id` | many-to-one requester |
| `pickup_routes` | `driver_id` | `users` | `id` | many-to-one driver, `users.role=driver` |
| `prices` | `updated_by` | `users` | `id` | many-to-one admin/user updater |
| `activity_events` | `entity_id` | polymorphic | `id` | depends on `entity_type` |

## Indexes Dari Schema

| Koleksi | Index / unique |
| --- | --- |
| `users` | `id` unique, `email` unique |
| `submissions` | `id` unique, `user_id`, `waste_type`, `status`, `created_at` |
| `pickup_routes` | `id` unique, `submission_id`, `user_id`, `driver_id`, `scheduled_at`, `status`, `created_at` |
| `transactions` | `id` unique, `user_id`, `type`, `status`, `created_at` |
| `payments` | `id` unique, `user_id`, `status`, `created_at` |
| `prices` | `id` unique, `waste_type` unique |
| `drop_points` | `id` unique, `name`, `location` 2dsphere |
| `activity_events` | `id` unique, `event`, `entity_type`, `entity_id`, `created_at` |

## Catatan NoSQL

- Primary key aplikasi memakai field `id`, bukan `_id` MongoDB.
- Field dengan suffix `_id` adalah reference logical antar collection.
- Data user biasa, admin, dan driver disimpan dalam collection yang sama: `users`, dibedakan oleh field `role`.
- `drop_points` saat ini berdiri sendiri dan dipakai untuk pencarian lokasi; belum ada reference langsung dari collection lain.
- `activity_events` adalah audit/event log polymorphic: `entity_type` menentukan collection target, `entity_id` menentukan dokumen target.
