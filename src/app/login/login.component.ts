import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Auth, signInWithEmailAndPassword, User } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Firestore, collection, addDoc, getDocs, query, where } from '@angular/fire/firestore';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  loginForm: FormGroup;
  errorMessage: string | null = null;
  loading = false;
  showPassword = false;

  constructor(private fb: FormBuilder, private auth: Auth, private router: Router, private firestore: Firestore) {
    this.loginForm = this.fb.group({
      company_id: [''],
      employee_id: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    // メールアドレスの変更を監視
    this.loginForm.get('email')?.valueChanges.subscribe(email => {
      const companyIdControl = this.loginForm.get('company_id');
      const employeeIdControl = this.loginForm.get('employee_id');
      
      if (email === 'yuki.wada@pathoslogos.co.jp') {
        companyIdControl?.clearValidators();
        employeeIdControl?.clearValidators();
        companyIdControl?.setValue(''); // 値をクリア
        employeeIdControl?.setValue(''); // 値をクリア
      } else {
        companyIdControl?.setValidators([Validators.required]);
        employeeIdControl?.setValidators([Validators.required]);
      }
      companyIdControl?.updateValueAndValidity();
      employeeIdControl?.updateValueAndValidity();
    });
  }

  async onSubmit() {
    this.errorMessage = null;
    this.loading = true;
    const { company_id, employee_id, email, password } = this.loginForm.value;
    
    try {
      // 特定のメールアドレスとパスワードの組み合わせの場合は無条件でログイン
      if (email === 'yuki.wada@pathoslogos.co.jp' && password === 'Wadayuuki') {
        // ダミーのユーザー情報を設定
        const userName = '和田 優希';
        const employeeCode = 'ADMIN001';
        
        // IPアドレス取得（外部API利用）
        let ipAddress = '';
        try {
          const res = await fetch('https://api.ipify.org?format=json');
          const json = await res.json();
          ipAddress = json.ip;
        } catch (e) {
          ipAddress = '';
        }

        // Firestoreに操作ログを追加
        const logsCol = collection(this.firestore, 'operation_logs');
        await addDoc(logsCol, {
          user_id: 'admin',
          employee_code: employeeCode,
          user_name: userName,
          company_id: 'ADMIN',
          operation_type: 'login',
          operation_detail: 'システムにログイン（管理者）',
          ip_address: ipAddress,
          status: 'success',
          timestamp: new Date()
        });

        // ログイン成功時にダッシュボードへ遷移
        this.router.navigate(['/dashboard']);
        return;
      }

      // 通常のログインフロー
      const employeesCol = collection(this.firestore, 'employees');
      const q = query(
        employeesCol,
        where('company_id', '==', company_id),
        where('employee_code', '==', employee_id),
        where('email', '==', email)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        throw new Error('会社ID、社員ID、またはメールアドレスが正しくありません。');
      }

      // Firebase Authenticationでログイン
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      // ユーザー情報を取得
      const employeeData = snapshot.docs[0].data();
      const userName = (employeeData['last_name_kanji'] || '') + (employeeData['first_name_kanji'] || '');
      const employeeCode = employeeData['employee_code'] || '';

      // IPアドレス取得（外部API利用）
      let ipAddress = '';
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const json = await res.json();
        ipAddress = json.ip;
      } catch (e) {
        ipAddress = '';
      }

      // Firestoreに操作ログを追加
      const logsCol = collection(this.firestore, 'operation_logs');
      await addDoc(logsCol, {
        user_id: snapshot.docs[0].id,
        employee_code: employeeCode,
        user_name: userName,
        company_id: company_id,
        operation_type: 'login',
        operation_detail: 'システムにログイン',
        ip_address: ipAddress,
        status: 'success',
        timestamp: new Date()
      });

      // ログイン成功時にダッシュボードへ遷移
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      if (error.message.includes('auth/invalid-credential')) {
        this.errorMessage = 'メールアドレスまたはパスワードが正しくありません。';
      } else {
        this.errorMessage = error.message;
      }
    } finally {
      this.loading = false;
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
