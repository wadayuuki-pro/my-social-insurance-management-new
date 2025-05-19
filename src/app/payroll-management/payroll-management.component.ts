import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, addDoc, doc, getDocs, query, orderBy, updateDoc } from '@angular/fire/firestore';
import { inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

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

interface SalarySummary {
  employeeId: string;
  name: string;
  avgLast3: number;
  avgPrev3: number;
  diffRate: number;
  result: string;
}

@Component({
  selector: 'app-payroll-management',
  imports: [CommonModule, FormsModule],
  templateUrl: './payroll-management.component.html',
  styleUrl: './payroll-management.component.scss'
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

  // 給与区分の選択肢
  salaryTypes = [
    { value: 'base', label: '基本給' },
    { value: 'overtime', label: '残業手当' },
    { value: 'commuting', label: '通勤手当' },
    { value: 'family', label: '家族手当' },
    { value: 'housing', label: '住宅手当' },
    { value: 'bonus', label: '賞与' },
    { value: 'other', label: 'その他' }
  ];

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

  async ngOnInit() {
    // Firestoreから従業員リストを取得
    const employeesCol = collection(this.firestore, 'employees');
    const snapshot = await getDocs(employeesCol);
    this.employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    this.filteredEmployees = [...this.employees];
    // デフォルト選択
    if (this.employees.length > 0) {
      this.selectedEmployeeId = this.employees[0].id;
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
  formatAmount(amount: number): string {
    return amount.toLocaleString('ja-JP');
  }

  // 特定の区分の金額を取得
  getDetailAmount(salary: RegisteredSalary, type: string): number {
    const detail = salary.details.find(d => d.type === type);
    return detail?.amount || 0;
  }

  // その他手当の合計を計算
  getOtherAllowances(salary: RegisteredSalary): number {
    return salary.details
      .filter(d => !['base', 'overtime', 'commuting'].includes(d.type))
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
    } catch (e) {
      alert('保存に失敗しました: ' + (e as any).message);
    }
    this.isEditModalOpen = false;
    await this.loadRegisteredSalaries();
  }

  // 給与明細の削除
  async deleteSalary(salary: RegisteredSalary) {
    if (confirm('この給与明細を削除してもよろしいですか？')) {
      // TODO: Firestoreから削除
      console.log('削除:', salary);
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
    const salaryData = {
      year_month: ((event.target as HTMLFormElement).querySelector('input[type="month"]') as HTMLInputElement)?.value || '',
      details: this.salaryDetails,
      total_amount: this.totalAmount,
      taxable_amount: this.taxableAmount,
      social_insurance_deduction: this.socialInsuranceDeduction,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Firestoreに追加
    const salariesCol = collection(this.firestore, 'employees', employeeId, 'salaries');
    await addDoc(salariesCol, salaryData);
    this.clearForm();
    // 一覧を更新
    await this.loadRegisteredSalaries();
  }

  // タブ切り替え時の処理
  async onTabChange(tab: string) {
    this.activeTab = tab;
    if (tab === 'auto-judge') {
      await this.loadAutoJudgeSalaries();
      this.judgeSalaryChange();
    }
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

  // 報酬月額変更自動判定ロジック
  judgeSalaryChange() {
    this.autoJudgeAlert = '';
    this.judgePeriodLast3 = '';
    this.judgePeriodPrev3 = '';
    this.avgLast3 = 0;
    this.avgPrev3 = 0;
    this.diffRate = 0;
    if (this.autoJudgeSalaries.length < 6) return;
    // 直近3ヶ月とその前3ヶ月の平均
    const last3 = this.autoJudgeSalaries.slice(-3);
    const prev3 = this.autoJudgeSalaries.slice(-6, -3);
    const avg = (arr: RegisteredSalary[]) => arr.reduce((sum, s) => sum + (s.total_amount || 0), 0) / arr.length;
    this.avgLast3 = avg(last3);
    this.avgPrev3 = avg(prev3);
    this.diffRate = this.avgPrev3 ? (this.avgLast3 - this.avgPrev3) / this.avgPrev3 : 0;
    // 期間表示
    this.judgePeriodLast3 = `${last3[0].year_month} ～ ${last3[2].year_month}`;
    this.judgePeriodPrev3 = `${prev3[0].year_month} ～ ${prev3[2].year_month}`;
    // 仮：8%以上の増減で2等級変動とみなす
    if (Math.abs(this.diffRate) >= 0.08) {
      this.autoJudgeAlert = '2等級以上の変動が検出されました。標準報酬月額の変更届が必要です。';
    }
  }

  // 全従業員分の給与判定一覧を取得
  async loadSalarySummaries() {
    this.isSummaryLoading = true;
    this.salarySummaries = [];
    // 全従業員取得
    const employeesCol = collection(this.firestore, 'employees');
    const empSnapshot = await getDocs(employeesCol);
    const employees = empSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // 各従業員ごとにsalaries取得
    for (const empRaw of employees) {
      const emp = empRaw as any;
      const salariesCol = collection(this.firestore, 'employees', emp.id, 'salaries');
      const q = query(salariesCol, orderBy('year_month', 'desc'));
      const salSnapshot = await getDocs(q);
      const salaries = salSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data()['created_at']?.toDate(),
        updated_at: doc.data()['updated_at']?.toDate()
      } as RegisteredSalary)).slice(0, 12).reverse();
      if (salaries.length < 6) continue;
      const last3 = salaries.slice(-3);
      const prev3 = salaries.slice(-6, -3);
      const avg = (arr: RegisteredSalary[]) => arr.reduce((sum, s) => sum + (s.total_amount || 0), 0) / arr.length;
      const avgLast3 = avg(last3);
      const avgPrev3 = avg(prev3);
      const diffRate = avgPrev3 ? (avgLast3 - avgPrev3) / avgPrev3 : 0;
      let result = '';
      if (Math.abs(diffRate) >= 0.08) {
        result = '2等級以上変動';
      } else {
        result = '変動なし';
      }
      this.salarySummaries.push({
        employeeId: emp.id,
        name: `${emp.last_name_kanji || ''} ${emp.first_name_kanji || ''}`.trim() + (emp.employee_code ? `（${emp.employee_code}）` : ''),
        avgLast3,
        avgPrev3,
        diffRate,
        result
      });
    }
    this.isSummaryLoading = false;
  }
}
