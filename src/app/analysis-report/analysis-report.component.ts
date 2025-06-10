import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { Firestore, collection, query, where, getDocs, getDoc, doc } from '@angular/fire/firestore';
import { switchMap, map, from, of } from 'rxjs';

@Component({
  selector: 'app-analysis-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis-report.component.html',
  styleUrls: ['./analysis-report.component.scss']
})
export class AnalysisReportComponent {
  selectedTab: string = 'summary';

  companyId: string = '';
  departmentList: { department_id: string; department_name: string }[] = [];
  selectedDepartmentId: string = '';
  selectedYearMonth: string = '';
  yearMonthOptions: string[] = [];
  employeeCount: number = 0;
  activeCount: number = 0;
  retiredCount: number = 0;
  insuranceTotal: number = 0;

  // 保険料詳細用のプロパティ
  ippanCompanyTotal: number = 0;
  ippanEmployeeTotal: number = 0;
  tokuteiCompanyTotal: number = 0;
  tokuteiEmployeeTotal: number = 0;
  kouseiCompanyTotal: number = 0;
  kouseiEmployeeTotal: number = 0;
  kaigoCompanyTotal: number = 0;
  kaigoEmployeeTotal: number = 0;

  // 合計値の計算用getter
  get totalCompanyBurden(): number {
    return this.ippanCompanyTotal + this.tokuteiCompanyTotal + this.kouseiCompanyTotal + this.kaigoCompanyTotal;
  }

  get totalEmployeeBurden(): number {
    return this.ippanEmployeeTotal + this.tokuteiEmployeeTotal + this.kouseiEmployeeTotal + this.kaigoEmployeeTotal;
  }

  get totalBurden(): number {
    return this.totalCompanyBurden + this.totalEmployeeBurden;
  }

  get companyBurdenRatio(): number {
    if (this.totalBurden === 0) return 0;
    return Math.round((this.totalCompanyBurden / this.totalBurden) * 100);
  }

  get employeeBurdenRatio(): number {
    if (this.totalBurden === 0) return 0;
    return Math.round((this.totalEmployeeBurden / this.totalBurden) * 100);
  }

  // 月別加入者数用のプロパティ
  monthlyHealthInsuranceData: { [key: string]: number } = {};
  monthlyPensionData: { [key: string]: number } = {};
  // 月別喪失者数用のプロパティ
  monthlyHealthInsuranceWithdrawalData: { [key: string]: number } = {};
  monthlyPensionWithdrawalData: { [key: string]: number } = {};
  // 月額変更・賞与支給の推移用のプロパティ
  monthlySalaryChangeData: { [key: string]: number } = {};
  monthlyBonusData: { [key: string]: number } = {};
  chartLabels: string[] = [];

  // 拠点別保険料総額比較用プロパティ
  branchLabels: string[] = [];
  branchHealthTotals: number[] = [];
  branchPensionTotals: number[] = [];
  branchKaigoTotals: number[] = [];

  // 拠点ごとの負担割合（円グラフ用）
  branchPieLabels: string[] = [];
  branchCompanyBurden: number[] = [];
  branchEmployeeBurden: number[] = [];

  // 従業員ステータス別人数（6区分）
  statusActive: number = 0;
  statusLeave: number = 0;
  statusMaternity: number = 0;
  statusChildcare: number = 0;
  statusRetiring: number = 0;
  statusRetired: number = 0;

  public user$;
  public isAuthReady$;
  public employeeInfo$;

  // グラフインスタンスを保持するプロパティを追加
  private chartInstances: { [key: string]: any } = {};

  constructor(private authService: AuthService, private firestore: Firestore) {
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
    this.authService.companyId$.subscribe(async companyId => {
      if (companyId) {
        this.companyId = companyId;
        await this.loadDepartmentList();
        await this.loadYearMonthOptions();
        await this.loadMonthlyEnrollmentData();
        await this.loadMonthlySalaryAndBonusData();
        await this.loadBranchInsuranceTotals();
        await this.loadBranchPieData();
      }
    });
  }

  async loadDepartmentList() {
    if (!this.companyId) return;
    const departmentsCol = collection(this.firestore, 'departments');
    const q = query(departmentsCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    this.departmentList = snapshot.docs.map(doc => ({
      department_id: doc.data()['department_id'],
      department_name: doc.data()['department_name'] || doc.data()['department_id']
    }));
    if (this.departmentList.length > 0) {
      this.selectedDepartmentId = this.departmentList[0].department_id;
      await this.loadEmployeeCount();
      await this.loadEmployeeStatusCount();
    }
  }

  async loadYearMonthOptions() {
    if (!this.companyId || !this.selectedDepartmentId) return;
    
    const burdenRatiosCol = collection(this.firestore, 'departments', this.selectedDepartmentId, 'burden_ratios');
    const snapshot = await getDocs(burdenRatiosCol);
    
    this.yearMonthOptions = snapshot.docs
      .map(doc => doc.id)
      .sort((a, b) => b.localeCompare(a)); // 降順でソート
    
    if (this.yearMonthOptions.length > 0) {
      this.selectedYearMonth = this.yearMonthOptions[0];
      await this.loadEmployeeCount();
    }
  }

  async onDepartmentChange(deptId: string) {
    this.selectedDepartmentId = deptId;
    await this.loadYearMonthOptions();
    await this.loadEmployeeStatusCount();
    await this.loadMonthlyEnrollmentData();
    await this.loadMonthlySalaryAndBonusData();
    await this.loadBranchInsuranceTotals();
    await this.loadBranchPieData();
    // データ更新後にグラフを再描画
    this.renderCharts();
  }

  // 対象年月変更時の処理を追加
  async onYearMonthChange(yearMonth: string) {
    this.selectedYearMonth = yearMonth;
    await this.loadEmployeeCount();
  }

  async loadEmployeeCount() {
    if (!this.companyId || !this.selectedDepartmentId || !this.selectedYearMonth) {
      this.employeeCount = 0;
      this.activeCount = 0;
      this.retiredCount = 0;
      this.insuranceTotal = 0;
      // 保険料詳細の初期化
      this.ippanCompanyTotal = 0;
      this.ippanEmployeeTotal = 0;
      this.tokuteiCompanyTotal = 0;
      this.tokuteiEmployeeTotal = 0;
      this.kouseiCompanyTotal = 0;
      this.kouseiEmployeeTotal = 0;
      this.kaigoCompanyTotal = 0;
      this.kaigoEmployeeTotal = 0;
      return;
    }

    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', this.selectedDepartmentId));
    const snapshot = await getDocs(q);
    this.employeeCount = snapshot.size;
    let active = 0;
    let retired = 0;

    // 保険料詳細の初期化
    this.ippanCompanyTotal = 0;
    this.ippanEmployeeTotal = 0;
    this.tokuteiCompanyTotal = 0;
    this.tokuteiEmployeeTotal = 0;
    this.kouseiCompanyTotal = 0;
    this.kouseiEmployeeTotal = 0;
    this.kaigoCompanyTotal = 0;
    this.kaigoEmployeeTotal = 0;

    // 健康保険料と厚生年金保険料をburden_ratiosから取得
    const burdenRatiosDoc = await getDoc(doc(this.firestore, 'departments', this.selectedDepartmentId, 'burden_ratios', this.selectedYearMonth));
    if (burdenRatiosDoc.exists()) {
      const data = burdenRatiosDoc.data();
      this.ippanCompanyTotal = data['health_insurance_company_burden'] || 0;
      this.ippanEmployeeTotal = data['health_insurance_employee_burden'] || 0;
      this.kouseiCompanyTotal = data['pension_insurance_company_burden'] || 0;
      this.kouseiEmployeeTotal = data['pension_insurance_employee_burden'] || 0;
    }

    // 各従業員ごとにinsurance_premiumsサブコレクションから介護保険料を取得
    for (const doc of snapshot.docs) {
      const status = (doc.data()['status'] || '').trim();
      if (status === '在籍中') {
        active++;
      } else if (status === '退職' || status === '退職済み') {
        retired++;
      }

      // insurance_premiumsサブコレクションを取得
      const empId = doc.id;
      const premiumsCol = collection(this.firestore, 'employees', empId, 'insurance_premiums');
      
      // 対象年月のドキュメントを取得（YYYYMM形式とYYYY-MM形式の両方）
      const targetYearMonth = this.selectedYearMonth;
      const targetYearMonthWithHyphen = targetYearMonth.replace(/(\d{4})(\d{2})/, '$1-$2');
      
      const q1 = query(premiumsCol, where('year_month', '==', targetYearMonth));
      const q2 = query(premiumsCol, where('year_month', '==', targetYearMonthWithHyphen));
      
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      
      // 両方のドキュメントを処理
      const processPremiumDoc = (premiumDoc: any) => {
        const data = premiumDoc.data();
        if (data && data.premiums && data.premiums.kaigo && data.premiums.kaigo.is_applicable === true) {
          const full = Number(data.premiums.kaigo.full || 0);
          const half = Number(data.premiums.kaigo.half || 0);
          this.kaigoEmployeeTotal += half;
          this.kaigoCompanyTotal += full - half;
        }
      };

      // 両方のクエリ結果を処理
      snap1.docs.forEach(processPremiumDoc);
      snap2.docs.forEach(processPremiumDoc);
    }

    this.activeCount = active;
    this.retiredCount = retired;
    this.insuranceTotal = this.totalBurden;
  }

  async loadEmployeeStatusCount() {
    if (!this.companyId || !this.selectedDepartmentId) {
      this.statusActive = 0;
      this.statusLeave = 0;
      this.statusMaternity = 0;
      this.statusChildcare = 0;
      this.statusRetiring = 0;
      this.statusRetired = 0;
      return;
    }
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', this.selectedDepartmentId));
    const snapshot = await getDocs(q);
    let active = 0, leave = 0, maternity = 0, childcare = 0, retiring = 0, retired = 0;
    snapshot.forEach(doc => {
      const status = (doc.data()['status'] || '').trim();
      if (status === '在籍中') {
        active++;
      } else if (status === '休職中') {
        leave++;
      } else if (status === '産休中') {
        maternity++;
      } else if (status === '育休中') {
        childcare++;
      } else if (status === '退職予定') {
        retiring++;
      } else if (status === '退職' || status === '退職済み') {
        retired++;
      }
    });
    this.statusActive = active;
    this.statusLeave = leave;
    this.statusMaternity = maternity;
    this.statusChildcare = childcare;
    this.statusRetiring = retiring;
    this.statusRetired = retired;
  }

  async loadMonthlyEnrollmentData() {
    if (!this.companyId) return;

    // 過去6ヶ月分の日付を生成
    const today = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      months.push(`${y}-${m}`);
    }
    this.chartLabels = months.map(m => m.replace('-', '/')); // YYYY/MM形式に変換

    // 各月の加入者数と喪失者数を初期化
    months.forEach(month => {
      this.monthlyHealthInsuranceData[month] = 0;
      this.monthlyPensionData[month] = 0;
      this.monthlyHealthInsuranceWithdrawalData[month] = 0;
      this.monthlyPensionWithdrawalData[month] = 0;
    });

    // 従業員データを取得
    const employeesCol = collection(this.firestore, 'employees');
    let q;
    if (this.selectedDepartmentId) {
      q = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', this.selectedDepartmentId));
    } else {
      q = query(employeesCol, where('company_id', '==', this.companyId));
    }
    const snapshot = await getDocs(q);

    // 各従業員の加入日と脱退日を確認
    snapshot.forEach(doc => {
      const data = doc.data();
      const healthEnrollDate = data['health_insurance_enrollment_date'];
      const healthWithdrawDate = data['health_insurance_withdrawal_date'];
      const pensionEnrollDate = data['pension_insurance_enrollment_date'];
      const pensionWithdrawDate = data['pension_insurance_withdrawal_date'];

      // 健康保険加入者数と喪失者数の集計
      if (healthEnrollDate) {
        const enrollMonth = healthEnrollDate.slice(0, 7); // YYYY-MM形式
        const withdrawMonth = healthWithdrawDate ? healthWithdrawDate.slice(0, 7) : null;
        
        // 加入月から脱退月（または現在）までの期間をカウント
        months.forEach(month => {
          if (month >= enrollMonth && (!withdrawMonth || month <= withdrawMonth)) {
            this.monthlyHealthInsuranceData[month]++;
          }
        });

        // 脱退月の喪失者数をカウント
        if (withdrawMonth) {
          this.monthlyHealthInsuranceWithdrawalData[withdrawMonth]++;
        }
      }

      // 厚生年金加入者数と喪失者数の集計
      if (pensionEnrollDate) {
        const enrollMonth = pensionEnrollDate.slice(0, 7); // YYYY-MM形式
        const withdrawMonth = pensionWithdrawDate ? pensionWithdrawDate.slice(0, 7) : null;
        
        // 加入月から脱退月（または現在）までの期間をカウント
        months.forEach(month => {
          if (month >= enrollMonth && (!withdrawMonth || month <= withdrawMonth)) {
            this.monthlyPensionData[month]++;
          }
        });

        // 脱退月の喪失者数をカウント
        if (withdrawMonth) {
          this.monthlyPensionWithdrawalData[withdrawMonth]++;
        }
      }
    });
  }

  async loadMonthlySalaryAndBonusData() {
    if (!this.companyId) return;

    // デバッグ用: 現在日付とmonths配列の内容を出力
    const today = new Date();
    console.log('today:', today);
    const months: string[] = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      months.unshift(`${y}-${m}`);
    }
    console.log('months:', months);

    // 各月のデータを初期化
    months.forEach(month => {
      this.monthlySalaryChangeData[month] = 0;
      this.monthlyBonusData[month] = 0;
    });

    // 月額変更データの取得（operation_logs）
    const operationLogsCol = collection(this.firestore, 'operation_logs');
    const operationLogsQuery = query(
      operationLogsCol,
      where('company_id', '==', this.companyId),
      where('operation_type', '==', 'salary')
    );
    const operationLogsSnapshot = await getDocs(operationLogsQuery);

    operationLogsSnapshot.forEach(doc => {
      const data = doc.data();
      const timestamp = data['timestamp']?.toDate();
      if (timestamp) {
        const y = timestamp.getFullYear();
        const m = (timestamp.getMonth() + 1).toString().padStart(2, '0');
        const month = `${y}-${m}`;
        console.log('timestamp:', timestamp, '→ month:', month);
        console.log('months配列:', months);
        if (this.monthlySalaryChangeData[month] !== undefined) {
          // 部署フィルタ
          if (!this.selectedDepartmentId || (data['department_id'] === this.selectedDepartmentId)) {
            this.monthlySalaryChangeData[month]++;
          }
        }
      }
    });

    // 賞与データの取得（employees/salaries）
    const employeesCol = collection(this.firestore, 'employees');
    let employeesQuery;
    if (this.selectedDepartmentId) {
      employeesQuery = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', this.selectedDepartmentId));
    } else {
      employeesQuery = query(employeesCol, where('company_id', '==', this.companyId));
    }
    const employeesSnapshot = await getDocs(employeesQuery);

    for (const empDoc of employeesSnapshot.docs) {
      const salariesCol = collection(this.firestore, 'employees', empDoc.id, 'salaries');
      const salariesSnapshot = await getDocs(salariesCol);

      salariesSnapshot.forEach(doc => {
        const data = doc.data();
        const yearMonth = data['year_month'];
        const details = data['details'] || [];
        
        // 賞与（bonus）の有無を確認
        const hasBonus = details.some((detail: any) => detail.type === 'bonus');
        if (hasBonus && this.monthlyBonusData[yearMonth] !== undefined) {
          this.monthlyBonusData[yearMonth]++;
        }
      });
    }

    // グラフのラベルを更新（YYYY/MM形式）
    this.chartLabels = months.map(m => m.replace('-', '/'));
  }

  async loadBranchInsuranceTotals() {
    if (!this.companyId) return;
    // 拠点リスト取得
    const departmentsCol = collection(this.firestore, 'departments');
    const q = query(departmentsCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    const branches = snapshot.docs.map(doc => ({
      department_id: doc.data()['department_id'],
      department_name: doc.data()['department_name'] || doc.data()['department_id']
    }));
    // 各拠点ごとに保険料合計を集計
    const healthTotals: number[] = [];
    const pensionTotals: number[] = [];
    const kaigoTotals: number[] = [];
    const labels: string[] = [];
    // 選択された事業所がある場合はその事業所のみ、なければ全事業所
    const targetBranches = this.selectedDepartmentId 
      ? branches.filter(b => b.department_id === this.selectedDepartmentId)
      : branches.slice(0, Math.min(3, branches.length));
    for (const branch of targetBranches) {
      labels.push(branch.department_name);
      let health = 0, pension = 0, kaigo = 0;
      // 拠点ごとの従業員取得
      const employeesCol = collection(this.firestore, 'employees');
      const eq = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', branch.department_id));
      const empSnap = await getDocs(eq);
      for (const doc of empSnap.docs) {
        const empId = doc.id;
        const premiumsCol = collection(this.firestore, 'employees', empId, 'insurance_premiums');
        const premiumsSnap = await getDocs(premiumsCol);
        for (const d of premiumsSnap.docs) {
          const data = d.data() as any;
          if (data && data.premiums) {
            // 健康保険
            if (data.premiums.ippan && data.premiums.ippan.is_initial === true) {
              health += Number(data.premiums.ippan.full || 0);
            }
            // 介護保険
            if (data.premiums.kaigo && data.premiums.kaigo.is_applicable === true) {
              kaigo += Number(data.premiums.kaigo.full || 0);
            }
            // 厚生年金
            if (data.premiums.kousei && data.premiums.kousei.is_applicable === true) {
              pension += Number(data.premiums.kousei.full || 0);
            }
          }
        }
      }
      healthTotals.push(health);
      pensionTotals.push(pension);
      kaigoTotals.push(kaigo);
    }
    this.branchLabels = labels;
    this.branchHealthTotals = healthTotals;
    this.branchPensionTotals = pensionTotals;
    this.branchKaigoTotals = kaigoTotals;
  }

  async loadBranchPieData() {
    if (!this.companyId) return;
    // 拠点リスト取得
    const departmentsCol = collection(this.firestore, 'departments');
    const q = query(departmentsCol, where('company_id', '==', this.companyId));
    const snapshot = await getDocs(q);
    const branches = snapshot.docs.map(doc => ({
      department_id: doc.data()['department_id'],
      department_name: doc.data()['department_name'] || doc.data()['department_id']
    }));
    const pieLabels: string[] = [];
    const companyBurden: number[] = [];
    const employeeBurden: number[] = [];
    // 選択された事業所がある場合はその事業所のみ、なければ全事業所
    const targetBranches = this.selectedDepartmentId 
      ? branches.filter(b => b.department_id === this.selectedDepartmentId)
      : branches.slice(0, Math.min(3, branches.length));
    for (const branch of targetBranches) {
      pieLabels.push(branch.department_name);
      let company = 0, employee = 0;
      // 拠点ごとの従業員取得
      const employeesCol = collection(this.firestore, 'employees');
      const eq = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', branch.department_id));
      const empSnap = await getDocs(eq);
      for (const doc of empSnap.docs) {
        const empId = doc.id;
        const premiumsCol = collection(this.firestore, 'employees', empId, 'insurance_premiums');
        const premiumsSnap = await getDocs(premiumsCol);
        for (const d of premiumsSnap.docs) {
          const data = d.data() as any;
          if (data && data.premiums) {
            // 健康保険
            if (data.premiums.ippan && data.premiums.ippan.is_initial === true) {
              const full = Number(data.premiums.ippan.full || 0);
              const half = Number(data.premiums.ippan.half || 0);
              employee += half;
              company += full - half;
            }
            // 介護保険
            if (data.premiums.kaigo && data.premiums.kaigo.is_applicable === true) {
              const full = Number(data.premiums.kaigo.full || 0);
              const half = Number(data.premiums.kaigo.half || 0);
              employee += half;
              company += full - half;
            }
            // 厚生年金
            if (data.premiums.kousei && data.premiums.kousei.is_applicable === true) {
              const full = Number(data.premiums.kousei.full || 0);
              const half = Number(data.premiums.kousei.half || 0);
              employee += half;
              company += full - half;
            }
          }
        }
      }
      companyBurden.push(company);
      employeeBurden.push(employee);
    }
    this.branchPieLabels = pieLabels;
    this.branchCompanyBurden = companyBurden;
    this.branchEmployeeBurden = employeeBurden;
  }

  selectTab(tab: string) {
    this.selectedTab = tab;
    // タブ切り替え時にデータを再取得してからグラフを再描画
    this.loadMonthlyEnrollmentData().then(() => {
      this.loadMonthlySalaryAndBonusData().then(() => {
        this.loadBranchInsuranceTotals().then(() => {
          this.loadBranchPieData().then(() => {
            this.renderCharts();
          });
        });
      });
    });
  }

  ngAfterViewInit() {
    // Chart.jsを使ったサンプルグラフ描画
    // CDNでChart.jsを読み込む
    if (!(window as any).Chart) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => this.renderCharts();
      document.body.appendChild(script);
    } else {
      this.renderCharts();
    }
  }

  renderCharts() {
    // 既存のグラフインスタンスを破棄
    Object.values(this.chartInstances).forEach(chart => {
      if (chart) {
        chart.destroy();
      }
    });
    this.chartInstances = {};

    // 折れ線グラフ: 月別加入者数（健康保険・厚生年金）
    const ctx1 = (document.getElementById('lineChart1') as HTMLCanvasElement)?.getContext('2d');
    if (ctx1 && (window as any).Chart) {
      this.chartInstances['lineChart1'] = new (window as any).Chart(ctx1, {
        type: 'line',
        data: {
          labels: this.chartLabels,
          datasets: [
            {
              label: '健康保険加入者',
              data: this.chartLabels.map(label => {
                const month = label.replace('/', '-');
                return this.monthlyHealthInsuranceData[month] || 0;
              }),
              borderColor: '#1976d2',
              backgroundColor: 'rgba(25,118,210,0.15)',
              pointBackgroundColor: '#1976d2',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            },
            {
              label: '厚生年金加入者',
              data: this.chartLabels.map(label => {
                const month = label.replace('/', '-');
                return this.monthlyPensionData[month] || 0;
              }),
              borderColor: '#43a047',
              backgroundColor: 'rgba(67,160,71,0.15)',
              pointBackgroundColor: '#43a047',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: '月別加入者数推移', font: { size: 18 } }
          },
          scales: {
            y: { 
              beginAtZero: true, 
              title: { display: true, text: '人数' },
              ticks: {
                stepSize: 1
              }
            },
            x: { title: { display: true, text: '月' } }
          }
        }
      });
    }
    // 折れ線グラフ: 月別喪失者数
    const ctx2 = (document.getElementById('lineChart2') as HTMLCanvasElement)?.getContext('2d');
    if (ctx2 && (window as any).Chart) {
      this.chartInstances['lineChart2'] = new (window as any).Chart(ctx2, {
        type: 'line',
        data: {
          labels: this.chartLabels,
          datasets: [
            {
              label: '健康保険喪失者数',
              data: this.chartLabels.map(label => {
                const month = label.replace('/', '-');
                return this.monthlyHealthInsuranceWithdrawalData[month] || 0;
              }),
              borderColor: '#e65100',
              backgroundColor: 'rgba(230,81,0,0.15)',
              pointBackgroundColor: '#e65100',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            },
            {
              label: '厚生年金喪失者数',
              data: this.chartLabels.map(label => {
                const month = label.replace('/', '-');
                return this.monthlyPensionWithdrawalData[month] || 0;
              }),
              borderColor: '#d32f2f',
              backgroundColor: 'rgba(211,47,47,0.15)',
              pointBackgroundColor: '#d32f2f',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: '月別喪失者数推移', font: { size: 18 } }
          },
          scales: {
            y: { 
              beginAtZero: true, 
              title: { display: true, text: '人数' },
              ticks: {
                stepSize: 1
              }
            },
            x: { title: { display: true, text: '月' } }
          }
        }
      });
    }
    // 折れ線グラフ: 月額変更・賞与支給の推移
    const ctx3 = (document.getElementById('lineChart3') as HTMLCanvasElement)?.getContext('2d');
    if (ctx3 && (window as any).Chart) {
      this.chartInstances['lineChart3'] = new (window as any).Chart(ctx3, {
        type: 'line',
        data: {
          labels: this.chartLabels,
          datasets: [
            {
              label: '月額変更',
              data: this.chartLabels.map(label => {
                const month = label.replace('/', '-');
                return this.monthlySalaryChangeData[month] || 0;
              }),
              borderColor: '#388e3c',
              backgroundColor: 'rgba(56,142,60,0.15)',
              pointBackgroundColor: '#388e3c',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            },
            {
              label: '賞与支給',
              data: this.chartLabels.map(label => {
                const month = label.replace('/', '-');
                return this.monthlyBonusData[month] || 0;
              }),
              borderColor: '#1976d2',
              backgroundColor: 'rgba(25,118,210,0.15)',
              pointBackgroundColor: '#1976d2',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: '月額変更・賞与支給の推移', font: { size: 18 } }
          },
          scales: {
            y: { 
              beginAtZero: true, 
              title: { display: true, text: '件数' },
              ticks: {
                stepSize: 1
              }
            },
            x: { title: { display: true, text: '月' } }
          }
        }
      });
    }
    // 棒グラフ: 拠点別保険料総額比較
    const ctx4 = (document.getElementById('barChart1') as HTMLCanvasElement)?.getContext('2d');
    if (ctx4 && (window as any).Chart) {
      this.chartInstances['barChart1'] = new (window as any).Chart(ctx4, {
        type: 'bar',
        data: {
          labels: this.branchLabels,
          datasets: [
            {
              label: '健康保険',
              data: this.branchHealthTotals,
              backgroundColor: '#1976d2'
            },
            {
              label: '厚生年金',
              data: this.branchPensionTotals,
              backgroundColor: '#43a047'
            },
            {
              label: '介護保険',
              data: this.branchKaigoTotals,
              backgroundColor: '#ffb300'
            }
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: true, position: 'top' },
            title: { display: true, text: '拠点別保険料総額比較', font: { size: 18 } }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: '円' } },
            x: { title: { display: true, text: '拠点' } }
          }
        }
      });
    }
    // 円グラフ: 保険料負担割合（拠点ごと）
    for (let i = 0; i < this.branchPieLabels.length; i++) {
      const ctx = (document.getElementById('pieChart' + i) as HTMLCanvasElement)?.getContext('2d');
      if (ctx && (window as any).Chart) {
        this.chartInstances['pieChart' + i] = new (window as any).Chart(ctx, {
          type: 'pie',
          data: {
            labels: ['会社負担', '従業員負担'],
            datasets: [
              {
                data: [this.branchCompanyBurden[i], this.branchEmployeeBurden[i]],
                backgroundColor: ['#1976d2', '#ffb300'],
                borderColor: '#fff',
                borderWidth: 2
              }
            ]
          },
          options: {
            responsive: false,
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: this.branchPieLabels[i] + ' 保険料負担割合', font: { size: 18 } },
              tooltip: {
                callbacks: {
                  label: function(context: any) {
                    const label = context.label || '';
                    const value = context.parsed;
                    return `${label}: ${value}円`;
                  }
                }
              }
            }
          }
        });
      }
    }
    // 棒グラフ: 従業員ステータス別人数
    const ctx6 = (document.getElementById('barChart2') as HTMLCanvasElement)?.getContext('2d');
    if (ctx6 && (window as any).Chart) {
      this.chartInstances['barChart2'] = new (window as any).Chart(ctx6, {
        type: 'bar',
        data: {
          labels: ['在籍中', '休職中', '産休中', '育休中', '退職予定', '退職'],
          datasets: [
            {
              label: '人数',
              data: [this.statusActive, this.statusLeave, this.statusMaternity, this.statusChildcare, this.statusRetiring, this.statusRetired],
              backgroundColor: ['#1976d2', '#ffb300', '#f06292', '#64b5f6', '#8d6e63', '#e65100']
            }
          ]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: '従業員ステータス別人数', font: { size: 18 } }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: '人数' } },
            x: { title: { display: true, text: 'ステータス' } }
          }
        }
      });
    }
  }
} 