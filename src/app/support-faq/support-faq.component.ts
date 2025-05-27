import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FaqItem {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-support-faq',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './support-faq.component.html',
  styleUrls: ['./support-faq.component.scss']
})
export class SupportFaqComponent {
  selectedTab: string = 'faq';
  selectedCategory: number = 0; // 0:登録, 1:手続き, 2:トラブル
  selectedQuestionIndex: number = 0;

  faqCategories = [
    {
      name: '登録関連',
      items: [
        { question: 'ユーザー登録の手順は？', answer: '「新規登録」ボタンから必要情報を入力し、登録を完了してください。登録後、確認メールが届きますので、メール内のリンクをクリックして認証を行ってください。' },
        { question: 'メールアドレスを変更したい場合は？', answer: 'マイページの「アカウント設定」からメールアドレスの変更が可能です。' },
        { question: 'パスワードを忘れた場合は？', answer: 'ログイン画面の「パスワードを忘れた方はこちら」から再設定できます。' },
        { question: '退職者のアカウントはどうなりますか？', answer: '退職処理後、アカウントは自動的に無効化されます。' }
      ]
    },
    {
      name: '手続き関連',
      items: [
        { question: '社員情報を一括で登録できますか？', answer: '従業員管理ページの「CSVインポート」機能をご利用いただくことで、複数の社員情報を一括で登録できます。' },
        { question: '保険料率の年度更新はどうすればいいですか？', answer: 'マスタ設定ページから料率表をインポートしてください。' },
        { question: '給与明細のダウンロード方法は？', answer: '給与情報管理ページから該当月の明細をダウンロードできます。' },
        { question: '休職・復職の手続き方法は？', answer: '従業員詳細画面から「休職」「復職」ボタンを選択し、必要事項を入力してください。' }
      ]
    },
    {
      name: 'トラブル対応',
      items: [
        { question: 'ログインできない場合は？', answer: 'パスワードの再設定や、アカウントの有効期限切れがないかご確認ください。解決しない場合はサポート窓口までご連絡ください。' },
        { question: 'システムエラーが表示された場合は？', answer: '一度ログアウトし再度ログインしてください。解決しない場合はサポートまでご連絡ください。' },
        { question: 'データが消えてしまった場合は？', answer: 'まずは再読み込みをお試しください。復旧しない場合はサポートまでご連絡ください。' },
        { question: 'サポートへの問い合わせ方法は？', answer: 'サポート・FAQページ下部の問い合わせフォームよりご連絡ください。' }
      ]
    }
  ];

  selectCategory(idx: number) {
    this.selectedCategory = idx;
    this.selectedQuestionIndex = 0;
  }

  selectQuestion(idx: number) {
    this.selectedQuestionIndex = idx;
  }
} 