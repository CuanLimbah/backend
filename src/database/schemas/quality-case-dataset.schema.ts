import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type {
  AiVisualObservations,
  ContaminationLevel,
  ImageEmbeddingSource,
  ImageEmbeddingStatus,
  MultimodalRagSource,
  QualityCaseDatasetRecord,
  QualityCaseEligibilityStatus,
  QualityFeedback,
  QualityFeedbackSeverity,
  QualityFeedbackTag,
  QualityGrade,
  QualityGradeSource,
  QualityVectorProvider,
  QualityVectorSyncStatus,
  VisionAssessmentSource,
  WasteType,
} from '../../common/models';

@Schema({
  collection: 'quality_case_dataset',
  id: false,
  versionKey: false,
})
export class QualityCaseDatasetEntity implements QualityCaseDatasetRecord {
  @Prop({ type: String, required: true, unique: true, index: true })
  id: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  submission_id: string;

  @Prop({ type: String, required: true, index: true })
  user_id: string;

  @Prop({
    type: String,
    required: true,
    enum: ['food', 'oil'] satisfies WasteType[],
    index: true,
  })
  waste_type: WasteType;

  @Prop({ type: String })
  image_url?: string;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  ai_quality_grade?: QualityGrade;

  @Prop({ type: Number })
  ai_quality_confidence?: number;

  @Prop({
    type: String,
    enum: ['none', 'low', 'medium', 'high'] satisfies ContaminationLevel[],
  })
  ai_contamination_level?: ContaminationLevel;

  @Prop({ type: String })
  ai_quality_reason?: string;

  @Prop({ type: String, enum: ['rag', 'fallback_sop'] })
  ai_quality_rag_source?: 'rag' | 'fallback_sop';

  @Prop({
    type: String,
    enum: ['vision_llm', 'fallback'] satisfies VisionAssessmentSource[],
  })
  ai_visual_source?: VisionAssessmentSource;

  @Prop({ type: String })
  ai_visual_model?: string;

  @Prop({ type: Object })
  ai_visual_observations?: AiVisualObservations;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  final_quality_grade?: QualityGrade;

  @Prop({ type: String, enum: ['ai', 'admin'] satisfies QualityGradeSource[] })
  quality_grade_source?: QualityGradeSource;

  @Prop({ type: String })
  admin_quality_notes?: string;

  @Prop({ type: Object })
  quality_feedback?: QualityFeedback;

  @Prop({ type: [String], default: undefined })
  override_reason_tags?: QualityFeedbackTag[];

  @Prop({ type: String, index: true })
  override_primary_reason?: QualityFeedbackTag;

  @Prop({ type: String, enum: ['low', 'medium', 'high'] satisfies QualityFeedbackSeverity[] })
  override_feedback_severity?: QualityFeedbackSeverity;

  @Prop({ type: String })
  ai_error_pattern?: string;

  @Prop({ type: Boolean, required: true })
  is_overridden: boolean;

  @Prop({ type: [Number], default: undefined })
  image_embedding?: number[];

  @Prop({ type: String })
  image_embedding_model?: string;

  @Prop({
    type: String,
    enum: [
      'image_embedding_model',
      'visual_text_embedding',
      'fallback_visual_text',
    ] satisfies ImageEmbeddingSource[],
  })
  image_embedding_source?: ImageEmbeddingSource;

  @Prop({ type: String })
  image_embedding_generated_at?: string;

  @Prop({
    type: String,
    enum: ['pending', 'ready', 'failed', 'skipped'] satisfies ImageEmbeddingStatus[],
    index: true,
  })
  image_embedding_status?: ImageEmbeddingStatus;

  @Prop({ type: String })
  image_embedding_error?: string;

  @Prop({ type: Boolean, index: true })
  similarity_search_ready?: boolean;

  @Prop({ type: Boolean, index: true })
  supabase_vector_synced?: boolean;

  @Prop({ type: String, index: true })
  supabase_vector_synced_at?: string;

  @Prop({ type: String })
  supabase_vector_id?: string;

  @Prop({
    type: String,
    enum: ['pending', 'synced', 'failed', 'skipped'] satisfies QualityVectorSyncStatus[],
    index: true,
  })
  supabase_vector_sync_status?: QualityVectorSyncStatus;

  @Prop({ type: String })
  supabase_vector_sync_error?: string;

  @Prop({ type: String })
  supabase_vector_embedding_model?: string;

  @Prop({
    type: String,
    enum: [
      'image_embedding_model',
      'visual_text_embedding',
      'fallback_visual_text',
    ] satisfies ImageEmbeddingSource[],
  })
  supabase_vector_embedding_source?: ImageEmbeddingSource;

  @Prop({ type: [String], default: undefined })
  ai_similar_case_ids?: string[];

  @Prop({ type: Number })
  ai_similar_case_count?: number;

  @Prop({ type: Number })
  ai_similar_case_top_score?: number;

  @Prop({ type: Boolean })
  ai_multimodal_rag_used?: boolean;

  @Prop({
    type: String,
    enum: [
      'similar_quality_cases',
      'none',
      'embedding_unavailable',
    ] satisfies MultimodalRagSource[],
  })
  ai_multimodal_rag_source?: MultimodalRagSource;

  @Prop({
    type: String,
    enum: [
      'application_cosine',
      'supabase_pgvector',
      'fallback_none',
      'embedding_unavailable',
    ] satisfies QualityVectorProvider[],
  })
  ai_multimodal_rag_provider?: QualityVectorProvider;

  @Prop({ type: String })
  ai_multimodal_rag_model?: string;

  @Prop({ type: Number })
  actual_weight?: number;

  @Prop({ type: Number })
  price_snapshot_per_kg?: number;

  @Prop({ type: Number })
  final_price_per_kg?: number;

  @Prop({ type: Number })
  earnings?: number;

  @Prop({
    type: String,
    required: true,
    enum: [
      'eligible',
      'missing_image',
      'missing_final_grade',
      'missing_visual_observation',
      'missing_admin_validation',
      'excluded',
    ] satisfies QualityCaseEligibilityStatus[],
    index: true,
  })
  eligibility_status: QualityCaseEligibilityStatus;

  @Prop({ type: [String], required: true, default: [] })
  eligibility_reasons: string[];

  @Prop({ type: String, required: true, index: true })
  created_at: string;

  @Prop({ type: String, required: true })
  updated_at: string;
}

export const QualityCaseDatasetSchema = SchemaFactory.createForClass(
  QualityCaseDatasetEntity,
);

QualityCaseDatasetSchema.index({ submission_id: 1 });
QualityCaseDatasetSchema.index({ waste_type: 1, final_quality_grade: 1 });
QualityCaseDatasetSchema.index({ eligibility_status: 1, created_at: -1 });
QualityCaseDatasetSchema.index({ ai_visual_source: 1 });
QualityCaseDatasetSchema.index({ ai_quality_rag_source: 1 });
QualityCaseDatasetSchema.index({ override_primary_reason: 1 });
QualityCaseDatasetSchema.index({ image_embedding_status: 1 });
QualityCaseDatasetSchema.index({ supabase_vector_sync_status: 1 });
QualityCaseDatasetSchema.index({
  supabase_vector_synced: 1,
  eligibility_status: 1,
});
QualityCaseDatasetSchema.index({ supabase_vector_synced_at: -1 });
QualityCaseDatasetSchema.index({
  similarity_search_ready: 1,
  waste_type: 1,
  final_quality_grade: 1,
});
