import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

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

  public errorMessage: string = '';

  public isAdmin: boolean = false;

  async logout() {
    try {
      await this.authService.signOut();
      // ログアウト後はログインページにリダイレクト
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('ログアウト中にエラーが発生しました:', error);
    }
  }

  constructor(private auth: Auth, private firestore: Firestore, public authService: AuthService, private route: ActivatedRoute, private router: Router) {
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
            if (snapshot.empty) {
              this.isAdmin = false;
              return null;
            }
            const data = snapshot.docs[0].data();
            this.isAdmin = data['role'] === 'admin';
            return {
              company_id: data['company_id'],
              employee_code: data['employee_code'],
              name: `${data['last_name_kanji'] || ''}${data['first_name_kanji'] || ''}`,
              role: data['role']
            };
          })
        );
      })
    );
    // クエリパラメータでエラー取得
    this.route.queryParams.subscribe(params => {
      if (params['error'] === 'forbidden') {
        this.errorMessage = 'このページにアクセスする権限がありません。';
        // 2秒後にクエリパラメータを消す
        setTimeout(() => {
          this.router.navigate([], { queryParams: {}, replaceUrl: true });
        }, 2000);
      } else {
        this.errorMessage = '';
      }
    });
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
