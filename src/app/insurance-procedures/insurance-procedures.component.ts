import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map, of, from } from 'rxjs';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';

interface Procedure {
  id: string;
  type: string;
  status: string;
  applicant: string;
  date: string;
}

interface Employee {
  id: string;
  name: string;
  office_id?: string;
}

interface Office {
  id: string;
  name: string;
}

@Component({
  selector: 'app-insurance-procedures',
  standalone: true,
  templateUrl: './insurance-procedures.component.html',
  styleUrl: './insurance-procedures.component.scss',
  imports: [CommonModule, FormsModule]
})
export class InsuranceProceduresComponent implements OnInit {
  selectedTab: 'list' | 'form' | 'auto' | 'pdf' = 'list';

  // サンプル：手続き一覧
  procedureTypes = ['資格取得', '喪失', '月額変更', '賞与', '氏名変更', '住所変更'];
  procedureStatuses = ['未完了', '申請中', '承認済み'];
  procedures: Procedure[] = [
    { id: '1', type: '資格取得', status: '申請中', applicant: '山田太郎', date: '2024-06-01' },
    { id: '2', type: '月額変更', status: '未完了', applicant: '佐藤花子', date: '2024-05-20' },
    { id: '3', type: '氏名変更', status: '承認済み', applicant: '田中一郎', date: '2024-04-15' },
  ];
  selectedProcedureType = '';
  selectedProcedureStatus = '';

  // 事業所リスト
  offices: Office[] = [];
  selectedOfficeId = '';

  // 従業員リスト
  employees: Employee[] = [];
  selectedEmployeeId = '';

  formData = {
    info: '',
    file: null as File | null,
    fileName: '',
  };
  formError = '';
  draftSaved = false;

  // サンプル：自動判定
  salaryChangeDetected = true;
  dependentCheckAlert = '扶養資格に該当しない可能性があります。';
  suggestedDocuments = ['資格取得届', '扶養異動届'];

  // サンプル：PDFテンプレート
  pdfTemplates = ['資格取得届テンプレート', '氏名変更届テンプレート'];
  selectedPdfTemplate = '';
  pdfPreviewUrl = '';

  user$;
  isAuthReady$;
  employeeInfo$;
  companyId: string = '';
  currentEmployeeId: string = '';
  currentOfficeId: string = '';

  constructor(
    public authService: AuthService,
    private firestore: Firestore
  ) {
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
              name: `${data['last_name_kanji'] || ''}${data['first_name_kanji'] || ''}`,
              office_id: data['office_id'] || ''
            };
          })
        );
      })
    );
  }

  async ngOnInit() {
    this.isAuthReady$.subscribe(async isReady => {
      if (isReady) {
        this.employeeInfo$.subscribe(async info => {
          if (info) {
            this.companyId = info.company_id;
            this.currentEmployeeId = info.employee_code;
            this.currentOfficeId = info.office_id || '';
            // 事業所リスト取得
            await this.loadOffices();
            // 従業員リスト取得
            await this.loadEmployees();
            // デフォルト値セット
            this.selectedOfficeId = this.currentOfficeId || (this.offices[0]?.id ?? '');
            this.selectedEmployeeId = this.currentEmployeeId;
          }
        });
      }
    });
  }

  async loadOffices() {
    if (!this.companyId) return;
    const departmentsCol = collection(this.firestore, 'departments');
    const q = query(departmentsCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.offices = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data()['department_name'] }));
  }

  async loadEmployees() {
    if (!this.companyId) return;
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.employees = snapshot.docs.map(doc => ({
      id: doc.data()['employee_code'],
      name: `${doc.data()['last_name_kanji'] || ''}${doc.data()['first_name_kanji'] || ''}`,
      office_id: doc.data()['office_id'] || ''
    }));
  }

  // 手続き一覧フィルタリング
  get filteredProcedures() {
    return this.procedures.filter(p =>
      (!this.selectedProcedureType || p.type === this.selectedProcedureType) &&
      (!this.selectedProcedureStatus || p.status === this.selectedProcedureStatus)
    );
  }

  // 届出フォーム：下書き保存ダミー
  saveDraft() {
    this.draftSaved = true;
    setTimeout(() => this.draftSaved = false, 2000);
  }

  // 添付ファイル選択ダミー
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.formData.file = file;
      this.formData.fileName = file.name;
    }
  }

  // 届出フォーム：送信ダミー
  submitForm() {
    if (!this.selectedEmployeeId || !this.formData.info) {
      this.formError = '必須項目を入力してください';
      return;
    }
    this.formError = '';
    alert('申請を送信しました（ダミー）');
    this.selectedEmployeeId = this.currentEmployeeId;
    this.selectedOfficeId = this.currentOfficeId;
    this.formData = { info: '', file: null, fileName: '' };
  }
}
