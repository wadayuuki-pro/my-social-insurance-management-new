import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, updateDoc } from '@angular/fire/firestore';
import { AuthService } from '../shared/services/auth.service';
import { switchMap, map, of, from } from 'rxjs';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

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
  uploading: boolean = false;
  selectedApprovalRouteId: string = '';
  drafts: any[] = [];
  editingDraftId: string | null = null;
  selectedApprovalDetail: any = null;
  myApprovalList: any[] = [];
  employeeNameMap: { [id: string]: string } = {};
  myApplicationHistory: any[] = [];

  constructor(
    private firestore: Firestore,
    public authService: AuthService,
    private storage: Storage
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
            await this.loadEmployeeNameMap();
            await this.loadApprovalRoutes();
            await this.loadEmployeeList();
            await this.loadDrafts();
            await this.loadMyApprovals();
            await this.loadMyApplicationHistory();
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

  async loadEmployeeNameMap() {
    if (!this.companyId) return;
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.employeeNameMap = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      this.employeeNameMap[data['employee_code']] = `${data['last_name_kanji'] || ''}${data['first_name_kanji'] || ''}`;
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

  // 申請種類に該当する決済ルートのみを返すgetter
  get filteredApprovalRoutes() {
    if (!this.requestType) return [];
    return this.approvalRoutes.filter(route =>
      route.applicableFormTypes && route.applicableFormTypes.includes(this.requestType)
    );
  }

  async submitApplication() {
    if (!this.companyId || !this.currentEmployeeId || !this.requestType || !this.title || !this.detail || !this.selectedApprovalRouteId) {
      alert('必須項目を入力してください');
      return;
    }
    // 選択した決済ルートの1番目の承認者IDリストを取得
    const selectedRoute = this.approvalRoutes.find(r => r.id === this.selectedApprovalRouteId);
    const firstStepApproverIds = selectedRoute?.steps[0]?.approverIds || [];
    const applicationData = {
      employeeId: this.currentEmployeeId,
      companyId: this.companyId,
      type: this.requestType,
      title: this.title,
      description: this.detail,
      isImportant: this.isImportant,
      attachments: this.attachments,
      appliedDate: this.appliedDate,
      status: '申請中',
      approvalRouteId: this.selectedApprovalRouteId,
      currentStep: 1,
      currentApproverIds: firstStepApproverIds,
      decisionLogs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    try {
      await addDoc(collection(this.firestore, 'applications'), applicationData);
      // 下書きから編集していた場合は下書きを削除
      if (this.editingDraftId) {
        await deleteDoc(doc(this.firestore, 'applications', this.editingDraftId));
        this.editingDraftId = null;
        await this.loadDrafts();
      }
      alert('申請を送信しました');
      // 入力欄リセット等
      this.requestType = '';
      this.title = '';
      this.detail = '';
      this.isImportant = false;
      this.appliedDate = null;
      this.attachments = [];
      this.selectedApprovalRouteId = '';
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

  async onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;
    this.uploading = true;
    const uploadedUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = `applications/${Date.now()}_${file.name}`;
      const storageRef = ref(this.storage, filePath);
      try {
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      } catch (error) {
        alert('ファイルのアップロードに失敗しました: ' + file.name);
        console.error(error);
      }
    }
    this.attachments = [...this.attachments, ...uploadedUrls];
    this.uploading = false;
  }

  isImageFile(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(url);
  }

  getFileName(url: string): string {
    try {
      return decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    } catch {
      return url;
    }
  }

  editDraft(draft: any) {
    this.requestType = draft.type;
    this.title = draft.title;
    this.detail = draft.description;
    this.isImportant = draft.isImportant;
    this.attachments = draft.attachments || [];
    this.appliedDate = draft.appliedDate || null;
    this.selectedApprovalRouteId = draft.approvalRouteId || '';
    this.editingDraftId = draft.id;
  }

  async saveDraft() {
    if (!this.companyId || !this.currentEmployeeId || !this.selectedApprovalRouteId) {
      alert('ログイン情報または決済ルートが取得できません');
      return;
    }
    const draftData = {
      employeeId: this.currentEmployeeId,
      companyId: this.companyId,
      type: this.requestType,
      title: this.title,
      description: this.detail,
      isImportant: this.isImportant,
      attachments: this.attachments,
      appliedDate: this.appliedDate,
      status: '下書き',
      approvalRouteId: this.selectedApprovalRouteId,
      currentStep: 0,
      decisionLogs: [],
      updatedAt: new Date()
    };
    try {
      if (this.editingDraftId) {
        // 上書き保存
        const draftRef = doc(this.firestore, 'applications', this.editingDraftId);
        await updateDoc(draftRef, draftData);
        alert('下書きを上書き保存しました');
      } else {
        // 新規保存
        await addDoc(collection(this.firestore, 'applications'), {
          ...draftData,
          createdAt: new Date()
        });
        alert('下書きを保存しました');
      }
      // 入力欄リセット等
      this.requestType = '';
      this.title = '';
      this.detail = '';
      this.isImportant = false;
      this.appliedDate = null;
      this.attachments = [];
      this.selectedApprovalRouteId = '';
      this.editingDraftId = null;
      await this.loadDrafts();
    } catch (error) {
      alert('下書き保存に失敗しました');
      console.error(error);
    }
  }

  async deleteDraft(draftId: string) {
    if (!confirm('この下書きを削除しますか？')) return;
    await deleteDoc(doc(this.firestore, 'applications', draftId));
    if (this.editingDraftId === draftId) {
      this.editingDraftId = null;
    }
    await this.loadDrafts();
  }

  async loadDrafts() {
    if (!this.companyId || !this.currentEmployeeId) return;
    const draftsCol = collection(this.firestore, 'applications');
    const q = query(draftsCol,
      where('companyId', '==', this.companyId),
      where('employeeId', '==', this.currentEmployeeId),
      where('status', '==', '下書き')
    );
    const snapshot = await getDocs(q);
    this.drafts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  openApprovalDetail(item: any) {
    this.selectedApprovalDetail = item;
  }
  closeApprovalDetail() {
    this.selectedApprovalDetail = null;
  }

  async loadMyApprovals() {
    if (!this.companyId || !this.currentEmployeeId) return;
    const appsCol = collection(this.firestore, 'applications');
    // Firestoreのarray-containsでcurrentApproverIdsに自分のIDが含まれる申請を取得
    const q = query(appsCol,
      where('companyId', '==', this.companyId),
      where('currentApproverIds', 'array-contains', this.currentEmployeeId),
      where('status', '==', '申請中')
    );
    const snapshot = await getDocs(q);
    this.myApprovalList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // デモ用：内容確認・承認・却下メソッド
  openMyApprovalDetail(item: any) {
    this.selectedApprovalDetail = item;
  }
  async approveApplication(app: any) {
    // 1. ルート情報取得
    const route = this.approvalRoutes.find(r => r.id === app.approvalRouteId);
    if (!route) {
      alert('決済ルート情報が取得できません');
      return;
    }
    // 2. 次のステップの承認者取得
    const nextStep = (app.currentStep || 1) + 1;
    const nextStepObj = route.steps.find((s: any) => s.stepOrder === nextStep);
    let updateData: any = {
      updatedAt: new Date(),
      decisionLogs: [
        ...(app.decisionLogs || []),
        {
          action: '承認',
          approverId: this.currentEmployeeId,
          step: app.currentStep,
          date: new Date()
        }
      ]
    };
    if (nextStepObj && nextStepObj.approverIds && nextStepObj.approverIds.length > 0) {
      // 次の承認者がいる場合
      updateData.currentStep = nextStep;
      updateData.currentApproverIds = nextStepObj.approverIds;
    } else {
      // 最終承認者の場合
      updateData.status = '承認済み';
      updateData.currentApproverIds = [];
    }
    // 3. Firestore更新
    const appRef = doc(this.firestore, 'applications', app.id);
    await updateDoc(appRef, updateData);
    alert('承認処理が完了しました');
    this.closeApprovalDetail();
    await this.loadMyApprovals();
  }
  async rejectApplication(app: any) {
    alert('（デモ）却下処理を実行します: ' + app.title);
    this.closeApprovalDetail();
    await this.loadMyApprovals();
  }

  async loadMyApplicationHistory() {
    if (!this.companyId || !this.currentEmployeeId) return;
    const appsCol = collection(this.firestore, 'applications');
    const q = query(appsCol,
      where('companyId', '==', this.companyId),
      where('employeeId', '==', this.currentEmployeeId)
    );
    const snapshot = await getDocs(q);
    this.myApplicationHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  getApprovalRouteSteps(routeId: string): any[] {
    return this.approvalRoutes.find(r => r.id === routeId)?.steps || [];
  }
}
