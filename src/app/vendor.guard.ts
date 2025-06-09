import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth, User } from '@angular/fire/auth';

export const vendorGuard: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  let currentUser: User | null = auth.currentUser;

  if (!currentUser) {
    currentUser = await new Promise<User | null>((resolve) => {
      const unsub = auth.onAuthStateChanged(u => {
        unsub();
        resolve(u);
      });
    });
  }

  if (!currentUser || !currentUser.email) {
    // ユーザーがundefinedまたはnullの場合のみアクセス許可
    return true;
  }
  // それ以外はダッシュボードにリダイレクト
  return router.createUrlTree(['/dashboard'], { queryParams: { error: 'forbidden' } });
};
