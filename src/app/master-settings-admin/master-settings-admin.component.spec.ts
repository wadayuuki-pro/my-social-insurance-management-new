import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MasterSettingsAdminComponent } from './master-settings-admin.component';

describe('MasterSettingsAdminComponent', () => {
  let component: MasterSettingsAdminComponent;
  let fixture: ComponentFixture<MasterSettingsAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterSettingsAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MasterSettingsAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
