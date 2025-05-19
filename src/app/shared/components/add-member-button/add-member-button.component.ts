import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-add-member-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" (click)="onClick()" class="add-member-button">
      <span class="plus-icon">+</span>
      新規メンバー追加
    </button>
  `,
  styles: [`
    .add-member-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
      transition: background-color 0.3s;
    }

    .add-member-button:hover {
      background: #43a047;
    }

    .plus-icon {
      font-size: 1.2rem;
      font-weight: bold;
    }
  `]
})
export class AddMemberButtonComponent {
  @Output() addMember = new EventEmitter<void>();

  onClick() {
    this.addMember.emit();
  }
} 