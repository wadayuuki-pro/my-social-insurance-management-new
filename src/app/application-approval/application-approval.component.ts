import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map, of, from } from 'rxjs';

interface ApprovalStep {
  stepOrder: number;
  approverRole: string;
  approverIds: string[];
  isFinal: boolean;
}

interface ApprovalRoute {
  id: string;
  companyId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  applicableFormTypes: string[];
  steps: ApprovalStep[];
}

@Component({
  selector: 'app-application-approval',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './application-approval.component.html',
  styleUrl: './application-approval.component.scss'
})
export class ApplicationApprovalComponent implements OnInit {
  selectedTab: 'form' | 'approval' | 'history' = 'form';
  
  // フォーム関連
  requestType: string = '';
  title: string = '';
  detail: string = '';
  isImportant: boolean = false;
  
  // 決済ルート関連
  approvalRoutes: ApprovalRoute[] = [];
  currentRoute: ApprovalRoute = {
    id: '',
    companyId: '',
    name: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: '',
    applicableFormTypes: [],
    steps: []
  };
  
  // 利用可能な役職リスト
  availableRoles = [
    '部長',
    '課長',
    '係長',
    '主任',
    '一般社員'
  ];

  // 申請種別リスト
  availableFormTypes = [
    '氏名変更',
    '住所変更',
    '扶養家族の追加',
    '扶養家族の削除',
    '勤務状況変更',
    '転勤・事業所異動',
    '育児休業',
    '産前産後休業',
    'その他の休職',
    '復職',
    '退職',
    '再雇用',
    '再入社',
    '書類確認'
  ];

  // 従業員リスト（固定承認者選択用）
  employeeList: { employee_code: string; name: string }[] = [];

  // ログイン情報表示用
  companyId: string = '';
  user$;
  isAuthReady$;
  employeeInfo$;
  currentEmployeeId: string = '';
  appliedDate: Date | null = null;
  attachments: string[] = [];
  editingRouteId: string | null = null;

  constructor(
    private firestore: Firestore,
    public authService: AuthService
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
              name: `${data['last_name_kanji'] || ''}${data['first_name_kanji'] || ''}`
            };
          })
        );
      })
    );
  }

  ngOnInit() {
    this.authService.isAuthReady$.subscribe(isReady => {
      if (isReady) {
        this.authService.companyId$.subscribe(async companyId => {
          if (companyId) {
            this.companyId = companyId;
            await this.loadApprovalRoutes();
            await this.loadEmployeeList();
          }
        });
        this.employeeInfo$.subscribe(info => {
          if (info) {
            this.currentEmployeeId = info.employee_code;
          }
        });
      }
    });
  }

  // 決済ルートの読み込み
  async loadApprovalRoutes() {
    if (!this.companyId) return;
    const routesRef = collection(this.firestore, 'approval_routes');
    const q = query(routesRef, where('companyId', '==', this.companyId));
    const querySnapshot = await getDocs(q);

    this.approvalRoutes = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ApprovalRoute));
  }

  async loadEmployeeList() {
    // 会社IDで従業員一覧を取得
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.employeeList = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        employee_code: data['employee_code'],
        name: `${data['last_name_kanji'] || ''}${data['first_name_kanji'] || ''}`
      };
    });
  }

  // 決済ルートの追加
  async addApprovalRoute() {
    if (this.currentRoute.name && this.currentRoute.steps.length > 0 && this.companyId && this.currentEmployeeId) {
      const routeData = {
        name: this.currentRoute.name,
        companyId: this.companyId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: this.currentEmployeeId,
        applicableFormTypes: this.currentRoute.applicableFormTypes,
        steps: this.currentRoute.steps.map((step, idx) => ({
          stepOrder: idx + 1,
          approverRole: step.approverRole,
          approverIds: step.approverIds,
          isFinal: step.isFinal
        }))
      };

      try {
        const docRef = await addDoc(collection(this.firestore, 'approval_routes'), routeData);
        this.approvalRoutes.push({
          ...routeData,
          id: docRef.id
        });
        this.resetCurrentRoute();
      } catch (error) {
        console.error('決済ルートの保存に失敗しました:', error);
        // エラー処理（ユーザーへの通知など）
      }
    }
  }

  // 決済ステップの追加
  addApprovalStep() {
    const newStep: ApprovalStep = {
      stepOrder: this.currentRoute.steps.length + 1,
      approverRole: this.availableRoles[0],
      approverIds: [],
      isFinal: false
    };
    this.currentRoute.steps.push(newStep);
  }

  // 決済ステップの削除
  removeApprovalStep(stepOrder: number) {
    this.currentRoute.steps = this.currentRoute.steps.filter(step => step.stepOrder !== stepOrder);
    this.currentRoute.steps.forEach((step, idx) => {
      step.stepOrder = idx + 1;
    });
  }

  // 決済ステップの順序変更
  moveStep(stepOrder: number, direction: 'up' | 'down') {
    const index = this.currentRoute.steps.findIndex(step => step.stepOrder === stepOrder);
    if (
      (direction === 'up' && index > 0) ||
      (direction === 'down' && index < this.currentRoute.steps.length - 1)
    ) {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      const steps = [...this.currentRoute.steps];
      [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
      this.currentRoute.steps = steps.map((step, i) => ({
        ...step,
        stepOrder: i + 1
      }));
    }
  }

  // 現在のルートをリセット
  resetCurrentRoute() {
    this.currentRoute = {
      id: '',
      companyId: '',
      name: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      applicableFormTypes: [],
      steps: []
    };
  }

  // 決済ルートの削除
  async deleteApprovalRoute(routeId: string) {
    try {
      await deleteDoc(doc(this.firestore, 'approval_routes', routeId));
      this.approvalRoutes = this.approvalRoutes.filter(route => route.id !== routeId);
    } catch (error) {
      console.error('決済ルートの削除に失敗しました:', error);
      // エラー処理（ユーザーへの通知など）
    }
  }

  async submitApplication() {
    if (!this.companyId || !this.currentEmployeeId || !this.requestType || !this.title || !this.detail) {
      alert('必須項目を入力してください');
      return;
    }
    const applicationData = {
      employeeId: this.currentEmployeeId,
      companyId: this.companyId,
      type: this.requestType,
      title: this.title,
      description: this.detail,
      isImportant: this.isImportant,
      attachments: this.attachments, // 添付ファイルのURLリスト（現状は空）
      appliedDate: this.appliedDate, // 適用希望日（現状はnull）
      status: '申請中',
      approvalRouteId: '', // ルート選択UI追加時に対応
      currentStep: 1,
      decisionLogs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    try {
      await addDoc(collection(this.firestore, 'applications'), applicationData);
      alert('申請を送信しました');
      // 入力欄リセット等
      this.requestType = '';
      this.title = '';
      this.detail = '';
      this.isImportant = false;
      this.appliedDate = null;
      this.attachments = [];
    } catch (error) {
      alert('申請の送信に失敗しました');
      console.error(error);
    }
  }

  startEditRoute(route: ApprovalRoute) {
    this.editingRouteId = route.id;
    // currentRouteにディープコピー
    this.currentRoute = JSON.parse(JSON.stringify(route));
  }

  cancelEditRoute() {
    this.editingRouteId = null;
    this.resetCurrentRoute();
  }

  async updateApprovalRoute() {
    if (!this.editingRouteId) return;
    const routeRef = doc(this.firestore, 'approval_routes', this.editingRouteId);
    const updateData = {
      name: this.currentRoute.name,
      applicableFormTypes: this.currentRoute.applicableFormTypes,
      steps: this.currentRoute.steps.map((step, idx) => ({
        stepOrder: idx + 1,
        approverRole: step.approverRole,
        approverIds: step.approverIds,
        isFinal: step.isFinal
      })),
      updatedAt: new Date()
    };
    try {
      await updateDoc(routeRef, updateData);
      // ローカルリストも更新
      const idx = this.approvalRoutes.findIndex(r => r.id === this.editingRouteId);
      if (idx !== -1) {
        this.approvalRoutes[idx] = {
          ...this.approvalRoutes[idx],
          ...updateData
        };
      }
      this.cancelEditRoute();
    } catch (error) {
      alert('決済ルートの更新に失敗しました');
      console.error(error);
    }
  }
}
