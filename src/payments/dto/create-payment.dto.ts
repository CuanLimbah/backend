import type { PaymentMethod } from '../../common/models';

export class CreatePaymentDto {
  amount!: number;
  method!: PaymentMethod;
  purpose?: string;
  notes?: string;
}
