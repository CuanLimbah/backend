import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type {
  ContaminationLevel,
  AiVisualObservations,
  QualityAssessmentSource,
  QualityGrade,
  QualityGradeSource,
  VisionAssessmentSource,
  WasteSubmission,
} from '../../common/models';

type StorageProvider = 'inline' | 'cloudinary';
type StorageStatus = 'pending' | 'ready' | 'failed';

@Schema({
  collection: 'submissions',
  id: false,
  versionKey: false,
})
export class WasteSubmissionEntity implements WasteSubmission {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({ required: true, enum: ['food', 'oil'], index: true })
  waste_type: 'food' | 'oil';

  @Prop({ required: true })
  estimated_weight: number;

  @Prop()
  actual_weight?: number;

  @Prop()
  image_url?: string;

  @Prop({
    required: true,
    enum: ['pending', 'verified', 'completed', 'rejected'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'verified' | 'completed' | 'rejected';

  @Prop({ required: true, index: true })
  created_at: string;

  @Prop()
  verified_at?: string;

  @Prop()
  completed_at?: string;

  @Prop()
  notes?: string;

  @Prop()
  earnings?: number;

  @Prop()
  price_snapshot_per_kg?: number;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  quality_grade?: QualityGrade;

  @Prop()
  final_price_per_kg?: number;

  @Prop()
  pricing_model_version?: string;

  @Prop({ type: Object })
  pricing_breakdown?: Record<string, unknown>;

  @Prop()
  pricing_explanation?: string;

  @Prop({ type: String, enum: ['A', 'B', 'C'] satisfies QualityGrade[] })
  ai_quality_grade?: QualityGrade;

  @Prop()
  ai_quality_confidence?: number;

  @Prop({
    type: String,
    enum: ['none', 'low', 'medium', 'high'] satisfies ContaminationLevel[],
  })
  ai_contamination_level?: ContaminationLevel;

  @Prop()
  ai_quality_reason?: string;

  @Prop()
  ai_quality_tips?: string;

  @Prop({ type: [String], default: undefined })
  ai_quality_matched_criteria?: string[];

  @Prop()
  ai_quality_checked_at?: string;

  @Prop()
  ai_quality_model?: string;

  @Prop({
    type: String,
    enum: ['rag', 'fallback_sop', 'llm'] satisfies QualityAssessmentSource[],
  })
  ai_quality_source?: QualityAssessmentSource;

  @Prop({ type: String, enum: ['rag', 'fallback_sop'] })
  ai_quality_rag_source?: 'rag' | 'fallback_sop';

  @Prop({ type: Object })
  ai_visual_observations?: AiVisualObservations;

  @Prop()
  ai_visual_checked_at?: string;

  @Prop()
  ai_visual_model?: string;

  @Prop({
    type: String,
    enum: ['vision_llm', 'fallback'] satisfies VisionAssessmentSource[],
  })
  ai_visual_source?: VisionAssessmentSource;

  @Prop({ type: String, enum: ['ai', 'admin'] satisfies QualityGradeSource[] })
  quality_grade_source?: QualityGradeSource;

  @Prop()
  admin_quality_notes?: string;

  @Prop({ enum: ['inline', 'cloudinary'] satisfies StorageProvider[], default: 'inline' })
  storage_provider?: StorageProvider;

  @Prop({ enum: ['pending', 'ready', 'failed'] satisfies StorageStatus[], default: 'ready' })
  storage_status?: StorageStatus;

  @Prop()
  cloudinary_public_id?: string;
}

export const WasteSubmissionSchema =
  SchemaFactory.createForClass(WasteSubmissionEntity);
