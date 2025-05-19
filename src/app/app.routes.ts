import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { EmployeeManagementComponent } from './employee-management/employee-management.component';
import { InsuranceProceduresComponent } from './insurance-procedures/insurance-procedures.component';
import { ApplicationApprovalComponent } from './application-approval/application-approval.component';
import { PayrollManagementComponent } from './payroll-management/payroll-management.component';
import { InsurancePremiumCalculationComponent } from './insurance-premium-calculation/insurance-premium-calculation.component';
import { ReportExportComponent } from './report-export/report-export.component';
import { AdminPagesComponent } from './admin-pages/admin-pages.component';
import { VendorPageComponent } from './vendor-page/vendor-page.component';
import { vendorGuard } from './vendor.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'employee-management', component: EmployeeManagementComponent },
  { path: 'insurance-procedures', component: InsuranceProceduresComponent },
  { path: 'application-approval', component: ApplicationApprovalComponent },
  { path: 'payroll-management', component: PayrollManagementComponent },
  { path: 'insurance-premium-calculation', component: InsurancePremiumCalculationComponent },
  { path: 'report-export', component: ReportExportComponent },
  { path: 'admin-pages', component: AdminPagesComponent },
  { path: 'vendor-page', component: VendorPageComponent, canActivate: [vendorGuard] }
];
