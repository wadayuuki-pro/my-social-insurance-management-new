import { Injectable } from '@angular/core';
import { Auth, onAuthStateChanged, User } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSubject = new BehaviorSubject<User | null | undefined>(undefined);
  user$ = this.userSubject.asObservable();

  private companyIdSubject = new BehaviorSubject<string | null | undefined>(undefined);
  companyId$ = this.companyIdSubject.asObservable();

  private authReadySubject = new BehaviorSubject<boolean>(false);
  isAuthReady$ = this.authReadySubject.asObservable();

  constructor(private auth: Auth, private firestore: Firestore) {
    onAuthStateChanged(this.auth, async (user) => {
      this.userSubject.next(user);
      if (user && user.email) {
        // FirestoreからcompanyId取得
        const employeesCol = collection(this.firestore, 'employees');
        const q = query(employeesCol, where('email', '==', user.email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          this.companyIdSubject.next(data['company_id'] || null);
        } else {
          this.companyIdSubject.next(null);
        }
      } else {
        this.companyIdSubject.next(null);
      }
      this.authReadySubject.next(true); // 初期化完了
    });
  }
} 