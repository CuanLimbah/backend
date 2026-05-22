import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type {
  AiVisualObservations,
  ContaminationLevel,
  QualityCaseDatasetRecord,
  QualityCaseEligibilityStatus,
  QualityFeedback,
  QualityFeedbackSeverity,
  QualityFeedbackTag,
  QualityGrade,
  QualityGradeSource,
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
