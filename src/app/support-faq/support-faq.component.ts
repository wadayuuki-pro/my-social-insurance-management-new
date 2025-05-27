import { Component } from '@angular/core';

@Component({
  selector: 'app-support-faq',
  standalone: true,
  template: `
    <div style='padding:2rem;'>
      <h2>サポート・FAQページ</h2>
      <div style="margin-bottom:2rem;">
        <h3>よくあるご質問（FAQ）</h3>
        <ul style="line-height:2;">
          <li><strong>Q. パスワードを忘れた場合は？</strong><br>ログイン画面の「パスワードを忘れた方はこちら」から再設定できます。</li>
          <li><strong>Q. 社員情報を一括で登録できますか？</strong><br>従業員管理ページの「CSVインポート」機能をご利用ください。</li>
          <li><strong>Q. 保険料率の年度更新はどうすればいいですか？</strong><br>マスタ設定ページから料率表をインポートしてください。</li>
          <li><strong>Q. サポートへの問い合わせ方法は？</strong><br>下記のサポート窓口までご連絡ください。</li>
        </ul>
      </div>
      <div>
        <h3>サポート窓口</h3>
        <p>メール: <a href="mailto:support&#64;example.com">support&#64;example.com</a></p>
        <p>電話: 0120-123-456（平日9:00～18:00）</p>
      </div>
    </div>
  `
})
export class SupportFaqComponent {} 