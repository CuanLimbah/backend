import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DropPoint,
  SessionRecord,
  Transaction,
  UserRecord,
  WastePrice,
  WasteSubmission,
  WasteType,
} from '../common/models';
import { hashPassword } from '../common/utils';

@Injectable()
export class DataService {
  private readonly users: UserRecord[];
  private readonly prices: WastePrice[];
  private readonly dropPoints: DropPoint[];
  private readonly submissions: WasteSubmission[];
  private readonly transactions: Transaction[];
  private readonly sessions: SessionRecord[] = [];

  constructor() {
    this.users = this.buildUsers();
    this.prices = this.buildPrices();
    this.dropPoints = this.buildDropPoints();
    this.submissions = this.buildSubmissions();
    this.transactions = this.buildTransactions();
  }

  getUsers(): UserRecord[] {
    return [...this.users];
  }

  findUserById(id: string): UserRecord | undefined {
    return this.users.find((user) => user.id === id);
  }

  findUserByIdOrFail(id: string): UserRecord {
    const user = this.findUserById(id);

    if (!user) {
      throw new NotFoundException(`User dengan id "${id}" tidak ditemukan`);
    }

    return user;
  }

  findUserByEmail(email: string): UserRecord | undefined {
    const normalizedEmail = email.trim().toLowerCase();
    return this.users.find((user) => user.email.toLowerCase() === normalizedEmail);
  }

  createUser(payload: Omit<UserRecord, 'id' | 'created_at'> & { created_at?: string }): UserRecord {
    const user: UserRecord = {
      id: `user-${randomUUID()}`,
      created_at: payload.created_at ?? new Date().toISOString(),
      ...payload,
    };

    this.users.push(user);
    return user;
  }

  updateUser(id: string, updates: Partial<UserRecord>): UserRecord {
    const user = this.findUserByIdOrFail(id);
    Object.assign(user, updates);
    return user;
  }

  createSession(user_id: string): SessionRecord {
    const session: SessionRecord = {
      token: randomUUID(),
      user_id,
      created_at: new Date().toISOString(),
    };

    this.sessions.push(session);
    return session;
  }

  findSession(token: string): SessionRecord | undefined {
    return this.sessions.find((session) => session.token === token);
  }

  getPrices(): WastePrice[] {
    return [...this.prices];
  }

  findPriceById(id: string): WastePrice | undefined {
    return this.prices.find((price) => price.id === id);
  }

  findPriceByWasteType(wasteType: WasteType): WastePrice | undefined {
    return this.prices.find((price) => price.waste_type === wasteType);
  }

  updatePrice(id: string, updates: Partial<WastePrice>): WastePrice {
    const price = this.findPriceById(id);

    if (!price) {
      throw new NotFoundException(`Harga limbah dengan id "${id}" tidak ditemukan`);
    }

    Object.assign(price, updates);
    return price;
  }

  getDropPoints(): DropPoint[] {
    return [...this.dropPoints];
  }

  getSubmissions(): WasteSubmission[] {
    return [...this.submissions];
  }

  findSubmissionById(id: string): WasteSubmission | undefined {
    return this.submissions.find((submission) => submission.id === id);
  }

  createSubmission(
    payload: Omit<WasteSubmission, 'id' | 'created_at' | 'status'> & {
      created_at?: string;
      status?: WasteSubmission['status'];
    },
  ): WasteSubmission {
    const submission: WasteSubmission = {
      id: `sub-${randomUUID()}`,
      status: payload.status ?? 'pending',
      created_at: payload.created_at ?? new Date().toISOString(),
      user_id: payload.user_id,
      waste_type: payload.waste_type,
      estimated_weight: payload.estimated_weight,
      image_url: payload.image_url,
      actual_weight: payload.actual_weight,
      verified_at: payload.verified_at,
      completed_at: payload.completed_at,
      notes: payload.notes,
      earnings: payload.earnings,
    };

    this.submissions.push(submission);
    return submission;
  }

  updateSubmission(id: string, updates: Partial<WasteSubmission>): WasteSubmission {
    const submission = this.findSubmissionById(id);

    if (!submission) {
      throw new NotFoundException(`Setoran dengan id "${id}" tidak ditemukan`);
    }

    Object.assign(submission, updates);
    return submission;
  }

  getTransactions(): Transaction[] {
    return [...this.transactions];
  }

  findTransactionById(id: string): Transaction | undefined {
    return this.transactions.find((transaction) => transaction.id === id);
  }

  createTransaction(
    payload: Omit<Transaction, 'id' | 'created_at'> & { created_at?: string },
  ): Transaction {
    const transaction: Transaction = {
      id: `trx-${randomUUID()}`,
      created_at: payload.created_at ?? new Date().toISOString(),
      ...payload,
    };

    this.transactions.push(transaction);
    return transaction;
  }

  updateTransaction(id: string, updates: Partial<Transaction>): Transaction {
    const transaction = this.findTransactionById(id);

    if (!transaction) {
      throw new NotFoundException(`Transaksi dengan id "${id}" tidak ditemukan`);
    }

    Object.assign(transaction, updates);
    return transaction;
  }

  private buildUsers(): UserRecord[] {
    return [
      {
        id: 'admin-1',
        email: 'admin@cuanlimbah.com',
        full_name: 'Admin CuanLimbah',
        password_hash: hashPassword('Admin12345'),
        role: 'admin',
        status: 'active',
        created_at: this.daysAgo(180),
      },
      {
        id: 'user-1',
        email: 'user@example.com',
        full_name: 'John Doe',
        business_name: 'Warung Hijau',
        password_hash: hashPassword('User12345'),
        role: 'user',
        status: 'active',
        created_at: this.daysAgo(98),
      },
      {
        id: 'user-2',
        email: 'umkm1@example.com',
        full_name: 'Toko Maju Jaya',
        business_name: 'Toko Maju Jaya',
        password_hash: hashPassword('User12345'),
        role: 'user',
        status: 'active',
        created_at: this.daysAgo(85),
      },
      {
        id: 'user-3',
        email: 'umkm2@example.com',
        full_name: 'Warung Berkah',
        business_name: 'Warung Berkah',
        password_hash: hashPassword('User12345'),
        role: 'user',
        status: 'active',
        created_at: this.daysAgo(72),
      },
      {
        id: 'user-4',
        email: 'umkm3@example.com',
        full_name: 'CV. Harapan Baru',
        business_name: 'CV. Harapan Baru',
        password_hash: hashPassword('User12345'),
        role: 'user',
        status: 'active',
        created_at: this.daysAgo(50),
      },
      {
        id: 'user-5',
        email: 'kedainusantara@example.com',
        full_name: 'Kedai Nusantara',
        business_name: 'Kedai Nusantara',
        password_hash: hashPassword('User12345'),
        role: 'user',
        status: 'active',
        created_at: this.daysAgo(32),
      },
      {
        id: 'user-6',
        email: 'restosehat@example.com',
        full_name: 'Resto Sehat',
        business_name: 'Resto Sehat',
        password_hash: hashPassword('User12345'),
        role: 'user',
        status: 'inactive',
        created_at: this.daysAgo(15),
      },
    ];
  }

  private buildPrices(): WastePrice[] {
    return [
      {
        id: 'price-1',
        waste_type: 'food',
        price_per_kg: 1000,
        updated_at: this.daysAgo(5),
        updated_by: 'admin-1',
      },
      {
        id: 'price-2',
        waste_type: 'oil',
        price_per_kg: 3000,
        updated_at: this.daysAgo(5),
        updated_by: 'admin-1',
      },
    ];
  }

  private buildDropPoints(): DropPoint[] {
    return [
      {
        id: 'dp-1',
        name: 'Drop Point Sudirman',
        address: 'Jl. Jend. Sudirman No. 123, Jakarta Pusat',
        latitude: -6.2088,
        longitude: 106.8456,
        operating_hours: 'Senin - Sabtu: 08:00 - 17:00',
        contact: '081234567890',
      },
      {
        id: 'dp-2',
        name: 'Drop Point Tebet',
        address: 'Jl. Tebet Raya No. 45, Jakarta Selatan',
        latitude: -6.2297,
        longitude: 106.856,
        operating_hours: 'Senin - Jumat: 09:00 - 16:00',
        contact: '081234567891',
      },
      {
        id: 'dp-3',
        name: 'Drop Point Kelapa Gading',
        address: 'Jl. Boulevard Raya No. 78, Jakarta Utara',
        latitude: -6.1571,
        longitude: 106.9096,
        operating_hours: 'Setiap Hari: 08:00 - 18:00',
        contact: '081234567892',
      },
    ];
  }

  private buildSubmissions(): WasteSubmission[] {
    return [
      {
        id: 'sub-1',
        user_id: 'user-1',
        waste_type: 'oil',
        estimated_weight: 5,
        actual_weight: 4.8,
        status: 'completed',
        created_at: this.daysAgo(7),
        verified_at: this.daysAgo(6),
        completed_at: this.daysAgo(6),
        earnings: 14400,
      },
      {
        id: 'sub-2',
        user_id: 'user-1',
        waste_type: 'food',
        estimated_weight: 3,
        status: 'pending',
        created_at: this.daysAgo(2),
      },
      {
        id: 'sub-3',
        user_id: 'user-2',
        waste_type: 'food',
        estimated_weight: 46,
        actual_weight: 45.5,
        status: 'completed',
        created_at: this.daysAgo(18),
        verified_at: this.daysAgo(17),
        completed_at: this.daysAgo(17),
        earnings: 45500,
      },
      {
        id: 'sub-4',
        user_id: 'user-2',
        waste_type: 'oil',
        estimated_weight: 12.2,
        actual_weight: 12,
        status: 'completed',
        created_at: this.daysAgo(10),
        verified_at: this.daysAgo(9),
        completed_at: this.daysAgo(9),
        earnings: 36000,
      },
      {
        id: 'sub-5',
        user_id: 'user-3',
        waste_type: 'oil',
        estimated_weight: 32.5,
        actual_weight: 32.3,
        status: 'completed',
        created_at: this.daysAgo(20),
        verified_at: this.daysAgo(19),
        completed_at: this.daysAgo(19),
        earnings: 96900,
      },
      {
        id: 'sub-6',
        user_id: 'user-4',
        waste_type: 'food',
        estimated_weight: 160,
        actual_weight: 156.8,
        status: 'completed',
        created_at: this.daysAgo(35),
        verified_at: this.daysAgo(34),
        completed_at: this.daysAgo(34),
        earnings: 156800,
      },
      {
        id: 'sub-7',
        user_id: 'user-5',
        waste_type: 'food',
        estimated_weight: 18.2,
        actual_weight: 17.4,
        status: 'completed',
        created_at: this.daysAgo(12),
        verified_at: this.daysAgo(11),
        completed_at: this.daysAgo(11),
        earnings: 17400,
      },
      {
        id: 'sub-8',
        user_id: 'user-2',
        waste_type: 'food',
        estimated_weight: 5,
        status: 'pending',
        created_at: this.hoursAgo(2),
      },
      {
        id: 'sub-9',
        user_id: 'user-3',
        waste_type: 'oil',
        estimated_weight: 3.5,
        status: 'pending',
        created_at: this.hoursAgo(3),
      },
    ];
  }

  private buildTransactions(): Transaction[] {
    return [
      {
        id: 'trx-1',
        user_id: 'user-1',
        type: 'deposit',
        amount: 14400,
        status: 'completed',
        created_at: this.daysAgo(6),
        completed_at: this.daysAgo(6),
        submission_id: 'sub-1',
      },
      {
        id: 'trx-2',
        user_id: 'user-2',
        type: 'deposit',
        amount: 45500,
        status: 'completed',
        created_at: this.daysAgo(17),
        completed_at: this.daysAgo(17),
        submission_id: 'sub-3',
      },
      {
        id: 'trx-3',
        user_id: 'user-2',
        type: 'deposit',
        amount: 36000,
        status: 'completed',
        created_at: this.daysAgo(9),
        completed_at: this.daysAgo(9),
        submission_id: 'sub-4',
      },
      {
        id: 'trx-4',
        user_id: 'user-3',
        type: 'deposit',
        amount: 96900,
        status: 'completed',
        created_at: this.daysAgo(19),
        completed_at: this.daysAgo(19),
        submission_id: 'sub-5',
      },
      {
        id: 'trx-5',
        user_id: 'user-4',
        type: 'deposit',
        amount: 156800,
        status: 'completed',
        created_at: this.daysAgo(34),
        completed_at: this.daysAgo(34),
        submission_id: 'sub-6',
      },
      {
        id: 'trx-6',
        user_id: 'user-5',
        type: 'deposit',
        amount: 17400,
        status: 'completed',
        created_at: this.daysAgo(11),
        completed_at: this.daysAgo(11),
        submission_id: 'sub-7',
      },
      {
        id: 'trx-7',
        user_id: 'user-2',
        type: 'withdrawal',
        amount: 50000,
        status: 'pending',
        created_at: this.hoursAgo(1),
        withdrawal_method: 'gopay',
        withdrawal_account: '081234567890',
      },
      {
        id: 'trx-8',
        user_id: 'user-3',
        type: 'withdrawal',
        amount: 75000,
        status: 'pending',
        created_at: this.hoursAgo(3),
        withdrawal_method: 'bank',
        withdrawal_account: '1234567890',
      },
      {
        id: 'trx-9',
        user_id: 'user-4',
        type: 'withdrawal',
        amount: 50000,
        status: 'completed',
        created_at: this.daysAgo(8),
        completed_at: this.daysAgo(7),
        withdrawal_method: 'dana',
        withdrawal_account: '081111111111',
      },
      {
        id: 'trx-10',
        user_id: 'user-4',
        type: 'withdrawal',
        amount: 30000,
        status: 'rejected',
        created_at: this.daysAgo(4),
        completed_at: this.daysAgo(3),
        withdrawal_method: 'bank',
        withdrawal_account: '999000111222',
        notes: 'Nama rekening tidak sesuai',
      },
    ];
  }

  private daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  private hoursAgo(hours: number): string {
    const date = new Date();
    date.setHours(date.getHours() - hours);
    return date.toISOString();
  }
}
