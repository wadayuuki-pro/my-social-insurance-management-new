import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { EmployeeManagementComponent } from './employee-management/employee-management.component';
import { ApplicationApprovalComponent } from './application-approval/application-approval.component';
import { PayrollManagementComponent } from './payroll-management/payroll-management.component';
import { InsurancePremiumCalculationComponent } from './insurance-premium-calculation/insurance-premium-calculation.component';
import { AdminPagesComponent } from './admin-pages/admin-pages.component';
import { VendorPageComponent } from './vendor-page/vendor-page.component';
import { vendorGuard } from './vendor.guard';
import { AnalysisReportComponent } from './analysis-report/analysis-report.component';
import { SupportFaqComponent } from './support-faq/support-faq.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  {
    path: 'employee-management',
    loadComponent: () => import('./employee-management/employee-management.component').then(m => m.EmployeeManagementComponent)
  },
  { path: 'application-approval', component: ApplicationApprovalComponent },
  {
    path: 'payroll-management',
    loadComponent: () => import('./payroll-management/payroll-management.component').then(m => m.PayrollManagementComponent)
  },
  {
    path: 'insurance-premium-calculation',
    loadComponent: () => import('./insurance-premium-calculation/insurance-premium-calculation.component').then(m => m.InsurancePremiumCalculationComponent)
  },
  { path: 'admin-pages', component: AdminPagesComponent },
  { path: 'analysis-report', component: AnalysisReportComponent },
  { path: 'support-faq', component: SupportFaqComponent },
  { path: 'vendor-page', component: VendorPageComponent, canActivate: [vendorGuard] },
  {
    path: 'master-settings',
    loadComponent: () => import('./master-settings-admin/master-settings-admin.component').then(m => m.MasterSettingsAdminComponent)
  }
];
