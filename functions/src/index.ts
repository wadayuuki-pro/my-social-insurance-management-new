import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
admin.initializeApp();

export const createEmployeeWithAuth = functions.https.onCall(
  async (data: any, context) => {
    // 必要なら管理者チェック
    // if (!context.auth || !context.auth.token.admin)
    //   throw new functions.https.HttpsError("permission-denied");

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
  }
);

