import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

admin.initializeApp();

// メール送信用の設定
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().gmail.email,
    pass: functions.config().gmail.password,
  },
});

export const createEmployeeWithAuth = functions.https.onCall(
  async (data: any, context: any) => {
    // 1. Firebase Authユーザー作成
    const userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName || "",
    });

    // 2. Firestoreに従業員情報を保存
    const employeeData = {
      ...data.employeeData,
      uid: userRecord.uid,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin.firestore().collection("employees").add(employeeData);

    return {uid: userRecord.uid};
  },
);

// 申請が作成されたときに次の承認者にメール通知を送信
export const sendApprovalNotification = functions.firestore
  .document("applications/{applicationId}")
  .onCreate(async (snap: any, context: any) => {
    const application = snap.data();
    if (!application) return;

    // 次の承認者のメールアドレスを取得
    const approverIds = application.currentApproverIds || [];
    if (approverIds.length === 0) return;

    const db = admin.firestore();
    const approverEmails: string[] = [];

    // 承認者のメールアドレスを取得
    for (const approverId of approverIds) {
      const employeeDoc = await db.collection("employees")
        .where("employee_code", "==", approverId)
        .get();

      if (!employeeDoc.empty) {
        const employeeData = employeeDoc.docs[0].data();
        if (employeeData.email) {
          approverEmails.push(employeeData.email);
        }
      }
    }

    if (approverEmails.length === 0) return;

    // メール本文を作成
    const mailOptions = {
      from: functions.config().gmail.email,
      to: approverEmails.join(","),
      subject: `【承認依頼】${application.title}`,
      html: `
        <h2>承認依頼が届きました</h2>
        <p>以下の申請の承認をお願いします。</p>
        <hr>
        <p><strong>申請タイトル：</strong>${application.title}</p>
        <p><strong>申請種別：</strong>${application.type}</p>
        <p><strong>申請者：</strong>${application.employeeId}</p>
        <p><strong>申請日時：</strong>${
  application.createdAt.toDate().toLocaleString()
}</p>
        <p><strong>申請内容：</strong></p>
        <p>${application.description}</p>
        <hr>
        <p>以下のURLから承認処理を行ってください：</p>
        <p><a href="${
  functions.config().app.url
}/application-approval">承認ページへ</a></p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("承認通知メールを送信しました");
    } catch (error) {
      console.error("メール送信エラー:", error);
    }
  });

// 問い合わせが作成されたときに管理者にメール通知を送信
export const sendInquiryNotification = functions.firestore
  .document("inquiries/{inquiryId}")
  .onCreate(async (snap: any, context: any) => {
    const inquiry = snap.data();
    if (!inquiry) return;

    // 管理者メールアドレス（必要に応じて複数可）
    const adminEmails = [functions.config().gmail.email];

    // メール本文を作成
    const mailOptions = {
      from: functions.config().gmail.email,
      to: adminEmails.join(","),
      subject: `【お問い合わせ】${inquiry.type}：${inquiry.name}様`,
      html: `
        <h2>新しいお問い合わせが届きました</h2>
        <p><strong>氏名：</strong>${inquiry.name}</p>
        <p><strong>メールアドレス：</strong>${inquiry.email}</p>
        <p><strong>種別：</strong>${inquiry.type}</p>
        <p><strong>内容：</strong></p>
        <p>${inquiry.content.replace(/\n/g, "<br>")}</p>
        <hr>
        <p>このメールはシステムから自動送信されています。</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("問い合わせ通知メールを送信しました");
    } catch (error) {
      console.error("問い合わせメール送信エラー:", error);
    }
  });

