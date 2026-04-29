export type UserRole = 'admin' | 'user' | 'driver';

export type UserStatus = 'active' | 'inactive';

export type WasteType = 'food' | 'oil';

export type SubmissionStatus = 'pending' | 'verified' | 'completed' | 'rejected';

export type TransactionType = 'deposit' | 'withdrawal';

export type TransactionStatus = 'pending' | 'completed' | 'rejected';

export type WithdrawalMethod = 'gopay' | 'ovo' | 'dana' | 'bank';

export interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  business_name?: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  avatar_url?: string;
  phone_number?: string;
  vehicle_number?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string;
  business_name?: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  avatar_url?: string;
  phone_number?: string;
  vehicle_number?: string;
}

export interface WasteSubmission {
  id: string;
  user_id: string;
  waste_type: WasteType;
  estimated_weight: number;
  actual_weight?: number;
  image_url?: string;
  status: SubmissionStatus;
  created_at: string;
  verified_at?: string;
  completed_at?: string;
  notes?: string;
  earnings?: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  created_at: string;
  completed_at?: string;
  submission_id?: string;
  withdrawal_method?: WithdrawalMethod;
  withdrawal_account?: string;
  notes?: string;
}

export interface WastePrice {
  id: string;
  waste_type: WasteType;
  price_per_kg: number;
  updated_at: string;
  updated_by: string;
}

export interface DropPoint {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  operating_hours: string;
  contact: string;
}

export interface SessionRecord {
  token: string;
  user_id: string;
  created_at: string;
}

export interface UserStats {
  total_submissions: number;
  total_weight: number;
  total_earnings: number;
  current_balance: number;
  pending_submissions: number;
}

export interface AdminStats {
  total_users: number;
  total_waste_collected: number;
  total_cuan_distributed: number;
  pending_verifications: number;
  pending_withdrawals: number;
  user_growth: Array<{ date: string; users: number }>;
  waste_by_type: Array<{ type: WasteType; weight: number }>;
}

export type PickupRouteStatus =
  | 'assigned'
  | 'on_the_way'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

export interface PickupRoute {
  id: string;
  submission_id: string;
  user_id: string;
  driver_id: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  scheduled_at: string;
  status: PickupRouteStatus;
  created_at: string;
  started_at?: string;
  picked_up_at?: string;
  completed_at?: string;
  notes?: string;
}

export type PaymentMethod = 'qris' | 'virtual_account' | 'ewallet';

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface PaymentRecord {
  id: string;
  user_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  purpose: string;
  checkout_url: string;
  external_reference?: string;
  created_at: string;
  paid_at?: string;
  expires_at?: string;
  notes?: string;
}
