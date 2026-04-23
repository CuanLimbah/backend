import { WithdrawalMethod } from '../../common/models';

export class CreateWithdrawalDto {
  amount!: number;
  method!: WithdrawalMethod;
  account!: string;
}
