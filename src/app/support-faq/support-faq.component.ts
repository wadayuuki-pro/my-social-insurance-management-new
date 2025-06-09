import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-support-faq',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './support-faq.component.html',
  styleUrls: ['./support-faq.component.scss']
})
export class SupportFaqComponent {
  selectedTab: string = 'faq';
  selectedCategory: number = 0; // 0:登録, 1:手続き, 2:トラブル
  selectedQuestionIndex: number = 0;

  // 問い合わせフォーム用
  inquiryName: string = '';
  inquiryEmail: string = '';
  inquiryType: string = '';
  inquiryContent: string = '';
  inquirySuccess: boolean = false;
  inquirySending: boolean = false;
  inquiryError: string = '';

  faqCategories = [
    {
      name: '登録関連',
      items: [
        { question: 'ユーザー登録の手順は？', answer: '従業員管理ページのサインアップボタンを押すとユーザー登録が完了します。登録後、パスワード変更メールが届きますので、メール内のリンクをクリックしてパスワードの変更を行ってください。' },
        { question: 'パスワードを忘れた場合は？', answer: '会社のシステム管理者の方にご連絡ください。管理者の方はマスタ設定・自社管理ページより操作ください' },
        { question: '退職者のアカウントはどうなりますか？', answer: 'そのまま残り続けます。削除したい場合は、会社のシステム管理者の方にご連絡ください。管理者の方はマスタ設定・自社管理ページより操作ください' }
      ]
    },
    {
      name: '手続き関連',
      items: [
        { question: '社員情報を一括で登録できますか？', answer: '従業員管理ページの「CSVインポート」機能をご利用いただくことで、複数の社員情報を一括で登録できます。' },
        { question: '保険料率の年度更新はどうすればいいですか？', answer: 'マスタ設定ページから料率表をインポートしてください。' },
        { question: '給与情報に各種手当を入力したい場合は？', answer: '給与情報管理ページの手当区分管理から手当区分を作成してください。' },
      ]
    },
    {
      name: 'トラブル対応',
      items: [
        { question: 'ログインできない場合は？', answer: 'まずは会社の担当者様にご連絡ください。解決しない場合はサポート窓口までご連絡ください。' },
        { question: 'システムエラーが表示された場合は？', answer: '一度ログアウトし再度ログインしてください。解決しない場合はサポートまでご連絡ください。' },
        { question: 'データが消えてしまった場合は？', answer: 'まずは再読み込みをお試しください。復旧しない場合はサポートまでご連絡ください。' },
        { question: 'サポートへの問い合わせ方法は？', answer: 'サポート・FAQページ下部の問い合わせフォームよりご連絡ください。' }
      ]
    }
  ];

  constructor(private firestore: Firestore) {}

  selectCategory(idx: number) {
    this.selectedCategory = idx;
    this.selectedQuestionIndex = 0;
  }

  selectQuestion(idx: number) {
    this.selectedQuestionIndex = idx;
  }

  async submitInquiryForm(event: Event) {
    event.preventDefault();
    this.inquiryError = '';
    this.inquirySuccess = false;
    if (!this.inquiryName || !this.inquiryEmail || !this.inquiryType || !this.inquiryContent) {
      this.inquiryError = 'すべての必須項目を入力してください。';
      return;
    }
    this.inquirySending = true;
    try {
      await addDoc(collection(this.firestore, 'inquiries'), {
        name: this.inquiryName,
        email: this.inquiryEmail,
        type: this.inquiryType,
        content: this.inquiryContent,
        created_at: serverTimestamp()
      });
      this.inquirySuccess = true;
      this.inquiryName = '';
      this.inquiryEmail = '';
      this.inquiryType = '';
      this.inquiryContent = '';
    } catch (e) {
      this.inquiryError = '送信中にエラーが発生しました。時間をおいて再度お試しください。';
    } finally {
      this.inquirySending = false;
    }
  }
} 