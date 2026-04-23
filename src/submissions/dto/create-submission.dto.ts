import { WasteType } from '../../common/models';

export class CreateSubmissionDto {
  wasteType!: WasteType;
  estimatedWeight!: number;
  imageUrl?: string;
}
