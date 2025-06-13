import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

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
  public isVendor: boolean = false;

  // お知らせ欄用（UIのみ）
  public notices: string[] = [];

  public gradeNotices: string[] = [];

  async logout() {
    try {
      await this.authService.signOut();
      // ログアウト後はログインページにリダイレクト
      this.router.navigate(['/login']);
    } catch (error) {
      // console.error('ログアウト中にエラーが発生しました:', error);
    }
  }

  async changePassword() {
    const auth = getAuth();
    try {
      const user = auth.currentUser;
      if (!user?.email) {
        alert('ログイン情報が取得できません。');
        return;
      }
      await sendPasswordResetEmail(auth, user.email);
      alert('パスワード再設定メールを送信しました。メールをご確認ください。');
    } catch (error) {
      alert('パスワード再設定メールの送信に失敗しました。');
      console.error(error);
    }
  }

  constructor(private auth: Auth, private firestore: Firestore, public authService: AuthService, private route: ActivatedRoute, private router: Router) {
    this.user$ = this.authService.user$;
    this.isAuthReady$ = this.authService.isAuthReady$;
    // ログイン中のユーザーのメールアドレスをコンソールに表示
    this.user$.subscribe(user => {
      // console.log('ログイン中のユーザー:', user?.email);
      // ユーザーがundefinedまたはnullの場合のみベンダーページを表示
      this.isVendor = (user === undefined || user === null);
    });
    // 追加: employeeInfo$の初期化
    this.employeeInfo$ = this.user$.pipe(
      switchMap(user => {
        if (!user?.email) return of(null);
        // ベンダー権限のチェック
        this.isVendor = user.email === 'yuki.wada@pathoslogos.co.jp';
        
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

  async ngOnInit() {
    this.authService.isAuthReady$.subscribe(isReady => {
      if (isReady) {
        this.authService.companyId$.subscribe(async companyId => {
          if (companyId) {
            this.companyId = companyId;
            await this.loadGradeChangeNotices();
          }
        });
      }
    });
  }

  async loadGradeChangeNotices() {
    this.gradeNotices = [];
    if (!this.companyId) return;
    // 全従業員取得
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId));
    const empSnapshot = await getDocs(q);
    const employees = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 全国共通等級表（2025年）を取得
    const grades: { [key: string]: any } = {};
    const gradesCol = collection(this.firestore, 'prefectures', '全国', 'insurance_premiums', '2025', 'grades');
    const gradesSnapshot = await getDocs(gradesCol);
    gradesSnapshot.forEach(doc => {
      grades[doc.id] = doc.data();
    });
    function getGradeIdBySalary(grades: { [key: string]: any }, salary: number): string | null {
      for (const [gradeId, grade] of Object.entries(grades)) {
        if (salary >= grade.salaryMin && salary < grade.salaryMax) {
          return gradeId;
        }
      }
      return null;
    }
    // 現在の年月を取得
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const getLast3Months = (year: number, month: number): string[] => {
      const months: string[] = [];
      for (let i = 0; i < 3; i++) {
        let targetMonth = month - i;
        let targetYear = year;
        if (targetMonth <= 0) {
          targetMonth += 12;
          targetYear--;
        }
        months.unshift(`${targetYear}-${String(targetMonth).padStart(2, '0')}`);
      }
      return months;
    };
    const targetMonths = getLast3Months(currentYear, currentMonth);
    // 各従業員ごとにsalaries取得
    for (const empRaw of employees) {
      const emp = empRaw as any;
      const salariesCol = collection(this.firestore, 'employees', emp.id, 'salaries');
      const salSnapshot = await getDocs(query(salariesCol, where('year_month', 'in', targetMonths)));
      const salaries = salSnapshot.docs.map(doc => doc.data() as any);
      // 各月の給与データを取得（賞与を除く）
      const monthlySalaries = targetMonths.map(month => {
        const salary = salaries.find((s: any) => s.year_month === month);
        if (!salary) return 0;
        // 賞与を除いた合計を計算
        const nonBonusTotal = (salary.details || [])
          .filter((d: any) => d.type !== 'bonus')
          .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
        return nonBonusTotal;
      });
      // 平均を計算（データがない月は0として計算）
      const avgLast3 = monthlySalaries.reduce((sum, amount) => sum + amount, 0) / 3;
      // 現在の等級（employeesコレクションのauto_grade）
      const currentGrade = emp.auto_grade || '';
      // 直近3ヶ月の平均から等級を算出
      const calculatedGrade = getGradeIdBySalary(grades, avgLast3);
      // 2等級以上の変動を検出
      if (avgLast3 !== 0 && currentGrade && calculatedGrade) {
        const getGradeNumber = (grade: string): number => {
          const match = grade.match(/^[0-9]+/);
          return match ? parseInt(match[0], 10) : 0;
        };
        const diff = Math.abs(getGradeNumber(calculatedGrade) - getGradeNumber(currentGrade));
        if (diff >= 2) {
          const name = `${emp.last_name_kanji || ''}${emp.first_name_kanji || ''}`.trim() + (emp.employee_code ? `（${emp.employee_code}）` : '');
          this.gradeNotices.push(`${name}が2級以上変動しています。`);
        }
      }
    }
  }
}
