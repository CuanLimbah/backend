import type {
  ContaminationLevel,
  QualityAssessmentSource,
  QualityGrade,
  WasteType,
} from '../common/models';

export interface QualityCriteriaInput {
  wasteType: WasteType;
  conditionDescription?: string;
}

export interface RetrievedQualityChunk {
  title?: string;
  content: string;
  score?: number;
}

export interface QualityCriteriaResult {
  criteriaText: string;
  criteria: string[];
  source: 'rag' | 'fallback_sop';
  retrievedChunks?: RetrievedQualityChunk[];
}

export interface QualityAssessmentInput {
  submissionId: string;
  requestedBy: string;
  conditionDescription?: string;
}

export interface QualityAssessmentResult {
  submissionId: string;
  wasteType: WasteType;
  recommendedGrade: QualityGrade;
  confidence: number;
  contaminationLevel: ContaminationLevel;
  reason: string;
  matchedCriteria: string[];
  tips: string;
  requiresAdminReview: true;
  modelProvider: string;
  modelVersion: string;
  ragSource: 'rag' | 'fallback_sop';
}

export interface InternalQualityAssessmentResult extends QualityAssessmentResult {
  qualitySource: QualityAssessmentSource;
}
