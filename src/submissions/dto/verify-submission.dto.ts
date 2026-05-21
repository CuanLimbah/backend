import {
  QualityFeedbackSeverity,
  QualityFeedbackTag,
  QualityGrade,
  QualityGradeSource,
} from '../../common/models';

export class VerifySubmissionDto {
  actualWeight!: number;
  qualityGrade?: QualityGrade;
  qualityGradeSource?: QualityGradeSource;
  adminQualityNotes?: string;
  overrideReasonTags?: QualityFeedbackTag[];
  overridePrimaryReason?: QualityFeedbackTag;
  overrideFeedbackSeverity?: QualityFeedbackSeverity;
}
