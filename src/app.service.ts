import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getApiInfo() {
    return {
      name: 'CuanLimbah Backend API',
      status: 'ok',
      stack: 'NestJS',
      description:
        'Backend API untuk auth, setoran limbah, wallet, withdrawal, drop point, dan dashboard admin/user.',
      routes: {
        auth: ['/auth/register', '/auth/login', '/auth/me'],
        users: ['/users/me', '/users/me/stats', '/users/me/dashboard'],
        submissions: ['/submissions', '/submissions/me', '/admin/submissions'],
        prices: ['/prices', '/admin/prices/:id'],
        transactions: [
          '/transactions/me',
          '/transactions/withdrawals',
          '/admin/withdrawals',
        ],
        admin: ['/admin/dashboard', '/admin/stats', '/admin/users'],
        dropPoints: ['/drop-points'],
      },
    };
  }
}
