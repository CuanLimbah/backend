export type UserRole = 'admin' | 'user' | 'driver';

export type UserStatus = 'active' | 'inactive';

export type WasteType = 'food' | 'oil';

export type QualityGrade = 'A' | 'B' | 'C';

export type ContaminationLevel = 'none' | 'low' | 'medium' | 'high';

export type QualityGradeSource = 'ai' | 'admin';

export type QualityAssessmentSource = 'rag' | 'fallback_sop' | 'llm';

export type ImageQuality = 'clear' | 'blurry' | 'dark' | 'unclear' | 'invalid';

export type SedimentLevel = 'none' | 'low' | 'medium' | 'high' | 'unknown';

export type VisionAssessmentSource = 'vision_llm' | 'fallback';

export type ImageEmbeddingSource =
  | 'image_embedding_model'
  | 'visual_text_embedding'
  | 'fallback_visual_text';

export type ImageEmbeddingStatus = 'pending' | 'ready' | 'failed' | 'skipped';

export type MultimodalRagSource =
  | 'similar_quality_cases'
  | 'none'
  | 'embedding_unavailable';

export type QualityFeedbackTag =
  | 'photo_unclear'
  | 'visual_missed_sediment'
  | 'visual_missed_water'
  | 'visual_missed_food_residue'
  | 'visual_missed_non_organic_contamination'
  | 'wrong_waste_type_detected'
  | 'sop_mismatch'
  | 'rag_context_insufficient'
  | 'fallback_sop_used'
  | 'vision_fallback_used'
  | 'ai_too_optimistic'
  | 'ai_too_conservative'
  | 'admin_manual_inspection'
  | 'pricing_sensitive_case'
  | 'other';

export type QualityFeedbackSeverity = 'low' | 'medium' | 'high';

export interface QualityFeedback {
  tags: QualityFeedbackTag[];
  primaryReason?: QualityFeedbackTag;
  severity?: QualityFeedbackSeverity;
  note?: string;
  created_at: string;
  created_by?: string;
}

export type QualityAuditEventType =
  | 'ai_quality_checked'
  | 'admin_verified'
  | 'admin_overridden';

export interface AiVisualObservations {
  imageQuality: ImageQuality;
  isWasteVisible: boolean;
  detectedWasteType: WasteType | 'unknown';
  color?: string;
  clarity?: string;
  sedimentLevel?: SedimentLevel;
  waterVisible?: boolean;
  foodResidueVisible?: boolean;
  nonOrganicContaminationVisible?: boolean;
  containerCondition?: string;
  visualObservation: string;
  visionConfidence: number;
}

export type SubmissionStatus = 'pending' | 'verified' | 'completed' | 'rejected';

export type TransactionType = 'deposit' | 'withdrawal';

export type TransactionStatus = 'pending' | 'completed' | 'rejected';

export type WithdrawalMethod = 'gopay' | 'ovo' | 'dana' | 'bank';

export interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  business_name?: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  avatar_url?: string;
  phone_number?: string;
  vehicle_number?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string;
  business_name?: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  avatar_url?: string;
  phone_number?: string;
  vehicle_number?: string;
}

export interface WasteSubmission {
  id: string;
  user_id: string;
  waste_type: WasteType;
  estimated_weight: number;
  actual_weight?: number;
  image_url?: string;
  status: SubmissionStatus;
  created_at: string;
  verified_at?: string;
  completed_at?: string;
  notes?: string;
  earnings?: number;
  price_snapshot_per_kg?: number;
  quality_grade?: QualityGrade;
  final_price_per_kg?: number;
  pricing_model_version?: string;
  pricing_breakdown?: Record<string, unknown>;
  pricing_explanation?: string;
  ai_quality_grade?: QualityGrade;
  ai_quality_confidence?: number;
  ai_contamination_level?: ContaminationLevel;
  ai_quality_reason?: string;
  ai_quality_tips?: string;
  ai_quality_matched_criteria?: string[];
  ai_quality_checked_at?: string;
  ai_quality_model?: string;
  ai_quality_source?: QualityAssessmentSource;
  ai_quality_rag_source?: 'rag' | 'fallback_sop';
  ai_visual_observations?: AiVisualObservations;
  ai_visual_checked_at?: string;
  ai_visual_model?: string;
  ai_visual_source?: VisionAssessmentSource;
  ai_similar_case_ids?: string[];
  ai_similar_case_count?: number;
  ai_similar_case_top_score?: number;
  ai_multimodal_rag_used?: boolean;
  ai_multimodal_rag_source?: MultimodalRagSource;
  ai_multimodal_rag_model?: string;
  quality_grade_source?: QualityGradeSource;
  admin_quality_notes?: string;
  quality_feedback?: QualityFeedback;
  override_reason_tags?: QualityFeedbackTag[];
  override_primary_reason?: QualityFeedbackTag;
  override_feedback_severity?: QualityFeedbackSeverity;
}

export interface QualityAuditLog {
  id: string;
  submission_id: string;
  user_id: string;
  waste_type: WasteType;
  event_type: QualityAuditEventType;
  ai_quality_grade?: QualityGrade;
  ai_quality_confidence?: number;
  ai_contamination_level?: ContaminationLevel;
  ai_quality_reason?: string;
  ai_quality_rag_source?: 'rag' | 'fallback_sop';
  ai_quality_model?: string;
  ai_quality_source?: QualityAssessmentSource;
  ai_visual_source?: VisionAssessmentSource;
  ai_visual_model?: string;
  ai_visual_observations?: AiVisualObservations;
  ai_multimodal_rag_used?: boolean;
  ai_multimodal_rag_source?: string;
  ai_similar_case_ids?: string[];
  ai_similar_case_count?: number;
  ai_similar_case_top_score?: number;
  final_quality_grade?: QualityGrade;
  quality_grade_source?: QualityGradeSource;
  admin_quality_notes?: string;
  admin_id?: string;
  quality_feedback?: QualityFeedback;
  override_reason_tags?: QualityFeedbackTag[];
  override_primary_reason?: QualityFeedbackTag;
  override_feedback_severity?: QualityFeedbackSeverity;
  ai_error_pattern?: string;
  rag_improvement_suggestion?: string;
  vision_improvement_suggestion?: string;
  is_overridden: boolean;
  override_from?: QualityGrade;
  override_to?: QualityGrade;
  actual_weight?: number;
  price_snapshot_per_kg?: number;
  final_price_per_kg?: number;
  earnings?: number;
  created_at: string;
}

export interface QualityAiAnalytics {
  totalQualityChecks: number;
  totalAdminDecisions: number;
  aiAcceptedCount: number;
  adminOverrideCount: number;
  overrideRate: number;
  agreementRate: number;
  averageConfidence: number | null;
  lowConfidenceReviewCount: number;
  ragUsage: Record<string, number>;
  visionUsage: Record<string, number>;
  gradeDistribution: {
    ai: Record<QualityGrade, number>;
    admin: Record<QualityGrade, number>;
  };
  overrideMatrix: Record<string, number>;
  feedbackTagCounts: Record<string, number>;
  primaryOverrideReasons: Record<string, number>;
  aiErrorPatterns: Record<string, number>;
  multimodalRag: {
    totalAiQualityChecks: number;
    usedCount: number;
    notUsedCount: number;
    usageRate: number;
    embeddingUnavailableCount: number;
    noSimilarCaseCount: number;
    similarCaseContextUsedCount: number;
    averageSimilarCaseCount: number | null;
    averageTopSimilarityScore: number | null;
    averageConfidenceWhenUsed: number | null;
    averageConfidenceWhenNotUsed: number | null;
    overrideRateWhenUsed: number;
    overrideRateWhenNotUsed: number;
    agreementRateWhenUsed: number;
    agreementRateWhenNotUsed: number;
    adminDecisionCountWhenUsed: number;
    adminDecisionCountWhenNotUsed: number;
    overrideCountWhenUsed: number;
    overrideCountWhenNotUsed: number;
    sourceUsage: {
      similar_quality_cases: number;
      none: number;
      embedding_unavailable: number;
      unknown: number;
    };
    byWasteType: Record<
      WasteType,
      {
        totalAiQualityChecks: number;
        usedCount: number;
        usageRate: number;
        averageTopSimilarityScore: number | null;
        overrideRateWhenUsed: number;
        overrideRateWhenNotUsed: number;
      }
    >;
  };
  byWasteType: Record<
    WasteType,
    {
      totalQualityChecks: number;
      adminOverrideCount: number;
      averageConfidence: number | null;
    }
  >;
  recentOverrides: Array<{
    submission_id: string;
    waste_type: WasteType;
    ai_quality_grade?: QualityGrade;
    final_quality_grade?: QualityGrade;
    ai_quality_confidence?: number;
    admin_quality_notes?: string;
    created_at: string;
  }>;
}

export type QualityCaseEligibilityStatus =
  | 'eligible'
  | 'missing_image'
  | 'missing_final_grade'
  | 'missing_visual_observation'
  | 'missing_admin_validation'
  | 'excluded';

export interface QualityCaseDatasetRecord {
  id: string;
  submission_id: string;
  user_id: string;
  waste_type: WasteType;
  image_url?: string;
  ai_quality_grade?: QualityGrade;
  ai_quality_confidence?: number;
  ai_contamination_level?: ContaminationLevel;
  ai_quality_reason?: string;
  ai_quality_rag_source?: 'rag' | 'fallback_sop';
  ai_visual_source?: VisionAssessmentSource;
  ai_visual_model?: string;
  ai_visual_observations?: AiVisualObservations;
  final_quality_grade?: QualityGrade;
  quality_grade_source?: QualityGradeSource;
  admin_quality_notes?: string;
  quality_feedback?: QualityFeedback;
  override_reason_tags?: QualityFeedbackTag[];
  override_primary_reason?: QualityFeedbackTag;
  override_feedback_severity?: QualityFeedbackSeverity;
  ai_error_pattern?: string;
  is_overridden: boolean;
  image_embedding?: number[];
  image_embedding_model?: string;
  image_embedding_source?: ImageEmbeddingSource;
  image_embedding_generated_at?: string;
  image_embedding_status?: ImageEmbeddingStatus;
  image_embedding_error?: string;
  similarity_search_ready?: boolean;
  ai_similar_case_ids?: string[];
  ai_similar_case_count?: number;
  ai_similar_case_top_score?: number;
  ai_multimodal_rag_used?: boolean;
  ai_multimodal_rag_source?: MultimodalRagSource;
  ai_multimodal_rag_model?: string;
  actual_weight?: number;
  price_snapshot_per_kg?: number;
  final_price_per_kg?: number;
  earnings?: number;
  eligibility_status: QualityCaseEligibilityStatus;
  eligibility_reasons: string[];
  created_at: string;
  updated_at: string;
}

export interface QualityDatasetReadinessAnalytics {
  totalCases: number;
  eligibleCases: number;
  ineligibleCases: number;
  eligibilityRate: number;
  missingImageCount: number;
  missingFinalGradeCount: number;
  missingVisualObservationCount: number;
  missingAdminValidationCount: number;
  byWasteType: Record<
    WasteType,
    {
      totalCases: number;
      eligibleCases: number;
      eligibilityRate: number;
    }
  >;
  byFinalGrade: Record<QualityGrade, number>;
  visionSourceUsage: Record<string, number>;
  ragSourceUsage: Record<string, number>;
  feedbackTagCounts: Record<string, number>;
  aiErrorPatterns: Record<string, number>;
  embeddingCoverage?: {
    totalEligibleCases: number;
    embeddedCases: number;
    missingEmbeddingCases: number;
    embeddingCoverageRate: number;
  };
  recentEligibleCases: Array<{
    submission_id: string;
    waste_type: WasteType;
    final_quality_grade?: QualityGrade;
    ai_quality_grade?: QualityGrade;
    ai_quality_confidence?: number;
    ai_visual_source?: VisionAssessmentSource;
    ai_quality_rag_source?: 'rag' | 'fallback_sop';
    created_at: string;
  }>;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  created_at: string;
  completed_at?: string;
  submission_id?: string;
  withdrawal_method?: WithdrawalMethod;
  withdrawal_account?: string;
  notes?: string;
}

export interface WastePrice {
  id: string;
  waste_type: WasteType;
  price_per_kg: number;
  updated_at: string;
  updated_by: string;
}

export interface DropPoint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  operating_hours: string;
  contact: string;
}

export interface SessionRecord {
  token: string;
  user_id: string;
  created_at: string;
}

export interface UserStats {
  total_submissions: number;
  total_weight: number;
  total_earnings: number;
  current_balance: number;
  pending_submissions: number;
}

export interface AdminStats {
  total_users: number;
  total_waste_collected: number;
  total_cuan_distributed: number;
  pending_verifications: number;
  pending_withdrawals: number;
  user_growth: Array<{ date: string; users: number }>;
  waste_by_type: Array<{ type: WasteType; weight: number }>;
}

export type PickupRouteStatus =
  | 'assigned'
  | 'on_the_way'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

export interface PickupRoute {
  id: string;
  submission_id: string;
  user_id: string;
  driver_id: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  scheduled_at: string;
  status: PickupRouteStatus;
  created_at: string;
  started_at?: string;
  picked_up_at?: string;
  completed_at?: string;
  notes?: string;
}

export type PaymentMethod = 'qris' | 'virtual_account' | 'ewallet';

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface PaymentRecord {
  id: string;
  user_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  purpose: string;
  checkout_url: string;
  external_reference?: string;
  created_at: string;
  paid_at?: string;
  expires_at?: string;
  notes?: string;
}
