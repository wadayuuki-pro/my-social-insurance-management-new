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
  ippanEmployee: number;
  ippanCompany: number;
  tokuteiEmployee: number;
  tokuteiCompany: number;
  kouseiEmployee: number;
  kouseiCompany: number;
  totalEmployee: number;
  totalCompany: number;
  total: number;
}

// 都道府県の型
interface Prefecture {
  id: string;
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

  // 賞与計算結果
  bonusCalculationResult = {
    healthInsurance: 0,
    nursingInsurance: 0,
    pensionInsurance: 0,
    employmentInsurance: 0,
    total: 0,
    ippanFull: 0,
    ippanHalf: 0
  };

  // 賞与額入力用
  bonusAmount: number = 0;
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
  totalEmployeeBurden: number = 0;
  totalCompanyBurden: number = 0;
  totalBurden: number = 0;

  // 四捨五入パターン: 'round'（標準） or 'custom'（0.5未満切り捨て、0.5以上切り上げ）
  roundingPattern: 'round' | 'custom' = 'round';

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

            // 等級情報を取得
            if (this.selectedGrade && this.selectedPrefectureId && this.selectedYear) {
              const gradeDoc = await getDoc(doc(this.firestore, 'prefectures', this.selectedPrefectureId, 'insurance_premiums', this.selectedYear, 'grades', this.selectedGrade));
              if (gradeDoc.exists()) {
                this.selectedGradeInfo = gradeDoc.data();
                console.log('取得した等級情報:', this.selectedGradeInfo);
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
    console.log('Firestoreの都道府県ID一覧:', ids);
    console.log('アプリ側のselectedPrefectureId: [' + this.selectedPrefectureId + ']');
  }

  // 保険料計算
  async calculateInsurance() {
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

      // 計算結果を設定
      this.calculationResult = {
        healthInsurance: this.selectedGradeInfo.ippan?.full || 0,
        nursingInsurance: 0,
        pensionInsurance: this.selectedGradeInfo.kousei?.full || 0,
        employmentInsurance: 0,
        total: (this.selectedGradeInfo.ippan?.full || 0) + (this.selectedGradeInfo.kousei?.full || 0),
        ippanFull: this.selectedGradeInfo.ippan?.full || 0,
        ippanHalf: this.selectedGradeInfo.ippan?.half || 0
      };

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

  // 40歳の誕生月の翌月から65歳の誕生月までかどうか判定
  isNursingInsurancePeriod(): boolean {
    if (!this.selectedEmployeeBirth) return false;
    const birth = new Date(this.selectedEmployeeBirth);
    const now = new Date();
    // 40歳の誕生月の翌月1日
    const start = new Date(birth.getFullYear() + 40, birth.getMonth() + 1, 1);
    // 65歳の誕生月の月末
    const end = new Date(birth.getFullYear() + 65, birth.getMonth() + 1, 0);
    // 今月1日
    const nowMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return nowMonth >= start && nowMonth <= end;
  }

  // 計算結果を保存
  async saveCalculationResult() {
    if (!this.selectedEmployeeId || !this.selectedGradeInfo) {
      alert('従業員と等級情報を選択してください');
      return;
    }

    try {
      // 1月から3月の場合は年度を1年進める
      const yearMonth = this.adjustYearForBonus(this.selectedYear, this.selectedMonth);
      const isNursingPeriod = this.isNursingInsurancePeriod();

      // 介護保険料の計算（Decimal.jsを使用）
      let kaigoFull = 0;
      let kaigoHalf = 0;
      if (isNursingPeriod) {
        const tokuteiFull = new Decimal(this.selectedGradeInfo.tokutei?.full || 0);
        const tokuteiHalf = new Decimal(this.selectedGradeInfo.tokutei?.half || 0);
        const ippanFull = new Decimal(this.selectedGradeInfo.ippan?.full || 0);
        const ippanHalf = new Decimal(this.selectedGradeInfo.ippan?.half || 0);
        kaigoFull = tokuteiFull.minus(ippanFull).toNumber();
        kaigoHalf = tokuteiHalf.minus(ippanHalf).toNumber();
      }

      const premiumData: InsurancePremium = {
        year_month: yearMonth,
        grade: this.selectedGrade || '',
        standard_salary: this.selectedGradeInfo.standardSalary || 0,
        standardSalary: this.selectedGradeInfo.standardSalary || 0,
        salaryMin: this.selectedGradeInfo.salaryMin || 0,
        salaryMax: this.selectedGradeInfo.salaryMax || 0,
        age: this.selectedEmployeeAge || 0,
        is_nursing_insurance_period: isNursingPeriod,
        birth_date: this.selectedEmployeeBirth || '',
        premiums: {
          ippan: {
            full: this.selectedGradeInfo.ippan?.full || 0,
            half: this.applyRounding(this.selectedGradeInfo.ippan?.half || 0),
            is_applicable: !isNursingPeriod,
            is_initial: true
          },
          tokutei: {
            full: this.selectedGradeInfo.tokutei?.full || 0,
            half: this.applyRounding(this.selectedGradeInfo.tokutei?.half || 0),
            is_applicable: isNursingPeriod
          },
          kousei: {
            full: this.selectedGradeInfo.kousei?.full || 0,
            half: this.applyRounding(this.selectedGradeInfo.kousei?.half || 0),
            is_applicable: true
          },
          kaigo: {
            full: kaigoFull,
            half: this.applyRounding(kaigoHalf),
            is_applicable: isNursingPeriod
          }
        },
        total: this.calculationResult.total,
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
          healthInsurance: savedResult.premiums.ippan.full,
          nursingInsurance: 0,
          pensionInsurance: savedResult.premiums.kousei.full,
          employmentInsurance: 0,
          total: savedResult.total,
          ippanFull: savedResult.premiums.ippan.full,
          ippanHalf: savedResult.premiums.ippan.half
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
    this.employeePremiumSummaries = [];
    this.totalEmployeeBurden = 0;
    this.totalCompanyBurden = 0;
    this.totalBurden = 0;
    // 対象従業員リスト
    const targetEmployees = this.selectedDepartmentId
      ? this.employees.filter(emp => emp.department_id === this.selectedDepartmentId)
      : [...this.employees];
    for (const emp of targetEmployees) {
      // insurance_premiumsサブコレクション取得
      const premiumsCol = collection(this.firestore, 'employees', emp.id, 'insurance_premiums');
      const snapshot = await getDocs(premiumsCol);
      // 合計値を計算
      let ippanEmployee = 0, ippanCompany = 0;
      let tokuteiEmployee = 0, tokuteiCompany = 0;
      let kouseiEmployee = 0, kouseiCompany = 0;
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data && data['premiums']) {
          // 健康保険料（ippan）の計算
          if (data['premiums']['ippan'] && data['premiums']['ippan']['is_applicable'] === true) {
            ippanEmployee += data['premiums']['ippan']['half'] || 0;
            ippanCompany += (data['premiums']['ippan']['full'] || 0) - (data['premiums']['ippan']['half'] || 0);
          }
          // 健康保険料（2号）（tokutei）の計算
          if (data['premiums']['tokutei'] && data['premiums']['tokutei']['is_applicable'] === true) {
            tokuteiEmployee += data['premiums']['tokutei']['half'] || 0;
            tokuteiCompany += (data['premiums']['tokutei']['full'] || 0) - (data['premiums']['tokutei']['half'] || 0);
          }
          // 厚生年金保険料（kousei）の計算
          if (data['premiums']['kousei'] && data['premiums']['kousei']['is_applicable'] === true) {
            kouseiEmployee += data['premiums']['kousei']['half'] || 0;
            kouseiCompany += (data['premiums']['kousei']['full'] || 0) - (data['premiums']['kousei']['half'] || 0);
          }
        }
      }
      const totalEmployee = ippanEmployee + tokuteiEmployee + kouseiEmployee;
      const totalCompany = ippanCompany + tokuteiCompany + kouseiCompany;
      const total = totalEmployee + totalCompany;
      this.employeePremiumSummaries.push({
        employeeId: emp.id,
        name: `${emp.last_name_kanji}${emp.first_name_kanji}`,
        ippanEmployee,
        ippanCompany,
        tokuteiEmployee,
        tokuteiCompany,
        kouseiEmployee,
        kouseiCompany,
        totalEmployee,
        totalCompany,
        total
      });
      this.totalEmployeeBurden += totalEmployee;
      this.totalCompanyBurden += totalCompany;
      this.totalBurden += total;
    }
  }

  // パターン切替
  toggleRoundingPattern() {
    this.roundingPattern = this.roundingPattern === 'round' ? 'custom' : 'round';
  }

  // パターンに応じた整数化関数
  applyRounding(value: number): number {
    if (this.roundingPattern === 'round') {
      return Math.round(value);
    } else {
      return Math.floor(value + 0.5);
    }
  }

  // 計算結果を表示する際に整数化して返すgetter
  get displayIppanHalf(): number {
    return this.applyRounding(this.selectedGradeInfo?.ippan?.half || 0);
  }
  get displayTokuteiHalf(): number {
    return this.applyRounding(this.selectedGradeInfo?.tokutei?.half || 0);
  }
  get displayKouseiHalf(): number {
    return this.applyRounding(this.selectedGradeInfo?.kousei?.half || 0);
  }

  // 合計値の小数点以下切り捨て値と小数点有無判定用getter
  get totalCompanyBurdenFloor(): number {
    return Math.floor(this.totalCompanyBurden);
  }
  get totalCompanyBurdenHasFraction(): boolean {
    return this.totalCompanyBurden !== Math.floor(this.totalCompanyBurden);
  }
  get totalEmployeeBurdenFloor(): number {
    return Math.floor(this.totalEmployeeBurden);
  }
  get totalEmployeeBurdenHasFraction(): boolean {
    return this.totalEmployeeBurden !== Math.floor(this.totalEmployeeBurden);
  }
  get totalBurdenFloor(): number {
    return Math.floor(this.totalBurden);
  }
  get totalBurdenHasFraction(): boolean {
    return this.totalBurden !== Math.floor(this.totalBurden);
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
      total_employee_burden: this.totalEmployeeBurden,
      total_company_burden: this.totalCompanyBurden,
      total_burden: this.totalBurden
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
    if (!this.selectedMasterPrefectureId || !this.selectedMasterYear) {
      this.masterGrades = null;
      return;
    }
    this.isLoadingMasterGrades = true;
    this.masterGradesError = null;
    try {
      const gradesCol = collection(this.firestore, 'prefectures', this.selectedMasterPrefectureId, 'insurance_premiums', this.selectedMasterYear, 'grades');
      const snapshot = await getDocs(gradesCol);
      if (snapshot.empty) {
        this.masterGrades = null;
        this.masterGradesError = 'データがありません';
      } else {
        this.masterGrades = {};
        snapshot.docs.forEach(doc => {
          this.masterGrades[doc.id] = doc.data();
        });
      }
    } catch (error) {
      this.masterGrades = null;
      this.masterGradesError = 'データ取得エラー';
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
    if (!this.selectedMasterPrefectureId || !this.selectedMasterYear) return;
    try {
      const gradesCol = collection(this.firestore, 'prefectures', this.selectedMasterPrefectureId, 'insurance_premiums', this.selectedMasterYear, 'grades');
      for (const [gradeId, gradeData] of Object.entries(this.editGrades)) {
        const gradeDoc = doc(gradesCol, gradeId);
        await setDoc(gradeDoc, gradeData);
      }
      this.isEditMode = false;
      // 保存後、再取得してmasterGradesを更新
      await this.onMasterSelectionChange();
      alert('保険料表を保存しました');
    } catch (error: any) {
      alert('保存中にエラーが発生しました');
    }
  }

  async onHistorySelectionChange() {
    this.historyPrefectureRates = null;
    this.historyPrefectureRatesError = null;
    if (!this.selectedHistoryPrefectureId) return;
    try {
      const prefectureDocRef = doc(this.firestore, 'prefectures', this.selectedHistoryPrefectureId);
      const prefectureDoc = await getDoc(prefectureDocRef);
      if (prefectureDoc.exists()) {
        this.historyPrefectureRates = prefectureDoc.data();
      } else {
        this.historyPrefectureRatesError = 'データがありません';
      }
    } catch (e) {
      this.historyPrefectureRatesError = '取得エラー';
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
      this.bonusAmount = 0;
      this.hasBonus = false;
      return;
    }

    try {
      // 賞与計算の場合は年度を調整
      const yearMonth = this.isBonusCalculation ? 
        this.adjustYearForBonus(this.selectedYear, this.selectedMonth) :
        `${this.selectedYear}${this.selectedMonth}`;

      const salaryCol = collection(this.firestore, 'employees', this.selectedEmployeeId, 'salaries');
      const q = query(salaryCol, where('year_month', '==', yearMonth));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.bonusAmount = 0;
        this.hasBonus = false;
        return;
      }

      const salaryData = snapshot.docs[0].data();
      const bonusDetail = salaryData['details']?.find((detail: any) => detail.type === '賞与');
      
      if (bonusDetail) {
        this.bonusAmount = bonusDetail.amount || 0;
        this.hasBonus = true;
      } else {
        this.bonusAmount = 0;
        this.hasBonus = false;
      }
    } catch (error) {
      console.error('Error loading bonus amount:', error);
      this.bonusAmount = 0;
      this.hasBonus = false;
    }
  }

  // 賞与計算時の年度調整メソッド
  private adjustYearForBonus(year: string, month: string): string {
    // 1月から3月の場合は年度を1年進める
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 3) {
      return `${parseInt(year, 10) + 1}${month}`;
    }
    return `${year}${month}`;
  }

  // 賞与保険料計算
  async calculateBonusInsurance() {
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

      // 賞与額の確認
      if (!this.bonusAmount || this.bonusAmount <= 0) {
        alert('賞与額を入力してください');
        return;
      }

      // 賞与額を標準報酬月額の範囲内に収める
      const standardSalary = this.selectedGradeInfo.standardSalary || 0;
      const cappedBonus = Math.min(Math.max(this.bonusAmount, standardSalary * 0.5), standardSalary * 6);

      // 計算結果を設定
      this.bonusCalculationResult = {
        healthInsurance: this.selectedGradeInfo.ippan?.full || 0,
        nursingInsurance: 0,
        pensionInsurance: this.selectedGradeInfo.kousei?.full || 0,
        employmentInsurance: 0,
        total: (this.selectedGradeInfo.ippan?.full || 0) + (this.selectedGradeInfo.kousei?.full || 0),
        ippanFull: this.selectedGradeInfo.ippan?.full || 0,
        ippanHalf: this.selectedGradeInfo.ippan?.half || 0
      };

      this.isBonusCalculation = true;
      // 賞与額を再取得（年度調整後）
      await this.loadBonusAmount();

    } catch (error) {
      console.error('Error calculating bonus insurance:', error);
      alert('賞与保険料の計算中にエラーが発生しました');
    }
  }

  // 賞与年月変更時の処理
  async onBonusYearChange() {
    await this.loadBonusAmount();
  }

  async onBonusMonthChange() {
    await this.loadBonusAmount();
  }
}
