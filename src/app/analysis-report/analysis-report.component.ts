import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../shared/services/auth.service';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

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
  employeeCount: number = 0;
  activeCount: number = 0;
  retiredCount: number = 0;
  insuranceTotal: number = 0;

  constructor(private authService: AuthService, private firestore: Firestore) {
    this.authService.companyId$.subscribe(async companyId => {
      if (companyId) {
        this.companyId = companyId;
        await this.loadDepartmentList();
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
    }
  }

  async onDepartmentChange(deptId: string) {
    this.selectedDepartmentId = deptId;
    await this.loadEmployeeCount();
  }

  async loadEmployeeCount() {
    if (!this.companyId || !this.selectedDepartmentId) {
      this.employeeCount = 0;
      this.activeCount = 0;
      this.retiredCount = 0;
      this.insuranceTotal = 0;
      return;
    }
    const employeesCol = collection(this.firestore, 'employees');
    const q = query(employeesCol, where('company_id', '==', this.companyId), where('department_id', '==', this.selectedDepartmentId));
    const snapshot = await getDocs(q);
    this.employeeCount = snapshot.size;
    let active = 0;
    let retired = 0;
    let ippanTotal = 0;
    let kouseiTotal = 0;
    // 各従業員ごとにinsurance_premiumsサブコレクションから保険料を取得
    for (const doc of snapshot.docs) {
      const status = (doc.data()['status'] || '').trim();
      if (status === '在籍中') {
        active++;
      } else if (status === '退職' || status === '退職済み') {
        retired++;
      }
      // insurance_premiumsサブコレクションを全件取得
      const empId = doc.id;
      const premiumsCol = collection(this.firestore, 'employees', empId, 'insurance_premiums');
      const premiumsSnap = await getDocs(premiumsCol);
      for (const d of premiumsSnap.docs) {
        const data = d.data() as any;
        // 健康保険料（ippan.full）はis_applicableまたはis_nursing_insurance_periodがtrueのもののみ合計
        if (data && (data.is_applicable === true || data.is_nursing_insurance_period === true)) {
          ippanTotal += Number(data.premiums && data.premiums.ippan ? data.premiums.ippan.full : 0);
        }
        // 厚生年金保険料（kousei.full）は全件合計
        kouseiTotal += Number(data.premiums && data.premiums.kousei ? data.premiums.kousei.full : 0);
      }
    }
    this.activeCount = active;
    this.retiredCount = retired;
    this.insuranceTotal = ippanTotal + kouseiTotal;
  }

  selectTab(tab: string) {
    this.selectedTab = tab;
    setTimeout(() => this.renderCharts(), 0); // タブ切り替え後にグラフ再描画
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
    // 折れ線グラフ: 月別加入者数（健康保険・厚生年金）
    const ctx1 = (document.getElementById('lineChart1') as HTMLCanvasElement)?.getContext('2d');
    if (ctx1 && (window as any).Chart) {
      new (window as any).Chart(ctx1, {
        type: 'line',
        data: {
          labels: ['2024/01', '2024/02', '2024/03', '2024/04', '2024/05', '2024/06'],
          datasets: [
            {
              label: '健康保険加入者',
              data: [12, 13, 14, 15, 15, 16],
              borderColor: '#1976d2',
              backgroundColor: 'rgba(25,118,210,0.15)',
              pointBackgroundColor: '#1976d2',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            },
            {
              label: '厚生年金加入者',
              data: [10, 11, 12, 13, 13, 14],
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
            y: { beginAtZero: true, title: { display: true, text: '人数' } },
            x: { title: { display: true, text: '月' } }
          }
        }
      });
    }
    // 折れ線グラフ: 月別喪失者数
    const ctx2 = (document.getElementById('lineChart2') as HTMLCanvasElement)?.getContext('2d');
    if (ctx2 && (window as any).Chart) {
      new (window as any).Chart(ctx2, {
        type: 'line',
        data: {
          labels: ['2024/01', '2024/02', '2024/03', '2024/04', '2024/05', '2024/06'],
          datasets: [
            {
              label: '喪失者数',
              data: [0, 1, 0, 1, 0, 0],
              borderColor: '#e65100',
              backgroundColor: 'rgba(230,81,0,0.15)',
              pointBackgroundColor: '#e65100',
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
            y: { beginAtZero: true, title: { display: true, text: '人数' } },
            x: { title: { display: true, text: '月' } }
          }
        }
      });
    }
    // 折れ線グラフ: 月額変更・賞与支給の推移
    const ctx3 = (document.getElementById('lineChart3') as HTMLCanvasElement)?.getContext('2d');
    if (ctx3 && (window as any).Chart) {
      new (window as any).Chart(ctx3, {
        type: 'line',
        data: {
          labels: ['2024/01', '2024/02', '2024/03', '2024/04', '2024/05', '2024/06'],
          datasets: [
            {
              label: '月額変更',
              data: [2, 1, 3, 2, 1, 2],
              borderColor: '#388e3c',
              backgroundColor: 'rgba(56,142,60,0.15)',
              pointBackgroundColor: '#388e3c',
              pointRadius: 5,
              fill: true,
              tension: 0.3
            },
            {
              label: '賞与支給',
              data: [1, 0, 0, 1, 0, 1],
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
            y: { beginAtZero: true, title: { display: true, text: '件数' } },
            x: { title: { display: true, text: '月' } }
          }
        }
      });
    }
    // 棒グラフ: 拠点別保険料総額比較
    const ctx4 = (document.getElementById('barChart1') as HTMLCanvasElement)?.getContext('2d');
    if (ctx4 && (window as any).Chart) {
      new (window as any).Chart(ctx4, {
        type: 'bar',
        data: {
          labels: ['東京本社', '大阪支社', '名古屋営業所'],
          datasets: [
            {
              label: '健康保険',
              data: [60, 30, 20],
              backgroundColor: '#1976d2'
            },
            {
              label: '厚生年金',
              data: [40, 25, 15],
              backgroundColor: '#43a047'
            },
            {
              label: '介護保険',
              data: [10, 5, 3],
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
            y: { beginAtZero: true, title: { display: true, text: '万円' } },
            x: { title: { display: true, text: '拠点' } }
          }
        }
      });
    }
    // 円グラフ: 保険料負担割合
    const ctx5 = (document.getElementById('pieChart1') as HTMLCanvasElement)?.getContext('2d');
    if (ctx5 && (window as any).Chart) {
      new (window as any).Chart(ctx5, {
        type: 'pie',
        data: {
          labels: ['会社負担', '従業員負担'],
          datasets: [
            {
              data: [60, 40],
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
            title: { display: true, text: '保険料負担割合', font: { size: 18 } },
            tooltip: {
              callbacks: {
                label: function(context: any) {
                  const label = context.label || '';
                  const value = context.parsed;
                  return `${label}: ${value}%`;
                }
              }
            }
          }
        }
      });
    }
    // 棒グラフ: 従業員ステータス別人数
    const ctx6 = (document.getElementById('barChart2') as HTMLCanvasElement)?.getContext('2d');
    if (ctx6 && (window as any).Chart) {
      new (window as any).Chart(ctx6, {
        type: 'bar',
        data: {
          labels: ['在籍', '休職', '退職'],
          datasets: [
            {
              label: '人数',
              data: [18, 1, 2],
              backgroundColor: ['#1976d2', '#ffb300', '#e65100']
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