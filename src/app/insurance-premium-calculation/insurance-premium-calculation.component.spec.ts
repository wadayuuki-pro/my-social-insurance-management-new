import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsurancePremiumCalculationComponent } from './insurance-premium-calculation.component';

describe('InsurancePremiumCalculationComponent', () => {
  let component: InsurancePremiumCalculationComponent;
  let fixture: ComponentFixture<InsurancePremiumCalculationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsurancePremiumCalculationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InsurancePremiumCalculationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
