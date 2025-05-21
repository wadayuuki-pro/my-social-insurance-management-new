import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, collection, query, where, getDocs, doc, updateDoc, addDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray, Validators, AbstractControl, ValidatorFn } from '@angular/forms';
import { AddMemberButtonComponent } from '../shared/components/add-member-button/add-member-button.component';

@Component({
  selector: 'app-employee-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AddMemberButtonComponent],
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
    department: '所属部署・拠点',
    work_category: '勤務区分',
    health_insurance_enrolled: '健康保険加入状況',
    pension_insurance_enrolled: '厚生年金加入状況',
    health_insurance_number: '健康保険番号',
    pension_number: '厚生年金番号',
    insurer_number: '保険者番号',
    office_number: '事業所番号',
    has_dependents: '扶養家族の有無',
    dependents: '扶養者情報',
    remarks: '特記事項',
    created_at: '作成日時',
    updated_at: '更新日時',
    role: '権限',
    password: 'パスワード'
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
    work_category: '例：正社員',
    health_insurance_number: '例：1234567890',
    pension_number: '例：123456789012',
    insurer_number: '例：1234567',
    office_number: '例：1234567890',
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
    'insurer_number',
    'office_number',
    'remarks',
    'role',
    'password',
    'has_dependents',
    'dependents',
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

  constructor(private auth: Auth, private firestore: Firestore, private fb: FormBuilder) {
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
      department_id: [''],
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
      status: ['在籍中'],
      department: [''],
      work_category: [''],
      health_insurance_enrolled: [false],
      pension_insurance_enrolled: [false],
      health_insurance_number: [''],
      pension_number: [''],
      insurer_number: [''],
      office_number: [''],
      has_dependents: [false],
      role: [''],
      password: [''],
      remarks: [''],
      dependents: this.fb.array([]),
      scheduled_working_hours: [''],
      employment_contract_period: [''],
      expected_monthly_income: [''],
      student_category: ['学生ではない']
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
  }

  async ngOnInit() {
    // ログインユーザーの会社ID取得
    const user = this.auth.currentUser;
    if (user && user.email) {
      const employeesCol = collection(this.firestore, 'employees');
      const q = query(employeesCol, where('email', '==', user.email));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        this.companyId = data['company_id'] || '';
        // 会社IDで従業員一覧取得
        await this.loadEmployees();
      }
    }
    // 検索欄の値が変わったらフィルタ
    this.searchForm.get('employee_id')!.valueChanges.subscribe(val => {
      this.filterEmployees(val);
    });
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
        await updateDoc(ref, saveData);
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

  exportEmployeeCSV(employee: any) {
    // CSVヘッダーの作成
    const headers = [
      '社員ID',
      '氏名（漢字）',
      '氏名（カナ）',
      '生年月日',
      '性別',
      '郵便番号',
      '住所',
      '電話番号',
      'メールアドレス',
      '雇用形態',
      '勤務開始日',
      '勤務終了日',
      '在籍ステータス',
      '所属部署',
      '勤務区分',
      '健康保険加入状況',
      '厚生年金加入状況',
      '健康保険番号',
      '厚生年金番号',
      '保険者番号',
      '事業所番号',
      '扶養家族の有無',
      '特記事項'
    ];

    // データの作成
    const data = [
      employee.employee_code || '',
      `${employee.last_name_kanji || ''} ${employee.first_name_kanji || ''}`,
      `${employee.last_name_kana || ''} ${employee.first_name_kana || ''}`,
      employee.date_of_birth || '',
      employee.gender || '',
      employee.postal_code || '',
      employee.address || '',
      employee.phone_number || '',
      employee.email || '',
      employee.employment_type || '',
      employee.employment_start_date || '',
      employee.employment_end_date || '',
      employee.status || '',
      employee.department || '',
      employee.work_category || '',
      employee.health_insurance_enrolled ? '加入' : '未加入',
      employee.pension_insurance_enrolled ? '加入' : '未加入',
      employee.health_insurance_number || '',
      employee.pension_number || '',
      employee.insurer_number || '',
      employee.office_number || '',
      employee.has_dependents ? '有' : '無',
      employee.remarks || ''
    ];

    // CSVデータの作成
    const csvContent = [
      headers.join(','),
      data.map(value => `"${value}"`).join(',')
    ].join('\n');

    // BOMを追加してUTF-8でエンコード
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8' });

    // ダウンロードリンクの作成とクリック
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `employee_${employee.employee_code}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
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

    this.newEmployeeForm.reset({
      status: '在籍中',
      company_id: this.companyId,
      health_insurance_enrolled: false,
      pension_insurance_enrolled: false,
      has_dependents: false
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

    try {
      // 所属会社IDを有効化して値を取得
      this.newEmployeeForm.get('company_id')?.enable();
      // フォームの値を取得
      const formValue = this.newEmployeeForm.value;
      // パスワードを自動生成
      const generatedPassword = this.generateRandomPassword(formValue.employee_code);

      // 1. Firebase Authにユーザー登録
      await createUserWithEmailAndPassword(this.auth, formValue.email, generatedPassword);

      // 2. Firestoreに従業員情報を保存
      const newEmployeeData = {
        ...formValue,
        password: generatedPassword,
        health_insurance_enrolled: formValue.health_insurance_number ? true : false,
        pension_insurance_enrolled: formValue.pension_number ? true : false,
        health_insurance_number: formValue.health_insurance_number || '',
        pension_number: formValue.pension_number || '',
        insurer_number: formValue.insurer_number || '',
        office_number: formValue.office_number || '',
        has_dependents: this.newEmployeeDependentsArray.length > 0,
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

  exportAllEmployeesCSV() {
    if (!this.filteredEmployees || this.filteredEmployees.length === 0) {
      alert('エクスポートする従業員がありません。');
      return;
    }
    // CSVヘッダー
    const headers = [
      '社員ID', '氏名（漢字）', '氏名（カナ）', 'メールアドレス', '所属部署/拠点', '雇用形態', '勤務開始日', '勤務終了日', '在籍ステータス', '健康保険加入', '厚生年金加入', '扶養家族の有無', '作成日', '最終更新日'
    ];
    // データ行
    const rows = this.filteredEmployees.map(emp => [
      emp.employee_code || '',
      (emp.last_name_kanji || '') + ' ' + (emp.first_name_kanji || ''),
      (emp.last_name_kana || '') + ' ' + (emp.first_name_kana || ''),
      emp.email || '',
      emp.department || '',
      emp.employment_type || '',
      emp.employment_start_date || '',
      emp.employment_end_date || '',
      emp.status || '',
      emp.health_insurance_enrolled ? '加入' : '未加入',
      emp.pension_insurance_enrolled ? '加入' : '未加入',
      emp.has_dependents ? '有' : '無',
      emp.created_at ? (emp.created_at.toDate ? emp.created_at.toDate().toLocaleDateString() : emp.created_at) : '',
      emp.updated_at ? (emp.updated_at.toDate ? emp.updated_at.toDate().toLocaleDateString() : emp.updated_at) : ''
    ]);
    // CSV文字列生成
    const csvContent = [headers, ...rows].map(e => e.map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    // ダウンロード処理
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  toggleMyNumber() {
    this.showMyNumber = !this.showMyNumber;
  }
}
