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
      company_id: ['', Validators.required],
      department_id: [''], // 任意
      employee_id: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async onSubmit() {
    this.errorMessage = null;
    this.loading = true;
    const { company_id, department_id, employee_id, email, password } = this.loginForm.value;
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      // Firestoreからユーザー情報を取得
      let userName = '';
      let companyId = '';
      let employeeId = '';
      let employeeCode = '';
      const employeesCol = collection(this.firestore, 'employees');
      const q = query(employeesCol, where('email', '==', email));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        userName = (data['last_name_kanji'] || '') + (data['first_name_kanji'] || '');
        companyId = data['company_id'] || '';
        employeeId = snapshot.docs[0].id;
        employeeCode = data['employee_code'] || '';
      }
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
        user_id: employeeId,
        employee_code: employeeCode,
        user_name: userName,
        company_id: companyId,
        operation_type: 'login',
        operation_detail: 'システムにログイン',
        ip_address: ipAddress,
        status: 'success',
        timestamp: new Date()
      });
      // ログイン成功時にダッシュボードへ遷移
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.loading = false;
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
