import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { KeyValuePipe } from '@angular/common';
import { InsurancePremiumService } from '../shared/services/insurance-premium.service';
import * as XLSX from 'xlsx';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit } from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';

// 従業員の型定義
interface Employee {
  id: string;
  employee_code: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  company_id: string;
}

// 給与明細の型定義
interface SalaryDetail {
  type: string;
  amount: number;
  note: string;
}

interface RegisteredSalary {
  id: string;
  year_month: string;
  details: SalaryDetail[];
  total_amount: number;
  taxable_amount: number;
  social_insurance_deduction: number;
  created_at: Date;
  updated_at: Date;
}

@Component({
  selector: 'app-insurance-premium-calculation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatIconModule,
    KeyValuePipe
  ],
  templateUrl: './insurance-premium-calculation.component.html',
  styleUrl: './insurance-premium-calculation.component.scss'
})
export class InsurancePremiumCalculationComponent implements OnInit {
  tabs = [
    { label: '保険料計算', key: 'calculation' },
    { label: '負担比率', key: 'ratio' },
    { label: 'マスタ管理', key: 'master' },
    { label: '履歴閲覧', key: 'history' }
  ];
  selectedTab = this.tabs[0].key;

  // 従業員リスト
  employees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  selectedEmployeeId: string = '';
  searchText: string = '';

  // 計算結果
  calculationResult = {
    healthInsurance: 0,
    nursingInsurance: 0,
    pensionInsurance: 0,
    employmentInsurance: 0,
    total: 0,
    ippanFull: 0,
    ippanHalf: 0
  };

  // 保険料表管理用プロパティ
  selectedYear: string = '';
  yearOptions: string[] = [];
  isImporting: boolean = false;
  importError: string | null = null;
  selectedFile: File | null = null;
  sheetNames: string[] = [];
  private _selectedSheetName: string = '';
  premiums: { [key: string]: any } | null = null;
  selectedPrefectureId: string = '';

  // 認証関連
  public user$;
  public isAuthReady$;
  public employeeInfo$;
  companyId: string = '';

  registeredSalaries: RegisteredSalary[] = [];
  selectedGrade: number | null = null;
  selectedGradeInfo: any = null;
  avgLast3: number = 0;

  constructor(
    private insurancePremiumService: InsurancePremiumService,
    private authService: AuthService,
    private firestore: Firestore
  ) {
    // 年度選択肢の設定
    const now = new Date();
    const thisYear = now.getFullYear();
    this.yearOptions = [String(thisYear), String(thisYear - 1), String(thisYear - 2)];
    this.selectedYear = this.yearOptions[0];

    // 認証関連の初期化
    this.user$ = this.authService.user$;
    this.isAuthReady$ = this.authService.isAuthReady$;
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

  async ngOnInit() {
    // 認証状態の購読
    this.authService.isAuthReady$.subscribe(isReady => {
      if (isReady) {
        this.authService.companyId$.subscribe(async companyId => {
          if (companyId) {
            this.companyId = companyId;
            await this.loadEmployees();
          }
        });
      }
    });
  }

  // 従業員一覧を取得
  async loadEmployees() {
    if (!this.companyId) return;
    
    try {
      const employeesCol = collection(this.firestore, 'employees');
      const q = query(employeesCol, where('company_id', '==', this.companyId));
      const snapshot = await getDocs(q);
      
      this.employees = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Employee));
      
      this.filteredEmployees = [...this.employees];
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  }

  // 従業員検索
  filterEmployees() {
    if (!this.searchText) {
      this.filteredEmployees = [...this.employees];
      return;
    }
    const searchLower = this.searchText.toLowerCase();
    this.filteredEmployees = this.employees.filter(emp => {
      const fullName = `${emp.last_name_kanji}${emp.first_name_kanji}`.toLowerCase();
      const fullNameKana = `${emp.last_name_kana}${emp.first_name_kana}`.toLowerCase();
      const employeeCode = (emp.employee_code || '').toLowerCase();
      
      return fullName.includes(searchLower) || 
             fullNameKana.includes(searchLower) || 
             employeeCode.includes(searchLower);
    });
  }

  // タブ切り替え
  selectTab(tabKey: string) {
    this.selectedTab = tabKey;
  }

  // 従業員選択時の処理
  async onEmployeeSelect() {
    if (!this.selectedEmployeeId) return;

    try {
      console.log('選択された従業員ID:', this.selectedEmployeeId);

      // 給与明細の取得（サブコレクションから）
      const salariesCol = collection(this.firestore, 'employees', this.selectedEmployeeId, 'salaries');
      const q = query(
        salariesCol,
        orderBy('year_month', 'desc'),
        limit(3)
      );
      const snapshot = await getDocs(q);
      
      this.registeredSalaries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as RegisteredSalary));
      console.log('取得した給与データ:', this.registeredSalaries);

      // 従業員の部署情報を取得して都道府県IDを設定
      const employeeDoc = await getDoc(doc(this.firestore, 'employees', this.selectedEmployeeId));
      console.log('従業員データ:', employeeDoc.exists() ? employeeDoc.data() : '存在しません');
      
      if (employeeDoc.exists()) {
        const employeeData = employeeDoc.data();
        console.log('従業員の部署ID:', employeeData['department_id']);
        
        if (employeeData['department_id']) {
          const departmentDoc = await getDoc(doc(this.firestore, 'departments', employeeData['department_id']));
          console.log('部署データ:', departmentDoc.exists() ? departmentDoc.data() : '存在しません');
          
          if (departmentDoc.exists()) {
            const departmentData = departmentDoc.data();
            this.selectedPrefectureId = departmentData['prefecture_id'] || '';
            console.log('設定された都道府県ID:', this.selectedPrefectureId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading employee data:', error);
      alert('従業員データの取得に失敗しました');
    }
  }

  // Firestoreの都道府県ID一覧とselectedPrefectureIdを表示
  async printPrefectureIds() {
    const prefecturesCol = collection(this.firestore, 'prefectures');
    const snapshot = await getDocs(prefecturesCol);
    const ids = snapshot.docs.map(doc => doc.id);
    console.log('Firestoreの都道府県ID一覧:', ids);
    console.log('アプリ側のselectedPrefectureId: [' + this.selectedPrefectureId + ']');
  }

  // 保険料計算
  async calculateInsurance() {
    await this.printPrefectureIds();
    try {
      // 直近3ヶ月の給与明細が必要
      if (!this.registeredSalaries || this.registeredSalaries.length < 3) {
        alert('直近3ヶ月分の給与データが必要です');
        return;
      }

      // 平均給与の計算
      const last3 = this.registeredSalaries.slice(-3);
      const avgLast3 = last3.reduce((sum, s) => sum + (s.total_amount || 0), 0) / last3.length;
      this.avgLast3 = avgLast3;
      console.log('平均給与:', avgLast3);

      // 都道府県と年度の確認
      if (!this.selectedPrefectureId || !this.selectedYear) {
        alert('都道府県・年度を選択してください');
        return;
      }
      console.log('都道府県ID:', this.selectedPrefectureId);
      console.log('年度:', this.selectedYear);

      // 等級表の取得
      const gradesCol = collection(this.firestore, 'prefectures', this.selectedPrefectureId, 'insurance_premiums', this.selectedYear, 'grades');
      const gradesSnapshot = await getDocs(gradesCol);
      const grades: { [key: string]: any } = {};
      gradesSnapshot.forEach(doc => {
        grades[doc.id] = doc.data();
      });
      console.log(`取得した等級表（都道府県ID: ${this.selectedPrefectureId}, 年度: ${this.selectedYear}）:`, grades);

      if (Object.keys(grades).length === 0) {
        alert('等級表データが存在しません');
        return;
      }

      // 等級判定
      const grade = this.getGradeIdBySalary(grades, avgLast3);
      console.log('判定された等級:', grade);
      this.selectedGrade = grade;
      this.selectedGradeInfo = grade !== null ? grades[String(grade)] : null;
      console.log('選択された等級情報:', this.selectedGradeInfo);

      if (!this.selectedGradeInfo) {
        alert('該当する等級が見つかりませんでした');
        return;
      }

      // ippan.fullとippan.halfを出力
      console.log('等級', this.selectedGrade, 'の一般保険料（全額）:', this.selectedGradeInfo.ippan?.full);
      console.log('等級', this.selectedGrade, 'の一般保険料（折半額）:', this.selectedGradeInfo.ippan?.half);

      this.calculationResult = {
        healthInsurance: this.selectedGradeInfo.ippan.full,
        nursingInsurance: 0,
        pensionInsurance: 0,
        employmentInsurance: 0,
        total: this.selectedGradeInfo.ippan.full,
        ippanFull: this.selectedGradeInfo.ippan.full,
        ippanHalf: this.selectedGradeInfo.ippan.half
      };

    } catch (error) {
      console.error('Error calculating insurance:', error);
      alert('保険料の計算中にエラーが発生しました');
    }
  }

  // 等級判定のヘルパーメソッド
  private getGradeIdBySalary(grades: { [key: string]: any }, salary: number): number | null {
    console.log('等級判定開始 - 給与:', salary);
    for (const [gradeId, grade] of Object.entries(grades)) {
      console.log(`等級${gradeId}の範囲:`, grade.salaryMin, '～', grade.salaryMax);
      if (salary >= grade.salaryMin && salary < grade.salaryMax) {
        console.log(`等級${gradeId}に該当`);
        return Number(gradeId);
      }
    }
    console.log('該当する等級なし');
    return null;
  }

  // 保険料表の等級ソート関数
  sortByGrade = (a: {key: string}, b: {key: string}): number => {
    // 等級キーから括弧前の数字だけを抽出
    const getGradeNumber = (key: string) => {
      const match = key.match(/^\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    return getGradeNumber(a.key) - getGradeNumber(b.key);
  };

  // ファイル選択時の処理
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files && input.files.length > 0 ? input.files[0] : null;
    this.sheetNames = [];
    this.selectedSheetName = '';
    if (this.selectedFile) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          this.sheetNames = workbook.SheetNames;
          if (this.sheetNames.length > 0) {
            this.selectedSheetName = this.sheetNames[0];
          }
        } catch (error) {
          this.importError = 'シート名の取得に失敗しました。';
        }
      };
      reader.readAsArrayBuffer(this.selectedFile);
    }
  }

  // インポート実行
  async onImportClick(): Promise<void> {
    if (!this.selectedFile || !this.selectedSheetName) return;
    this.isImporting = true;
    this.importError = null;
    try {
      await this.insurancePremiumService.importExcelFile(this.selectedFile, this.selectedPrefectureId, this.selectedYear, this.selectedSheetName);
      await this.loadPremiums();
    } catch (error: any) {
      this.importError = error?.message || 'インポート中にエラーが発生しました。';
    } finally {
      this.isImporting = false;
      this.selectedFile = null;
      this.sheetNames = [];
      this.selectedSheetName = '';
      const input = document.getElementById('excelFile') as HTMLInputElement;
      if (input) input.value = '';
    }
  }

  // エクスポート実行
  async exportToExcel(): Promise<void> {
    if (!this.selectedPrefectureId) {
      this.importError = '都道府県を選択してください。';
      return;
    }
    if (!this.selectedYear) {
      this.importError = '年度を選択してください。';
      return;
    }
    try {
      await this.insurancePremiumService.exportToExcel(this.selectedPrefectureId, this.selectedYear);
    } catch (error: any) {
      this.importError = error?.message || 'エクスポート中にエラーが発生しました。';
    }
  }

  // 保険料表の読み込み
  async loadPremiums(): Promise<void> {
    if (!this.selectedPrefectureId || !this.selectedYear) {
      this.premiums = null;
      return;
    }
    try {
      const result = await this.insurancePremiumService.getPremiums(this.selectedPrefectureId, this.selectedYear);
      this.premiums = result?.premiums || null;
    } catch (error) {
      this.premiums = null;
    }
  }

  get selectedSheetName(): string {
    return this._selectedSheetName;
  }
  set selectedSheetName(value: string) {
    this._selectedSheetName = value;
    this.selectedPrefectureId = value;
  }

  // prefectures/全国/insurance_premiums/2025/gradesサブコレクションのドキュメント一覧を取得してコンソールに出力するテスト用メソッド
  async getPrefectureTest() {
    const gradesCol = collection(this.firestore, 'prefectures', '全国', 'insurance_premiums', '2025', 'grades');
    const snapshot = await getDocs(gradesCol);
    const ids = snapshot.docs.map(doc => doc.id);
    console.log('全国/insurance_premiums/2025/gradesのID一覧:', ids);
    snapshot.docs.forEach(doc => {
      console.log('gradesドキュメント内容:', doc.id, doc.data());
    });
  }

  // 全国ドキュメント（prefectures/全国）の情報を取得してコンソールに出力するテスト用メソッド
  async getZenkokuPrefectureTest() {
    const zenkokuDocRef = doc(this.firestore, 'prefectures', '全国');
    const zenkokuDoc = await getDoc(zenkokuDocRef);
    if (zenkokuDoc.exists()) {
      console.log('全国ドキュメントの内容:', zenkokuDoc.id, zenkokuDoc.data());
    } else {
      console.log('全国ドキュメントは存在しません');
    }
  }
}
