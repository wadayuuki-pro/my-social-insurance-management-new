import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors, ValidatorFn, FormsModule } from '@angular/forms';
import { Firestore, doc, setDoc, collection, getDocs, query, where, deleteDoc, getDoc, serverTimestamp } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { debounceTime } from 'rxjs/operators';
import { createUserWithEmailAndPassword, Auth } from '@angular/fire/auth';
import { HttpClient } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { InsurancePremiumService } from '../shared/services/insurance-premium.service';

// カタカナのみ許可するバリデータ
function katakanaValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) return null;
    // 全角カタカナのみ許可（スペースも可）
    return /^[\u30A0-\u30FF\u3000\s]+$/.test(value) ? null : { katakana: true };
  };
}

@Component({
  selector: 'app-vendor-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './vendor-page.component.html',
  styleUrl: './vendor-page.component.scss'
})
export class VendorPageComponent implements OnInit {
  selectedTab: string = 'company';
  companyForm: FormGroup;
  companyRegisterSuccess = false;
  companyRegisterError: string | null = null;
  newCompanyId: string | null = null;
  companyNameExists = false;
  branchForm: FormGroup;
  branchRegisterSuccess = false;
  branchRegisterError: string | null = null;
  newDepartmentId: string | null = null;
  companyIdExists = true;
  deleteForm: FormGroup;
  deleteCompanyId: string = '';
  deleteSuccess = false;
  deleteError: string | null = null;
  departmentCount = 0;

  // 保険料表管理用のプロパティ
  selectedMasterYear: string = '';
  selectedMasterPrefectureId: string = '';
  selectedYear: string = '';
  masterGrades: any = null;
  isLoadingMasterGrades: boolean = false;
  masterGradesError: string | null = null;
  isEditMode = false;
  editGrades: any = {};
  yearOptions: string[] = [];
  prefectures: { id: string; name: string }[] = [
    { id: '北海道', name: '北海道' },
    { id: '青森', name: '青森県' },
    { id: '岩手', name: '岩手県' },
    { id: '宮城', name: '宮城県' },
    { id: '秋田', name: '秋田県' },
    { id: '山形', name: '山形県' },
    { id: '福島', name: '福島県' },
    { id: '茨城', name: '茨城県' },
    { id: '栃木', name: '栃木県' },
    { id: '群馬', name: '群馬県' },
    { id: '埼玉', name: '埼玉県' },
    { id: '千葉', name: '千葉県' },
    { id: '東京', name: '東京都' },
    { id: '神奈川', name: '神奈川県' },
    { id: '新潟', name: '新潟県' },
    { id: '富山', name: '富山県' },
    { id: '石川', name: '石川県' },
    { id: '福井', name: '福井県' },
    { id: '山梨', name: '山梨県' },
    { id: '長野', name: '長野県' },
    { id: '岐阜', name: '岐阜県' },
    { id: '静岡', name: '静岡県' },
    { id: '愛知', name: '愛知県' },
    { id: '三重', name: '三重県' },
    { id: '滋賀', name: '滋賀県' },
    { id: '京都', name: '京都府' },
    { id: '大阪', name: '大阪府' },
    { id: '兵庫', name: '兵庫県' },
    { id: '奈良', name: '奈良県' },
    { id: '和歌山', name: '和歌山県' },
    { id: '鳥取', name: '鳥取県' },
    { id: '島根', name: '島根県' },
    { id: '岡山', name: '岡山県' },
    { id: '広島', name: '広島県' },
    { id: '山口', name: '山口県' },
    { id: '徳島', name: '徳島県' },
    { id: '香川', name: '香川県' },
    { id: '愛媛', name: '愛媛県' },
    { id: '高知', name: '高知県' },
    { id: '福岡', name: '福岡県' },
    { id: '佐賀', name: '佐賀県' },
    { id: '長崎', name: '長崎県' },
    { id: '熊本', name: '熊本県' },
    { id: '大分', name: '大分県' },
    { id: '宮崎', name: '宮崎県' },
    { id: '鹿児島', name: '鹿児島県' },
    { id: '沖縄', name: '沖縄県' }
  ];
  selectedFile: File | null = null;
  sheetNames: string[] = [];
  private _selectedSheetName: string = '';
  isImporting: boolean = false;
  importError: string | null = null;

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

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private auth: Auth,
    private http: HttpClient,
    private insurancePremiumService: InsurancePremiumService
  ) {
    this.companyForm = this.fb.group({
      company_name: ['', Validators.required],
      company_name_kana: ['', [Validators.required, katakanaValidator()]],
      postal_code: ['', Validators.required],
      address: ['', Validators.required],
      phone_number: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      representative_name: ['', Validators.required],
      representative_title: [''],
      industry: [''],
      prefecture_id: [''],
      is_tokutei: [false, Validators.required]
    });

    // 会社名の重複チェック（入力が変わるたびに）
    this.companyForm.get('company_name')!.valueChanges
      .pipe(debounceTime(400))
      .subscribe(async (value: string) => {
        this.companyRegisterError = null;
        this.companyNameExists = false;
        if (!value) return;
        const companiesCol = collection(this.firestore, 'companies');
        const qName = query(companiesCol, where('company_name', '==', value));
        const nameSnapshot = await getDocs(qName);
        if (!nameSnapshot.empty) {
          this.companyNameExists = true;
          this.companyRegisterError = 'すでに登録されています';
        }
      });

    this.branchForm = this.fb.group({
      company_id: ['', Validators.required],
      department_id: [''],
      department_name: ['', Validators.required],
      address: [''],
      postal_code: [''],
      office_number: [''],
      insurer_number: [''],
      phone_number: [''],
      email: [''],
      manager_name: ['', Validators.required],
      prefecture_id: ['']
    });

    // 会社ID存在チェック（入力が変わるたびに）
    this.branchForm.get('company_id')!.valueChanges
      .pipe(debounceTime(400))
      .subscribe(async (value: string) => {
        this.companyIdExists = true;
        if (!value) return;
        const companyDocRef = doc(this.firestore, `companies/${value}`);
        const companySnap = await getDocs(query(collection(this.firestore, 'companies')));
        const exists = companySnap.docs.some(d => d.id === value);
        this.companyIdExists = exists;
      });

    this.deleteForm = this.fb.group({
      company_name: ['']
    });
    this.deleteForm.get('company_name')!.valueChanges
      .pipe(debounceTime(400))
      .subscribe(async (value: string) => {
        this.deleteSuccess = false;
        this.deleteError = null;
        this.deleteCompanyId = '';
        if (!value) return;
        // 会社名からcompany_id検索
        const companiesCol = collection(this.firestore, 'companies');
        const q = query(companiesCol, where('company_name', '==', value));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          this.deleteCompanyId = snapshot.docs[0].id;
        }
      });
  }

  ngOnInit() {
    // 年度オプションの設定（現在の年度から前後5年分）
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const fiscalYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    
    this.yearOptions = Array.from({ length: 11 }, (_, i) => 
      (fiscalYear - 5 + i).toString()
    );

    // 初期値の設定
    this.selectedMasterYear = fiscalYear.toString();
    this.selectedYear = fiscalYear.toString();
  }

  async registerCompany() {
    this.companyRegisterSuccess = false;
    this.companyRegisterError = null;
    this.newCompanyId = null;
    if (this.companyForm.invalid || this.companyNameExists) {
      this.companyRegisterError = this.companyNameExists ? 'すでに登録されています' : '必須項目をすべて入力してください。';
      return;
    }
    try {
      // 会社名の重複チェック（念のため）
      const companiesCol = collection(this.firestore, 'companies');
      const qName = query(companiesCol, where('company_name', '==', this.companyForm.value.company_name));
      const nameSnapshot = await getDocs(qName);
      if (!nameSnapshot.empty) {
        this.companyRegisterError = 'すでに登録されています';
        this.companyNameExists = true;
        return;
      }
      // 既存会社IDの最大値を取得
      const q = query(companiesCol);
      const snapshot = await getDocs(q);
      let maxId = 1000;
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const idStr = data['company_id'];
        const idNum = Number(idStr);
        if (!isNaN(idNum) && idNum > maxId) {
          maxId = idNum;
        }
      });
      const newId = (maxId + 1).toString();
      const data = {
        company_id: newId,
        ...this.companyForm.value,
        created_at: new Date()
      };
      const companyDoc = doc(this.firestore, `companies/${newId}`);
      await setDoc(companyDoc, data);
      // 代表者をemployeesコレクションにも追加
      const initialPassword = newId + '00';
      const employeeCode = newId + '000'; // 会社ID+000
      const employeeData = {
        company_id: newId,
        department_id: '',
        employee_code: employeeCode,
        last_name_kanji: '',
        first_name_kanji: '',
        last_name_kana: '',
        first_name_kana: '',
        date_of_birth: '',
        gender: '',
        nationality: '',
        postal_code: '',
        address: '',
        phone_number: this.companyForm.value.phone_number || '',
        email: this.companyForm.value.email || '',
        password: initialPassword,
        role: 'admin',
        employment_type: '',
        employment_start_date: '',
        employment_end_date: '',
        leave_start_date: '',
        leave_end_date: '',
        status: '在籍中',
        department: '',
        work_category: '',
        health_insurance_enrolled: false,
        pension_insurance_enrolled: false,
        health_insurance_number: '',
        pension_number: '',
        insurer_number: '',
        office_number: '',
        has_dependents: false,
        is_dependent: false,
        dependents: [],
        remarks: '',
        auto_grade: '',
        auto_standard_salary: '',
        expected_salary: '',
        scheduled_working_hours: '',
        employment_contract_period: '',
        expected_monthly_income: '',
        student_category: '学生ではない',
        health_insurance_enrollment_date: '',
        pension_insurance_enrollment_date: '',
        health_insurance_withdrawal_date: '',
        pension_insurance_withdrawal_date: '',
        created_at: new Date(),
        updated_at: new Date()
      };
      const employeesCol = collection(this.firestore, 'employees');
      await setDoc(doc(employeesCol), employeeData);
      // Firebase Authにもサインアップ
      try {
        await createUserWithEmailAndPassword(this.auth, employeeData.email, initialPassword);
      } catch (e: any) {
        // すでに登録済みの場合などは無視（他のエラーは通知）
        if (e.code !== 'auth/email-already-in-use') {
          throw e;
        }
      }
      // 会社登録時に本社（会社ID-00）をdepartmentsコレクションに自動追加
      const departmentId = `${newId}-00`;
      const departmentData = {
        company_id: newId,
        department_id: departmentId,
        department_name: '本社',
        address: this.companyForm.value.address,
        postal_code: this.companyForm.value.postal_code,
        office_number: '',
        insurer_number: '',
        phone_number: this.companyForm.value.phone_number,
        email: this.companyForm.value.email,
        manager_name: this.companyForm.value.representative_name,
        prefecture_id: this.companyForm.value.prefecture_id,
        created_at: new Date(),
        updated_at: new Date()
      };
      const departmentsCol = collection(this.firestore, 'departments');
      await setDoc(doc(departmentsCol, departmentId), departmentData);
      this.companyRegisterSuccess = true;
      this.newCompanyId = newId;
      this.companyForm.reset();
      this.companyNameExists = false;
    } catch (e: any) {
      this.companyRegisterError = '登録に失敗しました: ' + (e.message || e);
    }
  }

  async addBranch() {
    if (this.branchForm.invalid) return;

    try {
      const companyId = this.branchForm.get('company_id')?.value;
      let departmentId = this.branchForm.get('department_id')?.value;
      if (!departmentId) {
        // Firestoreから既存の事業所IDを取得し、最大番号+1で生成
        const departmentsCol = collection(this.firestore, 'departments');
        const q = query(departmentsCol, where('company_id', '==', companyId));
        const snapshot = await getDocs(q);
        // 会社ID-XX形式の番号部分を抽出
        const numbers = snapshot.docs
          .map(doc => doc.data()['department_id'])
          .filter((id: string) => id && id.startsWith(companyId + '-'))
          .map((id: string) => parseInt(id.split('-')[1], 10))
          .filter((num: number) => !isNaN(num));
        let nextNum = 1;
        if (numbers.length > 0) {
          nextNum = Math.max(...numbers) + 1;
        }
        departmentId = `${companyId}-${String(nextNum).padStart(2, '0')}`;
      }

      // 事業所IDの重複チェック
      const departmentDocRef = doc(this.firestore, 'departments', departmentId);
      const departmentSnap = await getDoc(departmentDocRef);
      if (departmentSnap.exists()) {
        this.branchRegisterError = 'この事業所IDは既に使用されています';
        return;
      }

      // 事業所情報を保存
      const departmentData = {
        ...this.branchForm.value,
        department_id: departmentId,
        address: this.branchForm.get('address')?.value,
        prefecture_id: this.branchForm.get('prefecture_id')?.value,
        insurer_number: this.branchForm.get('insurer_number')?.value || '',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      await setDoc(departmentDocRef, departmentData);

      this.branchRegisterSuccess = true;
      this.newDepartmentId = departmentId;
      this.branchForm.reset();
      this.departmentCount++;
    } catch (error) {
      console.error('Error adding branch:', error);
      this.branchRegisterError = '事業所の登録に失敗しました';
    }
  }

  async onDeleteCompany() {
    this.deleteSuccess = false;
    this.deleteError = null;
    const companyId = this.deleteCompanyId;
    if (!companyId) {
      this.deleteError = '会社IDが見つかりません';
      return;
    }
    try {
      // companiesから削除
      await deleteDoc(doc(this.firestore, `companies/${companyId}`));
      // departmentsから該当company_idの全ドキュメント削除
      const departmentsCol = collection(this.firestore, 'departments');
      const q = query(departmentsCol, where('company_id', '==', companyId));
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(this.firestore, `departments/${docSnap.id}`));
      }
      this.deleteSuccess = true;
      this.deleteForm.reset();
      this.deleteCompanyId = '';
    } catch (e: any) {
      this.deleteError = '削除に失敗しました: ' + (e.message || e);
    }
  }

  // 都道府県名から都道府県ID+短縮名を取得する関数
  getPrefectureId(prefectureName: string): string {
    // 京都の場合は「京都」を返す
    if (prefectureName.includes('京都')) {
      return '京都';
    }
    // その他の都道府県は「都」「道」「府」「県」を除去して短縮名を返す
    return prefectureName.replace(/[都道府県]/g, '');
  }

  // 郵便番号から住所を検索（会社用）
  async searchCompanyAddressByPostalCode(postalCode: string) {
    if (!postalCode || postalCode.length !== 7) return;
    try {
      const response = await this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`).toPromise();
      if (response && response.results && response.results[0]) {
        const address = response.results[0];
        const fullAddress = `${address.address1}${address.address2}${address.address3}`;
        // 京都府の場合は「京都」を返す
        const prefectureId = address.address1 === '京都府' ? '京都' : this.getPrefectureId(address.address1);
        this.companyForm.patchValue({ 
          address: fullAddress,
          prefecture_id: prefectureId
        });
      }
    } catch (error) {
      console.error('郵便番号検索エラー:', error);
    }
  }

  // 郵便番号から住所を検索（事業所用）
  async searchBranchAddressByPostalCode(postalCode: string) {
    if (!postalCode || postalCode.length !== 7) return;
    try {
      const response = await this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`).toPromise();
      if (response && response.results && response.results[0]) {
        const address = response.results[0];
        const fullAddress = `${address.address1}${address.address2}${address.address3}`;
        // 京都府の場合は「京都」を返す
        const prefectureId = address.address1 === '京都府' ? '京都' : this.getPrefectureId(address.address1);
        this.branchForm.patchValue({ 
          address: fullAddress,
          prefecture_id: prefectureId
        });
      }
    } catch (error) {
      console.error('郵便番号検索エラー:', error);
    }
  }

  // 郵便番号入力時の処理
  onPostalCodeChange(postalCode: string | null) {
    if (!postalCode) return;
    const cleanPostalCode = postalCode.replace(/-/g, '');
    if (cleanPostalCode.length === 7) {
      this.searchBranchAddressByPostalCode(cleanPostalCode);
    }
  }

  // companyForm用：郵便番号入力時の処理
  onCompanyPostalCodeChange(postalCode: string | null) {
    if (!postalCode) return;
    const cleanPostalCode = postalCode.replace(/-/g, '');
    if (cleanPostalCode.length === 7) {
      this.searchCompanyAddressByPostalCode(cleanPostalCode);
    }
  }

  // タブ切り替えメソッド
  selectTab(tab: string) {
    this.selectedTab = tab;
  }

  // 年度または都道府県が変更された時の処理
  async onMasterSelectionChange() {
    if (!this.selectedMasterYear || !this.selectedMasterPrefectureId) {
      this.masterGrades = null;
      this.masterGradesError = null;
      return;
    }

    this.isLoadingMasterGrades = true;
    this.masterGradesError = null;

    try {
      // 新しいFirestoreの構造に合わせてデータを取得
      const gradesRef = collection(
        this.firestore,
        `prefectures/${this.selectedMasterPrefectureId}/insurance_premiums/${this.selectedMasterYear}/grades`
      );
      const gradesSnapshot = await getDocs(gradesRef);

      if (!gradesSnapshot.empty) {
        // 取得したデータを整形
        const gradesData: any = {};
        gradesSnapshot.forEach(doc => {
          gradesData[doc.id] = doc.data();
        });
        
        this.masterGrades = gradesData;
        this.editGrades = { ...this.masterGrades };
      } else {
        this.masterGradesError = 'データがありません';
        this.masterGrades = null;
      }
    } catch (error) {
      console.error('Error loading master grades:', error);
      this.masterGradesError = 'データの読み込みに失敗しました';
    } finally {
      this.isLoadingMasterGrades = false;
    }
  }

  enableEditMode() {
    this.isEditMode = true;
    this.editGrades = { ...this.masterGrades };
  }

  cancelEditMode() {
    this.isEditMode = false;
    this.editGrades = {};
  }

  // 保険料表データの保存処理も修正
  async saveMasterGrades() {
    if (!this.selectedMasterYear || !this.selectedMasterPrefectureId) return;

    try {
      const gradesRef = collection(
        this.firestore,
        `prefectures/${this.selectedMasterPrefectureId}/insurance_premiums/${this.selectedMasterYear}/grades`
      );

      // 各等級のデータを保存
      for (const [gradeId, gradeData] of Object.entries(this.editGrades)) {
        const gradeDocRef = doc(gradesRef, gradeId);
        await setDoc(gradeDocRef, gradeData);
      }

      this.masterGrades = { ...this.editGrades };
      this.isEditMode = false;
    } catch (error) {
      console.error('Error saving master grades:', error);
      this.masterGradesError = 'データの保存に失敗しました';
    }
  }

  // ファイル選択時の処理
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.sheetNames = [];
      this._selectedSheetName = '';
      
      // Excelファイルのシート名を取得
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          this.sheetNames = workbook.SheetNames;
        } catch (error) {
          console.error('Error reading Excel file:', error);
          this.importError = 'Excelファイルの読み込みに失敗しました';
        }
      };
      reader.readAsArrayBuffer(this.selectedFile);
    }
  }

  // インポート実行時の処理
  async onImportClick(): Promise<void> {
    if (!this.selectedFile || !this.selectedSheetName || !this.selectedYear) {
      this.importError = 'ファイル、シート、年度を選択してください';
      return;
    }

    this.isImporting = true;
    this.importError = null;

    try {
      // シート名から都道府県IDを取得
      const prefectureId = this.getPrefectureId(this.selectedSheetName);
      
      await this.insurancePremiumService.importExcelFile(
        this.selectedFile,
        prefectureId,
        this.selectedYear,
        this.selectedSheetName
      );

      // インポート後にデータを再読み込み
      this.selectedMasterPrefectureId = prefectureId;
      this.selectedMasterYear = this.selectedYear;
      await this.onMasterSelectionChange();

      // 入力フィールドをクリア
      this.selectedFile = null;
      this.sheetNames = [];
      this._selectedSheetName = '';
      const input = document.getElementById('excelFile') as HTMLInputElement;
      if (input) input.value = '';

    } catch (error: any) {
      console.error('Error importing file:', error);
      this.importError = error?.message || 'ファイルのインポートに失敗しました';
    } finally {
      this.isImporting = false;
    }
  }

  get selectedSheetName(): string {
    return this._selectedSheetName;
  }

  set selectedSheetName(value: string) {
    this._selectedSheetName = value;
  }

  sortByGrade = (a: {key: string}, b: {key: string}): number => {
    const getGradeNumber = (key: string) => {
      const match = key.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    };
    return getGradeNumber(a.key) - getGradeNumber(b.key);
  };
}
