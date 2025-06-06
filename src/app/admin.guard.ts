import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

export const adminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const firestore = inject(Firestore);
  const router = inject(Router);
  let currentUser = auth.currentUser;

  if (!currentUser) {
    currentUser = await new Promise<any>((resolve) => {
      const unsub = auth.onAuthStateChanged(u => {
        unsub();
        resolve(u);
      });
    });
  }

  if (!currentUser || !currentUser.email) {
    router.navigate(['/dashboard'], { queryParams: { error: 'forbidden' } });
    return false;
  }

  // Firestoreからrole=adminか判定
  const employeesCol = collection(firestore, 'employees');
  const q = query(employeesCol, where('email', '==', currentUser.email));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const data = snapshot.docs[0].data();
    if (data['role'] === 'admin') {
      return true;
    }
  }
  // adminでなければダッシュボードへ
  router.navigate(['/dashboard'], { queryParams: { error: 'forbidden' } });
  return false;
}; 