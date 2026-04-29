import type { PickupRouteStatus } from '../../common/models';

export class UpdatePickupRouteStatusDto {
  status!: PickupRouteStatus;
  notes?: string;
}
