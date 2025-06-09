import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, addDoc, doc, getDocs, query, orderBy, updateDoc, where, deleteDoc, getDoc } from '@angular/fire/firestore';
import { inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { InsurancePremiumService } from '../shared/services/insurance-premium.service';
import { PrefecturePremiums } from '../shared/interfaces/insurance-premium.interface';
import { InsurancePremium } from '../shared/interfaces/insurance-premium.interface';
import { saveAs } from 'file-saver';
import { Auth } from '@angular/fire/auth';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

interface SalaryDetail {
  type: string;
  amount: number;
  note: string;
}

interface CustomAllowance {
  id: string;
  company_id: string;
  value: string;
  label: string;
  created_at: Date;
  updated_at: Date;
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

interface SalarySummary {
  employeeId: string;
  name: string;
  avgLast3: number;
  avgPrev3: number;
  diffRate: number;
  result: string;
  gradeLast3: string | null;
  gradePrev3: string | null;
}

@Component({
  selector: 'app-payroll-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './payroll-management.component.html',
  styleUrls: ['./payroll-management.component.scss']
})
export class PayrollManagementComponent implements OnInit {
  activeTab: string = 'salary';
  employees: any[] = [];
  filteredEmployees: any[] = [];
  selectedEmployeeId: string = '';
  searchText: string = '';

  // 明細管理用
  salaryDetails: SalaryDetail[] = [];
  totalAmount: number = 0;
  taxableAmount: number = 0;
  socialInsuranceDeduction: number = 0;

  // 基本手当区分
  baseSalaryTypes = [
    { value: 'base', label: '基本給' },
    { value: 'overtime', label: '残業手当' },
    { value: 'commuting', label: '通勤手当' },
    { value: 'family', label: '家族手当' },
    { value: 'housing', label: '住宅手当' },
    { value: 'bonus', label: '賞与' }
  ];

  // カスタム手当区分
  customAllowances: CustomAllowance[] = [];
  
  // 手当区分の選択肢（基本 + カスタム）
  get salaryTypes() {
    return [
      ...this.baseSalaryTypes,
      ...this.customAllowances.map(a => ({ value: a.value, label: a.label }))
  ];
  }

  // 登録済み給与明細
  registeredSalaries: RegisteredSalary[] = [];

  // 報酬月額変更自動判定用
  autoJudgeSalaries: RegisteredSalary[] = [];
  autoJudgeAlert: string = '';

  // 判定に使う期間の表示用
  judgePeriodLast3: string = '';
  judgePeriodPrev3: string = '';

  // 平均・増減率の表示用
  avgLast3: number = 0;
  avgPrev3: number = 0;
  diffRate: number = 0;

  // 一覧用
  salarySummaries: SalarySummary[] = [];
  isSummaryLoading: boolean = false;

  // FirestoreのDI
  private firestore = inject(Firestore);

  // --- 編集モーダル用 ---
  isEditModalOpen: boolean = false;
  editSalaryData: RegisteredSalary = {
    id: '',
    year_month: '',
    details: [],
    total_amount: 0,
    taxable_amount: 0,
    social_insurance_deduction: 0,
    created_at: new Date(),
    updated_at: new Date()
  };
  editTotalAmount: number = 0;
  editTaxableAmount: number = 0;
  editSocialInsuranceDeduction: number = 0;

  // CSV/Excelインポート用
  importError: string | null = null;
  importSuccess: string | null = null;
  isImporting: boolean = false;

  selectedPrefectureId: string = '';
  premiums: { [key: string]: InsurancePremium } | null = null;

  selectedYear: string = '';
  yearOptions: string[] = [];

  selectedFile: File | null = null;
  sheetNames: string[] = [];
  private _selectedSheetName: string = '';

  gradeLast3: string | null = null;
  gradePrev3: string | null = null;

  currentCompanyId: string = '';

  // カスタム手当管理用
  showCustomAllowanceModal = false;
  showCustomAllowanceListModal = false;
  customAllowanceForm: FormGroup;
  editingAllowanceId: string | null = null;

  selectedCSVFile: File | null = null;
  csvImportMessage: string = '';
  csvImportSuccess: boolean = false;
  selectedCSVFileType: string = '';

  salaryHistories: any[] = [];
  isHistoryLoading: boolean = false;

  public user$;
  public isAuthReady$;
  public employeeInfo$;

  constructor(
    private insurancePremiumService: InsurancePremiumService,
    private auth: Auth,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.customAllowanceForm = this.fb.group({
      label: ['', Validators.required]
    });
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

  // 表示名を英数字・アンダースコア化＋ランダムID付与
  private generateIdentifier(label: string): string {
    let base = label.normalize('NFKC')
      .replace(/[ぁ-んァ-ヶ一-龠々ー]/g, '') // 日本語除去
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    if (!base) base = 'allowance';
    const rand = Math.random().toString(36).substring(2, 7);
    return `${base}_${rand}`;
  }

  async ngOnInit(): Promise<void> {
    // 今年度と過去数年分を選択肢として用意
    const currentYear = new Date().getFullYear();
    this.yearOptions = [currentYear.toString(), (currentYear - 1).toString(), (currentYear - 2).toString()];
    this.selectedYear = currentYear.toString();

    // 認証状態の購読
    this.authService.isAuthReady$.subscribe(isReady => {
      if (isReady) {
        this.authService.companyId$.subscribe(async companyId => {
          if (companyId) {
            this.currentCompanyId = companyId;
            await this.loadEmployees();
            await this.loadCustomAllowances();
            if (this.activeTab === 'history') {
              await this.loadSalaryHistories();
            }
          }
        });
      }
    });
  }

  async loadEmployees() {
    if (!this.currentCompanyId) return;
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.currentCompanyId));
    const empSnapshot = await getDocs(q);
    this.employees = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this.filteredEmployees = [...this.employees];
  }

  async onTabChange(tab: string): Promise<void> {
    this.activeTab = tab;
    if (tab === 'insurance') {
      await this.loadPremiums();
    } else if (tab === 'auto-judge') {
      await this.loadAutoJudgeSalaries();
      this.judgeSalaryChange();
    } else if (tab === 'history') {
      await this.loadSalaryHistories();
    }
  }

  async onPrefectureChange(): Promise<void> {
    await this.loadPremiums();
  }

  private async loadPremiums(): Promise<void> {
    if (!this.selectedPrefectureId || !this.selectedYear) {
      this.premiums = null;
      return;
    }
    try {
      const result = await this.insurancePremiumService.getPremiums(this.selectedPrefectureId, this.selectedYear);
      this.premiums = result?.premiums || null;
    } catch (error) {
      console.error('Error loading premiums:', error);
      this.premiums = null;
    }
  }

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

  async onImportClick(): Promise<void> {
    if (!this.selectedFile || !this.selectedSheetName) return;
    this.isImporting = true;
    this.importError = null;
    this.importSuccess = null;
    try {
      await this.insurancePremiumService.importExcelFile(this.selectedFile, this.selectedPrefectureId, this.selectedYear, this.selectedSheetName);
      this.importSuccess = '保険料表のインポートが完了しました。';
      await this.loadPremiums();
    } catch (error) {
      console.error('Import error:', error);
      this.importError = error instanceof Error ? error.message : 'インポート中にエラーが発生しました。';
    } finally {
      this.isImporting = false;
      this.selectedFile = null;
      this.sheetNames = [];
      this.selectedSheetName = '';
      const input = document.getElementById('excelFile') as HTMLInputElement;
      if (input) input.value = '';
    }
  }

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
    } catch (error) {
      console.error('Export error:', error);
      this.importError = error instanceof Error ? error.message : 'エクスポート中にエラーが発生しました。';
    }
  }

  filterEmployees() {
    if (!this.searchText) {
      this.filteredEmployees = [...this.employees];
    } else {
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
  }

  // 明細行の追加
  addSalaryDetail() {
    this.salaryDetails.push({
      type: 'base',
      amount: 0,
      note: ''
    });
    this.calculateTotals();
  }

  // 明細行の削除
  removeSalaryDetail(index: number) {
    this.salaryDetails.splice(index, 1);
    this.calculateTotals();
  }

  // 明細の変更を監視して計算を実行
  onDetailChange() {
    this.calculateTotals();
  }

  // 合計金額の計算
  calculateTotals() {
    // 総支給額の計算
    this.totalAmount = this.salaryDetails.reduce((sum, detail) => sum + (detail.amount || 0), 0);

    // 課税対象額の計算（通勤手当は非課税）
    this.taxableAmount = this.salaryDetails.reduce((sum, detail) => {
      if (detail.type === 'commuting') {
        return sum;
      }
      return sum + (detail.amount || 0);
    }, 0);

    // 社会保険料控除額の計算（基本給の約14%と仮定）
    const baseSalary = this.salaryDetails.find(d => d.type === 'base')?.amount || 0;
    this.socialInsuranceDeduction = Math.floor(baseSalary * 0.14);
  }

  // フォームのクリア
  clearForm() {
    this.salaryDetails = [];
    this.calculateTotals();
  }

  // 給与明細の取得
  async loadRegisteredSalaries() {
    if (!this.selectedEmployeeId) return;
    
    const salariesCol = collection(this.firestore, 'employees', this.selectedEmployeeId, 'salaries');
    const q = query(salariesCol, orderBy('year_month', 'desc'));
    const snapshot = await getDocs(q);
    
    this.registeredSalaries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data()['created_at']?.toDate(),
      updated_at: doc.data()['updated_at']?.toDate()
    } as RegisteredSalary));
  }

  // 従業員選択時の処理
  async onEmployeeSelect() {
    await this.loadRegisteredSalaries();
  }

  // 給与区分のラベルを取得
  getSalaryTypeLabel(type: string): string {
    return this.salaryTypes.find(t => t.value === type)?.label || type;
  }

  // 日付のフォーマット
  formatDate(date: Date): string {
    if (!date) return '';
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 金額のフォーマット
  formatAmount(amount: number | undefined | null): string {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return '';
    return Number(amount).toLocaleString('ja-JP');
  }

  // 特定の区分の金額を取得
  getDetailAmount(salary: RegisteredSalary, typeOrLabel: string): number {
    if (!salary || !salary.details) return 0;
    // type値とlabel値の両方で一致を探す
    const typeMap = new Map(this.salaryTypes.map(t => [t.value, t.label]));
    const labelMap = new Map(this.salaryTypes.map(t => [t.label, t.value]));
    return (
      salary.details.find(
        d =>
          d.type === typeOrLabel ||
          typeMap.get(d.type) === typeOrLabel ||
          labelMap.get(d.type) === typeOrLabel
      )?.amount || 0
    );
  }

  // その他手当の合計を計算
  getOtherAllowances(salary: RegisteredSalary): number {
    if (!salary || !salary.details) return 0;
    // 基本給・残業手当・通勤手当・賞与以外
    const excludeTypes = ['base', 'overtime', 'commuting', 'bonus', '基本給', '残業手当', '通勤手当', '賞与'];
    return salary.details
      .filter(d => !excludeTypes.includes(d.type))
      .reduce((sum, d) => sum + (d.amount || 0), 0);
  }

  // 給与明細の編集
  editSalary(salary: RegisteredSalary) {
    this.editSalaryData = JSON.parse(JSON.stringify(salary)); // ディープコピー
    this.isEditModalOpen = true;
    this.calculateEditTotals();
  }

  // モーダル閉じる
  closeEditModal() {
    this.isEditModalOpen = false;
  }

  // 編集明細行の追加
  addEditSalaryDetail() {
    this.editSalaryData.details.push({ type: 'base', amount: 0, note: '' });
    this.calculateEditTotals();
  }

  // 編集明細行の削除
  removeEditSalaryDetail(index: number) {
    this.editSalaryData.details.splice(index, 1);
    this.calculateEditTotals();
  }

  // 編集明細の合計再計算
  calculateEditTotals() {
    this.editTotalAmount = this.editSalaryData.details.reduce((sum, detail) => sum + (detail.amount || 0), 0);
    this.editTaxableAmount = this.editSalaryData.details.reduce((sum, detail) => {
      if (detail.type === 'commuting') return sum;
      return sum + (detail.amount || 0);
    }, 0);
    const baseSalary = this.editSalaryData.details.find(d => d.type === 'base')?.amount || 0;
    this.editSocialInsuranceDeduction = Math.floor(baseSalary * 0.14);
  }

  // 編集内容保存
  async saveEditedSalary() {
    // 合計等を再計算
    this.calculateEditTotals();
    this.editSalaryData.total_amount = this.editTotalAmount;
    this.editSalaryData.taxable_amount = this.editTaxableAmount;
    this.editSalaryData.social_insurance_deduction = this.editSocialInsuranceDeduction;
    this.editSalaryData.updated_at = new Date();

    try {
      const employeeId = this.selectedEmployeeId;
      const salaryId = this.editSalaryData.id;
      if (!employeeId || !salaryId) throw new Error('IDが不正です');
      const salaryDocRef = doc(this.firestore, 'employees', employeeId, 'salaries', salaryId);
      await updateDoc(salaryDocRef, {
        year_month: this.editSalaryData.year_month,
        details: this.editSalaryData.details,
        total_amount: this.editSalaryData.total_amount,
        taxable_amount: this.editSalaryData.taxable_amount,
        social_insurance_deduction: this.editSalaryData.social_insurance_deduction,
        updated_at: this.editSalaryData.updated_at
      });
      // 履歴も保存
      await this.saveSalaryHistory(employeeId, this.editSalaryData, 'update');
    } catch (e) {
      alert('保存に失敗しました: ' + (e as any).message);
    }
    this.isEditModalOpen = false;
    await this.loadRegisteredSalaries();
  }

  // 給与明細の削除
  async deleteSalary(salary: RegisteredSalary) {
    if (confirm('この給与明細を削除してもよろしいですか？')) {
      try {
        const employeeId = this.selectedEmployeeId;
        const salaryId = salary.id;
        if (!employeeId || !salaryId) throw new Error('IDが不正です');
        const salaryDocRef = doc(this.firestore, 'employees', employeeId, 'salaries', salaryId);
        await deleteDoc(salaryDocRef);
        // 削除履歴を保存（operation: 'delete', operationフィールドは'削除'、changeMessage: '明細が削除されました'）
        await this.saveSalaryHistory(employeeId, { ...salary, operation: '削除', changeMessage: '明細が削除されました' }, 'delete');
        await this.loadRegisteredSalaries();
      } catch (e) {
        alert('削除に失敗しました: ' + (e as any).message);
      }
    }
  }

  async registerSalary(event: Event) {
    event.preventDefault();
    const employeeId = this.selectedEmployeeId;
    if (!employeeId) {
      alert('従業員を選択してください');
      return;
    }

    if (this.salaryDetails.length === 0) {
      alert('明細を入力してください');
      return;
    }

    // 給与明細データ
    const yearMonth = ((event.target as HTMLFormElement).querySelector('input[type="month"]') as HTMLInputElement)?.value || '';
    const isAllBonus = this.salaryDetails.every(d => d.type === 'bonus');
    const isAnyNonBonus = this.salaryDetails.some(d => d.type !== 'bonus');

    // Firestoreに同じ年月のデータがあるかチェック
    const salariesCol = collection(this.firestore, 'employees', employeeId, 'salaries');
    const q = query(salariesCol, where('year_month', '==', yearMonth));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      // 既存データのdetailsを確認
      let hasNonBonus = false;
      let bonusCount = 0;
      snapshot.forEach(docSnap => {
        const details = docSnap.data()['details'] || [];
        if (details.some((d: any) => d.type !== 'bonus')) {
          hasNonBonus = true;
        }
        if (details.length === 1 && details[0].type === 'bonus') {
          bonusCount++;
        }
      });
      // bonus以外が既に存在する場合
      if (isAnyNonBonus && hasNonBonus) {
        alert('同じ年月の給与明細（基本給や手当）が既に存在します。編集または削除してください。');
        return;
      }
      // bonusのみ登録の場合、既にbonusが1件以上あればエラー
      if (isAllBonus && bonusCount >= 1) {
        alert('同じ年月の賞与明細は2件以上登録できません。');
        return;
      }
    }

    // 通常の登録処理
    const salaryData = {
      year_month: yearMonth,
      details: this.salaryDetails,
      total_amount: this.totalAmount,
      taxable_amount: this.taxableAmount,
      social_insurance_deduction: this.socialInsuranceDeduction,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Firestoreに追加
    const docRef = await addDoc(salariesCol, salaryData);
    // 履歴も保存
    await this.saveSalaryHistory(employeeId, salaryData, 'create');
    this.clearForm();
    // 一覧を更新
    await this.loadRegisteredSalaries();
  }

  // 履歴保存
  async saveSalaryHistory(employeeId: string, salaryData: any, operation: 'create' | 'update' | 'delete') {
    if (!this.currentCompanyId) return;
    // employeeIdからemployee_codeと氏名を取得
    const empDoc = this.employees.find(e => e.id === employeeId);
    const employee_code = empDoc?.employee_code || '';
    const employee_name = empDoc ? `${empDoc.last_name_kanji || ''}${empDoc.first_name_kanji || ''}` : '';
    // 操作ユーザー名を取得
    let operatorName = '';
    if (this.auth.currentUser && this.auth.currentUser.email) {
      // ログインユーザーのemailから従業員情報を検索
      const loginEmp = this.employees.find(e => e.email === this.auth.currentUser!.email);
      operatorName = loginEmp ? `${loginEmp.last_name_kanji || ''}${loginEmp.first_name_kanji || ''}` : this.auth.currentUser.email;
    }
    const historiesCol = collection(this.firestore, 'companies', this.currentCompanyId, 'salary_histories');
    await addDoc(historiesCol, {
      employee_id: employee_code, // 社員IDはemployee_codeを保存
      employee_name: employee_name, // 氏名も保存
      year_month: salaryData.year_month,
      details: salaryData.details,
      total_amount: salaryData.total_amount,
      taxable_amount: salaryData.taxable_amount,
      social_insurance_deduction: salaryData.social_insurance_deduction,
      operation,
      operated_at: new Date(),
      operator: operatorName, // 氏名で保存
      changeMessage: this.generateChangeMessage(salaryData, null)
    });
  }

  // 変更内容メッセージ生成関数
  generateChangeMessage(current: any, prev: any): string {
    if (current.operation === 'import') {
      return current.changeMessage || 'インポートされました。';
    }
    if (current.operation === '削除' || current.operation === 'delete') {
      return '明細が削除されました';
    }
    if (!prev) {
      return '明細が追加されました';
    }
    if (current.total_amount !== prev.total_amount) {
      return `総支給額が変更されました（${prev.total_amount?.toLocaleString()}円→${current.total_amount?.toLocaleString()}円）`;
    }
    // 明細の追加
    const prevTypes = new Set((prev.details || []).map((d: any) => d.type));
    const currTypes = new Set((current.details || []).map((d: any) => d.type));
    for (const type of currTypes) {
      if (!prevTypes.has(type)) {
        const added = (current.details || []).find((d: any) => d.type === type);
        const label = this.salaryTypes.find(t => t.value === type)?.label || type;
        return `${label}が追加されました（${added.amount?.toLocaleString()}円）`;
      }
    }
    return '内容が更新されました';
  }

  // 直近12ヶ月分の給与データ取得
  async loadAutoJudgeSalaries() {
    if (!this.selectedEmployeeId) return;
    const salariesCol = collection(this.firestore, 'employees', this.selectedEmployeeId, 'salaries');
    const q = query(salariesCol, orderBy('year_month', 'desc'));
    const snapshot = await getDocs(q);
    this.autoJudgeSalaries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data()['created_at']?.toDate(),
      updated_at: doc.data()['updated_at']?.toDate()
    } as RegisteredSalary)).slice(0, 12).reverse(); // 昇順
  }

  // 直近3ヶ月の年月を生成するヘルパーメソッド
  private getLast3Months(year: number, month: number): string[] {
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
  }

  // 現在の年月を取得するヘルパーメソッド
  private getCurrentYearMonth(): { year: number; month: number } {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1
    };
  }

  // 報酬月額変更自動判定ロジック
  async judgeSalaryChange() {
    this.autoJudgeAlert = '';
    this.judgePeriodLast3 = '';
    this.judgePeriodPrev3 = '';
    this.avgLast3 = 0;
    this.avgPrev3 = 0;
    this.diffRate = 0;
    this.gradeLast3 = null;
    this.gradePrev3 = null;
    if (this.autoJudgeSalaries.length < 6) return;
    
    // 直近3ヶ月とその前3ヶ月の平均
    const latestSalary = this.autoJudgeSalaries[this.autoJudgeSalaries.length - 1];
    if (!latestSalary) return;
    
    // 最新の年月から連続した3ヶ月を取得
    const latestYearMonth = latestSalary.year_month;
    const [latestYear, latestMonth] = latestYearMonth.split('-').map(Number);
    
    const last3Months = this.getLast3Months(latestYear, latestMonth);
    const prev3Months = this.getLast3Months(latestYear, latestMonth - 3);
    
    // 該当する年月の給与情報を取得
    const last3 = last3Months.map((ym: string) => 
      this.autoJudgeSalaries.find(s => s.year_month === ym)
    ).filter((s): s is RegisteredSalary => s !== undefined);
    
    const prev3 = prev3Months.map((ym: string) => 
      this.autoJudgeSalaries.find(s => s.year_month === ym)
    ).filter((s): s is RegisteredSalary => s !== undefined);
    
    if (last3.length < 3 || prev3.length < 3) {
      this.autoJudgeAlert = '判定には直近6ヶ月の連続した給与データが必要です。';
      return;
    }
    
    // 賞与を除外した合計で平均を計算
    const avg = (arr: RegisteredSalary[]) => arr.reduce((sum, s) => {
      const nonBonusTotal = (s.details || []).filter(d => d.type !== 'bonus').reduce((a, d) => a + (d.amount || 0), 0);
      return sum + nonBonusTotal;
    }, 0) / arr.length;
    
    this.avgLast3 = avg(last3);
    this.avgPrev3 = avg(prev3);
    
    // 期間表示
    this.judgePeriodLast3 = `${last3[0].year_month} ～ ${last3[2].year_month}`;
    this.judgePeriodPrev3 = `${prev3[0].year_month} ～ ${prev3[2].year_month}`;

    // 2025年の等級表（全国共通）を取得
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
    const gradeLast3 = getGradeIdBySalary(grades, this.avgLast3);
    this.gradeLast3 = gradeLast3;
    // employeesコレクションから現在登録されている等級を取得
    let registeredGrade: string | null = null;
    if (this.selectedEmployeeId) {
      const emp = this.employees.find(e => e.id === this.selectedEmployeeId);
      if (emp && emp.auto_grade !== undefined && emp.auto_grade !== null && emp.auto_grade !== '') {
        registeredGrade = emp.auto_grade;
      }
    }
    // 等級差で判定
    if (registeredGrade !== null && gradeLast3 !== null) {
      // 先頭の数字を取得して比較
      const getGradeNumber = (grade: string): number => {
        const match = grade.match(/^\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };
      const diff = Math.abs(getGradeNumber(gradeLast3) - getGradeNumber(registeredGrade));
      if (diff >= 2) {
        this.autoJudgeAlert = '2等級以上の変動が検出されました。標準報酬月額の変更届が必要です。';
      }
    }
  }

  // 全従業員分の給与判定一覧を取得
  async loadSalarySummaries() {
    this.isSummaryLoading = true;
    this.salarySummaries = [];
    if (!this.currentCompanyId) {
      this.isSummaryLoading = false;
      return;
    }

    // 全従業員取得（会社IDで絞り込み）
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.currentCompanyId));
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
    const { year: currentYear, month: currentMonth } = this.getCurrentYearMonth();
    const targetMonths = this.getLast3Months(currentYear, currentMonth);

    // 各従業員ごとにsalaries取得
    for (const empRaw of employees) {
      const emp = empRaw as any;
      const salariesCol = collection(this.firestore, 'employees', emp.id, 'salaries');
      const q = query(salariesCol, where('year_month', 'in', targetMonths));
      const salSnapshot = await getDocs(q);
      const salaries = salSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data()['created_at']?.toDate(),
        updated_at: doc.data()['updated_at']?.toDate()
      } as RegisteredSalary));

      // 各月の給与データを取得（賞与を除く）
      const monthlySalaries = targetMonths.map(month => {
        const salary = salaries.find(s => s.year_month === month);
        if (!salary) return 0;
        
        // 賞与を除いた合計を計算
        const nonBonusTotal = (salary.details || [])
          .filter(d => d.type !== 'bonus')
          .reduce((sum, d) => sum + (d.amount || 0), 0);
        
        return nonBonusTotal;
      });

      // 平均を計算（データがない月は0として計算）
      const avgLast3 = monthlySalaries.reduce((sum, amount) => sum + amount, 0) / 3;

      // 現在の等級（employeesコレクションのauto_grade）
      const currentGrade = emp.auto_grade || '';

      // 直近3ヶ月の平均から等級を算出
      const calculatedGrade = getGradeIdBySalary(grades, avgLast3);

      // 判定結果の生成
      let result = '';
      if (avgLast3 === 0) {
        result = '直近の給与なし';
      } else if (currentGrade && calculatedGrade) {
        // 先頭の数字を取得して比較
        const getGradeNumber = (grade: string): number => {
          const match = grade.match(/^\d+/);
          return match ? parseInt(match[0], 10) : 0;
        };
        const diff = Math.abs(getGradeNumber(calculatedGrade) - getGradeNumber(currentGrade));
        if (diff >= 2) {
          result = '2等級以上の変動あり';
        } else {
          result = '変動なし';
        }
      } else if (!calculatedGrade) {
        result = '等級判定不可';
      }

      this.salarySummaries.push({
        employeeId: emp.id,
        name: `${emp.last_name_kanji || ''} ${emp.first_name_kanji || ''}`.trim() + (emp.employee_code ? `（${emp.employee_code}）` : ''),
        avgLast3,
        avgPrev3: 0,
        diffRate: 0,
        result,
        gradeLast3: calculatedGrade,
        gradePrev3: currentGrade
      });
    }
    this.isSummaryLoading = false;
  }

  set selectedSheetName(value: string) {
    this._selectedSheetName = value;
    this.selectedPrefectureId = value;
  }
  get selectedSheetName(): string {
    return this._selectedSheetName;
  }

  async exportSalariesToCSV(): Promise<void> {
    if (!this.currentCompanyId) return;
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.currentCompanyId));
    const empSnapshot = await getDocs(q);
    const employees = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const allRows: any[] = [];
    for (const empRaw of employees) {
      const emp = empRaw as any;
      const departmentId = emp.department_id || emp.office_id || '';
      const salariesCol = collection(this.firestore, 'employees', emp.id, 'salaries');
      const salSnapshot = await getDocs(salariesCol);
      for (const docSnap of salSnapshot.docs) {
        const data = docSnap.data();
        const yearMonth = data['year_month'] || '';
        const details = data['details'] || [];
        // 基本給
        const base = details.find((d: any) => d.type === 'base');
        if (base) {
          allRows.push({
            companyId: emp.company_id,
            departmentId,
            employee_code: emp.employee_code || emp.id,
            name: `${emp.last_name_kanji || ''}${emp.first_name_kanji || ''}`.trim(),
            year_month: yearMonth,
            item: '基本給',
            amount: base.amount || 0
          });
        }
        // 残業手当
        const overtime = details.find((d: any) => d.type === 'overtime');
        if (overtime) {
          allRows.push({
            companyId: emp.company_id,
            departmentId,
            employee_code: emp.employee_code || emp.id,
            name: `${emp.last_name_kanji || ''}${emp.first_name_kanji || ''}`.trim(),
            year_month: yearMonth,
            item: '残業手当',
            amount: overtime.amount || 0
          });
        }
        // 通勤手当
        const commuting = details.find((d: any) => d.type === 'commuting');
        if (commuting) {
          allRows.push({
            companyId: emp.company_id,
            departmentId,
            employee_code: emp.employee_code || emp.id,
            name: `${emp.last_name_kanji || ''}${emp.first_name_kanji || ''}`.trim(),
            year_month: yearMonth,
            item: '通勤手当',
            amount: commuting.amount || 0
          });
        }
        // 賞与
        const bonus = details.find((d: any) => d.type === 'bonus');
        if (bonus) {
          allRows.push({
            companyId: emp.company_id,
            departmentId,
            employee_code: emp.employee_code || emp.id,
            name: `${emp.last_name_kanji || ''}${emp.first_name_kanji || ''}`.trim(),
            year_month: yearMonth,
            item: '賞与',
            amount: bonus.amount || 0
          });
        }
        // その他手当（基本・残業・通勤・賞与以外）
        const excludeTypes = ['base', 'overtime', 'commuting', 'bonus', '基本給', '残業手当', '通勤手当', '賞与'];
        details.filter((d: any) => !excludeTypes.includes(d.type)).forEach((other: any) => {
          allRows.push({
            companyId: emp.company_id,
            departmentId,
            employee_code: emp.employee_code || emp.id,
            name: `${emp.last_name_kanji || ''}${emp.first_name_kanji || ''}`.trim(),
            year_month: yearMonth,
            item: other.type,
            amount: other.amount || 0
          });
        });
      }
    }
    // CSV生成
    const header = ['会社ID','事業所ID','社員ID','氏名','対象年月','項目','金額'];
    const csv = [header.join(',')].concat(
      allRows.map(row => header.map(h => {
        let value = row[
          h === '会社ID' ? 'companyId' :
          h === '事業所ID' ? 'departmentId' :
          h === '社員ID' ? 'employee_code' :
          h === '氏名' ? 'name' :
          h === '対象年月' ? 'year_month' :
          h === '項目' ? 'item' :
          h === '金額' ? 'amount' : ''
        ];
        // 対象年月はYYYY-MM形式の文字列で出力
        if (h === '対象年月') {
          value = String(value).slice(0, 7); // 先頭7文字（YYYY-MM）
        }
        return '"' + String(value).replace(/"/g, '""') + '"';
      }).join(','))
    ).join('\r\n');
    // ダウンロード
    const now = new Date();
    const fileName = `給与情報_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, fileName);
  }

  // カスタム手当の読み込み
  async loadCustomAllowances() {
    if (!this.currentCompanyId) return;
    const allowancesCol = collection(this.firestore, 'companies', this.currentCompanyId, 'custom_allowances');
    const q = query(allowancesCol, orderBy('label'));
    const snapshot = await getDocs(q);
    this.customAllowances = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data()['created_at']?.toDate(),
      updated_at: doc.data()['updated_at']?.toDate()
    } as CustomAllowance));
  }

  // カスタム手当モーダルを開く
  openCustomAllowanceModal(allowance?: CustomAllowance) {
    this.editingAllowanceId = allowance?.id || null;
    this.customAllowanceForm.reset({
      label: allowance?.label || ''
    });
    this.showCustomAllowanceModal = true;
  }

  // カスタム手当モーダルを閉じる
  closeCustomAllowanceModal() {
    this.showCustomAllowanceModal = false;
    this.editingAllowanceId = null;
    this.customAllowanceForm.reset();
  }

  // カスタム手当の保存
  async saveCustomAllowance() {
    if (this.customAllowanceForm.invalid || !this.currentCompanyId) return;

    const label = this.customAllowanceForm.value.label;
    let value = '';
    if (this.editingAllowanceId) {
      // 編集時は既存のvalueを維持。ただし空の場合は再生成
      const existing = this.customAllowances.find(a => a.id === this.editingAllowanceId);
      value = (existing && existing.value) ? existing.value : this.generateIdentifier(label);
    } else {
      // 新規作成時は必ず自動生成
      value = this.generateIdentifier(label);
    }
    if (!value) value = this.generateIdentifier(label); // 念のため

    // --- 追加: 重複チェック ---
    // 編集時は自分以外、新規時は全件で同じlabelがないか
    const duplicate = this.customAllowances.find(a => a.label === label && a.id !== this.editingAllowanceId);
    if (duplicate) {
      alert('同じ名前の手当区分がすでに存在します。別の名前を入力してください。');
      return;
    }
    // --- ここまで ---

    const data = {
      value,
      label,
      company_id: this.currentCompanyId,
      created_at: new Date(),
      updated_at: new Date()
    };

    try {
      const allowancesCol = collection(this.firestore, 'companies', this.currentCompanyId, 'custom_allowances');
      if (this.editingAllowanceId) {
        // 更新
        const docRef = doc(allowancesCol, this.editingAllowanceId);
        await updateDoc(docRef, {
          label: data.label,
          updated_at: data.updated_at
        });
      } else {
        // 新規作成
        await addDoc(allowancesCol, data);
      }
      await this.loadCustomAllowances();
      this.closeCustomAllowanceModal();
        } catch (error) {
      console.error('Error saving custom allowance:', error);
      alert('手当区分の保存に失敗しました。');
        }
  }

  // カスタム手当の削除
  async deleteCustomAllowance(allowance: CustomAllowance) {
    if (!confirm(`「${allowance.label}」を削除してもよろしいですか？`)) return;
    if (!this.currentCompanyId) return;

    try {
      const docRef = doc(this.firestore, 'companies', this.currentCompanyId, 'custom_allowances', allowance.id);
      await deleteDoc(docRef);
      await this.loadCustomAllowances();
    } catch (error) {
      console.error('Error deleting custom allowance:', error);
      alert('手当区分の削除に失敗しました。');
    }
  }

  // カスタム手当一覧モーダルを閉じる
  closeCustomAllowanceListModal() {
    this.showCustomAllowanceListModal = false;
    }

  onCSVFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedCSVFile = input.files && input.files.length > 0 ? input.files[0] : null;
    const ext = this.selectedCSVFile ? this.selectedCSVFile.name.split('.').pop() : '';
    this.selectedCSVFileType = ext ? ext.toLowerCase() : '';
  }

  async importSalariesFromCSV() {
    this.csvImportMessage = '';
    this.csvImportSuccess = false;
    if (!this.selectedCSVFile || !this.currentCompanyId) {
      this.csvImportMessage = 'ファイルまたは会社IDがありません';
      return;
    }
    try {
      let rows: any[] = [];
      let header: string[] = [];
      if (this.selectedCSVFileType === 'xlsx') {
        // Excelファイルの場合
        const data = await this.selectedCSVFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (json.length < 2) throw new Error('データ行がありません');
        header = (json[0] as string[]).map(h => h.replace(/^"|"$/g, ''));
        rows = (json.slice(1) as string[][]).map(colsArr => {
          const row: any = {};
          header.forEach((h, i) => row[h] = colsArr[i]);
          return row;
        });
      } else {
        // CSVファイルの場合
        const text = await this.selectedCSVFile.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) throw new Error('データ行がありません');
        header = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
        rows = lines.slice(1).map(line => {
          const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, ''));
          const row: any = {};
          header.forEach((h, i) => row[h] = cols[i]);
          return row;
        });
      }
      // 社員ID＋年月ごとにグループ化
      const salaryMap: { [key: string]: any } = {};
      for (const row of rows) {
        // 全カラムが空の行はスキップ
        if (Object.values(row).every(v => !v || String(v).trim() === '')) continue;
        const companyId = row['会社ID'] ? String(row['会社ID']).trim() : '';
        const empCode = row['社員ID'] ? String(row['社員ID']).trim() : '';
        const yearMonth = this.normalizeYearMonth(row['対象年月']);
        const item = row['項目'] ? String(row['項目']).trim() : '';
        const amount = Number(row['金額']) || 0;
        if (!companyId || !empCode || !yearMonth || !item) continue;
        // 賞与は同じ年月でも別レコードにする
        const isBonus = item === '賞与';
        const key = isBonus ? `${empCode}_${yearMonth}_bonus_${Math.random().toString(36).slice(2,8)}` : `${empCode}_${yearMonth}`;
        if (!salaryMap[key]) {
          salaryMap[key] = {
            employee_code: empCode,
            year_month: yearMonth,
            details: [],
            total_amount: 0,  // 初期値を0に設定
            created_at: new Date(),
            updated_at: new Date()
          };
        }
        // 項目→type変換
        let type = '';
        if (item === '基本給') type = 'base';
        else if (item === '残業手当') type = 'overtime';
        else if (item === '通勤手当') type = 'commuting';
        else if (item === '賞与') type = 'bonus';
        else type = item;
        salaryMap[key].details.push({ type, amount });
        // total_amountに加算
        salaryMap[key].total_amount += amount;
      }
      // Firestoreへ保存
      const employeesCol = collection(this.firestore, 'employees');
      let errorCount = 0;
      let importCount = 0;
      for (const key of Object.keys(salaryMap)) {
        const salary = salaryMap[key];
        if (!salary.employee_code || !this.currentCompanyId) {
          errorCount++;
          continue;
        }
        // 社員IDから従業員ドキュメントを検索
        const q = query(employeesCol, where('company_id', '==', this.currentCompanyId), where('employee_code', '==', salary.employee_code));
        const empSnapshot = await getDocs(q);
        if (empSnapshot.empty) {
          errorCount++;
          continue;
        }
        const empId = empSnapshot.docs[0].id;
        const salariesCol = collection(this.firestore, 'employees', empId, 'salaries');
        // --- 賞与の場合は同じ年月の賞与レコードがあれば上書き ---
        const isBonusOnly = salary['details'].length === 1 && salary['details'][0].type === 'bonus';
        let updated = false;
        if (isBonusOnly) {
          // 同じ年月・details.type==='bonus'のみのレコードを検索
          const salSnapshot = await getDocs(query(salariesCol, where('year_month', '==', salary.year_month)));
          let foundBonusDocId: string | null = null;
          salSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (Array.isArray(data['details']) && data['details'].length === 1 && data['details'][0].type === 'bonus') {
              foundBonusDocId = docSnap.id;
            }
          });
          if (foundBonusDocId) {
            // 上書き
            const docRef = doc(this.firestore, 'employees', empId, 'salaries', foundBonusDocId);
            await updateDoc(docRef, {
              details: salary['details'],
              total_amount: salary.total_amount,
              updated_at: new Date()
            });
            updated = true;
          }
        }
        if (!updated) {
          // 通常処理（既存レコードがあれば上書き、なければ新規追加）
          const salSnapshot = await getDocs(query(salariesCol, where('year_month', '==', salary.year_month)));
          if (!salSnapshot.empty && !isBonusOnly) {
            // 上書き
            const docRef = doc(this.firestore, 'employees', empId, 'salaries', salSnapshot.docs[0].id);
            await updateDoc(docRef, {
              details: salary['details'],
              total_amount: salary.total_amount,
              updated_at: new Date()
            });
          } else if (!isBonusOnly) {
            // 新規追加
            await addDoc(salariesCol, salary);
          } else if (isBonusOnly && !updated) {
            // 賞与で既存がなければ新規追加
            await addDoc(salariesCol, salary);
          }
        }
        importCount++;
      }
      // --- インポート履歴を1行で追加 ---
      const historiesCol = collection(this.firestore, 'companies', this.currentCompanyId, 'salary_histories');
      await addDoc(historiesCol, {
        employee_id: '',
        employee_name: '',
        year_month: '',
        details: [],
        total_amount: 0,
        operation: 'import',
        operated_at: new Date(),
        operator: 'システム',
        changeMessage: 'インポートされました。'
      });
      if (errorCount > 0) {
        this.csvImportMessage = `インポート完了（一部エラー: ${errorCount}件の社員IDまたは会社IDが不正）`;
        this.csvImportSuccess = false;
      } else {
        this.csvImportMessage = 'インポートが完了しました。';
        this.csvImportSuccess = true;
      }
    } catch (e: any) {
      this.csvImportMessage = 'インポート失敗: ' + (e.message || e);
      this.csvImportSuccess = false;
    }
    this.selectedCSVFile = null;
    this.selectedCSVFileType = '';
    const input = document.getElementById('csvFile') as HTMLInputElement;
    if (input) input.value = '';
  }

  // 対象年月をYYYY-MM形式に正規化
  private normalizeYearMonth(val: any): string {
    if (!val) return '';
    if (typeof val === 'number') {
      // Excel日付シリアル値をYYYY-MMに変換
      const date = XLSX.SSF.parse_date_code(val);
      if (date && date.y && date.m) {
        return `${date.y}-${String(date.m).padStart(2, '0')}`;
      }
    }
    // 2025/04/01や2025-04-01など
    const m = String(val).match(/(\d{4})[\/-](\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, '0')}`;
    }
    // すでにYYYY-MM形式ならそのまま
    if (/^\d{4}-\d{2}$/.test(val)) return val;
    return String(val);
  }

  async loadSalaryHistories() {
    this.isHistoryLoading = true;
    this.salaryHistories = [];
    if (!this.currentCompanyId) {
      this.isHistoryLoading = false;
      return;
    }
    const historiesCol = collection(this.firestore, 'companies', this.currentCompanyId, 'salary_histories');
    const snapshot = await getDocs(historiesCol);
    // 日付降順で並べ替え（新しい順）
    let histories = snapshot.docs.map(doc => {
      const data = doc.data() as any;
      return { id: doc.id, ...data };
    });
    histories.forEach(h => {
      if (h.operated_at && h.operated_at.toDate) h.operated_at = h.operated_at.toDate();
    });
    // 社員ID・年月ごとにグループ化して、直前の履歴と比較
    histories.sort((a, b) => (b.operated_at?.getTime?.() || 0) - (a.operated_at?.getTime?.() || 0));
    for (let i = 0; i < histories.length; i++) {
      const h = histories[i];
      // 同じ社員ID・年月の直前の履歴を探す
      const prev = histories.slice(i + 1).find(p => p.employee_id === h.employee_id && p.year_month === h.year_month);
      h.changeMessage = this.generateChangeMessage(h, prev);
    }
    this.salaryHistories = histories;
    this.isHistoryLoading = false;
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