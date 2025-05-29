import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs, doc, updateDoc, addDoc, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray, Validators, AbstractControl, ValidatorFn } from '@angular/forms';
import { AddMemberButtonComponent } from '../shared/components/add-member-button/add-member-button.component';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map } from 'rxjs/operators';
import { of, from } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { Storage } from '@angular/fire/storage';
import { Router } from '@angular/router';
import { Timestamp } from '@angular/fire/firestore';

interface Employee {
  id: string;
  employee_code: string;
  last_name_kanji: string;
  first_name_kanji: string;
  department_id: string;
  department?: string;
  my_number?: string;
  my_number_registered_at?: any;
  my_number_updated_at?: any;
  uid?: string;
  [key: string]: any;
  hasMyNumber?: boolean;
}

@Component({
  selector: 'app-employee-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AddMemberButtonComponent, FormsModule],
  templateUrl: './employee-management.component.html',
  styleUrl: './employee-management.component.scss'
})
export class EmployeeManagementComponent implements OnInit {
  employees: any[] = [];
  filteredEmployees: any[] = [];
  companyId: string = '';
  searchForm: FormGroup;
  searchSortForm: FormGroup;
  isSearchSortPanelOpen: boolean = false;
  selectedEmployee: any = null;
  detailForm: FormGroup;
  showDetailModal = false;
  detailSaveMessage: string = '';
  showNewEmployeeModal = false;
  newEmployeeForm: FormGroup;

  // 扶養者追加用モーダルフォームと表示フラグ
  dependentForm: FormGroup;
  showDependentModal = false;
  editingDependentIndex: number | null = null;
  editingNewEmployeeDependentIndex: number | null = null;

  departments: any[] = [];

  // フィールド日本語ラベル対応表
  employeeFieldLabels: { [key: string]: string } = {
    company_id: '所属会社ID',
    department_id: '所属事業所ID',
    employee_code: '社員ID',
    last_name_kanji: '姓（漢字）',
    first_name_kanji: '名（漢字）',
    last_name_kana: '姓（カナ）',
    first_name_kana: '名（カナ）',
    date_of_birth: '生年月日',
    gender: '性別',
    nationality: '国籍',
    my_number: 'マイナンバー',
    postal_code: '郵便番号',
    address: '現住所',
    phone_number: '電話番号',
    email: 'メールアドレス',
    employment_type: '雇用形態',
    employment_start_date: '勤務開始日',
    employment_end_date: '勤務終了日',
    status: '在籍ステータス',
    department: '所属部署',
    work_category: '職位',
    health_insurance_enrolled: '健康保険加入状況',
    pension_insurance_enrolled: '厚生年金加入状況',
    health_insurance_number: '健康保険番号',
    pension_number: '基礎年金番号',
    has_dependents: '扶養家族の有無',
    dependents: '扶養者情報',
    remarks: '特記事項',
    created_at: '作成日時',
    updated_at: '更新日時',
    role: '権限',
    password: 'パスワード',
    is_dependent: '自分が扶養されているか',
    expected_salary: '給与支給予定額',
    auto_grade: '等級',
    auto_standard_salary: '標準報酬月額'
  };

  // 入力例（placeholder）
  employeeFieldPlaceholders: { [key: string]: string } = {
    last_name_kanji: '例：山田',
    first_name_kanji: '例：太郎',
    last_name_kana: '例：ヤマダ',
    first_name_kana: '例：タロウ',
    date_of_birth: '例：1990-01-01',
    phone_number: '例：09012345678',
    email: '例：taro@example.com',
    address: '例：東京都新宿区1-2-3',
    postal_code: '例：123-4567',
    my_number: '例：123456789012',
    department: '例：営業部',
    work_category: '例：部長',
    health_insurance_number: '例：12345678(8桁)',
    pension_number: '例：123456789012(12桁 ハイフンなし)',
    remarks: '例：特記事項など',
    password: '初期パスワードは自動生成'
  };

  employeeFieldOrder: string[] = [
    'company_id',
    'department_id',
    'employee_code',
    'last_name_kanji',
    'first_name_kanji',
    'last_name_kana',
    'first_name_kana',
    'date_of_birth',
    'gender',
    'nationality',
    'my_number',
    'postal_code',
    'address',
    'phone_number',
    'email',
    'employment_type',
    'employment_start_date',
    'employment_end_date',
    'status',
    'department',
    'work_category',
    'health_insurance_enrolled',
    'pension_insurance_enrolled',
    'health_insurance_number',
    'pension_number',
    'has_dependents',
    'is_dependent',
    'dependents',
    'remarks',
    'role',
    'password',
    'expected_salary',
    'auto_grade',
    'auto_standard_salary',
    'created_at',
    'updated_at'
  ];

  // 全角カタカナバリデータ
  katakanaValidator: ValidatorFn = (control: AbstractControl) => {
    const value = control.value;
    return value === '' || /^[ァ-ヶー　]+$/.test(value) ? null : { katakana: true };
  };

  // 新規メンバー追加用の扶養者FormArray
  get newEmployeeDependentsArray(): FormArray {
    return this.newEmployeeForm.get('dependents') as FormArray;
  }

  showMyNumber: boolean = false;

  showPartTimeFieldsModal = false;
  partTimeFieldsForm: FormGroup;

  public user$;
  public isAuthReady$;
  public employeeInfo$;

  showLeaveDates = false;
  showNewLeaveDates = false;

  // バリデータ追加
  healthInsuranceNumberValidator: ValidatorFn = (control: AbstractControl) => {
    const value = control.value;
    if (!value) return null;
    return /^\d{8}$/.test(value) ? null : { length: true };
  };
  pensionNumberValidator: ValidatorFn = (control: AbstractControl) => {
    const value = control.value;
    if (!value) return null;
    return /^\d{12}$/.test(value) ? null : { length: true };
  };

  @ViewChild('employeesImportInput') employeesImportInput!: ElementRef<HTMLInputElement>;
  @ViewChild('dependentsImportInput') dependentsImportInput!: ElementRef<HTMLInputElement>;

  activeTab: 'employee' | 'mynumber' | 'insurance' = 'employee';

  // マイナンバー管理用のプロパティ
  myNumberSearchForm: FormGroup;
  myNumberEditForm: FormGroup;
  showMyNumberEditModal = false;
  filteredMyNumberEmployees: any[] = [];

  // 事業所関連のプロパティを追加
  offices: any[] = [];
  selectedOfficeId: string = '';
  officeEmployees: Employee[] = [];

  currentUserRole: string = '';

  // ログインユーザーのマイナンバー登録状況を取得するプロパティ
  public isMyNumberRegistered: boolean = false;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private fb: FormBuilder,
    private authService: AuthService,
    private http: HttpClient,
    private storage: Storage,
    private router: Router
  ) {
    this.searchForm = this.fb.group({
      employee_id: ['']
    });
    this.searchSortForm = this.fb.group({
      // 検索条件
      employee_code: [''],
      name: [''],
      department: [''],
      employment_type: [''],
      status: [''],
      health_insurance: [''],
      pension_insurance: [''],
      has_dependents: [''],
      // ソート条件
      sort1_field: [''],
      sort1_order: ['asc'],
      sort2_field: [''],
      sort2_order: ['asc']
    });
    this.detailForm = this.fb.group({});
    this.newEmployeeForm = this.fb.group({
      company_id: [''],
      department_id: ['', Validators.required],
      employee_code: ['', Validators.required],
      last_name_kanji: ['', Validators.required],
      first_name_kanji: ['', Validators.required],
      last_name_kana: ['', [Validators.required, this.katakanaValidator]],
      first_name_kana: ['', [Validators.required, this.katakanaValidator]],
      date_of_birth: [''],
      gender: [''],
      nationality: [''],
      my_number: [''],
      postal_code: [''],
      address: [''],
      phone_number: [''],
      email: ['', [Validators.required, Validators.email]],
      employment_type: [''],
      employment_start_date: [''],
      employment_end_date: [''],
      leave_start_date: [''],
      leave_end_date: [''],
      status: ['在籍中'],
      department: [''],
      work_category: [''],
      health_insurance_enrolled: [false],
      pension_insurance_enrolled: [false],
      health_insurance_number: ['', [this.healthInsuranceNumberValidator]],
      pension_number: ['', [this.pensionNumberValidator]],
      has_dependents: [false],
      is_dependent: [false],
      role: [''],
      password: [''],
      remarks: [''],
      dependents: this.fb.array([]),
      scheduled_working_hours: [''],
      employment_contract_period: [''],
      expected_monthly_income: [''],
      student_category: ['学生ではない'],
      expected_salary: [''],
      auto_grade: [{value: '', disabled: true}],
      auto_standard_salary: [{value: '', disabled: true}],
      health_insurance_enrollment_date: [''],
      pension_insurance_enrollment_date: [''],
      health_insurance_withdrawal_date: [''],
      pension_insurance_withdrawal_date: [''],
      created_at: [new Date()],
      updated_at: [new Date()]
    });
    // 扶養者追加用フォーム初期化
    this.dependentForm = this.fb.group({
      name: [''],
      relationship: [''],
      birthdate: [''],
      gender: [''],
      cohabitation: [false],
      annualIncome: [''],
      employmentStatus: [''],
      fuyouStartDate: [''],
      isCurrentlyDependent: [true],
      note: [''],
      myNumber: ['']
    });
    this.partTimeFieldsForm = this.fb.group({
      scheduled_working_hours: [''],
      employment_contract_period: [''],
      expected_monthly_income: [''],
      student_category: ['学生ではない']
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

    // マイナンバー検索フォームの初期化
    this.myNumberSearchForm = this.fb.group({
      office_id: [''],
      employee_id: [''],
      name: [''],
      department: [''],
      my_number_status: [''],
      selected_employee_id: ['']
    });

    // マイナンバー編集フォームの初期化
    this.myNumberEditForm = this.fb.group({
      my_number: ['', [Validators.required, Validators.pattern(/^\d{12}$/)]],
      my_number_note: ['']
    });

    // ログイン情報から会社IDを取得
    this.employeeInfo$.subscribe(info => {
      if (info) {
        this.companyId = info.company_id;
        // 会社IDが取得できたら部署一覧と事業所一覧を読み込む
        this.loadDepartments();
        this.loadOffices();
      }
    });

    // ログインユーザーの権限を取得
    this.auth.onAuthStateChanged(async (user) => {
      if (user && user.email) {
        // 会社IDは this.companyId で取得済み
        // companyIdがまだセットされていない場合は待つ
        const waitForCompanyId = async () => {
          while (!this.companyId) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        };
        await waitForCompanyId();
        const employeesCol = collection(this.firestore, 'employees');
        const q = query(
          employeesCol,
          where('company_id', '==', this.companyId),
          where('email', '==', user.email)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          const data = docSnap.data();
          this.currentUserRole = data['role'] || '';
          console.log('現在のユーザー権限:', this.currentUserRole);
          // ドキュメントIDを取得
          const employeeDocId = docSnap.id;
          // sensitive_idsコレクションの同じIDのmyNumberを確認
          const sensitiveDoc = await getDoc(doc(this.firestore, 'sensitive_ids', employeeDocId));
          this.isMyNumberRegistered = !!(sensitiveDoc.exists() && sensitiveDoc.data()['myNumber']);
        } else {
          this.currentUserRole = '';
          this.isMyNumberRegistered = false;
          console.log('ユーザー情報が見つかりませんでした');
        }
      }
    });
  }

  async ngOnInit() {
    this.authService.companyId$.subscribe(async companyId => {
      if (companyId) {
        this.companyId = companyId;
        await this.loadEmployees();
      }
    });
    // 検索欄の値が変わったらフィルタ
    this.searchForm.get('employee_id')!.valueChanges.subscribe(val => {
      this.filterEmployees(val);
    });
    await this.logCurrentEmployeeAndSensitiveId();
  }

  async loadEmployees() {
    if (!this.companyId) return;
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.employees = snapshot.docs.map(doc => doc.data());
    this.filteredEmployees = [...this.employees];
  }

  filterEmployees(employeeId: string) {
    if (!employeeId) {
      this.filteredEmployees = [...this.employees];
    } else {
      this.filteredEmployees = this.employees.filter(emp => emp.employee_code && emp.employee_code === employeeId);
    }
  }

  // 検索・ソート条件に基づいて従業員をフィルタリング
  applySearchAndSort() {
    const searchValues = this.searchSortForm.value;
    let filtered = [...this.employees];

    // 検索条件の適用
    if (searchValues.employee_code) {
      filtered = filtered.filter(emp => 
        emp.employee_code?.toLowerCase().includes(searchValues.employee_code.toLowerCase())
      );
    }

    if (searchValues.name) {
      filtered = filtered.filter(emp => 
        (emp.last_name_kanji + ' ' + emp.first_name_kanji).toLowerCase().includes(searchValues.name.toLowerCase()) ||
        (emp.last_name_kana + ' ' + emp.first_name_kana).toLowerCase().includes(searchValues.name.toLowerCase())
      );
    }

    if (searchValues.department) {
      filtered = filtered.filter(emp => emp.department_id === searchValues.department);
    }

    if (searchValues.employment_type) {
      filtered = filtered.filter(emp => emp.employment_type === searchValues.employment_type);
    }

    if (searchValues.status) {
      filtered = filtered.filter(emp => emp.status === searchValues.status);
    }

    if (searchValues.health_insurance !== '') {
      filtered = filtered.filter(emp => emp.health_insurance_enrolled === (searchValues.health_insurance === 'true'));
    }

    if (searchValues.pension_insurance !== '') {
      filtered = filtered.filter(emp => emp.pension_insurance_enrolled === (searchValues.pension_insurance === 'true'));
    }

    if (searchValues.has_dependents !== '') {
      filtered = filtered.filter(emp => emp.has_dependents === (searchValues.has_dependents === 'true'));
    }

    // ソート条件の適用
    if (searchValues.sort1_field) {
      filtered.sort((a, b) => {
        let valueA = a[searchValues.sort1_field];
        let valueB = b[searchValues.sort1_field];

        // 日付の場合の特別処理
        if (searchValues.sort1_field === 'employment_start_date' || 
            searchValues.sort1_field === 'updated_at') {
          valueA = valueA?.toDate?.() || valueA;
          valueB = valueB?.toDate?.() || valueB;
        }

        // 名前の場合の特別処理
        if (searchValues.sort1_field === 'last_name_kanji') {
          valueA = (a.last_name_kanji + a.first_name_kanji).toLowerCase();
          valueB = (b.last_name_kanji + b.first_name_kanji).toLowerCase();
        }

        if (valueA < valueB) return searchValues.sort1_order === 'asc' ? -1 : 1;
        if (valueA > valueB) return searchValues.sort1_order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // 第2ソート条件の適用
    if (searchValues.sort2_field) {
      filtered.sort((a, b) => {
        let valueA = a[searchValues.sort2_field];
        let valueB = b[searchValues.sort2_field];

        // 日付の場合の特別処理
        if (searchValues.sort2_field === 'employment_start_date' || 
            searchValues.sort2_field === 'updated_at') {
          valueA = valueA?.toDate?.() || valueA;
          valueB = valueB?.toDate?.() || valueB;
        }

        // 名前の場合の特別処理
        if (searchValues.sort2_field === 'last_name_kanji') {
          valueA = (a.last_name_kanji + a.first_name_kanji).toLowerCase();
          valueB = (b.last_name_kanji + b.first_name_kanji).toLowerCase();
        }

        if (valueA < valueB) return searchValues.sort2_order === 'asc' ? -1 : 1;
        if (valueA > valueB) return searchValues.sort2_order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    this.filteredEmployees = filtered;
  }

  // 検索条件のリセット
  resetSearchAndSort() {
    this.searchSortForm.reset({
      employee_code: '',
      name: '',
      department: '',
      employment_type: '',
      status: '',
      health_insurance: '',
      pension_insurance: '',
      has_dependents: '',
      sort1_field: '',
      sort1_order: 'asc',
      sort2_field: '',
      sort2_order: 'asc'
    });
    this.filteredEmployees = [...this.employees];
  }

  // 検索ボタンクリック時の処理
  onSearch() {
    this.applySearchAndSort();
  }

  // リセットボタンクリック時の処理
  onReset() {
    this.resetSearchAndSort();
  }

  async openDetail(emp: any) {
    this.selectedEmployee = { ...emp };
    this.detailForm = this.fb.group({});
    // 会社IDに紐づく事業所リストを取得
    this.departments = [];
    if (emp.company_id) {
      const departmentsCol = collection(this.firestore, 'departments');
      const q = query(departmentsCol, where('company_id', '==', emp.company_id));
      const snapshot = await getDocs(q);
      this.departments = snapshot.docs.map(doc => doc.data());
    }
    for (const key of Object.keys(emp)) {
      if (key === 'company_id') {
        this.detailForm.addControl(key, this.fb.control({ value: emp[key], disabled: true }));
      } else if (key === 'password') {
        this.detailForm.addControl(key, this.fb.control({ value: emp[key], disabled: true }));
      } else if (key === 'dependents') {
        // 扶養者情報はFormArrayで初期化（画像のフィールドに合わせる）
        const dependentsFGs = (Array.isArray(emp[key]) ? emp[key] : []).map((d: any) =>
          this.fb.group({
            name: [d.name || ''],
            relationship: [d.relationship || ''],
            birthdate: [d.birthdate || ''],
            gender: [d.gender || ''],
            cohabitation: [d.cohabitation ?? false],
            annualIncome: [d.annualIncome ?? ''],
            employmentStatus: [d.employmentStatus || ''],
            fuyouStartDate: [d.fuyouStartDate || ''],
            isCurrentlyDependent: [d.isCurrentlyDependent ?? true],
            note: [d.note || ''],
            myNumber: [d.myNumber || '']
          })
        );
        this.detailForm.addControl(key, this.fb.array(dependentsFGs));
      } else if (key === 'last_name_kana' || key === 'first_name_kana') {
        this.detailForm.addControl(key, this.fb.control(emp[key], [this.katakanaValidator]));
      } else if (key === 'health_insurance_enrolled' || key === 'pension_insurance_enrolled') {
        // 編集不可・自動セット
        this.detailForm.addControl(key, this.fb.control(emp[key]));
      } else {
        this.detailForm.addControl(key, this.fb.control(emp[key]));
      }
    }
    // 健康保険番号の値を監視し、health_insurance_enrolledを自動セット
    this.detailForm.get('health_insurance_number')?.valueChanges.subscribe(val => {
      this.detailForm.get('health_insurance_enrolled')?.setValue(val && val.trim() !== '' ? true : false, { emitEvent: false });
    });
    // 初期値も反映
    const hin = this.detailForm.get('health_insurance_number')?.value;
    this.detailForm.get('health_insurance_enrolled')?.setValue(hin && hin.trim() !== '' ? true : false, { emitEvent: false });
    // 厚生年金番号の値を監視し、pension_insurance_enrolledを自動セット
    this.detailForm.get('pension_number')?.valueChanges.subscribe(val => {
      this.detailForm.get('pension_insurance_enrolled')?.setValue(val && val.trim() !== '' ? true : false, { emitEvent: false });
    });
    // 初期値も反映
    const pn = this.detailForm.get('pension_number')?.value;
    this.detailForm.get('pension_insurance_enrolled')?.setValue(pn && pn.trim() !== '' ? true : false, { emitEvent: false });
    // expected_salary, auto_grade, auto_standard_salaryを追加
    this.detailForm.addControl('expected_salary', this.fb.control(emp.expected_salary || ''));
    this.detailForm.addControl('auto_grade', this.fb.control({value: '', disabled: true}));
    this.detailForm.addControl('auto_standard_salary', this.fb.control({value: '', disabled: true}));
    // expected_salaryの変更監視
    this.detailForm.get('expected_salary')?.valueChanges.subscribe(val => {
      this.judgeGradeAndStandardSalary(val, 'detail');
    });
    this.showDetailModal = true;
    this.detailSaveMessage = '';
  }

  closeDetail() {
    this.showDetailModal = false;
    this.selectedEmployee = null;
    this.detailSaveMessage = '';
  }

  async saveDetail() {
    if (!this.selectedEmployee || !this.selectedEmployee.employee_code) return;
    // バリデーションチェック
    if (this.detailForm.get('health_insurance_number')?.value && this.detailForm.get('health_insurance_number')?.errors?.['length']) {
      this.detailSaveMessage = '健康保険番号の桁数に誤りがあります';
      return;
    }
    if (this.detailForm.get('pension_number')?.value && this.detailForm.get('pension_number')?.errors?.['length']) {
      this.detailSaveMessage = '基礎年金番号の桁数に誤りがあります';
      return;
    }
    try {
      const employeesCol = collection(this.firestore, 'employees');
      // employee_codeとcompany_idで一意に特定
      const q = query(employeesCol, where('employee_code', '==', this.selectedEmployee.employee_code), where('company_id', '==', this.selectedEmployee.company_id));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const ref = doc(this.firestore, 'employees', snapshot.docs[0].id);
        // created_at, updated_atを除外して保存
        const saveData = { ...this.detailForm.value };
        delete saveData.created_at;
        // updated_atは現在時刻で上書き
        saveData.updated_at = new Date();
        // dependentsに値があればhas_dependentsをtrue、なければfalseに自動セット
        if (Array.isArray(saveData.dependents) && saveData.dependents.length > 0) {
          saveData.has_dependents = true;
        } else if (typeof saveData.dependents === 'string' && saveData.dependents.trim() !== '') {
          saveData.has_dependents = true;
        } else {
          saveData.has_dependents = false;
        }
        // 健康保険番号があればhealth_insurance_enrolledをtrue、なければfalse
        if (saveData.health_insurance_number && saveData.health_insurance_number.trim() !== '') {
          saveData.health_insurance_enrolled = true;
        } else {
          saveData.health_insurance_enrolled = false;
        }
        // 厚生年金番号があればpension_insurance_enrolledをtrue、なければfalse
        if (saveData.pension_number && saveData.pension_number.trim() !== '') {
          saveData.pension_insurance_enrolled = true;
        } else {
          saveData.pension_insurance_enrolled = false;
        }
        // 保存前に等級・標準報酬月額を再取得
        let auto_grade = saveData.auto_grade;
        let auto_standard_salary = saveData.auto_standard_salary;
        if (saveData.expected_salary && saveData.department_id) {
          const depDoc = await getDocs(query(collection(this.firestore, 'departments'), where('department_id', '==', saveData.department_id), where('company_id', '==', this.companyId)));
          let prefectureId = '';
          if (!depDoc.empty) {
            prefectureId = depDoc.docs[0].data()['prefecture_id'] || '';
          }
          if (prefectureId) {
            // 年度は現在時刻から
            const now = new Date();
            const year = String(now.getFullYear());
            const gradesCol = collection(this.firestore, 'prefectures', prefectureId, 'insurance_premiums', year, 'grades');
            const gradesSnapshot = await getDocs(gradesCol);
            const grades: { [key: string]: any } = {};
            gradesSnapshot.forEach(doc => {
              grades[doc.id] = doc.data();
            });
            for (const [gradeId, grade] of Object.entries(grades)) {
              if (saveData.expected_salary >= grade.salaryMin && saveData.expected_salary < grade.salaryMax) {
                auto_grade = gradeId;
                auto_standard_salary = grade.standardSalary;
                break;
              }
            }
          }
        }
        // --- ここから操作ログ用のauto_grade変更検知 ---
        const beforeAutoGrade = this.selectedEmployee.auto_grade || '';
        const afterAutoGrade = auto_grade === undefined ? '' : auto_grade;
        // --- ここまで ---
        saveData.auto_grade = afterAutoGrade;
        saveData.auto_standard_salary = auto_standard_salary === undefined ? '' : auto_standard_salary;
        await updateDoc(ref, saveData);
        // --- auto_gradeが変更された場合のみ操作ログを記録 ---
        if (beforeAutoGrade !== afterAutoGrade) {
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
            user_id: snapshot.docs[0].id,
            employee_code: this.selectedEmployee.employee_code,
            user_name: (this.selectedEmployee.last_name_kanji || '') + (this.selectedEmployee.first_name_kanji || ''),
            company_id: this.selectedEmployee.company_id,
            operation_type: 'salary',
            operation_detail: `auto_gradeを「${beforeAutoGrade}」→「${afterAutoGrade}」に変更`,
            ip_address: ipAddress,
            status: 'success',
            timestamp: new Date()
          });
        }
        // --- ここまで ---
        this.detailSaveMessage = '保存しました';
        await this.loadEmployees();
        this.closeDetail(); // 保存後にモーダルを閉じる
      }
    } catch (e) {
      this.detailSaveMessage = '保存に失敗しました';
    }
  }

  // 扶養者情報FormArray取得
  get dependentsArray(): FormArray {
    return this.detailForm.get('dependents') as FormArray;
  }

  // 扶養者追加モーダルを開く
  openDependentModal() {
    this.dependentForm.reset({
      name: '',
      relationship: '',
      birthdate: '',
      gender: '',
      cohabitation: false,
      annualIncome: '',
      employmentStatus: '',
      fuyouStartDate: '',
      isCurrentlyDependent: true,
      note: '',
      myNumber: ''
    });
    this.editingDependentIndex = null;
    this.showDependentModal = true;
  }

  // 扶養者編集モーダルを開く
  editDependent(index: number) {
    const dep = this.dependentsArray.at(index).value;
    this.dependentForm.setValue({
      name: dep.name || '',
      relationship: dep.relationship || '',
      birthdate: dep.birthdate || '',
      gender: dep.gender || '',
      cohabitation: dep.cohabitation ?? false,
      annualIncome: dep.annualIncome ?? '',
      employmentStatus: dep.employmentStatus || '',
      fuyouStartDate: dep.fuyouStartDate || '',
      isCurrentlyDependent: dep.isCurrentlyDependent ?? true,
      note: dep.note || '',
      myNumber: dep.myNumber || ''
    });
    this.editingDependentIndex = index;
    this.showDependentModal = true;
  }

  // モーダルから扶養者を追加または編集
  addDependentFromModal() {
    if (this.dependentForm.valid) {
      if (this.editingDependentIndex !== null) {
        // 詳細編集の場合は上書き
        this.dependentsArray.at(this.editingDependentIndex).setValue(this.dependentForm.value);
      } else if (this.editingNewEmployeeDependentIndex !== null) {
        // 新規メンバー追加の場合は上書き
        this.newEmployeeDependentsArray.at(this.editingNewEmployeeDependentIndex).setValue(this.dependentForm.value);
      } else {
        // 新規追加の場合は、現在開いているフォームに応じて追加
        if (this.showNewEmployeeModal) {
          this.newEmployeeDependentsArray.push(this.fb.group(this.dependentForm.value));
        } else {
          this.dependentsArray.push(this.fb.group(this.dependentForm.value));
        }
      }
      this.closeDependentModal();
    }
  }

  // 扶養者追加モーダルを閉じる
  closeDependentModal() {
    this.showDependentModal = false;
    this.editingDependentIndex = null;
    this.editingNewEmployeeDependentIndex = null;
  }

  removeDependent(i: number) {
    this.dependentsArray.removeAt(i);
  }

  exportAllEmployeesCSV() {
    if (!this.filteredEmployees || this.filteredEmployees.length === 0) {
      alert('エクスポートする従業員がありません。');
      return;
    }

    // 扶養者情報を除外した基本情報のカラム
    const baseFields = this.employeeFieldOrder.filter(f => 
      !['company_id', 'my_number', 'role', 'password', 'dependents', 'created_at', 'updated_at'].includes(f)
    );

    // ヘッダー行の作成
    const headers = baseFields.map(f => this.employeeFieldLabels[f] || f);

    // データ行の作成
    const rows: string[][] = [];
    
    for (const emp of this.filteredEmployees) {
      const baseData = baseFields.map(f => {
        let val = emp[f];
        if (f === 'has_dependents') return val ? '有' : '無';
        if (f === 'health_insurance_enrolled' || f === 'pension_insurance_enrolled') return val ? '加入' : '未加入';
        if (f === 'is_dependent') return val ? 'はい' : 'いいえ';
        if (val === undefined || val === null) return '';
        return val;
      });
      rows.push(baseData);
    }

    // CSVコンテンツの作成
    const csvContent = [
      headers,
      ...rows
    ].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');

    // ダウンロード
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportEmployeeCSV(employee: any) {
    // 扶養者情報を除外した基本情報のカラム
    const baseFields = this.employeeFieldOrder.filter(f => 
      !['company_id', 'my_number', 'role', 'password', 'dependents', 'created_at', 'updated_at'].includes(f)
    );

    // ヘッダー行の作成
    const headers = baseFields.map(f => this.employeeFieldLabels[f] || f);

    // データ行の作成
    const baseData = baseFields.map(f => {
      let val = employee[f];
      if (f === 'has_dependents') return val ? '有' : '無';
      if (f === 'health_insurance_enrolled' || f === 'pension_insurance_enrolled') return val ? '加入' : '未加入';
      if (f === 'is_dependent') return val ? 'はい' : 'いいえ';
      if (val === undefined || val === null) return '';
      return val;
    });

    // CSVコンテンツの作成
    const csvContent = [
      headers,
      baseData
    ].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');

    // ダウンロード
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee_${employee.id}_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async openNewEmployeeModal() {
    // 会社IDに紐づく事業所リストを取得
    this.departments = [];
    if (this.companyId) {
      const departmentsCol = collection(this.firestore, 'departments');
      const q = query(departmentsCol, where('company_id', '==', this.companyId));
      const snapshot = await getDocs(q);
      this.departments = snapshot.docs.map(doc => doc.data());
    }

    this.newEmployeeForm = this.fb.group({
      employee_code: ['', Validators.required],
      last_name_kanji: ['', Validators.required],
      first_name_kanji: ['', Validators.required],
      last_name_kana: ['', [Validators.required, this.katakanaValidator]],
      first_name_kana: ['', [Validators.required, this.katakanaValidator]],
      email: ['', [Validators.required, Validators.email]],
      department_id: ['', Validators.required],
      company_id: [this.companyId],
      role: [''],
      employment_type: [''],
      status: ['在籍中'],
      gender: [''],
      date_of_birth: [''],
      employment_start_date: [''],
      employment_end_date: [''],
      postal_code: [''],
      address: [''],
      phone_number: [''],
      emergency_contact: [''],
      health_insurance_enrolled: [false],
      health_insurance_enrollment_date: [''],
      health_insurance_withdrawal_date: [''],
      health_insurance_number: [''],
      pension_insurance_enrolled: [false],
      pension_insurance_enrollment_date: [''],
      pension_insurance_withdrawal_date: [''],
      pension_number: [''],
      has_dependents: [false],
      is_dependent: [false],
      dependents: this.fb.array([])
    });

    // 所属会社IDを編集不可に設定
    this.newEmployeeForm.get('company_id')?.disable();

    this.showNewEmployeeModal = true;
  }

  closeNewEmployeeModal() {
    this.showNewEmployeeModal = false;
    this.newEmployeeForm.get('company_id')?.enable();
  }

  // ランダムなパスワードを生成する関数
  private generateRandomPassword(employeeCode?: string): string {
    // 社員ID＋00 形式
    return (employeeCode || '') + '00';
  }

  async saveNewEmployee() {
    if (this.newEmployeeForm.invalid) {
      // 必須項目のエラーメッセージを表示
      Object.keys(this.newEmployeeForm.controls).forEach(key => {
        const control = this.newEmployeeForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }
    // バリデーションチェック
    if (this.newEmployeeForm.get('health_insurance_number')?.value && this.newEmployeeForm.get('health_insurance_number')?.errors?.['length']) {
      alert('健康保険番号の桁数に誤りがあります');
      return;
    }
    if (this.newEmployeeForm.get('pension_number')?.value && this.newEmployeeForm.get('pension_number')?.errors?.['length']) {
      alert('基礎年金番号の桁数に誤りがあります');
      return;
    }
    try {
      // 所属会社IDを有効化して値を取得
      this.newEmployeeForm.get('company_id')?.enable();
      // フォームの値を取得
      const formValue = this.newEmployeeForm.value;
      // 保存前に等級・標準報酬月額を再取得
      let auto_grade = formValue.auto_grade;
      let auto_standard_salary = formValue.auto_standard_salary;
      if (formValue.expected_salary && formValue.department_id) {
        // 事業所IDから都道府県ID取得
        const depDoc = await getDocs(query(collection(this.firestore, 'departments'), where('department_id', '==', formValue.department_id), where('company_id', '==', this.companyId)));
        let prefectureId = '';
        if (!depDoc.empty) {
          prefectureId = depDoc.docs[0].data()['prefecture_id'] || '';
        }
        if (prefectureId) {
          // 年度は現在時刻から
          const now = new Date();
          const year = String(now.getFullYear());
          const gradesCol = collection(this.firestore, 'prefectures', prefectureId, 'insurance_premiums', year, 'grades');
          const gradesSnapshot = await getDocs(gradesCol);
          const grades: { [key: string]: any } = {};
          gradesSnapshot.forEach(doc => {
            grades[doc.id] = doc.data();
          });
          for (const [gradeId, grade] of Object.entries(grades)) {
            if (formValue.expected_salary >= grade.salaryMin && formValue.expected_salary < grade.salaryMax) {
              auto_grade = gradeId;
              auto_standard_salary = grade.standardSalary;
              break;
            }
          }
        }
      }
      // パスワードを自動生成
      const generatedPassword = this.generateRandomPassword(formValue.employee_code);
      // Firestoreに従業員情報を保存（Auth登録はしない）
      const newEmployeeData = {
        ...formValue,
        auto_grade: auto_grade === undefined ? '' : auto_grade,
        auto_standard_salary: auto_standard_salary === undefined ? '' : auto_standard_salary,
        password: generatedPassword,
        health_insurance_enrolled: formValue.health_insurance_number ? true : false,
        pension_insurance_enrolled: formValue.pension_number ? true : false,
        health_insurance_number: formValue.health_insurance_number || '',
        pension_number: formValue.pension_number || '',
        has_dependents: this.newEmployeeDependentsArray.length > 0,
        is_dependent: false,
        dependents: this.newEmployeeDependentsArray.value,
        created_at: new Date(),
        updated_at: new Date(),
        status: formValue.status || '在籍中'
      };
      this.newEmployeeForm.get('company_id')?.disable();
      const employeesCol = collection(this.firestore, 'employees');
      await addDoc(employeesCol, newEmployeeData);
      alert(`新規メンバーを追加しました。\n初期パスワード: ${generatedPassword}\n\n※このパスワードはこの画面でのみ表示されます。`);
      this.showNewEmployeeModal = false;
      await this.loadEmployees();
    } catch (error: any) {
      alert('新規メンバーの追加に失敗しました: ' + (error.message || error));
    }
  }

  // 個別サインアップ処理
  async signUpEmployee(employee: any) {
    if (!employee.email || !employee.password) {
      alert('メールアドレスまたはパスワードがありません');
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, employee.email, employee.password);
      // サインアップ成功時にuidをFirestoreに保存
      const employeesCol = collection(this.firestore, 'employees');
      const q = query(employeesCol, where('employee_code', '==', employee.employee_code), where('company_id', '==', employee.company_id));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const ref = doc(this.firestore, 'employees', snapshot.docs[0].id);
        await updateDoc(ref, { uid: userCredential.user.uid });
      }
      alert('サインアップが完了しました');
      await this.loadEmployees();
    } catch (error: any) {
      alert('サインアップに失敗しました: ' + (error.message || error));
    }
  }

  // 新規メンバー追加用の扶養者編集
  editNewEmployeeDependent(index: number) {
    const dep = this.newEmployeeDependentsArray.at(index).value;
    this.dependentForm.setValue({
      name: dep.name || '',
      relationship: dep.relationship || '',
      birthdate: dep.birthdate || '',
      gender: dep.gender || '',
      cohabitation: dep.cohabitation ?? false,
      annualIncome: dep.annualIncome ?? '',
      employmentStatus: dep.employmentStatus || '',
      fuyouStartDate: dep.fuyouStartDate || '',
      isCurrentlyDependent: dep.isCurrentlyDependent ?? true,
      note: dep.note || '',
      myNumber: dep.myNumber || ''
    });
    this.editingNewEmployeeDependentIndex = index;
    this.showDependentModal = true;
  }

  // 新規メンバー追加用の扶養者削除
  removeNewEmployeeDependent(i: number) {
    this.newEmployeeDependentsArray.removeAt(i);
  }

  // 検索・ソートパネルの表示/非表示を切り替え
  toggleSearchSortPanel() {
    this.isSearchSortPanelOpen = !this.isSearchSortPanelOpen;
  }

  toggleMyNumber() {
    this.showMyNumber = !this.showMyNumber;
  }

  // 雇用形態変更時のハンドラ
  onEmploymentTypeChange() {
    // 雇用形態の変更では日付表示を制御しない
    this.showLeaveDates = false;
  }

  // サブモーダルの保存
  savePartTimeFields() {
    this.newEmployeeForm.patchValue(this.partTimeFieldsForm.value);
    this.showPartTimeFieldsModal = false;
  }

  // サブモーダルのキャンセル
  cancelPartTimeFields() {
    this.showPartTimeFieldsModal = false;
  }

  onNewEmploymentTypeChange() {
    // 雇用形態の変更では日付表示を制御しない
    this.showNewLeaveDates = false;
  }

  onStatusChange() {
    const status = this.detailForm.get('status')?.value;
    this.showLeaveDates = ['休職中', '産休中', '育休中'].includes(status);
  }

  onNewStatusChange() {
    const status = this.newEmployeeForm.get('status')?.value;
    this.showNewLeaveDates = ['休職中', '産休中', '育休中'].includes(status);
  }

  async judgeGradeAndStandardSalary(salary: number, mode: 'new' | 'detail') {
    if (!salary || !this.companyId) {
      if (mode === 'new') {
        this.newEmployeeForm.patchValue({ auto_grade: '', auto_standard_salary: '' });
      } else {
        this.detailForm.patchValue({ auto_grade: '', auto_standard_salary: '' });
      }
      return;
    }
    // 会社IDから部署→都道府県IDを取得
    let prefectureId = '';
    if (mode === 'new') {
      const depId = this.newEmployeeForm.get('department_id')?.value;
      if (depId) {
        const depDoc = await getDocs(query(collection(this.firestore, 'departments'), where('department_id', '==', depId), where('company_id', '==', this.companyId)));
        if (!depDoc.empty) {
          prefectureId = depDoc.docs[0].data()['prefecture_id'] || '';
        }
      }
    } else {
      const depId = this.detailForm.get('department_id')?.value;
      if (depId) {
        const depDoc = await getDocs(query(collection(this.firestore, 'departments'), where('department_id', '==', depId), where('company_id', '==', this.companyId)));
        if (!depDoc.empty) {
          prefectureId = depDoc.docs[0].data()['prefecture_id'] || '';
        }
      }
    }
    if (!prefectureId) {
      if (mode === 'new') {
        this.newEmployeeForm.patchValue({ auto_grade: '', auto_standard_salary: '' });
      } else {
        this.detailForm.patchValue({ auto_grade: '', auto_standard_salary: '' });
      }
      return;
    }
    // 年度は最新（今年）で取得
    const now = new Date();
    const year = String(now.getFullYear());
    const gradesCol = collection(this.firestore, 'prefectures', prefectureId, 'insurance_premiums', year, 'grades');
    const gradesSnapshot = await getDocs(gradesCol);
    const grades: { [key: string]: any } = {};
    gradesSnapshot.forEach(doc => {
      grades[doc.id] = doc.data();
    });
    let found = false;
    for (const [gradeId, grade] of Object.entries(grades)) {
      if (salary >= grade.salaryMin && salary < grade.salaryMax) {
        if (mode === 'new') {
          this.newEmployeeForm.patchValue({ auto_grade: gradeId, auto_standard_salary: grade.standardSalary });
        } else {
          this.detailForm.patchValue({ auto_grade: gradeId, auto_standard_salary: grade.standardSalary });
        }
        found = true;
        break;
      }
    }
    if (!found) {
      if (mode === 'new') {
        this.newEmployeeForm.patchValue({ auto_grade: '', auto_standard_salary: '' });
      } else {
        this.detailForm.patchValue({ auto_grade: '', auto_standard_salary: '' });
      }
    }
  }

  // 健康保険番号入力時の処理
  onHealthInsuranceNumberChange() {
    const healthInsuranceNumber = this.detailForm.get('health_insurance_number')?.value;
    if (healthInsuranceNumber) {
      this.detailForm.patchValue({
        health_insurance_enrolled: true
      });
    }
  }

  // 厚生年金番号入力時の処理
  onPensionNumberChange() {
    const pensionNumber = this.detailForm.get('pension_number')?.value;
    if (pensionNumber) {
      this.detailForm.patchValue({
        pension_insurance_enrolled: true
      });
    }
  }

  // 新規従業員用の健康保険番号入力時の処理
  onNewHealthInsuranceNumberChange() {
    const healthInsuranceNumber = this.newEmployeeForm.get('health_insurance_number')?.value;
    if (healthInsuranceNumber) {
      this.newEmployeeForm.patchValue({
        health_insurance_enrolled: true
      });
    }
  }

  // 新規従業員用の厚生年金番号入力時の処理
  onNewPensionNumberChange() {
    const pensionNumber = this.newEmployeeForm.get('pension_number')?.value;
    if (pensionNumber) {
      this.newEmployeeForm.patchValue({
        pension_insurance_enrolled: true
      });
    }
  }

  // 郵便番号から住所を検索（新規メンバー用）
  async searchNewEmployeeAddressByPostalCode(postalCode: string) {
    if (!postalCode || postalCode.length !== 7) return;
    try {
      const response = await this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`).toPromise();
      if (response && response.results && response.results[0]) {
        const address = response.results[0];
        const fullAddress = `${address.address1}${address.address2}${address.address3}`;
        this.newEmployeeForm.patchValue({ 
          address: fullAddress
        });
      }
    } catch (error) {
      console.error('郵便番号検索エラー:', error);
    }
  }

  // 郵便番号から住所を検索（詳細モーダル用）
  async searchDetailAddressByPostalCode(postalCode: string) {
    if (!postalCode || postalCode.length !== 7) return;
    try {
      const response = await this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`).toPromise();
      if (response && response.results && response.results[0]) {
        const address = response.results[0];
        const fullAddress = `${address.address1}${address.address2}${address.address3}`;
        this.detailForm.patchValue({ 
          address: fullAddress
        });
      }
    } catch (error) {
      console.error('郵便番号検索エラー:', error);
    }
  }

  // 新規メンバー用：郵便番号入力時の処理
  onNewEmployeePostalCodeChange(postalCode: string | null) {
    if (!postalCode) return;
    const cleanPostalCode = postalCode.replace(/-/g, '');
    if (cleanPostalCode.length === 7) {
      this.searchNewEmployeeAddressByPostalCode(cleanPostalCode);
    }
  }

  // 詳細モーダル用：郵便番号入力時の処理
  onDetailPostalCodeChange(postalCode: string | null) {
    if (!postalCode) return;
    const cleanPostalCode = postalCode.replace(/-/g, '');
    if (cleanPostalCode.length === 7) {
      this.searchDetailAddressByPostalCode(cleanPostalCode);
    }
  }

  exportDependentsCSV() {
    if (!this.filteredEmployees || this.filteredEmployees.length === 0) {
      alert('エクスポートする扶養者情報がありません。');
      return;
    }

    // 扶養者CSVのカラム
    const headers = [
      '社員ID',
      '氏名',
      '扶養者氏名',
      '続柄',
      '生年月日',
      '性別',
      '同居',
      '年収',
      '就業状況',
      '扶養開始日',
      '現在も扶養中',
      '備考'
    ];

    const rows: string[][] = [];
    for (const emp of this.filteredEmployees) {
      if (emp.dependents && Array.isArray(emp.dependents) && emp.dependents.length > 0) {
        for (const dep of emp.dependents) {
          rows.push([
            emp.employee_code || '',
            (emp.last_name_kanji || '') + (emp.first_name_kanji || ''),
            dep.name || '',
            dep.relationship || '',
            dep.birthdate || '',
            dep.gender || '',
            dep.cohabitation ? '同居' : '別居',
            dep.annualIncome || '',
            dep.employmentStatus || '',
            dep.fuyouStartDate || '',
            dep.isCurrentlyDependent ? '扶養中' : '扶養外',
            dep.note || ''
          ]);
        }
      }
    }

    if (rows.length === 0) {
      alert('エクスポートする扶養者情報がありません。');
      return;
    }

    const csvContent = [
      headers,
      ...rows
    ].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dependents_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onClickImportDependents() {
    if (this.dependentsImportInput) {
      this.dependentsImportInput.nativeElement.value = '';
      this.dependentsImportInput.nativeElement.click();
    }
  }

  async onImportDependentsFile(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    let text = '';
    if (ext === 'xlsx') {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      text = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
    } else {
      text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e: any) => resolve(e.target.result);
        reader.readAsText(file, 'utf-8');
      });
    }
    // 期待カラム名
    const excludeFields = ['company_id', 'my_number', 'role', 'password', 'dependents', 'created_at', 'updated_at'];
    const expectedHeaders = this.employeeFieldOrder
      .filter(f => !excludeFields.includes(f))
      .map(f => this.employeeFieldLabels[f] || f);
    // 1行目を取得
    const lines = text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
    const headerLine = lines[0];
    const headers = headerLine.replace(/^\uFEFF/, '').split(',').map((h: string) => h.replace(/"/g, '').trim());
    // 厳密一致チェック
    if (headers.length !== expectedHeaders.length || !headers.every((h: string, i: number) => h === expectedHeaders[i])) {
      alert('インポートできません：列名や順番が正しくありません。');
      return;
    }
    // 制御文字や不正な文字チェック（簡易）
    if (/[^\x20-\x7E\u3000-\u30FF\u4E00-\u9FFF\uFF01-\uFF5E\r\n,\"]/.test(text)) {
      alert('インポートできません：不正な文字が含まれています。');
      return;
    }
    if (!this.companyId) {
      alert('会社IDが取得できません。ログインし直してください。');
      return;
    }
    // CSVデータをパース
    const dependentsMap: { [employee_code: string]: any[] } = {};
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((v: string) => v.replace(/"/g, '').trim());
      if (row.length !== expectedHeaders.length) continue;
      const employee_code = row[0];
      if (!employee_code) continue;
      const dependent = {
        name: row[2],
        relationship: row[3],
        birthdate: row[4],
        gender: row[5],
        cohabitation: row[6] === '同居',
        annualIncome: row[7],
        employmentStatus: row[8],
        fuyouStartDate: row[9],
        isCurrentlyDependent: row[10] === '扶養中',
        note: row[11]
      };
      if (!dependentsMap[employee_code]) dependentsMap[employee_code] = [];
      dependentsMap[employee_code].push(dependent);
    }
    // Firestoreへ保存
    let errorCount = 0;
    for (const employee_code of Object.keys(dependentsMap)) {
      try {
        const employeesCol = collection(this.firestore, 'employees');
        const q = query(employeesCol, where('company_id', '==', this.companyId), where('employee_code', '==', employee_code));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          errorCount++;
          continue;
        }
        const ref = doc(this.firestore, 'employees', snapshot.docs[0].id);
        await updateDoc(ref, { dependents: dependentsMap[employee_code], has_dependents: dependentsMap[employee_code].length > 0 });
      } catch (e) {
        errorCount++;
      }
    }
    if (errorCount === 0) {
      alert('インポートが完了しました。');
      await this.loadEmployees();
    } else {
      alert('一部または全ての従業員が見つからなかったため、インポートできませんでした。');
    }
  }

  onClickImportEmployees() {
    if (this.employeesImportInput) {
      this.employeesImportInput.nativeElement.value = '';
      this.employeesImportInput.nativeElement.click();
    }
  }

  async onImportEmployeesFile(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    let text = '';
    if (ext === 'xlsx') {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      text = XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
    } else {
      text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e: any) => resolve(e.target.result);
        reader.readAsText(file, 'utf-8');
      });
    }
    // 期待カラム名
    const excludeFields = ['company_id', 'my_number', 'role', 'password', 'dependents', 'created_at', 'updated_at'];
    const expectedHeaders = this.employeeFieldOrder
      .filter(f => !excludeFields.includes(f))
      .map(f => this.employeeFieldLabels[f] || f);
    const lines = text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
    const headerLine = lines[0];
    const headers = headerLine.replace(/^\uFEFF/, '').split(',').map((h: string) => h.replace(/"/g, '').trim());
    if (headers.length !== expectedHeaders.length || !headers.every((h: string, i: number) => h === expectedHeaders[i])) {
      alert('インポートできません：列名や順番が正しくありません。');
      return;
    }
    if (/[^\x20-\x7E\u3000-\u30FF\u4E00-\u9FFF\uFF01-\uFF5E\r\n,\"]/.test(text)) {
      alert('インポートできません：不正な文字が含まれています。');
      return;
    }
    if (!this.companyId) {
      alert('会社IDが取得できません。ログインし直してください。');
      return;
    }
    let errorCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((v: string) => v.replace(/"/g, '').trim());
      if (row.length !== expectedHeaders.length) continue;
      const employee_code = row[1];
      if (!employee_code) continue;
      // Excelの指数表記を文字列に変換（基礎年金番号・健康保険番号）
      let pension_number = row[22];
      let health_insurance_number = row[21];
      // 指数表記の場合のみ数値としてパースし文字列化、それ以外はそのまま
      if (/^\d+(\.\d+)?e[\+\-]?\d+$/i.test(pension_number)) {
        pension_number = String(Number(pension_number));
      }
      if (/^\d+(\.\d+)?e[\+\-]?\d+$/i.test(health_insurance_number)) {
        health_insurance_number = String(Number(health_insurance_number));
      }
      // Firestoreで従業員を検索
      try {
        const employeesCol = collection(this.firestore, 'employees');
        const q = query(employeesCol, where('company_id', '==', this.companyId), where('employee_code', '==', employee_code));
        const snapshot = await getDocs(q);
        const employeeData: any = {
          company_id: this.companyId,
          department_id: row[0],
          employee_code: row[1],
          last_name_kanji: row[2],
          first_name_kanji: row[3],
          last_name_kana: row[4],
          first_name_kana: row[5],
          date_of_birth: row[6],
          gender: row[7],
          nationality: row[8],
          postal_code: row[9],
          address: row[10],
          phone_number: row[11],
          email: row[12],
          employment_type: row[13],
          employment_start_date: row[14],
          employment_end_date: row[15],
          status: row[16],
          department: row[17],
          work_category: row[18],
          health_insurance_enrolled: row[19] === '加入',
          pension_insurance_enrolled: row[20] === '加入',
          health_insurance_number: health_insurance_number,
          pension_number: pension_number,
          has_dependents: row[23] === '有',
          is_dependent: row[24] === 'はい',
          remarks: row[25],
          updated_at: new Date()
        };
        if (!snapshot.empty) {
          // 既存従業員を上書き
          const ref = doc(this.firestore, 'employees', snapshot.docs[0].id);
          await updateDoc(ref, employeeData);
        } else {
          // newEmployeeFormの全フィールドを初期値で埋める
          const allFields = Object.keys(this.newEmployeeForm.controls);
          for (const key of allFields) {
            if (!(key in employeeData)) {
              // フォームの初期値をセット
              const ctrl = this.newEmployeeForm.get(key);
              employeeData[key] = ctrl ? ctrl.value : '';
            }
          }
          employeeData.company_id = this.companyId;
          employeeData.created_at = new Date();
          employeeData.updated_at = new Date();
          await addDoc(employeesCol, employeeData);
        }
      } catch (e) {
        errorCount++;
      }
    }
    if (errorCount === 0) {
      alert('インポートが完了しました。');
      await this.loadEmployees();
    } else {
      alert('一部または全ての従業員の登録・更新に失敗しました。');
    }
  }

  // マイナンバー管理用のメソッド
  searchMyNumber() {
    const searchData = this.myNumberSearchForm.value;
    let filtered = [...this.officeEmployees];

    // 社員IDでフィルタリング
    if (searchData.employee_id) {
      filtered = filtered.filter(emp => 
        emp.employee_code.toLowerCase().includes(searchData.employee_id.toLowerCase())
      );
    }

    // 氏名でフィルタリング
    if (searchData.name) {
      const searchName = searchData.name.toLowerCase();
      filtered = filtered.filter(emp => 
        `${emp.last_name_kanji}${emp.first_name_kanji}`.toLowerCase().includes(searchName)
      );
    }

    // 部署でフィルタリング
    if (searchData.department) {
      filtered = filtered.filter(emp => 
        emp.department_id === searchData.department
      );
    }

    // マイナンバー登録状況でフィルタリング
    if (searchData.my_number_status) {
      if (searchData.my_number_status === 'registered') {
        filtered = filtered.filter(emp => emp.my_number);
      } else if (searchData.my_number_status === 'not_registered') {
        filtered = filtered.filter(emp => !emp.my_number);
      }
    }

    this.filteredMyNumberEmployees = filtered;
  }

  resetMyNumberSearch() {
    this.myNumberSearchForm.reset();
    this.filteredMyNumberEmployees = [...this.officeEmployees];
  }

  // 暗号化用の関数を追加
  private async encryptMyNumber(myNumber: string): Promise<string> {
    // 実際の暗号化処理は、セキュリティ要件に応じて実装してください
    // ここでは簡易的な実装例を示します
    return btoa(myNumber); // Base64エンコード（実際の実装では、より強力な暗号化を使用してください）
  }

  // 復号化用の関数を追加
  private async decryptMyNumber(encryptedMyNumber: string): Promise<string> {
    // 実際の復号化処理は、セキュリティ要件に応じて実装してください
    return atob(encryptedMyNumber); // Base64デコード
  }

  async openMyNumberEdit(employee: any) {
    this.selectedEmployee = employee;
    this.showMyNumberEditModal = true;

    // 既存のマイナンバーがある場合は取得して表示
    if (employee.id) {
      const sensitiveDoc = await getDoc(doc(this.firestore, 'sensitive_ids', employee.id));
      if (sensitiveDoc.exists()) {
        const encryptedMyNumber = sensitiveDoc.data()['myNumber'];
        if (encryptedMyNumber) {
          const decryptedMyNumber = await this.decryptMyNumber(encryptedMyNumber);
          this.myNumberEditForm.patchValue({
            my_number: decryptedMyNumber
          });
        } else {
          this.myNumberEditForm.patchValue({
            my_number: ''
          });
        }
      } else {
        this.myNumberEditForm.patchValue({
          my_number: ''
        });
      }
    } else {
      this.myNumberEditForm.patchValue({
        my_number: ''
      });
    }

    this.myNumberEditForm.patchValue({
      my_number_note: employee.my_number_note || ''
    });
  }

  async saveMyNumber() {
    if (this.myNumberEditForm.valid && this.selectedEmployee) {
      // idチェック
      if (!this.selectedEmployee.id) {
        alert('従業員IDが取得できません。再度従業員を選択してください。');
        return;
      }
      try {
        const myNumber = this.myNumberEditForm.get('my_number')?.value;
        const note = this.myNumberEditForm.get('my_number_note')?.value;
        const now = serverTimestamp();

        // sensitive_idsコレクションの既存データを取得
        const sensitiveRef = doc(this.firestore, 'sensitive_ids', this.selectedEmployee.id);
        const sensitiveDoc = await getDoc(sensitiveRef);
        let sensitiveData: any = {
          myNumber: await this.encryptMyNumber(myNumber),
          updated_at: now,
          my_number_updated_at: now
        };
        if (!sensitiveDoc.exists() || !sensitiveDoc.data()['my_number_registered_at']) {
          sensitiveData.my_number_registered_at = now;
        } else {
          sensitiveData.my_number_registered_at = sensitiveDoc.data()['my_number_registered_at'];
        }
        await setDoc(sensitiveRef, sensitiveData);

        // 従業員情報を更新
        await updateDoc(doc(this.firestore, 'employees', this.selectedEmployee.id), {
          my_number_registered_at: sensitiveData.my_number_registered_at,
          my_number_updated_at: now,
          my_number_note: note
        });

        // 一覧を更新
        await this.loadOfficeEmployees(this.selectedOfficeId);
        this.closeMyNumberEdit();
      } catch (error) {
        console.error('マイナンバーの保存に失敗しました:', error);
      }
    }
  }

  closeMyNumberEdit() {
    this.showMyNumberEditModal = false;
    this.selectedEmployee = null;
    this.myNumberEditForm.reset();
  }

  // 事業所一覧を取得する関数
  async loadOffices() {
    if (!this.companyId) {
      console.error('会社IDが設定されていません');
      return;
    }

    try {
      const departmentsCol = collection(this.firestore, 'departments');
      const q = query(departmentsCol, where('company_id', '==', this.companyId));
      const snapshot = await getDocs(q);
      this.offices = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data()['department_name'] || doc.data()['department_id']
      }));
    } catch (error) {
      console.error('事業所の取得に失敗しました:', error);
      this.offices = [];
    }
  }

  // 事業所が選択された時の処理
  async onOfficeSelect() {
    const officeId = this.myNumberSearchForm.get('office_id')?.value;
    if (!officeId || !this.companyId) {
      this.officeEmployees = [];
      this.filteredMyNumberEmployees = [];
      this.myNumberSearchForm.get('selected_employee_id')?.setValue('');
      return;
    }

    this.selectedOfficeId = officeId;
    await this.loadOfficeEmployees(officeId);
    this.filteredMyNumberEmployees = [...this.officeEmployees]; // 初期表示時は全員表示
  }

  async loadOfficeEmployees(officeId: string) {
    try {
      const employeesRef = collection(this.firestore, 'employees');
      const q = query(
        employeesRef,
        where('company_id', '==', this.companyId),
        where('department_id', '==', officeId)
      );
      const querySnapshot = await getDocs(q);
      const employees = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];

      // sensitive_idsをまとめて取得
      const sensitiveIdsPromises = employees.map(emp =>
        getDoc(doc(this.firestore, 'sensitive_ids', emp.id))
      );
      const sensitiveDocs = await Promise.all(sensitiveIdsPromises);

      // myNumberの有無をemployeesに付与
      employees.forEach((emp, idx) => {
        const sensitiveDoc = sensitiveDocs[idx];
        const myNumber = sensitiveDoc.exists() ? sensitiveDoc.data()['myNumber'] : undefined;
        console.log('従業員ID:', emp.id, 'myNumber:', myNumber, 'hasMyNumber:', !!myNumber);
        emp.hasMyNumber = !!myNumber;
      });

      this.officeEmployees = employees;
    } catch (error) {
      console.error('従業員情報の取得に失敗しました:', error);
    }
  }

  onEmployeeSelect() {
    const selectedEmployeeId = this.myNumberSearchForm.get('selected_employee_id')?.value;
    if (selectedEmployeeId) {
      const selectedEmployee = this.officeEmployees.find(emp => emp.id === selectedEmployeeId);
      if (selectedEmployee) {
        this.myNumberSearchForm.patchValue({
          employee_id: selectedEmployee.employee_code,
          name: `${selectedEmployee.last_name_kanji} ${selectedEmployee.first_name_kanji}`
        });
        this.searchMyNumber(); // 従業員選択時に自動的に検索を実行
      }
    } else {
      this.myNumberSearchForm.patchValue({
        employee_id: '',
        name: ''
      });
    }
  }

  // 部署一覧を取得する関数
  async loadDepartments() {
    try {
      const departmentsRef = collection(this.firestore, 'departments');
      const q = query(departmentsRef, where('company_id', '==', this.companyId));
      const querySnapshot = await getDocs(q);
      this.departments = querySnapshot.docs.map(doc => ({
        department_id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('部署情報の取得に失敗しました:', error);
    }
  }

  // 権限チェック用の関数を追加
  canEditMyNumber(): boolean {
    return this.currentUserRole === 'admin' || this.currentUserRole === 'hr';
  }

  async logCurrentEmployeeAndSensitiveId() {
    // ログインユーザーのメールアドレスと会社IDでemployeesコレクションから自分のドキュメントIDを取得
    const user = this.auth.currentUser;
    if (user && user.email && this.companyId) {
      const employeesCol = collection(this.firestore, 'employees');
      const q = query(
        employeesCol,
        where('company_id', '==', this.companyId),
        where('email', '==', user.email)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const employeeDocId = docSnap.id;
        console.log('現在ログイン中のemployeesコレクションのドキュメントID:', employeeDocId);
        // sensitive_idsコレクションの同じIDも表示
        const sensitiveDoc = await getDoc(doc(this.firestore, 'sensitive_ids', employeeDocId));
        if (sensitiveDoc.exists()) {
          console.log('対応するsensitive_idsコレクションのドキュメントID:', employeeDocId);
        } else {
          console.log('対応するsensitive_idsコレクションのドキュメントは存在しません:', employeeDocId);
        }
      } else {
        console.log('ログインユーザーのemployeesコレクションのドキュメントが見つかりませんでした');
      }
    } else {
      console.log('ユーザー情報または会社IDが取得できませんでした');
    }
  }
}
