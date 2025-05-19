import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportExportComponent } from './report-export.component';

describe('ReportExportComponent', () => {
  let component: ReportExportComponent;
  let fixture: ComponentFixture<ReportExportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportExportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportExportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
