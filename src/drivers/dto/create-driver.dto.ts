export class CreateDriverDto {
  fullName!: string;
  email!: string;
  password!: string;
  phoneNumber?: string;
  vehicleNumber?: string;
}
