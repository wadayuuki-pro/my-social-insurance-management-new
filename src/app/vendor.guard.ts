import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth, User } from '@angular/fire/auth';
import { environment } from '../environments/environment';

export const vendorGuard: CanActivateFn = async (route, state) => {
  if (!environment.production) {
    // 開発環境では誰でもアクセス可能
    return true;
  }

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

  if (currentUser && currentUser.email === 'wadayuuki30@gmail.com') {
    return true;
  } else {
    // アクセス不可の場合はログインページへリダイレクト
    router.navigate(['/login']);
    return false;
  }
};
