import { QualityGrade, QualityGradeSource } from '../../common/models';

export class VerifySubmissionDto {
  actualWeight!: number;
  qualityGrade?: QualityGrade;
  qualityGradeSource?: QualityGradeSource;
  adminQualityNotes?: string;
}
