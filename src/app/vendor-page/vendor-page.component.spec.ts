import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VendorPageComponent } from './vendor-page.component';

describe('VendorPageComponent', () => {
  let component: VendorPageComponent;
  let fixture: ComponentFixture<VendorPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VendorPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
