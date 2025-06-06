import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { Firestore, doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, addDoc } from '@angular/fire/firestore';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';

interface CompanyInfo {
  company_name: string;
  company_name_kana: string;
  address: string;
  phone_number: string;
  representative_name: string;
  contact_email: string;
  postal_code: string;
  is_tokutei?: boolean;
  [key: string]: any;
}

interface DepartmentInfo {
  id: string;
  department_name: string;
  location: string;
  email: string;
  department_id: string;
  company_id: string;
  office_number: string;
  manager_name: string;
  insurer_number?: string;
  [key: string]: any;
}

interface EmployeeInfo {
  id: string;
  last_name_kanji: string;
  first_name_kanji: string;
  email: string;
  role: string;
  company_id: string;
  employee_code: string;
}

interface OperationLog {
  id: string;
  user_id: string;
  user_name: string;
  operation_type: string;
  operation_detail: string;
  ip_address: string;
  status: 'success' | 'failure';
  timestamp: Date;
  company_id: string;
  updated_by?: string;
}

@Component({
  selector: 'app-master-settings-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './master-settings-admin.component.html',
  styleUrl: './master-settings-admin.component.scss'
})
export class MasterSettingsAdminComponent {
  selectedTab: string = 'company';
  isEditingCompany: boolean = false;
  isEditingDepartment: { [key: string]: boolean } = {};

  // 会社・事業所情報
  companyId: string = '';
  departmentId: string = '';
  companyInfo: CompanyInfo | null = null;
  departmentList: DepartmentInfo[] = [];
  departmentInfo: DepartmentInfo | null = null;
  companyForm: Partial<CompanyInfo> = {};
  departmentForm: Partial<DepartmentInfo> = {};
  saveMessage: string = '';

  // 従業員情報
  employeeList: EmployeeInfo[] = [];
  filteredEmployeeList: EmployeeInfo[] = [];
  searchQuery: string = '';

  // 操作ログ情報
  operationLogs: OperationLog[] = [];
  filteredOperationLogs: OperationLog[] = [];
  logSearchQuery: string = '';
  selectedOperationType: string = '';
  selectedDate: string = '';

  // ページネーション用
  pageSize = 10;
  currentPage = 1;

  // 日本語ラベルマッピング
  fieldLabels: Record<string, string> = {
    company_name: '会社名',
    company_name_kana: '会社名カナ',
    address: '住所',
    phone_number: '電話番号',
    representative_name: '代表者名',
    contact_email: '連絡先メール',
    postal_code: '郵便番号',
    is_tokutei: '特定適用事業所かどうか',
    department_name: '事業所名',
    location: '所在地',
    email: 'メール',
    department_id: '事業所ID',
    company_id: '会社ID',
    office_number: '事業所番号',
    manager_name: '管理者名',
    insurer_number: '保険者番号'
  };

  updatedByNameMap: { [id: string]: string } = {};

  constructor(
    private authService: AuthService,
    private firestore: Firestore,
    private http: HttpClient
  ) {
    // ログイン中の会社ID・事業所IDを取得
    this.authService.companyId$.subscribe(async companyId => {
      if (companyId) {
        this.companyId = companyId;
        await this.loadCompanyInfo();
        await this.loadDepartmentList();
        await this.loadEmployeeList();
        await this.loadOperationLogs();
      }
    });
  }

  selectTab(tab: string) {
    this.selectedTab = tab;
  }

  // 会社情報の取得
  async loadCompanyInfo() {
    if (!this.companyId) return;
    const companyDocRef = doc(this.firestore, 'companies', this.companyId);
    const companySnap = await getDoc(companyDocRef);
    if (companySnap.exists()) {
      this.companyInfo = companySnap.data() as CompanyInfo;
      this.companyForm = { ...this.companyInfo };
      if (this.companyForm.is_tokutei === undefined) {
        this.companyForm.is_tokutei = false;
      }
    }
  }

  // 事業所情報の全件取得
  async loadDepartmentList() {
    if (!this.companyId) return;
    const departmentsCol = collection(this.firestore, 'departments');
    const q = query(departmentsCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.departmentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DepartmentInfo));
  }

  // 従業員情報の取得
  async loadEmployeeList() {
    if (!this.companyId) return;
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.employeeList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmployeeInfo));
    this.filteredEmployeeList = [...this.employeeList];
  }

  // 従業員情報の検索
  searchEmployees(query: string) {
    this.searchQuery = query;
    if (!query) {
      this.filteredEmployeeList = [...this.employeeList];
      return;
    }

    const searchLower = query.toLowerCase();
    this.filteredEmployeeList = this.employeeList.filter(employee => {
      const fullName = `${employee.last_name_kanji}${employee.first_name_kanji}`.toLowerCase();
      const employeeCode = employee.employee_code?.toLowerCase() || '';
      return fullName.includes(searchLower) || employeeCode.includes(searchLower);
    });
  }

  // 会社情報の編集開始
  startEditingCompany() {
    this.isEditingCompany = true;
    this.companyForm = { ...this.companyInfo };
    if (this.companyForm.is_tokutei === undefined) {
      this.companyForm.is_tokutei = false;
    }
  }

  // 会社情報の編集キャンセル
  cancelEditingCompany() {
    this.isEditingCompany = false;
    this.companyForm = {};
  }

  // 事業所情報の編集開始
  startEditingDepartment(departmentId: string) {
    this.isEditingDepartment[departmentId] = true;
    const department = this.departmentList.find(dept => dept.id === departmentId);
    if (department) {
      this.departmentForm = { ...department };
    }
  }

  // 事業所情報の編集キャンセル
  cancelEditingDepartment(departmentId: string) {
    this.isEditingDepartment[departmentId] = false;
    this.departmentForm = {};
  }

  // 会社情報の保存
  async saveCompanyInfo() {
    if (!this.companyId) return;
    try {
      const companyDocRef = doc(this.firestore, 'companies', this.companyId);
      await updateDoc(companyDocRef, this.companyForm);
      this.saveMessage = '会社情報を保存しました';
      this.isEditingCompany = false;
      await this.loadCompanyInfo();
    } catch (error) {
      this.saveMessage = '保存に失敗しました';
      console.error('Error saving company info:', error);
    }
  }

  // 事業所情報の保存
  async saveDepartmentInfo(departmentId: string) {
    try {
      const departmentDocRef = doc(this.firestore, 'departments', departmentId);
      await updateDoc(departmentDocRef, this.departmentForm);
      this.saveMessage = '事業所情報を保存しました';
      this.isEditingDepartment[departmentId] = false;
      await this.loadDepartmentList();
    } catch (error) {
      this.saveMessage = '保存に失敗しました';
      console.error('Error saving department info:', error);
    }
  }

  // 郵便番号から住所を検索
  async searchAddressByPostalCode(postalCode: string) {
    if (!postalCode || postalCode.length !== 7) return;

    try {
      const response = await this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`).toPromise();
      
      if (response && response.results && response.results[0]) {
        const address = response.results[0];
        const fullAddress = `${address.address1}${address.address2}${address.address3}`;
        
        if (this.isEditingCompany) {
          this.companyForm.address = fullAddress;
        }
      }
    } catch (error) {
      console.error('郵便番号検索エラー:', error);
    }
  }

  // 郵便番号入力時の処理
  onPostalCodeChange(postalCode: string) {
    // ハイフンを除去
    const cleanPostalCode = postalCode.replace(/-/g, '');
    if (cleanPostalCode.length === 7) {
      this.searchAddressByPostalCode(cleanPostalCode);
    }
  }

  // 権限の日本語表示
  getRoleLabel(role: string): string {
    const roleLabels: Record<string, string> = {
      'admin': '管理者',
      'hr': '人事担当者',
      '': '権限なし'
    };
    return roleLabels[role] || role;
  }

  // 権限の更新
  async updateEmployeeRole(employeeId: string, newRole: string) {
    try {
      const employeeDocRef = doc(this.firestore, 'employees', employeeId);
      await updateDoc(employeeDocRef, { role: newRole });
      await this.loadEmployeeList(); // 一覧を再読み込み
      this.saveMessage = '権限を更新しました';

      // 操作ログを追加
      // 対象従業員情報を取得
      const employee = this.employeeList.find(e => e.id === employeeId);
      const userName = employee ? `${employee.last_name_kanji}${employee.first_name_kanji}` : '';
      const companyId = employee ? employee.company_id : '';
      const employeeCode = employee ? employee.employee_code : '';
      // IPアドレス取得
      let ipAddress = '';
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const json = await res.json();
        ipAddress = json.ip;
      } catch (e) {
        ipAddress = '';
      }
      const logsCol = collection(this.firestore, 'operation_logs');
      await addDoc(logsCol, {
        user_id: employeeId,
        employee_code: employeeCode,
        user_name: userName,
        company_id: companyId,
        operation_type: 'user',
        operation_detail: `権限を${this.getRoleLabel(newRole)}に変更`,
        ip_address: ipAddress,
        status: 'success',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error updating employee role:', error);
      this.saveMessage = '権限の更新に失敗しました';
    }
  }

  // 操作ログの取得
  async loadOperationLogs() {
    if (!this.companyId) return;
    const logsCol = collection(this.firestore, 'operation_logs');
    const q = query(
      logsCol,
      where('company_id', '==', this.companyId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    this.operationLogs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: (doc.data()['timestamp'] as any).toDate()
    } as OperationLog));
    this.filteredOperationLogs = [...this.operationLogs];

    // --- ここから追加: updated_byの氏名を一括取得・キャッシュ ---
    const updatedByIds = Array.from(new Set(this.operationLogs.map(log => log.updated_by).filter(id => typeof id === 'string')));
    if (updatedByIds.length > 0) {
      const employeesCol = collection(this.firestore, 'employees');
      for (const id of updatedByIds) {
        const idStr = String(id);
        if (!this.updatedByNameMap[idStr]) {
          try {
            const empDoc = await getDoc(doc(this.firestore, 'employees', idStr));
            if (empDoc.exists()) {
              const data = empDoc.data();
              this.updatedByNameMap[idStr] = (data['last_name_kanji'] || '') + (data['first_name_kanji'] || '');
            } else {
              this.updatedByNameMap[idStr] = '-';
            }
          } catch {
            this.updatedByNameMap[idStr] = '-';
          }
        }
      }
    }
    // --- ここまで追加 ---
  }

  // 操作ログの検索
  searchOperationLogs() {
    if (!this.logSearchQuery && !this.selectedOperationType && !this.selectedDate) {
      this.filteredOperationLogs = [...this.operationLogs];
      this.currentPage = 1;
      return;
    }

    this.filteredOperationLogs = this.operationLogs.filter(log => {
      const matchesSearch = !this.logSearchQuery || 
        log.user_name.toLowerCase().includes(this.logSearchQuery.toLowerCase()) ||
        log.operation_detail.toLowerCase().includes(this.logSearchQuery.toLowerCase());

      const matchesType = !this.selectedOperationType || 
        log.operation_type === this.selectedOperationType;

      const matchesDate = !this.selectedDate || 
        log.timestamp.toISOString().split('T')[0] === this.selectedDate;

      return matchesSearch && matchesType && matchesDate;
    });
    this.currentPage = 1;
  }

  // 操作種別の日本語表示
  getOperationTypeLabel(type: string): string {
    const typeLabels: Record<string, string> = {
      'login': 'ログイン',
      'salary': '給与変更',
      'insurance': '保険情報変更',
      'user': 'ユーザー管理'
    };
    return typeLabels[type] || type;
  }

  // 操作種別の背景色
  getOperationTypeStyle(type: string): string {
    const styles: Record<string, string> = {
      'login': 'background: #e3f2fd; color: #1976d2;',
      'salary': 'background: #fff3e0; color: #e65100;',
      'insurance': 'background: #e8f5e9; color: #2e7d32;',
      'user': 'background: #f3e5f5; color: #7b1fa2;'
    };
    return styles[type] || 'background: #f5f5f5; color: #333;';
  }

  // ステータスの背景色
  getStatusStyle(status: string): string {
    return status === 'success' 
      ? 'background: #e8f5e9; color: #2e7d32;'
      : 'background: #ffebee; color: #c62828;';
  }

  // 操作ログのoperation_detailを日本語で分かりやすく表示する
  formatOperationDetail(detail: string): string {
    if (!detail) return '';
    // auto_gradeを → 等級を
    return detail.replace(/^auto_gradeを/, '等級を');
  }

  get totalPages(): number {
    return Math.ceil(this.filteredOperationLogs.length / this.pageSize) || 1;
  }

  get pagedOperationLogs() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredOperationLogs.slice(start, start + this.pageSize);
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  goToPrevPage() {
    if (this.currentPage > 1) this.currentPage--;
  }

  goToNextPage() {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  // 変更したユーザー名を取得
  getTargetUserName(log: any): string {
    // 1. target_user_nameがあればそれを表示
    if (log.target_user_name) return log.target_user_name;
    // 2. employee_codeがあれば（従業員番号＋氏名）
    if (log.employee_code && log.user_name) return `${log.employee_code} ${log.user_name}`;
    // 3. operation_detailから「○○を△△に変更」などを抽出
    if (log.operation_detail) {
      // 例：「等級を「22（19）」→「19（16）」に変更」
      const match = log.operation_detail.match(/→[「"]?(.+?)[」"]?に変更/);
      if (match) return match[1];
    }
    // 4. なければ空文字
    return '';
  }

  /**
   * 操作ログの変更者名を取得（updated_byからemployeesコレクションを参照）
   * 非同期でキャッシュし、なければ「-」を返す
   */
  async getUpdatedByName(log: any): Promise<string> {
    if (!log.updated_by) return '-';
    if (this.updatedByNameMap[log.updated_by]) return this.updatedByNameMap[log.updated_by];
    try {
      const empDoc = await getDoc(doc(this.firestore, 'employees', log.updated_by));
      if (empDoc.exists()) {
        const data = empDoc.data();
        const name = (data['last_name_kanji'] || '') + (data['first_name_kanji'] || '');
        this.updatedByNameMap[log.updated_by] = name;
        return name;
      } else {
        this.updatedByNameMap[log.updated_by] = '-';
        return '-';
      }
    } catch {
      this.updatedByNameMap[log.updated_by] = '-';
      return '-';
    }
  }
}
