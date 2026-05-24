import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type {
  AiVisualObservations,
  ContaminationLevel,
  MultimodalRagSource,
  QualityAssessmentSource,
  QualityAuditEventType,
  QualityAuditLog,
  QualityFeedback,
  QualityFeedbackSeverity,
  QualityFeedbackTag,
  QualityGrade,
  QualityGradeSource,
  QualityVectorProvider,
  VisionAssessmentSource,
  WasteType,
} from '../../common/models';

@Schema({
  collection: 'quality_audit_logs',
  id: false,
  versionKey: false,
})
export class QualityAuditLogEntity implements QualityAuditLog {
  @Prop({ type: String, required: true, unique: true, index: true })
  id: string;

  @Prop({ type: String, required: true, index: true })
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

  @Prop({
    type: String,
    required: true,
    enum: [
      'ai_quality_checked',
      'admin_verified',
      'admin_overridden',
    ] satisfies QualityAuditEventType[],
    index: true,
  })
  event_type: QualityAuditEventType;

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

  @Prop({ type: String })
  ai_quality_model?: string;

  @Prop({
    type: String,
    enum: ['rag', 'fallback_sop', 'llm'] satisfies QualityAssessmentSource[],
  })
  ai_quality_source?: QualityAssessmentSource;

  @Prop({ type: String, enum: ['vision_llm', 'fallback'] satisfies VisionAssessmentSource[] })
  ai_visual_source?: VisionAssessmentSource;

  @Prop({ type: String })
  ai_visual_model?: string;

  @Prop({ type: Object })
  ai_visual_observations?: AiVisualObservations;

  @Prop({ type: Boolean })
  ai_multimodal_rag_used?: boolean;

  @Prop({ type: String })
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

  @Prop({ type: [String], default: undefined })
  ai_similar_case_ids?: string[];

  @Prop({ type: Number })
  ai_similar_case_count?: number;

  @Prop({ type: Number })
  ai_similar_case_top_score?: number;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  final_quality_grade?: QualityGrade;

  @Prop({ type: String, enum: ['ai', 'admin'] satisfies QualityGradeSource[] })
  quality_grade_source?: QualityGradeSource;

  @Prop({ type: String })
  admin_quality_notes?: string;

  @Prop({ type: String })
  admin_id?: string;

  @Prop({ type: Object })
  quality_feedback?: QualityFeedback;

  @Prop({ type: [String], default: undefined })
  override_reason_tags?: QualityFeedbackTag[];

  @Prop({ type: String, index: true })
  override_primary_reason?: QualityFeedbackTag;

  @Prop({ type: String, enum: ['low', 'medium', 'high'] satisfies QualityFeedbackSeverity[], index: true })
  override_feedback_severity?: QualityFeedbackSeverity;

  @Prop({ type: String })
  ai_error_pattern?: string;

  @Prop({ type: String })
  rag_improvement_suggestion?: string;

  @Prop({ type: String })
  vision_improvement_suggestion?: string;

  @Prop({ type: Boolean, required: true, index: true })
  is_overridden: boolean;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  override_from?: QualityGrade;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  override_to?: QualityGrade;

  @Prop({ type: Number })
  actual_weight?: number;

  @Prop({ type: Number })
  price_snapshot_per_kg?: number;

  @Prop({ type: Number })
  final_price_per_kg?: number;

  @Prop({ type: Number })
  earnings?: number;

  @Prop({ type: String, required: true, index: true })
  created_at: string;
}

export const QualityAuditLogSchema =
  SchemaFactory.createForClass(QualityAuditLogEntity);

QualityAuditLogSchema.index({ submission_id: 1, created_at: -1 });
QualityAuditLogSchema.index({ event_type: 1, created_at: -1 });
QualityAuditLogSchema.index({ waste_type: 1, created_at: -1 });
QualityAuditLogSchema.index({ is_overridden: 1, created_at: -1 });
