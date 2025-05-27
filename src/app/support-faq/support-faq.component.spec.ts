import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupportFaqComponent } from './support-faq.component';

describe('SupportFaqComponent', () => {
  let component: SupportFaqComponent;
  let fixture: ComponentFixture<SupportFaqComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupportFaqComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(SupportFaqComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
}); 