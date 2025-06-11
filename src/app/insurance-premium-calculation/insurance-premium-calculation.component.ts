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
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit, setDoc } from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { InsurancePremium } from '../shared/interfaces/insurance-premium.interface';
import Decimal from 'decimal.js';

// 従業員の型定義
interface Employee {
  id: string;
  employee_code: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  company_id: string;
  department_id?: string;
  auto_grade?: string;
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

// 事業所（部署）の型定義
interface Department {
  id: string;
  name: string;
}

// 負担比率表示用の型
interface EmployeePremiumSummary {
  employeeId: string;
  name: string;
  ippanEmployee: Decimal;
  ippanCompany: Decimal;
  tokuteiEmployee: Decimal;
  tokuteiCompany: Decimal;
  kaigoEmployee: Decimal;
  kaigoCompany: Decimal;
  kouseiEmployee: Decimal;
  kouseiCompany: Decimal;
  totalEmployee: Decimal;
  totalCompany: Decimal;
  total: Decimal;
}

// 都道府県の型
interface Prefecture {
  id: string;
}

interface CalculationResult {
  healthInsurance: Decimal;
  nursingInsurance: Decimal;
  pensionInsurance: Decimal;
  employmentInsurance: Decimal;
  total: Decimal;
  ippanFull: Decimal;
  ippanHalf: Decimal;
  tokuteiFull: Decimal;
  tokuteiHalf: Decimal;
  kaigoFull: Decimal;
  kaigoHalf: Decimal;
  kouseiFull: Decimal;
  kouseiHalf: Decimal;
}

interface BonusCalculationResult extends CalculationResult {
  bonusAmount: Decimal;
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
  ],
  templateUrl: './insurance-premium-calculation.component.html',
  styleUrl: './insurance-premium-calculation.component.scss'
})
export class InsurancePremiumCalculationComponent implements OnInit {
  tabs = [
    { key: 'calculation', label: '保険料計算' },
    { key: 'ratio', label: '負担比率' },
    { key: 'history', label: '履歴閲覧' }
  ];
  selectedTab = this.tabs[0].key;

  // 従業員リスト
  employees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  selectedEmployeeId: string = '';
  searchText: string = '';

  // 計算結果
  calculationResult: CalculationResult = {
    healthInsurance: new Decimal(0),
    nursingInsurance: new Decimal(0),
    pensionInsurance: new Decimal(0),
    employmentInsurance: new Decimal(0),
    total: new Decimal(0),
    ippanFull: new Decimal(0),
    ippanHalf: new Decimal(0),
    tokuteiFull: new Decimal(0),
    tokuteiHalf: new Decimal(0),
    kaigoFull: new Decimal(0),
    kaigoHalf: new Decimal(0),
    kouseiFull: new Decimal(0),
    kouseiHalf: new Decimal(0)
  };

  // 賞与計算結果
  bonusCalculationResult: BonusCalculationResult = {
    healthInsurance: new Decimal(0),
    nursingInsurance: new Decimal(0),
    pensionInsurance: new Decimal(0),
    employmentInsurance: new Decimal(0),
    total: new Decimal(0),
    ippanFull: new Decimal(0),
    ippanHalf: new Decimal(0),
    tokuteiFull: new Decimal(0),
    tokuteiHalf: new Decimal(0),
    kaigoFull: new Decimal(0),
    kaigoHalf: new Decimal(0),
    kouseiFull: new Decimal(0),
    kouseiHalf: new Decimal(0),
    bonusAmount: new Decimal(0)
  };

  // 賞与額入力用
  bonusAmount: Decimal = new Decimal(0);
  isBonusCalculation: boolean = false;
  hasBonus: boolean = false;

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
  selectedGrade: string | null = null;
  selectedGradeInfo: any = null;
  avgLast3: number = 0;
  selectedEmployeeBirth: string | null = null;
  selectedEmployeeAge: number | null = null;

  // 対象月選択用のプロパティ
  selectedMonth: string = '';
  monthOptions: string[] = [];

  // 事業所（部署）リスト
  departments: Department[] = [];
  selectedDepartmentId: string = '';

  // 負担比率用
  employeePremiumSummaries: EmployeePremiumSummary[] = [];
  totalEmployeeBurden: Decimal = new Decimal(0);
  totalCompanyBurden: Decimal = new Decimal(0);
  totalBurden: Decimal = new Decimal(0);

  // 厚生年金保険料の合計を計算するプロパティ
  get totalKouseiEmployeeBurden(): Decimal {
    return this.employeePremiumSummaries.reduce((sum, summary) => 
      sum.plus(summary.kouseiEmployee), new Decimal(0));
  }

  get totalKouseiCompanyBurden(): Decimal {
    return this.employeePremiumSummaries.reduce((sum, summary) => 
      sum.plus(summary.kouseiCompany), new Decimal(0));
  }

  // 端数チェック用のメソッド
  hasFraction(value: Decimal): boolean {
    return !value.modulo(1).isZero();
  }

  // 四捨五入パターン: 'custom'（0.5以下切り捨て・0.5超切り上げ） or 'round'（0.5未満切り捨て・0.5以上切り上げ）
  roundingPattern: 'custom' | 'round' = 'custom';

  // マスタ管理用
  prefectures: Prefecture[] = [];
  selectedMasterPrefectureId: string = '';
  selectedMasterYear: string = '';

  // マスタ管理用: 取得したgradesデータ
  masterGrades: any = null;
  isLoadingMasterGrades: boolean = false;
  masterGradesError: string | null = null;

  isEditMode = false;
  editGrades: any = {};

  // 履歴閲覧タブ用
  selectedHistoryYear: string = '';
  selectedHistoryPrefectureId: string = '';
  historyPrefectureRates: any = null;
  historyPrefectureRatesError: string | null = null;

  // is_applicableの一時保存用
  public _lastInsuranceApplicable: { ippan: boolean; tokutei: boolean; kousei: boolean } = { ippan: false, tokutei: false, kousei: false };

  isBonusLoading = false;

  public editRates: {
    ippan_rate: number;
    tokutei_rate: number;
    kousei_rate: number;
    kaigo_rate: number;
  } = {
    ippan_rate: 0,
    tokutei_rate: 0,
    kousei_rate: 0,
    kaigo_rate: 0
  };

  public failedEmployees: Employee[] = [];
  public succeededEmployees: {
    name: string;
    ippanFull: number | null;
    ippanHalf: number | null;
    ippanApplicable: boolean;
    tokuteiFull: number | null;
    tokuteiHalf: number | null;
    tokuteiApplicable: boolean;
    kouseiFull: number | null;
    kouseiHalf: number | null;
    kouseiApplicable: boolean;
  }[] = [];

  public isSavingAll = false;
  public saveAllMessage = '';

  // 全従業員分の賞与計算結果表示用
  public succeededBonusEmployees: {
    name: string;
    ippanFull: number | null;
    ippanHalf: number | null;
    ippanApplicable: boolean;
    tokuteiFull: number | null;
    tokuteiHalf: number | null;
    tokuteiApplicable: boolean;
    kouseiFull: number | null;
    kouseiHalf: number | null;
    kouseiApplicable: boolean;
    bonusAmount: number;
  }[] = [];
  public failedBonusEmployees: Employee[] = [];

  public isSavingAllBonus = false;
  public saveAllBonusMessage = '';

  showOnlyFormattedDates: boolean = false;

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

    // 月選択肢の設定
    this.monthOptions = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return month.toString().padStart(2, '0');
    });
    this.selectedMonth = (now.getMonth() + 1).toString().padStart(2, '0');

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
            await this.loadDepartments();
            await this.loadEmployees();
            await this.loadEmployeePremiumSummaries();
            await this.loadPrefectures();
          }
        });
      }
    });
    this.selectedMasterYear = this.yearOptions[0];
  }

  // 事業所（部署）一覧を取得
  async loadDepartments() {
    if (!this.companyId) return;
    try {
      const departmentsCol = collection(this.firestore, 'departments');
      const q = query(departmentsCol, where('company_id', '==', this.companyId));
      const snapshot = await getDocs(q);
      this.departments = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data()['department_name'] || ''
      }));
    } catch (error) {
      console.error('Error loading departments:', error);
    }
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
      // 事業所選択時のフィルタを反映
      this.filterEmployeesByDepartment();
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  }

  // 事業所選択時の従業員フィルタ
  filterEmployeesByDepartment() {
    if (!this.selectedDepartmentId) {
      this.filteredEmployees = [...this.employees];
    } else {
      this.filteredEmployees = this.employees.filter(emp => emp['department_id'] === this.selectedDepartmentId);
    }
    // 検索テキストも反映
    this.filterEmployees();
  }

  // 事業所選択時の処理
  async onDepartmentChange() {
    this.filterEmployeesByDepartment();
    this.selectedEmployeeId = '';
    this.selectedEmployeeBirth = null;
    this.selectedEmployeeAge = null;
    this.selectedGrade = null;
    this.selectedGradeInfo = null;
    this.selectedPrefectureId = '';
    // 負担比率集計も更新
    await this.loadEmployeePremiumSummaries();
  }

  // 従業員検索
  filterEmployees() {
    let baseList = this.selectedDepartmentId
      ? this.employees.filter(emp => emp['department_id'] === this.selectedDepartmentId)
      : [...this.employees];
    if (!this.searchText) {
      this.filteredEmployees = [...baseList];
      return;
    }
    const searchLower = this.searchText.toLowerCase();
    this.filteredEmployees = baseList.filter(emp => {
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

      // 従業員情報を取得
      const employeeDoc = await getDoc(doc(this.firestore, 'employees', this.selectedEmployeeId));
      console.log('従業員データ:', employeeDoc.exists() ? employeeDoc.data() : '存在しません');
      
      this.selectedEmployeeBirth = null;
      this.selectedEmployeeAge = null;
      this.selectedGrade = null;
      this.selectedGradeInfo = null;

      if (employeeDoc.exists()) {
        const employeeData = employeeDoc.data();
        
        // 生年月日取得・年齢計算
        if (employeeData['date_of_birth']) {
          this.selectedEmployeeBirth = employeeData['date_of_birth'];
          const birth = new Date(employeeData['date_of_birth']);
          const today = new Date();
          let age = today.getFullYear() - birth.getFullYear();
          const m = today.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
          }
          this.selectedEmployeeAge = age;
        }

        // 等級情報を取得
        this.selectedGrade = employeeData['auto_grade'] || null;
        console.log('従業員の等級:', this.selectedGrade);

        // 部署情報を取得して都道府県IDを設定
        if (employeeData['department_id']) {
          const departmentDoc = await getDoc(doc(this.firestore, 'departments', employeeData['department_id']));
          console.log('部署データ:', departmentDoc.exists() ? departmentDoc.data() : '存在しません');
          if (departmentDoc.exists()) {
            const departmentData = departmentDoc.data();
            this.selectedPrefectureId = departmentData['prefecture_id'] || '';
            console.log('設定された都道府県ID:', this.selectedPrefectureId);

            // 等級情報を再取得（3月のみ次年度を参照）
            let usedYear = this.selectedYear;
            if (this.selectedMonth === '03') {
              usedYear = String(Number(this.selectedYear) + 1);
            }
            if (this.selectedGrade) {
              const gradeDoc = await getDoc(doc(this.firestore, 'prefectures', this.selectedPrefectureId, 'insurance_premiums', usedYear, 'grades', this.selectedGrade));
              if (gradeDoc.exists()) {
                this.selectedGradeInfo = gradeDoc.data();
              }
            }
          }
        }
      }

      // 賞与額を取得
      await this.loadBonusAmount();

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
    // console.log('Firestoreの都道府県ID一覧:', ids);
    // console.log('アプリ側のselectedPrefectureId: [' + this.selectedPrefectureId + ']');
  }

  // 年度と月から実際の年を計算し、ドキュメントIDを返す
  getDocIdFromYearAndMonth(selectedYear: string, selectedMonth: string): string {
    const monthNum = parseInt(selectedMonth, 10);
    let actualYear = parseInt(selectedYear, 10);
    // 1月から3月の場合は年度を1年進める
    if (monthNum >= 1 && monthNum <= 3) {
      actualYear += 1;
    }
    return `${actualYear}${selectedMonth}`;
  }

  // 判定ロジックを共通化
  private async getInsuranceApplicableFromJudgement(selectedYear: string, selectedMonth: string): Promise<{ ippan: boolean; tokutei: boolean; kousei: boolean }> {
    let healthApplicable = false;
    let nursingApplicable = false;
    let pensionApplicable = false;
    if (this.selectedEmployeeId) {
      // 1月から3月の場合は次年度のドキュメントを参照
      const monthNum = parseInt(selectedMonth, 10);
      let actualYear = parseInt(selectedYear, 10);
      if (monthNum >= 1 && monthNum <= 3) {
        actualYear += 1;
      }
      const docId = `${actualYear}-${selectedMonth}`;
      const judgementRef = doc(this.firestore, 'employees', this.selectedEmployeeId, 'insurance_judgements', docId);
      const judgementSnap = await getDoc(judgementRef);
      if (judgementSnap.exists()) {
        const data = judgementSnap.data();
        healthApplicable = data['health'] === 'in';
        nursingApplicable = data['nursing'] === 'in';
        pensionApplicable = data['pension'] === 'in';
      }
      // nursingApplicableがtrueならhealthApplicableはfalse
      if (nursingApplicable) healthApplicable = false;
    }
    return {
      ippan: healthApplicable,
      tokutei: nursingApplicable,
      kousei: pensionApplicable
    };
  }

  // 保険料計算
  async calculateInsurance() {
    this.isBonusCalculation = false;
    this.bonusCalculationResult = {
      healthInsurance: new Decimal(0),
      nursingInsurance: new Decimal(0),
      pensionInsurance: new Decimal(0),
      employmentInsurance: new Decimal(0),
      total: new Decimal(0),
      ippanFull: new Decimal(0),
      ippanHalf: new Decimal(0),
      tokuteiFull: new Decimal(0),
      tokuteiHalf: new Decimal(0),
      kaigoFull: new Decimal(0),
      kaigoHalf: new Decimal(0),
      kouseiFull: new Decimal(0),
      kouseiHalf: new Decimal(0),
      bonusAmount: new Decimal(0)
    };
    await this.printPrefectureIds();
    try {
      // 都道府県と年度の確認
      if (!this.selectedPrefectureId || !this.selectedYear) {
        alert('都道府県・年度を選択してください');
        return;
      }
      console.log('都道府県ID:', this.selectedPrefectureId);
      console.log('年度:', this.selectedYear);

      // 等級情報の確認
      if (!this.selectedGrade || !this.selectedGradeInfo) {
        alert('従業員の等級情報が取得できません');
        return;
      }

      // 等級情報を再取得（3月のみ次年度を参照）
      let usedYear = this.selectedYear;
      if (this.selectedMonth === '03') {
        usedYear = String(Number(this.selectedYear) + 1);
      }
      if (this.selectedGrade) {
        const gradeDoc = await getDoc(doc(this.firestore, 'prefectures', this.selectedPrefectureId, 'insurance_premiums', usedYear, 'grades', this.selectedGrade));
        if (gradeDoc.exists()) {
          this.selectedGradeInfo = gradeDoc.data();
        }
      }

      // --- ここから判定取得 ---
      this._lastInsuranceApplicable = await this.getInsuranceApplicableFromJudgement(this.selectedYear, this.selectedMonth);
      // --- ここまで ---

      // --- 介護保険の計算ロジック追加 ---
      let kaigoIsApplicable = false;
      let kaigoFull = new Decimal(0);
      let kaigoHalf = new Decimal(0);
      if (this.selectedGradeInfo?.tokutei && this.selectedGradeInfo?.ippan) {
        kaigoIsApplicable = true;
        // Decimal.jsを使用して計算（四捨五入前の値で計算）
        const tokuteiFull = new Decimal(this.selectedGradeInfo.tokutei.full || 0);
        const ippanFull = new Decimal(this.selectedGradeInfo.ippan.full || 0);
        kaigoFull = tokuteiFull.minus(ippanFull);
        
        const tokuteiHalf = new Decimal(this.selectedGradeInfo.tokutei.half || 0);
        const ippanHalf = new Decimal(this.selectedGradeInfo.ippan.half || 0);
        // 計算後に四捨五入を適用
        kaigoHalf = this.applyRounding(tokuteiHalf.minus(ippanHalf));
      }
      // --- ここまで ---

      // 計算結果を設定
      this.calculationResult = {
        healthInsurance: new Decimal(this.selectedGradeInfo.ippan?.full || 0),
        nursingInsurance: new Decimal(0),
        pensionInsurance: new Decimal(this.selectedGradeInfo.kousei?.full || 0),
        employmentInsurance: new Decimal(0),
        total: this.applyRounding(new Decimal(this.selectedGradeInfo.ippan?.full || 0).plus(new Decimal(this.selectedGradeInfo.kousei?.full || 0))),
        ippanFull: new Decimal(this.selectedGradeInfo.ippan?.full || 0),
        ippanHalf: this.applyRounding(new Decimal(this.selectedGradeInfo.ippan?.half || 0)),
        tokuteiFull: new Decimal(this.selectedGradeInfo.tokutei?.full || 0),
        tokuteiHalf: this.applyRounding(new Decimal(this.selectedGradeInfo.tokutei?.half || 0)),
        kaigoFull: kaigoFull,
        kaigoHalf: kaigoHalf,
        kouseiFull: new Decimal(this.selectedGradeInfo.kousei?.full || 0),
        kouseiHalf: this.applyRounding(new Decimal(this.selectedGradeInfo.kousei?.half || 0))
      };
      // premiums.tokutei.half, kaigo.halfもapplyRoundingを通す
      this.calculationResult['tokuteiHalf'] = this.applyRounding(new Decimal(this.selectedGradeInfo.tokutei?.half || 0));
      this.calculationResult['kaigoHalf'] = kaigoHalf;

    } catch (error) {
      console.error('Error calculating insurance:', error);
      alert('保険料の計算中にエラーが発生しました');
    }
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

  // 計算結果を保存
  async saveCalculationResult() {
    if (!this.selectedEmployeeId || !this.selectedGradeInfo) {
      alert('従業員と等級情報を選択してください');
      return;
    }

    try {
      // 1月から3月の場合は年度を1年進める
      const yearMonth = this.selectedYear + this.selectedMonth;

      // 計算実行時の判定結果を使用
      const healthApplicable = this._lastInsuranceApplicable.ippan;
      const nursingApplicable = this._lastInsuranceApplicable.tokutei;
      const pensionApplicable = this._lastInsuranceApplicable.kousei;

      // --- 介護保険の計算ロジック追加 ---
      let kaigoIsApplicable = false;
      let kaigoFull = new Decimal(0);
      let kaigoHalf = new Decimal(0);
      if (nursingApplicable && this.selectedGradeInfo?.tokutei && this.selectedGradeInfo?.ippan) {
        kaigoIsApplicable = true;
        // Decimal.jsを使用して計算（四捨五入前の値で計算）
        const tokuteiFull = new Decimal(this.selectedGradeInfo.tokutei.full || 0);
        const ippanFull = new Decimal(this.selectedGradeInfo.ippan.full || 0);
        kaigoFull = tokuteiFull.minus(ippanFull);
        
        const tokuteiHalf = new Decimal(this.selectedGradeInfo.tokutei.half || 0);
        const ippanHalf = new Decimal(this.selectedGradeInfo.ippan.half || 0);
        // 計算後に四捨五入を適用
        kaigoHalf = this.applyRounding(tokuteiHalf.minus(ippanHalf));
      }
      // --- ここまで ---

      const premiumData: InsurancePremium = {
        year_month: yearMonth,
        grade: this.selectedGrade || '',
        standard_salary: this.selectedGradeInfo.standardSalary || 0,
        standardSalary: this.selectedGradeInfo.standardSalary || 0,
        salaryMin: this.selectedGradeInfo.salaryMin || 0,
        salaryMax: this.selectedGradeInfo.salaryMax || 0,
        age: this.selectedEmployeeAge || 0,
        birth_date: this.selectedEmployeeBirth || '',
        premiums: {
          ippan: {
            full: new Decimal(this.selectedGradeInfo.ippan?.full || 0).toNumber(),
            half: this.applyRounding(new Decimal(this.selectedGradeInfo.ippan?.half || 0)).toNumber(),
            is_applicable: healthApplicable,
            is_initial: true
          },
          tokutei: {
            full: new Decimal(this.selectedGradeInfo.tokutei?.full || 0).toNumber(),
            half: this.applyRounding(new Decimal(this.selectedGradeInfo.tokutei?.half || 0)).toNumber(),
            is_applicable: nursingApplicable
          },
          kousei: {
            full: new Decimal(this.selectedGradeInfo.kousei?.full || 0).toNumber(),
            half: this.applyRounding(new Decimal(this.selectedGradeInfo.kousei?.half || 0)).toNumber(),
            is_applicable: pensionApplicable
          },
          kaigo: {
            full: kaigoIsApplicable ? kaigoFull.toNumber() : 0,
            half: kaigoIsApplicable ? kaigoHalf.toNumber() : 0,
            is_applicable: kaigoIsApplicable
          }
        },
        total: this.calculationResult.total.toNumber(),
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.insurancePremiumService.saveInsurancePremium(this.selectedEmployeeId, premiumData);
      alert('保険料計算結果を保存しました');
    } catch (error) {
      console.error('Error saving calculation result:', error);
      alert('保存中にエラーが発生しました');
    }
  }

  // 計算結果を取得
  async loadCalculationResult() {
    if (!this.selectedEmployeeId) return;

    try {
      const yearMonth = `${this.selectedYear}${this.selectedMonth}`;
      const savedResult = await this.insurancePremiumService.getInsurancePremium(
        this.selectedEmployeeId,
        yearMonth
      );

      if (savedResult) {
        this.selectedGrade = savedResult.grade;
        this.selectedGradeInfo = {
          standardSalary: savedResult.standard_salary,
          ippan: savedResult.premiums.ippan,
          tokutei: savedResult.premiums.tokutei,
          kousei: savedResult.premiums.kousei
        };
        this.calculationResult = {
          healthInsurance: new Decimal(savedResult.premiums.ippan.full || 0),
          nursingInsurance: new Decimal(0),
          pensionInsurance: new Decimal(savedResult.premiums.kousei.full || 0),
          employmentInsurance: new Decimal(0),
          total: new Decimal(savedResult.total || 0),
          ippanFull: new Decimal(savedResult.premiums.ippan.full || 0),
          ippanHalf: new Decimal(savedResult.premiums.ippan.half || 0),
          tokuteiFull: new Decimal(savedResult.premiums.tokutei.full || 0),
          tokuteiHalf: new Decimal(savedResult.premiums.tokutei.half || 0),
          kaigoFull: new Decimal(savedResult.premiums.kaigo.full || 0),
          kaigoHalf: new Decimal(savedResult.premiums.kaigo.half || 0),
          kouseiFull: new Decimal(savedResult.premiums.kousei.full || 0),
          kouseiHalf: new Decimal(savedResult.premiums.kousei.half || 0)
        };
      }
    } catch (error) {
      console.error('Error loading calculation result:', error);
    }
  }

  // 年度・月変更時の処理を更新
  async onYearChange() {
    await this.loadCalculationResult();
    await this.loadBonusAmount();
  }

  async onMonthChange() {
    await this.loadCalculationResult();
    await this.loadBonusAmount();
  }

  // 事業所内従業員ごとの保険料集計
  async loadEmployeePremiumSummaries() {
    if (!this.selectedDepartmentId || !this.selectedYear || !this.selectedMonth) return;
    this.employeePremiumSummaries = [];
    this.totalEmployeeBurden = new Decimal(0);
    this.totalCompanyBurden = new Decimal(0);
    this.totalBurden = new Decimal(0);

    // 対象の従業員を取得
    const targetEmployees = this.employees.filter(emp => emp.department_id === this.selectedDepartmentId);
    for (const emp of targetEmployees) {
      let ippanEmployee = new Decimal(0);
      let ippanCompany = new Decimal(0);
      let tokuteiEmployee = new Decimal(0);
      let tokuteiCompany = new Decimal(0);
      let kaigoEmployee = new Decimal(0);
      let kaigoCompany = new Decimal(0);
      let kouseiEmployee = new Decimal(0);
      let kouseiCompany = new Decimal(0);

      // 保険料データを取得
      const premiumsCol = collection(this.firestore, 'employees', emp.id, 'insurance_premiums');
      const yearMonth = this.selectedYear + this.selectedMonth;
      const formattedYearMonth = this.selectedYear + '-' + this.selectedMonth;
      
      // クエリの条件を設定
      const conditions = [];
      if (this.showOnlyFormattedDates) {
        conditions.push(where('year_month', '==', formattedYearMonth));
      } else {
        conditions.push(where('year_month', 'in', [yearMonth, formattedYearMonth]));
      }
      
      const q = query(premiumsCol, ...conditions);
      const snapshot = await getDocs(q);

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data && data['premiums']) {
          // 健康保険料（ippan）の計算
          if (data['premiums']['ippan'] && data['premiums']['ippan']['is_applicable'] === true) {
            ippanEmployee = ippanEmployee.plus(new Decimal(data['premiums']['ippan']['half'] || 0));
            ippanCompany = ippanCompany.plus(new Decimal(data['premiums']['ippan']['full'] || 0).minus(new Decimal(data['premiums']['ippan']['half'] || 0)));
          }
          // 健康保険料（2号）（tokutei）の計算
          if (data['premiums']['tokutei'] && data['premiums']['tokutei']['is_applicable'] === true) {
            tokuteiEmployee = tokuteiEmployee.plus(new Decimal(data['premiums']['tokutei']['half'] || 0));
            tokuteiCompany = tokuteiCompany.plus(new Decimal(data['premiums']['tokutei']['full'] || 0).minus(new Decimal(data['premiums']['tokutei']['half'] || 0)));
          }
          // 介護保険料（kaigo）の計算
          if (data['premiums']['kaigo'] && data['premiums']['kaigo']['is_applicable'] === true) {
            kaigoEmployee = kaigoEmployee.plus(new Decimal(data['premiums']['kaigo']['half'] || 0));
            kaigoCompany = kaigoCompany.plus(new Decimal(data['premiums']['kaigo']['full'] || 0).minus(new Decimal(data['premiums']['kaigo']['half'] || 0)));
          }
          // 厚生年金保険料（kousei）の計算
          if (data['premiums']['kousei'] && data['premiums']['kousei']['is_applicable'] === true) {
            kouseiEmployee = kouseiEmployee.plus(new Decimal(data['premiums']['kousei']['half'] || 0));
            kouseiCompany = kouseiCompany.plus(new Decimal(data['premiums']['kousei']['full'] || 0).minus(new Decimal(data['premiums']['kousei']['half'] || 0)));
          }
        }
      }

      const totalEmployee = ippanEmployee.plus(tokuteiEmployee).plus(kouseiEmployee);
      const totalCompany = ippanCompany.plus(tokuteiCompany).plus(kouseiCompany);
      const total = totalEmployee.plus(totalCompany);

      this.employeePremiumSummaries.push({
        employeeId: emp.id,
        name: `${emp.last_name_kanji}${emp.first_name_kanji}`,
        ippanEmployee,
        ippanCompany,
        tokuteiEmployee,
        tokuteiCompany,
        kaigoEmployee,
        kaigoCompany,
        kouseiEmployee,
        kouseiCompany,
        totalEmployee,
        totalCompany,
        total
      });

      this.totalEmployeeBurden = this.totalEmployeeBurden.plus(totalEmployee);
      this.totalCompanyBurden = this.totalCompanyBurden.plus(totalCompany);
      this.totalBurden = this.totalBurden.plus(total);
    }
  }

  toggleDateFormat() {
    this.showOnlyFormattedDates = !this.showOnlyFormattedDates;
    this.loadEmployeePremiumSummaries();
  }

  // 対象年月変更時の処理（負担比率タブ用）
  async onRatioDateChange() {
    await this.loadEmployeePremiumSummaries();
  }

  // 四捨五入パターン切り替え
  toggleRoundingPattern() {
    this.roundingPattern = this.roundingPattern === 'round' ? 'custom' : 'round';
  }

  // 四捨五入処理
  applyRounding(value: Decimal): Decimal {
    if (this.roundingPattern === 'round') {
      // 給与から控除する場合は四捨五入
      return value.round();
    } else {
      // 現金払いの場合は小数点以下切り上げ
      return value.ceil();
    }
  }

  // 計算結果を表示する際に整数化して返すgetter
  get displayIppanHalf(): number {
    return this.applyRounding(new Decimal(this.selectedGradeInfo?.ippan?.half || 0)).toNumber();
  }
  get displayTokuteiHalf(): number {
    return this.applyRounding(new Decimal(this.selectedGradeInfo?.tokutei?.half || 0)).toNumber();
  }
  get displayKouseiHalf(): number {
    return this.applyRounding(new Decimal(this.selectedGradeInfo?.kousei?.half || 0)).toNumber();
  }

  // 合計値の小数点以下切り捨て値と小数点有無判定用getter
  get totalCompanyBurdenFloor(): number {
    return this.totalCompanyBurden.floor().toNumber();
  }
  get totalCompanyBurdenHasFraction(): boolean {
    return !this.totalCompanyBurden.equals(this.totalCompanyBurden.floor());
  }
  get totalEmployeeBurdenFloor(): number {
    return this.totalEmployeeBurden.floor().toNumber();
  }
  get totalEmployeeBurdenHasFraction(): boolean {
    return !this.totalEmployeeBurden.equals(this.totalEmployeeBurden.floor());
  }
  get totalBurdenFloor(): number {
    return this.totalBurden.floor().toNumber();
  }
  get totalBurdenHasFraction(): boolean {
    return !this.totalBurden.equals(this.totalBurden.floor());
  }

  // 負担比率集計の保存
  async saveBurdenRatio() {
    if (!this.selectedDepartmentId) {
      alert('事業所を選択してください');
      return;
    }
    const yearMonth = `${this.selectedYear}${this.selectedMonth}`;
    const data = {
      year_month: yearMonth,
      department_id: this.selectedDepartmentId,
      // 健康保険料（従業員負担）
      health_insurance_employee_burden: this.totalEmployeeBurden.minus(this.totalKouseiEmployeeBurden).toNumber(),
      // 厚生年金保険料（従業員負担）
      pension_insurance_employee_burden: this.totalKouseiEmployeeBurden.toNumber(),
      // 健康保険料（会社負担）
      health_insurance_company_burden: this.totalCompanyBurden.minus(this.totalKouseiCompanyBurden).toNumber(),
      // 厚生年金保険料（会社負担）
      pension_insurance_company_burden: this.totalKouseiCompanyBurden.toNumber(),
      // 介護保険料（従業員負担）←追加
      kaigo_insurance_employee_burden: this.employeePremiumSummaries.reduce((sum, summary) => sum.plus(summary.kaigoEmployee), new Decimal(0)).toNumber(),
      // 介護保険料（会社負担）←追加
      kaigo_insurance_company_burden: this.employeePremiumSummaries.reduce((sum, summary) => sum.plus(summary.kaigoCompany), new Decimal(0)).toNumber(),
      // 総合計
      total_burden: this.totalBurden.toNumber()
    };
    try {
      await this.insurancePremiumService.saveDepartmentBurdenRatio(this.selectedDepartmentId, yearMonth, data);
      alert('負担比率集計を保存しました');
    } catch (error) {
      alert('保存中にエラーが発生しました');
    }
  }

  // 都道府県一覧を取得
  async loadPrefectures() {
    this.prefectures = [
      { id: '北海道' },
      { id: '青森' },
      { id: '岩手' },
      { id: '宮城' },
      { id: '秋田' },
      { id: '山形' },
      { id: '福島' },
      { id: '茨城' },
      { id: '栃木' },
      { id: '群馬' },
      { id: '埼玉' },
      { id: '千葉' },
      { id: '東京' },
      { id: '神奈川' },
      { id: '新潟' },
      { id: '富山' },
      { id: '石川' },
      { id: '福井' },
      { id: '山梨' },
      { id: '長野' },
      { id: '岐阜' },
      { id: '静岡' },
      { id: '愛知' },
      { id: '三重' },
      { id: '滋賀' },
      { id: '京都' },
      { id: '大阪' },
      { id: '兵庫' },
      { id: '奈良' },
      { id: '和歌山' },
      { id: '鳥取' },
      { id: '島根' },
      { id: '岡山' },
      { id: '広島' },
      { id: '山口' },
      { id: '徳島' },
      { id: '香川' },
      { id: '愛媛' },
      { id: '高知' },
      { id: '福岡' },
      { id: '佐賀' },
      { id: '長崎' },
      { id: '熊本' },
      { id: '大分' },
      { id: '宮崎' },
      { id: '鹿児島' },
      { id: '沖縄' }
    ];
    if (this.prefectures.length > 0 && !this.selectedMasterPrefectureId) {
      this.selectedMasterPrefectureId = this.prefectures[0].id;
    }
  }

  // 年度・都道府県選択時にデータ取得
  async onMasterSelectionChange() {
    if (!this.selectedMasterYear || !this.selectedMasterPrefectureId) {
      this.masterGrades = null;
      this.masterGradesError = null;
      return;
    }

    this.isLoadingMasterGrades = true;
    this.masterGradesError = null;

    try {
      // 料率データの取得
      const ratesRef = doc(
        this.firestore,
        `prefectures/${this.selectedMasterPrefectureId}/insurance_premiums/${this.selectedMasterYear}/rates/current`
      );
      const ratesSnap = await getDoc(ratesRef);
      
      // 等級データの取得
      const gradesRef = doc(
        this.firestore,
        `prefectures/${this.selectedMasterPrefectureId}/insurance_premiums/${this.selectedMasterYear}/grades/current`
      );
      const gradesSnap = await getDoc(gradesRef);

      if (gradesSnap.exists()) {
        this.masterGrades = gradesSnap.data();
        if (ratesSnap.exists()) {
          const ratesData = ratesSnap.data();
          this.editRates = {
            ippan_rate: ratesData['ippan_rate'] || 0,
            tokutei_rate: ratesData['tokutei_rate'] || 0,
            kousei_rate: ratesData['kousei_rate'] || 0,
            kaigo_rate: ratesData['kaigo_rate'] || 0
          };
        }
      } else {
        this.masterGradesError = 'データがありません';
      }
    } catch (error) {
      console.error('Error loading master data:', error);
      this.masterGradesError = 'データの取得に失敗しました';
    } finally {
      this.isLoadingMasterGrades = false;
    }
  }

  enableEditMode() {
    this.isEditMode = true;
    // ディープコピー
    this.editGrades = JSON.parse(JSON.stringify(this.masterGrades));
  }

  cancelEditMode() {
    this.isEditMode = false;
  }

  async saveMasterGrades() {
    if (!this.selectedMasterYear || !this.selectedMasterPrefectureId) {
      return;
    }

    try {
      // 料率データの保存
      const ratesRef = doc(
        this.firestore,
        `prefectures/${this.selectedMasterPrefectureId}/insurance_premiums/${this.selectedMasterYear}/rates/current`
      );
      await setDoc(ratesRef, {
        ippan_rate: this.editRates.ippan_rate,
        tokutei_rate: this.editRates.tokutei_rate,
        kousei_rate: this.editRates.kousei_rate,
        kaigo_rate: this.editRates.kaigo_rate,
        updated_at: new Date()
      });

      // 等級データの保存
      const gradesRef = doc(
        this.firestore,
        `prefectures/${this.selectedMasterPrefectureId}/insurance_premiums/${this.selectedMasterYear}/grades/current`
      );
      await setDoc(gradesRef, this.editGrades);

      this.isEditMode = false;
      await this.onMasterSelectionChange();
    } catch (error) {
      console.error('Error saving master data:', error);
    }
  }

  async onHistorySelectionChange() {
    if (!this.selectedHistoryYear || !this.selectedHistoryPrefectureId) {
      this.historyPrefectureRates = null;
      this.historyPrefectureRatesError = null;
      return;
    }

    try {
      this.historyPrefectureRatesError = null;
      const ratesRef = doc(
        this.firestore,
        `prefectures/${this.selectedHistoryPrefectureId}/insurance_premiums/${this.selectedHistoryYear}/rates/current`
      );
      const ratesSnap = await getDoc(ratesRef);
      
      if (ratesSnap.exists()) {
        this.historyPrefectureRates = ratesSnap.data();
      } else {
        this.historyPrefectureRatesError = 'データがありません';
      }
    } catch (error) {
      console.error('Error loading rates:', error);
      this.historyPrefectureRatesError = 'データの取得に失敗しました';
    }
  }

  get historyKaigoRate(): string | null {
    if (
      this.historyPrefectureRates &&
      this.historyPrefectureRates.tokutei_rate != null &&
      this.historyPrefectureRates.ippan_rate != null
    ) {
      const tokutei = new Decimal(this.historyPrefectureRates.tokutei_rate);
      const ippan = new Decimal(this.historyPrefectureRates.ippan_rate);
      // 小数第4位で四捨五入
      return tokutei.minus(ippan).toFixed(4);
    }
    return null;
  }

  // 賞与額を取得
  async loadBonusAmount() {
    if (!this.selectedEmployeeId || !this.selectedYear || !this.selectedMonth) {
      this.bonusAmount = new Decimal(0);
      this.hasBonus = false;
      return;
    }

    try {
      // year_monthを「2025-04」のような形式で生成
      const yearMonth = this.selectedYear + '-' + this.selectedMonth;

      const salaryCol = collection(this.firestore, 'employees', this.selectedEmployeeId, 'salaries');
      const q = query(salaryCol, where('year_month', '==', yearMonth));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.bonusAmount = new Decimal(0);
        this.hasBonus = false;
        return;
      }

      // 複数ドキュメント・複数details対応
      let totalBonus = new Decimal(0);
      snapshot.docs.forEach(docSnap => {
        const salaryData = docSnap.data();
        if (Array.isArray(salaryData['details'])) {
          salaryData['details'].forEach((detail: any) => {
            if (detail.type === 'bonus') {
              totalBonus = totalBonus.plus(new Decimal(detail.amount || 0));
            }
          });
        }
      });
      this.bonusAmount = totalBonus;
      this.hasBonus = totalBonus.gt(0);
    } catch (error) {
      console.error('Error loading bonus amount:', error);
      this.bonusAmount = new Decimal(0);
      this.hasBonus = false;
    }
  }

  // 賞与保険料計算
  async calculateBonusInsurance() {
    this.isBonusCalculation = true;
    this.isBonusLoading = true;
    this.calculationResult = {
        healthInsurance: new Decimal(0),
        nursingInsurance: new Decimal(0),
        pensionInsurance: new Decimal(0),
        employmentInsurance: new Decimal(0),
        total: new Decimal(0),
        ippanFull: new Decimal(0),
        ippanHalf: new Decimal(0),
        tokuteiFull: new Decimal(0),
        tokuteiHalf: new Decimal(0),
        kaigoFull: new Decimal(0),
        kaigoHalf: new Decimal(0),
        kouseiFull: new Decimal(0),
        kouseiHalf: new Decimal(0)
    };
    try {
        if (!this.selectedYear) {
            alert('年度を選択してください');
            this.isBonusLoading = false;
            return;
        }
        // 等級情報の確認
        if (!this.selectedGrade || !this.selectedGradeInfo) {
            alert('従業員の等級情報が取得できません');
            this.isBonusLoading = false;
            return;
        }
        // 賞与額の確認
        await this.loadBonusAmount(); // 最新の賞与額を取得
        if (!this.bonusAmount || this.bonusAmount.lte(0)) {
            alert('賞与額を入力してください');
            this.isBonusLoading = false;
            return;
        }

        // 年度内の賞与合計を取得し、上限573万円を超えた分は保険料をかけない
        const year = this.selectedYear;
        const startMonth = '04';
        const endMonth = '03';
        const yearStart = year + '-' + startMonth;
        const yearEnd = (parseInt(year, 10) + 1) + '-' + endMonth;
        const yearMonth = this.selectedYear + '-' + this.selectedMonth;
        const premiumsCol = collection(this.firestore, 'employees', this.selectedEmployeeId, 'insurance_premiums');
        const q = query(premiumsCol, where('is_bonus', '==', true));
        const snapshot = await getDocs(q);
        let totalBonus = new Decimal(0);
        snapshot.docs.forEach(doc => {
            const ym = doc.data()['year_month'];
            // 今回保存するyearMonthは除外
            if (ym !== yearMonth && ym >= yearStart && ym <= yearEnd) {
                totalBonus = totalBonus.plus(new Decimal(doc.data()['bonus_amount'] || 0));
            }
        });

        // 実際の賞与額と上限を比較
        const bonusLimit = new Decimal(5730000);
        const alreadyUsed = totalBonus;
        const available = bonusLimit.minus(alreadyUsed);
        const targetBonus = Decimal.min(this.bonusAmount, available);
        // 千円未満を切り捨て
        const flooredBonusAmount = targetBonus.div(1000).floor().mul(1000);
        console.log('賞与額（千円未満切り捨て後）:', flooredBonusAmount.toNumber());

        // 判定取得（insurance_judgementsサブコレクションからhealth, nursing, pension）
        this._lastInsuranceApplicable = await this.getInsuranceApplicableFromJudgement(this.selectedYear, this.selectedMonth);

        // 都道府県の料率を取得
        const ratesRef = doc(
            this.firestore,
            `prefectures/${this.selectedPrefectureId}/insurance_premiums/${this.selectedYear}/rates/current`
        );
        const ratesSnap = await getDoc(ratesRef);
        if (!ratesSnap.exists()) {
            alert('都道府県の料率データが取得できません');
            this.isBonusLoading = false;
            return;
        }
        const rates = ratesSnap.data();
        const ippanRate = new Decimal(rates['ippan_rate'] || 0);
        const kouseiRate = new Decimal(rates['kousei_rate'] || 0);
        const tokuteiRate = new Decimal(rates['tokutei_rate'] || 0);
        const kaigoRate = new Decimal(rates['kaigo_rate'] || 0);

        // 健康保険（一般・2号）は年度合計で573万円制限
        const ippanBonusRaw = flooredBonusAmount.mul(ippanRate);
        const tokuteiBonusRaw = flooredBonusAmount.mul(tokuteiRate);
        const ippanBonus = this.applyRounding(ippanBonusRaw);
        const tokuteiBonus = this.applyRounding(tokuteiBonusRaw);
        const ippanHalf = this.applyRounding(ippanBonus.div(2));
        const tokuteiHalf = this.applyRounding(tokuteiBonus.div(2));
        // 介護保険（2号-一般）
        const kaigoBonus = this.applyRounding(tokuteiBonus.minus(ippanBonus));
        const kaigoHalf = this.applyRounding(tokuteiHalf.minus(ippanHalf));
        // 厚生年金は各月150万円上限＋千円未満切り捨て
        const kouseiTargetBonus = new Decimal(Math.min(this.bonusAmount.toNumber(), 1500000));
        const kouseiFlooredBonus = kouseiTargetBonus.div(1000).floor().mul(1000);
        const kouseiBonusRaw = kouseiFlooredBonus.mul(kouseiRate);
        const kouseiBonus = this.applyRounding(kouseiBonusRaw);
        const kouseiHalf = this.applyRounding(kouseiBonus.div(2));
        // console.log(`厚生年金: ${kouseiFlooredBonus.toNumber()} × ${kouseiRate.toString()} = ${kouseiBonus.toNumber()}`);

        this.bonusCalculationResult = {
            healthInsurance: ippanBonus,
            nursingInsurance: kaigoBonus,
            pensionInsurance: kouseiBonus,
            employmentInsurance: new Decimal(0),
            total: ippanBonus.plus(kaigoBonus).plus(kouseiBonus),
            ippanFull: ippanBonus,
            ippanHalf: ippanHalf,
            tokuteiFull: tokuteiBonus,
            tokuteiHalf: tokuteiHalf,
            kaigoFull: kaigoBonus,
            kaigoHalf: kaigoHalf,
            kouseiFull: kouseiBonus,
            kouseiHalf: kouseiHalf,
            bonusAmount: this.bonusAmount // 実際の賞与額を表示
        };
        // console.log('賞与計算結果:', this.bonusCalculationResult);
        this.isBonusLoading = false;
    } catch (error) {
        console.error('Error calculating bonus insurance:', error);
        alert('賞与保険料の計算中にエラーが発生しました');
        this.isBonusLoading = false;
    }
}

  // 賞与年月変更時の処理
  async onBonusYearChange() {
    await this.loadBonusAmount();
  }

  async onBonusMonthChange() {
    await this.loadBonusAmount();
  }

  // 賞与計算結果の保存
  async saveBonusCalculationResult() {
    if (!this.selectedEmployeeId || !this.bonusCalculationResult) {
      alert('従業員と賞与計算結果を選択してください');
      return;
    }
    try {
      // year_monthを「2025-04」のような形式で生成
      const yearMonth = this.selectedYear + '-' + this.selectedMonth;
      // 判定を取得
      const applicable = await this.getInsuranceApplicableFromJudgement(this.selectedYear, this.selectedMonth);
      const premiumData = {
        year_month: yearMonth,
        is_bonus: true,
        bonus_amount: this.bonusCalculationResult.bonusAmount && typeof this.bonusCalculationResult.bonusAmount === 'object' && this.bonusCalculationResult.bonusAmount !== null && 'toNumber' in this.bonusCalculationResult.bonusAmount ? this.bonusCalculationResult.bonusAmount.toNumber() : this.bonusCalculationResult.bonusAmount,
        grade: this.selectedGrade || '',
        standard_salary: this.selectedGradeInfo?.standardSalary || 0,
        standardSalary: this.selectedGradeInfo?.standardSalary || 0,
        salaryMin: this.selectedGradeInfo?.salaryMin || 0,
        salaryMax: this.selectedGradeInfo?.salaryMax || 0,
        age: this.selectedEmployeeAge || 0,
        birth_date: this.selectedEmployeeBirth || '',
        premiums: {
          ippan: {
            full: this.bonusCalculationResult.ippanFull && typeof this.bonusCalculationResult.ippanFull === 'object' && this.bonusCalculationResult.ippanFull !== null && 'toNumber' in this.bonusCalculationResult.ippanFull ? this.bonusCalculationResult.ippanFull.toNumber() : this.bonusCalculationResult.ippanFull,
            half: this.bonusCalculationResult.ippanHalf && typeof this.bonusCalculationResult.ippanHalf === 'object' && this.bonusCalculationResult.ippanHalf !== null && 'toNumber' in this.bonusCalculationResult.ippanHalf ? this.bonusCalculationResult.ippanHalf.toNumber() : this.bonusCalculationResult.ippanHalf,
            is_applicable: applicable.ippan,
            is_initial: false
          },
          tokutei: {
            full: this.bonusCalculationResult.tokuteiFull && typeof this.bonusCalculationResult.tokuteiFull === 'object' && this.bonusCalculationResult.tokuteiFull !== null && 'toNumber' in this.bonusCalculationResult.tokuteiFull ? this.bonusCalculationResult.tokuteiFull.toNumber() : this.bonusCalculationResult.tokuteiFull,
            half: this.bonusCalculationResult.tokuteiHalf && typeof this.bonusCalculationResult.tokuteiHalf === 'object' && this.bonusCalculationResult.tokuteiHalf !== null && 'toNumber' in this.bonusCalculationResult.tokuteiHalf ? this.bonusCalculationResult.tokuteiHalf.toNumber() : this.bonusCalculationResult.tokuteiHalf,
            is_applicable: applicable.tokutei
          },
          kousei: {
            full: this.bonusCalculationResult.kouseiFull && typeof this.bonusCalculationResult.kouseiFull === 'object' && this.bonusCalculationResult.kouseiFull !== null && 'toNumber' in this.bonusCalculationResult.kouseiFull ? this.bonusCalculationResult.kouseiFull.toNumber() : this.bonusCalculationResult.kouseiFull,
            half: this.bonusCalculationResult.kouseiHalf && typeof this.bonusCalculationResult.kouseiHalf === 'object' && this.bonusCalculationResult.kouseiHalf !== null && 'toNumber' in this.bonusCalculationResult.kouseiHalf ? this.bonusCalculationResult.kouseiHalf.toNumber() : this.bonusCalculationResult.kouseiHalf,
            is_applicable: applicable.kousei
          },
          kaigo: {
            full: applicable.tokutei ? (this.bonusCalculationResult.kaigoFull && typeof this.bonusCalculationResult.kaigoFull === 'object' && this.bonusCalculationResult.kaigoFull !== null && 'toNumber' in this.bonusCalculationResult.kaigoFull ? this.bonusCalculationResult.kaigoFull.toNumber() : this.bonusCalculationResult.kaigoFull) : 0,
            half: applicable.tokutei ? (this.bonusCalculationResult.kaigoHalf && typeof this.bonusCalculationResult.kaigoHalf === 'object' && this.bonusCalculationResult.kaigoHalf !== null && 'toNumber' in this.bonusCalculationResult.kaigoHalf ? this.bonusCalculationResult.kaigoHalf.toNumber() : this.bonusCalculationResult.kaigoHalf) : 0,
            is_applicable: applicable.tokutei // 介護保険はtokutei（2号）と連動
          }
        },
        total: this.bonusCalculationResult.total && typeof this.bonusCalculationResult.total === 'object' && this.bonusCalculationResult.total !== null && 'toNumber' in this.bonusCalculationResult.total ? this.bonusCalculationResult.total.toNumber() : this.bonusCalculationResult.total,
        created_at: new Date(),
        updated_at: new Date()
      };
      await this.insurancePremiumService.saveInsurancePremium(this.selectedEmployeeId, premiumData);
      alert('賞与計算結果を保存しました');
    } catch (error) {
      console.error('Error saving bonus calculation result:', error);
      alert('保存中にエラーが発生しました');
    }
  }

  get displayYear(): string {
    const monthNum = parseInt(this.selectedMonth, 10);
    const yearNum = parseInt(this.selectedYear, 10);
    return (monthNum >= 1 && monthNum <= 3) ? (yearNum + 1).toString() : this.selectedYear;
  }

  /**
   * 全従業員計算ボタン押下時の処理
   */
  async onAllEmployeesCalculate() {
    this.isBonusCalculation = false;
    this.failedEmployees = [];
    this.succeededEmployees = [];
    if (!this.selectedDepartmentId) {
      alert('事業所（部署）を選択してください');
      return;
    }
    // 事業所内の従業員一覧
    const targetEmployees = this.employees.filter(emp => emp.department_id === this.selectedDepartmentId);
    for (const emp of targetEmployees) {
      try {
        const { result, applicable } = await this.calculateInsuranceForEmployee(emp);
        this.succeededEmployees.push({
          name: `${emp.last_name_kanji}${emp.first_name_kanji}`,
          ippanFull: result.ippanFull.toNumber(),
          ippanHalf: result.ippanHalf.toNumber(),
          ippanApplicable: applicable.ippan,
          tokuteiFull: applicable.tokutei ? result.tokuteiFull.toNumber() : null,
          tokuteiHalf: applicable.tokutei ? result.tokuteiHalf.toNumber() : null,
          tokuteiApplicable: applicable.tokutei,
          kouseiFull: applicable.kousei ? result.kouseiFull.toNumber() : null,
          kouseiHalf: applicable.kousei ? result.kouseiHalf.toNumber() : null,
          kouseiApplicable: applicable.kousei
        });
      } catch (e) {
        this.failedEmployees.push(emp);
      }
    }
  }

  /**
   * 全従業員分の計算結果を一括保存
   */
  async saveAllEmployeesResults() {
    if (!this.succeededEmployees || this.succeededEmployees.length === 0) return;
    this.isSavingAll = true;
    this.saveAllMessage = '';
    const failedSaves: string[] = [];
    for (const emp of this.succeededEmployees) {
      try {
        // 対象従業員を取得
        const employee = this.employees.find(e => `${e.last_name_kanji}${e.first_name_kanji}` === emp.name);
        if (!employee) throw new Error('従業員データなし');
        // ドキュメントID生成
        const docId = this.getDocIdFromYearAndMonth(this.selectedYear, this.selectedMonth);
        // Firestoreに保存
        const premiumData = {
          year_month: `${this.selectedYear}${this.selectedMonth}`,
          grade: employee.auto_grade || '',
          standard_salary: emp.ippanFull ?? 0,
          standardSalary: emp.ippanFull ?? 0,
          salaryMin: 0,
          salaryMax: 0,
          age: 0,
          birth_date: '',
          premiums: {
            ippan: {
              full: emp.ippanFull ?? 0,
              half: emp.ippanHalf ?? 0,
              is_applicable: emp.ippanApplicable,
              is_initial: true
            },
            tokutei: {
              full: emp.tokuteiFull ?? 0,
              half: emp.tokuteiHalf ?? 0,
              is_applicable: emp.tokuteiApplicable
            },
            kousei: {
              full: emp.kouseiFull ?? 0,
              half: emp.kouseiHalf ?? 0,
              is_applicable: emp.kouseiApplicable
            },
            kaigo: {
              full: emp.tokuteiApplicable ? ((emp.tokuteiFull ?? 0) - (emp.ippanFull ?? 0)) : 0,
              half: emp.tokuteiApplicable ? ((emp.tokuteiHalf ?? 0) - (emp.ippanHalf ?? 0)) : 0,
              is_applicable: emp.tokuteiApplicable
            }
          },
          total: (emp.ippanFull ?? 0) + (emp.kouseiFull ?? 0),
          created_at: new Date(),
          updated_at: new Date()
        };
        await this.insurancePremiumService.saveInsurancePremium(employee.id, premiumData);
      } catch (e) {
        failedSaves.push(emp.name);
      }
    }
    this.isSavingAll = false;
    if (failedSaves.length === 0) {
      this.saveAllMessage = '全員分の計算結果を保存しました';
    } else {
      this.saveAllMessage = `保存に失敗した従業員がいます: ${failedSaves.join(', ')}`;
    }
  }

  /**
   * 全従業員分の賞与計算結果を表示（保存はしない）
   */
  async onAllEmployeesBonusCalculate() {
    this.isBonusCalculation = true;
    this.failedBonusEmployees = [];
    this.succeededBonusEmployees = [];
    if (!this.selectedDepartmentId) {
      alert('事業所（部署）を選択してください');
      return;
    }
    // 事業所内の従業員一覧
    const targetEmployees = this.employees.filter(emp => emp.department_id === this.selectedDepartmentId);
    for (const emp of targetEmployees) {
      try {
        const { result, applicable } = await this.calculateBonusInsuranceForEmployee(emp);
        this.succeededBonusEmployees.push({
          name: `${emp.last_name_kanji}${emp.first_name_kanji}`,
          ippanFull: result.ippanFull.toNumber(),
          ippanHalf: result.ippanHalf.toNumber(),
          ippanApplicable: applicable.ippan,
          tokuteiFull: applicable.tokutei ? result.tokuteiFull.toNumber() : null,
          tokuteiHalf: applicable.tokutei ? result.tokuteiHalf.toNumber() : null,
          tokuteiApplicable: applicable.tokutei,
          kouseiFull: applicable.kousei ? result.kouseiFull.toNumber() : null,
          kouseiHalf: applicable.kousei ? result.kouseiHalf.toNumber() : null,
          kouseiApplicable: applicable.kousei,
          bonusAmount: result.bonusAmount.toNumber()
        });
      } catch (e) {
        this.failedBonusEmployees.push(emp);
      }
    }
  }

  /**
   * 全従業員分の賞与計算結果を一括保存
   */
  async saveAllEmployeesBonusResults() {
    if (!this.succeededBonusEmployees || this.succeededBonusEmployees.length === 0) return;
    this.isSavingAllBonus = true;
    this.saveAllBonusMessage = '';
    const failedSaves: string[] = [];
    for (const emp of this.succeededBonusEmployees) {
      try {
        // 対象従業員を取得
        const employee = this.employees.find(e => `${e.last_name_kanji}${e.first_name_kanji}` === emp.name);
        if (!employee) throw new Error('従業員データなし');
        // ドキュメントID生成
        const yearMonth = this.selectedYear + '-' + this.selectedMonth;
        // 判定を取得
        let applicable = { ippan: emp.ippanApplicable, tokutei: emp.tokuteiApplicable, kousei: emp.kouseiApplicable };
        // Firestoreに保存
        const premiumData = {
          year_month: yearMonth,
          is_bonus: true,
          bonus_amount: emp.bonusAmount,
          grade: employee.auto_grade || '',
          standard_salary: 0,
          standardSalary: 0,
          salaryMin: 0,
          salaryMax: 0,
          age: 0,
          birth_date: '',
          premiums: {
            ippan: {
              full: emp.ippanFull ?? 0,
              half: emp.ippanHalf ?? 0,
              is_applicable: emp.ippanApplicable,
              is_initial: false
            },
            tokutei: {
              full: emp.tokuteiFull ?? 0,
              half: emp.tokuteiHalf ?? 0,
              is_applicable: emp.tokuteiApplicable
            },
            kousei: {
              full: emp.kouseiFull ?? 0,
              half: emp.kouseiHalf ?? 0,
              is_applicable: emp.kouseiApplicable
            },
            kaigo: {
              full: emp.tokuteiApplicable ? ((emp.tokuteiFull ?? 0) - (emp.ippanFull ?? 0)) : 0,
              half: emp.tokuteiApplicable ? ((emp.tokuteiHalf ?? 0) - (emp.ippanHalf ?? 0)) : 0,
              is_applicable: emp.tokuteiApplicable
            }
          },
          total: (emp.ippanFull ?? 0) + (emp.kouseiFull ?? 0) + (emp.tokuteiFull ?? 0),
          created_at: new Date(),
          updated_at: new Date()
        };
        await this.insurancePremiumService.saveInsurancePremium(employee.id, premiumData);
      } catch (e) {
        failedSaves.push(emp.name);
      }
    }
    this.isSavingAllBonus = false;
    if (failedSaves.length === 0) {
      this.saveAllBonusMessage = '全従業員分の賞与計算結果を保存しました。';
    } else {
      this.saveAllBonusMessage = `保存できなかった従業員: ${failedSaves.join(', ')}`;
    }
  }

  // Decimal型をnumber型に変換して返す表示用getter
  get succeededEmployeesForDisplay() {
    return this.succeededEmployees;
  }

  get succeededBonusEmployeesForDisplay() {
    return this.succeededBonusEmployees;
  }

  get employeePremiumSummariesForDisplay() {
    return this.employeePremiumSummaries.map(row => ({
      ...row,
      ippanEmployee: row.ippanEmployee && typeof row.ippanEmployee !== 'number' ? row.ippanEmployee.toNumber() : row.ippanEmployee,
      ippanCompany: row.ippanCompany && typeof row.ippanCompany !== 'number' ? row.ippanCompany.toNumber() : row.ippanCompany,
      tokuteiEmployee: row.tokuteiEmployee && typeof row.tokuteiEmployee !== 'number' ? row.tokuteiEmployee.toNumber() : row.tokuteiEmployee,
      tokuteiCompany: row.tokuteiCompany && typeof row.tokuteiCompany !== 'number' ? row.tokuteiCompany.toNumber() : row.tokuteiCompany,
      kouseiEmployee: row.kouseiEmployee && typeof row.kouseiEmployee !== 'number' ? row.kouseiEmployee.toNumber() : row.kouseiEmployee,
      kouseiCompany: row.kouseiCompany && typeof row.kouseiCompany !== 'number' ? row.kouseiCompany.toNumber() : row.kouseiCompany,
      totalEmployee: row.totalEmployee && typeof row.totalEmployee !== 'number' ? row.totalEmployee.toNumber() : row.totalEmployee,
      totalCompany: row.totalCompany && typeof row.totalCompany !== 'number' ? row.totalCompany.toNumber() : row.totalCompany,
      total: row.total && typeof row.total !== 'number' ? row.total.toNumber() : row.total,
    }));
  }

  // テンプレート用: totalをnumber型で返すgetter
  get calculationResultTotalNumber(): number {
    return (typeof this.calculationResult.total === 'object' && 'toNumber' in this.calculationResult.total)
      ? this.calculationResult.total.toNumber()
      : Number(this.calculationResult.total);
  }
  get bonusCalculationResultTotalNumber(): number {
    return (typeof this.bonusCalculationResult.total === 'object' && 'toNumber' in this.bonusCalculationResult.total)
      ? this.bonusCalculationResult.total.toNumber()
      : Number(this.bonusCalculationResult.total);
  }

  // テンプレート用: 各保険料値をnumber型で返すgetter
  get calculationResultForDisplay() {
    return {
      ...this.calculationResult,
      ippanFull: (typeof this.calculationResult.ippanFull === 'object' && 'toNumber' in this.calculationResult.ippanFull) ? this.calculationResult.ippanFull.toNumber() : Number(this.calculationResult.ippanFull),
      ippanHalf: (typeof this.calculationResult.ippanHalf === 'object' && 'toNumber' in this.calculationResult.ippanHalf) ? this.calculationResult.ippanHalf.toNumber() : Number(this.calculationResult.ippanHalf),
      tokuteiHalf: (typeof this.calculationResult.tokuteiHalf === 'object' && 'toNumber' in this.calculationResult.tokuteiHalf) ? this.calculationResult.tokuteiHalf.toNumber() : Number(this.calculationResult.tokuteiHalf),
      tokuteiFull: (typeof this.calculationResult.tokuteiFull === 'object' && 'toNumber' in this.calculationResult.tokuteiFull) ? this.calculationResult.tokuteiFull.toNumber() : Number(this.calculationResult.tokuteiFull),
      kaigoHalf: (typeof this.calculationResult.kaigoHalf === 'object' && 'toNumber' in this.calculationResult.kaigoHalf) ? this.calculationResult.kaigoHalf.toNumber() : Number(this.calculationResult.kaigoHalf),
      kaigoFull: (typeof this.calculationResult.kaigoFull === 'object' && 'toNumber' in this.calculationResult.kaigoFull) ? this.calculationResult.kaigoFull.toNumber() : Number(this.calculationResult.kaigoFull),
      kouseiFull: (typeof this.calculationResult.kouseiFull === 'object' && 'toNumber' in this.calculationResult.kouseiFull) ? this.calculationResult.kouseiFull.toNumber() : Number(this.calculationResult.kouseiFull),
      kouseiHalf: (typeof this.calculationResult.kouseiHalf === 'object' && 'toNumber' in this.calculationResult.kouseiHalf) ? this.calculationResult.kouseiHalf.toNumber() : Number(this.calculationResult.kouseiHalf)
    };
  }
  get bonusCalculationResultForDisplay() {
    return {
      ...this.bonusCalculationResult,
      ippanFull: (typeof this.bonusCalculationResult.ippanFull === 'object' && 'toNumber' in this.bonusCalculationResult.ippanFull) ? this.bonusCalculationResult.ippanFull.toNumber() : Number(this.bonusCalculationResult.ippanFull),
      ippanHalf: (typeof this.bonusCalculationResult.ippanHalf === 'object' && 'toNumber' in this.bonusCalculationResult.ippanHalf) ? this.bonusCalculationResult.ippanHalf.toNumber() : Number(this.bonusCalculationResult.ippanHalf),
      tokuteiFull: (typeof this.bonusCalculationResult.tokuteiFull === 'object' && 'toNumber' in this.bonusCalculationResult.tokuteiFull) ? this.bonusCalculationResult.tokuteiFull.toNumber() : Number(this.bonusCalculationResult.tokuteiFull),
      tokuteiHalf: (typeof this.bonusCalculationResult.tokuteiHalf === 'object' && 'toNumber' in this.bonusCalculationResult.tokuteiHalf) ? this.bonusCalculationResult.tokuteiHalf.toNumber() : Number(this.bonusCalculationResult.tokuteiHalf),
      kaigoFull: (typeof this.bonusCalculationResult.kaigoFull === 'object' && 'toNumber' in this.bonusCalculationResult.kaigoFull) ? this.bonusCalculationResult.kaigoFull.toNumber() : Number(this.bonusCalculationResult.kaigoFull),
      kaigoHalf: (typeof this.bonusCalculationResult.kaigoHalf === 'object' && 'toNumber' in this.bonusCalculationResult.kaigoHalf) ? this.bonusCalculationResult.kaigoHalf.toNumber() : Number(this.bonusCalculationResult.kaigoHalf),
      kouseiFull: (typeof this.bonusCalculationResult.kouseiFull === 'object' && 'toNumber' in this.bonusCalculationResult.kouseiFull) ? this.bonusCalculationResult.kouseiFull.toNumber() : Number(this.bonusCalculationResult.kouseiFull),
      kouseiHalf: (typeof this.bonusCalculationResult.kouseiHalf === 'object' && 'toNumber' in this.bonusCalculationResult.kouseiHalf) ? this.bonusCalculationResult.kouseiHalf.toNumber() : Number(this.bonusCalculationResult.kouseiHalf)
    };
  }

  getDisplayValue(value: any): number {
    if (value && typeof value === 'object' && 'toNumber' in value) {
      return value.toNumber();
    }
    return value;
  }

  // 1人分の保険料計算ロジックを共通化
  async calculateInsuranceForEmployee(employee: Employee): Promise<{ result: CalculationResult, applicable: { ippan: boolean; tokutei: boolean; kousei: boolean } }> {
    // 等級情報取得
    const grade = employee['auto_grade'] || null;
    if (!grade || !employee.department_id) throw new Error('等級情報または部署IDなし');
    // 部署情報から都道府県ID取得
    const departmentDoc = await getDoc(doc(this.firestore, 'departments', employee.department_id));
    if (!departmentDoc.exists()) throw new Error('部署データなし');
    const departmentData = departmentDoc.data();
    const prefectureId = departmentData['prefecture_id'] || '';
    if (!prefectureId) throw new Error('都道府県IDなし');
    // 等級データ取得
    const gradeDoc = await getDoc(doc(this.firestore, 'prefectures', prefectureId, 'insurance_premiums', this.selectedYear, 'grades', grade));
    if (!gradeDoc.exists()) throw new Error('等級データなし');
    const gradeInfo = gradeDoc.data();
    // 判定取得
    let ippanApplicable = false;
    let tokuteiApplicable = false;
    let kouseiApplicable = false;
    try {
      const monthNum = parseInt(this.selectedMonth, 10);
      let actualYear = parseInt(this.selectedYear, 10);
      if (monthNum >= 1 && monthNum <= 3) actualYear += 1;
      const docId = `${actualYear}-${this.selectedMonth}`;
      const judgementRef = doc(this.firestore, 'employees', employee.id, 'insurance_judgements', docId);
      const judgementSnap = await getDoc(judgementRef);
      if (judgementSnap.exists()) {
        const data = judgementSnap.data();
        ippanApplicable = data['health'] === 'in';
        tokuteiApplicable = data['nursing'] === 'in';
        kouseiApplicable = data['pension'] === 'in';
        if (tokuteiApplicable) ippanApplicable = false;
      }
    } catch {}
    // 介護保険
    let kaigoFull = new Decimal(0);
    let kaigoHalf = new Decimal(0);
    if (gradeInfo && gradeInfo['tokutei'] && gradeInfo['ippan']) {
      const tokuteiFull = new Decimal(gradeInfo['tokutei'].full || 0);
      const ippanFull = new Decimal(gradeInfo['ippan'].full || 0);
      kaigoFull = tokuteiFull.minus(ippanFull);
      const tokuteiHalf = new Decimal(gradeInfo['tokutei'].half || 0);
      const ippanHalf = new Decimal(gradeInfo['ippan'].half || 0);
      kaigoHalf = this.applyRounding(tokuteiHalf.minus(ippanHalf));
    }
    // 計算結果
    const result: CalculationResult = {
      healthInsurance: new Decimal(gradeInfo['ippan']?.full || 0),
      nursingInsurance: new Decimal(0),
      pensionInsurance: new Decimal(gradeInfo['kousei']?.full || 0),
      employmentInsurance: new Decimal(0),
      total: this.applyRounding(new Decimal(gradeInfo['ippan']?.full || 0).plus(new Decimal(gradeInfo['kousei']?.full || 0))),
      ippanFull: new Decimal(gradeInfo['ippan']?.full || 0),
      ippanHalf: this.applyRounding(new Decimal(gradeInfo['ippan']?.half || 0)),
      tokuteiFull: new Decimal(gradeInfo['tokutei']?.full || 0),
      tokuteiHalf: this.applyRounding(new Decimal(gradeInfo['tokutei']?.half || 0)),
      kaigoFull: kaigoFull,
      kaigoHalf: kaigoHalf,
      kouseiFull: new Decimal(gradeInfo['kousei']?.full || 0),
      kouseiHalf: this.applyRounding(new Decimal(gradeInfo['kousei']?.half || 0))
    };
    return { result, applicable: { ippan: ippanApplicable, tokutei: tokuteiApplicable, kousei: kouseiApplicable } };
  }

  // 1人分の賞与計算ロジックを共通化
  async calculateBonusInsuranceForEmployee(employee: Employee): Promise<{ result: BonusCalculationResult, applicable: { ippan: boolean; tokutei: boolean; kousei: boolean } }> {
    // 等級情報取得
    const grade = employee['auto_grade'] || null;
    if (!grade || !employee.department_id) throw new Error('等級情報または部署IDなし');
    // 部署情報から都道府県ID取得
    const departmentDoc = await getDoc(doc(this.firestore, 'departments', employee.department_id));
    if (!departmentDoc.exists()) throw new Error('部署データなし');
    const departmentData = departmentDoc.data();
    const prefectureId = departmentData['prefecture_id'] || '';
    if (!prefectureId) throw new Error('都道府県IDなし');
    // 等級データ取得
    const gradeDoc = await getDoc(doc(this.firestore, 'prefectures', prefectureId, 'insurance_premiums', this.selectedYear, 'grades', grade));
    if (!gradeDoc.exists()) throw new Error('等級データなし');
    const gradeInfo = gradeDoc.data();
    // 賞与額取得
    let bonusAmount = new Decimal(0);
    const yearMonth = this.selectedYear + '-' + this.selectedMonth;
    const salaryCol = collection(this.firestore, 'employees', employee.id, 'salaries');
    const q = query(salaryCol, where('year_month', '==', yearMonth));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        snapshot.docs.forEach((docSnap) => {
            const salaryData = docSnap.data();
            if (Array.isArray(salaryData['details'])) {
                salaryData['details'].forEach((detail: any) => {
                    if (detail.type === 'bonus') {
                        bonusAmount = bonusAmount.plus(new Decimal(detail.amount || 0));
                    }
                });
            }
        });
    }
    if (!bonusAmount || bonusAmount.lte(0)) throw new Error('賞与額なし');

    // 年度内の賞与合計を取得し、上限573万円を超えた分は保険料をかけない
    const year = this.selectedYear;
    const startMonth = '04';
    const endMonth = '03';
    const yearStart = year + '-' + startMonth;
    const yearEnd = (parseInt(year, 10) + 1) + '-' + endMonth;
    const premiumsCol = collection(this.firestore, 'employees', employee.id, 'insurance_premiums');
    const bonusQ = query(premiumsCol, where('is_bonus', '==', true));
    const bonusSnap = await getDocs(bonusQ);
    let totalBonus = new Decimal(0);
    bonusSnap.docs.forEach(doc => {
        const ym = doc.data()['year_month'];
        if (ym !== yearMonth && ym >= yearStart && ym <= yearEnd) {
            totalBonus = totalBonus.plus(new Decimal(doc.data()['bonus_amount'] || 0));
        }
    });

    // 実際の賞与額と上限を比較
    const bonusLimit = new Decimal(5730000);
    const alreadyUsed = totalBonus;
    const available = bonusLimit.minus(alreadyUsed);
    const targetBonus = Decimal.min(bonusAmount, available);
    // 千円未満を切り捨て
    const flooredBonusAmount = targetBonus.div(1000).floor().mul(1000);

    // 判定取得
    let ippanApplicable = false;
    let tokuteiApplicable = false;
    let kouseiApplicable = false;
    try {
      const monthNum = parseInt(this.selectedMonth, 10);
      let actualYear = parseInt(this.selectedYear, 10);
      if (monthNum >= 1 && monthNum <= 3) actualYear += 1;
      const docId = `${actualYear}-${this.selectedMonth}`;
      const judgementRef = doc(this.firestore, 'employees', employee.id, 'insurance_judgements', docId);
      const judgementSnap = await getDoc(judgementRef);
      if (judgementSnap.exists()) {
        const data = judgementSnap.data();
        ippanApplicable = data['health'] === 'in';
        tokuteiApplicable = data['nursing'] === 'in';
        kouseiApplicable = data['pension'] === 'in';
        if (tokuteiApplicable) ippanApplicable = false;
      }
    } catch {}
    // 料率取得
    const ratesRef = doc(
      this.firestore,
      `prefectures/${prefectureId}/insurance_premiums/${this.selectedYear}/rates/current`
    );
    const ratesSnap = await getDoc(ratesRef);
    if (!ratesSnap.exists()) throw new Error('料率データなし');
    const rates = ratesSnap.data();
    const ippanRate = new Decimal(rates['ippan_rate'] || 0);
    const kouseiRate = new Decimal(rates['kousei_rate'] || 0);
    const tokuteiRate = new Decimal(rates['tokutei_rate'] || 0);
    // 健康保険（一般・2号）は年度合計で573万円制限
    const ippanBonusRaw = flooredBonusAmount.mul(ippanRate);
    const tokuteiBonusRaw = flooredBonusAmount.mul(tokuteiRate);
    const ippanBonus = this.applyRounding(ippanBonusRaw);
    const tokuteiBonus = this.applyRounding(tokuteiBonusRaw);
    const ippanHalf = this.applyRounding(ippanBonus.div(2));
    const tokuteiHalf = this.applyRounding(tokuteiBonus.div(2));
    // 介護保険（2号-一般）
    const kaigoBonus = this.applyRounding(tokuteiBonus.minus(ippanBonus));
    const kaigoHalf = this.applyRounding(tokuteiHalf.minus(ippanHalf));
    // 厚生年金は各月150万円上限＋千円未満切り捨て
    const kouseiTargetBonus = new Decimal(Math.min(bonusAmount.toNumber(), 1500000));
    const kouseiFlooredBonus = kouseiTargetBonus.div(1000).floor().mul(1000);
    const kouseiBonusRaw = kouseiFlooredBonus.mul(kouseiRate);
    const kouseiBonus = this.applyRounding(kouseiBonusRaw);
    const kouseiHalf = this.applyRounding(kouseiBonus.div(2));
    const result: BonusCalculationResult = {
      healthInsurance: ippanBonus,
      nursingInsurance: kaigoBonus,
      pensionInsurance: kouseiBonus,
      employmentInsurance: new Decimal(0),
      total: ippanBonus.plus(kaigoBonus).plus(kouseiBonus),
      ippanFull: ippanBonus,
      ippanHalf: ippanHalf,
      tokuteiFull: tokuteiBonus,
      tokuteiHalf: tokuteiHalf,
      kaigoFull: kaigoBonus,
      kaigoHalf: kaigoHalf,
      kouseiFull: kouseiBonus,
      kouseiHalf: kouseiHalf,
      bonusAmount: bonusAmount // 実際の賞与額を表示
    };
    return { result, applicable: { ippan: ippanApplicable, tokutei: tokuteiApplicable, kousei: kouseiApplicable } };
  }
}
