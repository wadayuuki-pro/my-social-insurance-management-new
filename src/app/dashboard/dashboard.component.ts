import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  companyId: string = '';
  employeeId: string = '';

  public user$;
  public isAuthReady$;

  // 追加: ログインユーザーの従業員情報
  public employeeInfo$;

  constructor(private auth: Auth, private firestore: Firestore, public authService: AuthService) {
    this.user$ = this.authService.user$;
    this.isAuthReady$ = this.authService.isAuthReady$;
    // 追加: employeeInfo$の初期化
    this.employeeInfo$ = this.user$.pipe(
      switchMap(user => {
        if (!user?.email) return of(null);
        const employeesCol = collection(this.firestore, 'employees');
        const q = query(employeesCol, where('email', '==', user.email));
        return from(getDocs(q)).pipe(
          map(snapshot => {
            if (snapshot.empty) return null;
            const data = snapshot.docs[0].data();
            return {
              company_id: data['company_id'],
              employee_code: data['employee_code'],
              name: `${data['last_name_kanji'] || ''}${data['first_name_kanji'] || ''}`
            };
          })
        );
      })
    );
  }

  ngOnInit() {
    this.authService.isAuthReady$.subscribe(isReady => {
      if (isReady) {
        this.authService.companyId$.subscribe(async companyId => {
          if (companyId) {
            this.companyId = companyId;
            // 必要ならここでemployeeId等の初期化も
          }
        });
      }
    });
  }
}
