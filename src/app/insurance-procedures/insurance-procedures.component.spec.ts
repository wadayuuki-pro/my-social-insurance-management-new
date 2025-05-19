import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuranceProceduresComponent } from './insurance-procedures.component';

describe('InsuranceProceduresComponent', () => {
  let component: InsuranceProceduresComponent;
  let fixture: ComponentFixture<InsuranceProceduresComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuranceProceduresComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InsuranceProceduresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
