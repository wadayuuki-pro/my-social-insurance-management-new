import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { Firestore, doc, getDoc, updateDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
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
  [key: string]: any;
}

@Component({
  selector: 'app-master-settings-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './master-settings-admin.component.html',
  styleUrl: './master-settings-admin.component.scss'
})
export class MasterSettingsAdminComponent {
  selectedTab: string = 'office';
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

  // 日本語ラベルマッピング
  fieldLabels: Record<string, string> = {
    company_name: '会社名',
    company_name_kana: '会社名カナ',
    address: '住所',
    phone_number: '電話番号',
    representative_name: '代表者名',
    contact_email: '連絡先メール',
    postal_code: '郵便番号',
    department_name: '事業所名',
    location: '所在地',
    email: 'メール',
    department_id: '事業所ID',
    company_id: '会社ID',
    office_number: '事業所番号',
    manager_name: '管理者名',
  };

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

  // 会社情報の編集開始
  startEditingCompany() {
    this.isEditingCompany = true;
    this.companyForm = { ...this.companyInfo };
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
}
