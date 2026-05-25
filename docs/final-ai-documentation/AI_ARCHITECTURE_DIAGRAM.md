# AI Architecture Diagram

```mermaid
flowchart TD
  User["User"] --> Frontend["Frontend"]
  Admin["Admin"] --> Frontend
  Driver["Driver"] --> Frontend

  Frontend --> Backend["Backend NestJS"]
  Backend --> Mongo["MongoDB Operational DB"]

  Backend --> Vision["Vision AI"]
  Backend --> SopRag["Supabase SOP RAG"]
  Backend --> VectorDb["Supabase pgvector quality_case_embeddings"]
  Backend --> Llm["LLM Quality Assessment"]

  Vision --> Backend
  SopRag --> Backend
  VectorDb --> Backend
  Backend --> Llm
  Llm --> Backend

  Backend --> Audit["Quality Audit Log"]
  Audit --> Analytics["AI Analytics"]
  Analytics --> Report["Final AI Report"]

  Admin --> Verify["Admin Final Validation"]
  Verify --> Backend
  Backend --> Pricing["Dynamic Pricing"]
  Pricing --> WalletTx["Wallet / Transactions"]

  Backend --> DriverOps["Driver Operations"]

  VectorDb -. "historical cases only" .-> Llm
  SopRag -. "SOP context" .-> Llm
  Vision -. "visual observations" .-> Llm
  Llm -. "recommendation only" .-> Admin
  Admin -. "final grade" .-> Pricing
  DriverOps -. "separate from AI quality decision" .-> Driver
```

## Diagram Notes

- User uploads waste submission through the frontend.
- Admin runs AI Quality Check from the verification flow.
- Backend calls Vision AI for visual observation.
- Backend retrieves SOP context from Supabase RAG.
- Backend retrieves similar historical quality cases from Supabase pgvector.
- LLM recommends grade and confidence.
- Admin finalizes grade manually.
- Dynamic Pricing calculates payout from final admin grade.
- Audit log feeds analytics and final AI report.
- Driver operations are separate from the AI quality decision.

