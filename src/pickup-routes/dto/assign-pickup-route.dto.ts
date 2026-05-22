export class AssignPickupRouteDto {
  submissionId!: string;
  driverId!: string;
  dropPointId!: string;
  scheduledAt?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}
