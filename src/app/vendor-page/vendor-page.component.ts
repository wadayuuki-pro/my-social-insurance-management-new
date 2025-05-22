import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Firestore, doc, setDoc, collection, getDocs, query, where, deleteDoc, getDoc, serverTimestamp } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { debounceTime } from 'rxjs/operators';
import { createUserWithEmailAndPassword, Auth } from '@angular/fire/auth';
import { HttpClient } from '@angular/common/http';

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
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './vendor-page.component.html',
  styleUrl: './vendor-page.component.scss'
})
export class VendorPageComponent {
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

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private auth: Auth,
    private http: HttpClient
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
      prefecture_id: ['']
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
      const employeeData = {
        company_id: newId,
        department_id: '',
        employee_code: newId,
        last_name_kanji: '',
        first_name_kanji: '',
        last_name_kana: '',
        first_name_kana: '',
        date_of_birth: '',
        gender: '',
        nationality: '',
        my_number: '',
        postal_code: '',
        address: '',
        phone_number: this.companyForm.value.phone_number || '',
        email: this.companyForm.value.email || '',
        password: initialPassword,
        role: 'admin',
        employment_type: '',
        employment_start_date: '',
        employment_end_date: '',
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
        dependents: [],
        remarks: '',
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
      const departmentId = this.branchForm.get('department_id')?.value || `${companyId}-${String(this.departmentCount + 1).padStart(2, '0')}`;

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
    const prefectureMap: { [key: string]: string } = {
      '北海道': '01', '青森県': '02', '岩手県': '03', '宮城県': '04', '秋田県': '05',
      '山形県': '06', '福島県': '07', '茨城県': '08', '栃木県': '09', '群馬県': '10',
      '埼玉県': '11', '千葉県': '12', '東京都': '13', '神奈川県': '14', '新潟県': '15',
      '富山県': '16', '石川県': '17', '福井県': '18', '山梨県': '19', '長野県': '20',
      '岐阜県': '21', '静岡県': '22', '愛知県': '23', '三重県': '24', '滋賀県': '25',
      '京都府': '26', '大阪府': '27', '兵庫県': '28', '奈良県': '29', '和歌山県': '30',
      '鳥取県': '31', '島根県': '32', '岡山県': '33', '広島県': '34', '山口県': '35',
      '徳島県': '36', '香川県': '37', '愛媛県': '38', '高知県': '39', '福岡県': '40',
      '佐賀県': '41', '長崎県': '42', '熊本県': '43', '大分県': '44', '宮崎県': '45',
      '鹿児島県': '46', '沖縄県': '47'
    };
    const id = prefectureMap[prefectureName];
    // 「県」「府」「都」「道」を除去
    const shortName = prefectureName.replace(/(都|道|府|県)$/, '');
    return id ? id + shortName : '';
  }

  // 郵便番号から住所を検索（会社用）
  async searchCompanyAddressByPostalCode(postalCode: string) {
    if (!postalCode || postalCode.length !== 7) return;
    try {
      const response = await this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`).toPromise();
      if (response && response.results && response.results[0]) {
        const address = response.results[0];
        const fullAddress = `${address.address1}${address.address2}${address.address3}`;
        const prefectureId = this.getPrefectureId(address.address1);
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
        const prefectureId = this.getPrefectureId(address.address1);
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
}
