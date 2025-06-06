import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDocs, query, where, getDoc, orderBy } from '@angular/fire/firestore';
import { InsurancePremium, PrefecturePremiums } from '../interfaces/insurance-premium.interface';
import * as XLSX from 'xlsx';

interface ExcelRow {
  '等級': number;
  '標準報酬月額': number;
  '報酬月額下限': number;
  '報酬月額上限': number;
  '総保険料': number;
  '介護保険料': number;
}

@Injectable({
  providedIn: 'root'
})
export class InsurancePremiumService {
  constructor(private firestore: Firestore) {}

  private parseNumber(value: any): number {
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    // 数値以外の文字を除去して数値に変換
    const num = Number(String(value).replace(/[^0-9.-]/g, '')) || 0;
    // 小数第1位までで四捨五入
    return Math.round(num * 10) / 10;
  }

  private parseMaxSalary(value: any, minSalary: number): number {
    if (value === null || value === undefined || value === '' || value === '～') {
      // 上限が「～」の場合は、下限の1.1倍を上限とする
      return Math.ceil(minSalary * 1.1);
    }
    return this.parseNumber(value);
  }

  private findDataStartRow(sheet: XLSX.WorkSheet): number {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
      if (cell && cell.v && String(cell.v).match(/^\d+$/)) {
        return row + 1; // 1-based index
      }
    }
    return 2; // デフォルト値
  }

  private validatePrefectureId(prefectureId: string): void {
    if (!prefectureId || prefectureId.trim() === '') {
      throw new Error('都道府県IDが指定されていません。');
    }
  }

  async importExcelFile(file: File, prefectureId: string, year: string, sheetName: string): Promise<void> {
    // 都道府県IDの検証
    this.validatePrefectureId(prefectureId);
    if (!year) {
      throw new Error('年度が指定されていません。');
    }
    if (!sheetName) {
      throw new Error('シート名が指定されていません。');
    }
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onload = async (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[sheetName];

          // A列からK列までの全行を配列で取得
          const allRows = XLSX.utils.sheet_to_json<any[]>(firstSheet, {
            header: 1,
            defval: null
          });

          // 10行目（インデックス9）がヘッダー
          const headerRow = allRows[9];

          // カラムインデックス
          const gradeIdx = 0; // 等級
          const salaryIdx = 1; // 標準報酬月額
          const minIdx = 2; // 円以上
          const maxIdx = 4; // 円未満
          const ippanFullIdx = 5; // 2号保険者に該当しない（全額）
          const ippanHalfIdx = 6; // 2号保険者に該当しない（折半額）
          const tokuteiFullIdx = 7; // 2号保険者に該当する（全額）
          const tokuteiHalfIdx = 8; // 2号保険者に該当する（折半額）
          const kouseiFullIdx = 9; // 厚生年金保険料（全額）
          const kouseiHalfIdx = 10; // 厚生年金保険料（半額）

          // 12行目（インデックス11）から61行目（インデックス60）までがデータ
          const dataRows = allRows.slice(11, 61).filter(row => row[gradeIdx]);

          const premiums: { [key: string]: any } = {};

          // まず等級4(1)または4（1）の厚生年金保険料（全額・半額）を取得
          let kouseiFull_4 = 0;
          let kouseiHalf_4 = 0;
          let found4 = false;
          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const gradeId = String(row[gradeIdx]).trim();
            if (gradeId === '4(1)' || gradeId === '4（1）') {
              kouseiFull_4 = this.parseNumber(row[kouseiFullIdx]);
              kouseiHalf_4 = this.parseNumber(row[kouseiHalfIdx]);
              found4 = true;
              break;
            }
          }

          // 等級35(32)または35（32）の厚生年金保険料（全額・半額）を取得
          let kouseiFull_35 = 0;
          let kouseiHalf_35 = 0;
          let found35 = false;
          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const gradeId = String(row[gradeIdx]).trim();
            if (gradeId === '35(32)' || gradeId === '35（32）') {
              kouseiFull_35 = this.parseNumber(row[kouseiFullIdx]);
              kouseiHalf_35 = this.parseNumber(row[kouseiHalfIdx]);
              found35 = true;
              break;
            }
          }

          // --- 料率の抽出 ---
          let ippan_rate = null;
          let tokutei_rate = null;
          let kousei_rate = null;
          try {
            const getCell = (col: any, row: any) => firstSheet[XLSX.utils.encode_cell({ c: col, r: row })]?.v;
            // 一般保険料率（F9, G9）
            const ippan1 = getCell(5, 8);
            const ippan2 = getCell(6, 8);
            ippan_rate = Number(parseFloat(String(ippan1 ?? ippan2).replace(/[^\d.]/g, '')).toFixed(4)) || Number(parseFloat(String(ippan2 ?? ippan1).replace(/[^\d.]/g, '')).toFixed(4)) || null;
            // 特定保険料率（H9, I9）
            const tokutei1 = getCell(7, 8);
            const tokutei2 = getCell(8, 8);
            tokutei_rate = Number(parseFloat(String(tokutei1 ?? tokutei2).replace(/[^\d.]/g, '')).toFixed(4)) || Number(parseFloat(String(tokutei2 ?? tokutei1).replace(/[^\d.]/g, '')).toFixed(4)) || null;
            // 厚生年金保険料率（J9, K9）
            const kousei1 = getCell(9, 8);
            const kousei2 = getCell(10, 8);
            kousei_rate = Number(parseFloat(String(kousei1 ?? kousei2).replace(/[^\d.]/g, '')).toFixed(4)) || Number(parseFloat(String(kousei2 ?? kousei1).replace(/[^\d.]/g, '')).toFixed(4)) || null;
          } catch (e) {
            // 取得失敗時はnullのまま
          }

          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const gradeId = String(row[gradeIdx]).trim();
            const standardSalary = this.parseNumber(row[salaryIdx]);
            const salaryMin = this.parseNumber(row[minIdx]);
            let salaryMax = this.parseNumber(row[maxIdx]);
            if ((row[maxIdx] === null || row[maxIdx] === undefined || row[maxIdx] === '') && i + 1 < dataRows.length) {
              salaryMax = this.parseNumber(dataRows[i + 1][minIdx]);
            }
            const ippanFull = this.parseNumber(row[ippanFullIdx]);
            const ippanHalf = this.parseNumber(row[ippanHalfIdx]);
            const tokuteiFull = this.parseNumber(row[tokuteiFullIdx]);
            const tokuteiHalf = this.parseNumber(row[tokuteiHalfIdx]);
            let kouseiFull = this.parseNumber(row[kouseiFullIdx]);
            let kouseiHalf = this.parseNumber(row[kouseiHalfIdx]);
            // 等級1～3は等級4(1)または4（1）の値を必ずセット
            if (["1", "2", "3"].includes(gradeId)) {
              kouseiFull = kouseiFull_4;
              kouseiHalf = kouseiHalf_4;
            }
            // 等級が36以上の場合は等級35(32)または35（32）の値をセット
            const gradeNumMatch = gradeId.match(/^\d+/);
            const gradeNum = gradeNumMatch ? parseInt(gradeNumMatch[0], 10) : 0;
            if (gradeNum >= 36 && found35) {
              kouseiFull = kouseiFull_35;
              kouseiHalf = kouseiHalf_35;
            }
            premiums[gradeId] = {
              standardSalary,
              salaryMin,
              salaryMax,
              ippan: { full: ippanFull, half: ippanHalf },
              tokutei: { full: tokuteiFull, half: tokuteiHalf },
              kousei: { full: kouseiFull, half: kouseiHalf }
            };
          }

          // Firestoreにデータを保存
          const prefectureCollection = collection(this.firestore, 'prefectures');
          const prefectureDoc = doc(prefectureCollection, prefectureId);
          const yearCollection = collection(prefectureDoc, 'insurance_premiums', year, 'grades');
          // 選択した都道府県に保存（従来通り）
          for (const [gradeId, premium] of Object.entries(premiums)) {
            const gradeDoc = doc(yearCollection, gradeId);
            await setDoc(gradeDoc, premium);
          }
          // --- 新しいratesコレクションにも保存 ---
          const ratesRef = doc(
            this.firestore,
            `prefectures/${prefectureId}/insurance_premiums/${year}/rates/current`
          );
          await setDoc(ratesRef, {
            ippan_rate,
            tokutei_rate,
            kousei_rate,
            updated_at: new Date()
          });

          // 全国にもgradesサブコレクション（E列まで）を保存
          const zenkokuDoc = doc(prefectureCollection, '全国');
          const zenkokuYearCollection = collection(zenkokuDoc, 'insurance_premiums', year, 'grades');
          for (const row of dataRows) {
            const gradeId = String(row[gradeIdx]).trim();
            const standardSalary = this.parseNumber(row[salaryIdx]);
            const salaryMin = this.parseNumber(row[minIdx]);
            let salaryMax = this.parseNumber(row[maxIdx]);
            if ((row[maxIdx] === null || row[maxIdx] === undefined || row[maxIdx] === '') && dataRows.indexOf(row) + 1 < dataRows.length) {
              salaryMax = this.parseNumber(dataRows[dataRows.indexOf(row) + 1][minIdx]);
            }
            const gradeDoc = doc(zenkokuYearCollection, gradeId);
            await setDoc(gradeDoc, {
              standardSalary,
              salaryMin,
              salaryMax
            });
          }
          // 全国ドキュメント直下にも年度・料率・更新日を保存
          const zenkokuData = {
            year,
            rates: {
              ippan_rate,
              tokutei_rate,
              kousei_rate
            },
            updated_at: new Date()
          };
          await setDoc(zenkokuDoc, zenkokuData, { merge: true });

          resolve();
        } catch (error) {
          console.error('Import error details:', error);
          reject(error);
        }
      };
      
      reader.onerror = (error) => {
        console.error('File read error:', error);
        reject(error);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async exportToExcel(prefectureId: string, year: string): Promise<void> {
    this.validatePrefectureId(prefectureId);
    if (!year) {
      throw new Error('年度が指定されていません。');
    }
    const prefectureCollection = collection(this.firestore, 'prefectures');
    const prefectureDoc = doc(prefectureCollection, prefectureId);
    const yearCollection = collection(prefectureDoc, 'insurance_premiums', year, 'grades');
    const premiumsData = await getDocs(yearCollection);
    
    const data = premiumsData.docs.map(doc => {
      const premium = doc.data() as InsurancePremium;
      return {
        '等級': doc.id,
        '標準報酬月額': premium.standard_salary,
        '報酬月額下限': premium.salaryMin,
        '報酬月額上限': premium.salaryMax,
        '一般保険料（全額）': premium.premiums.ippan.full,
        '一般保険料（折半額）': premium.premiums.ippan.half
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '保険料表');
    
    XLSX.writeFile(workbook, `insurance_premiums_${prefectureId}_${year}.xlsx`);
  }

  async getPremiums(prefectureId: string, year: string): Promise<PrefecturePremiums | null> {
    this.validatePrefectureId(prefectureId);
    if (!year) {
      throw new Error('年度が指定されていません。');
    }
    const prefectureCollection = collection(this.firestore, 'prefectures');
    const prefectureDoc = doc(prefectureCollection, prefectureId);
    const yearCollection = collection(prefectureDoc, 'insurance_premiums', year, 'grades');
    const premiumsData = await getDocs(yearCollection);
    
    if (premiumsData.empty) {
      return null;
    }

    const premiums: { [key: string]: InsurancePremium } = {};
    premiumsData.forEach(doc => {
      premiums[doc.id] = doc.data() as InsurancePremium;
    });

    return { premiums };
  }

  // 保険料計算結果を保存
  async saveInsurancePremium(employeeId: string, premiumData: InsurancePremium): Promise<void> {
    try {
      const premiumRef = doc(
        collection(this.firestore, 'employees', employeeId, 'insurance_premiums'),
        premiumData.year_month
      );

      await setDoc(premiumRef, {
        ...premiumData,
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error saving insurance premium:', error);
      throw error;
    }
  }

  // 保険料計算結果を取得
  async getInsurancePremium(employeeId: string, yearMonth: string): Promise<InsurancePremium | null> {
    try {
      const premiumRef = doc(
        collection(this.firestore, 'employees', employeeId, 'insurance_premiums'),
        yearMonth
      );
      const premiumDoc = await getDoc(premiumRef);

      if (premiumDoc.exists()) {
        return premiumDoc.data() as InsurancePremium;
      }
      return null;
    } catch (error) {
      console.error('Error getting insurance premium:', error);
      throw error;
    }
  }

  // 保険料計算結果の一覧を取得
  async getInsurancePremiums(employeeId: string): Promise<InsurancePremium[]> {
    try {
      const premiumsCol = collection(this.firestore, 'employees', employeeId, 'insurance_premiums');
      const q = query(premiumsCol, orderBy('year_month', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => doc.data() as InsurancePremium);
    } catch (error) {
      console.error('Error getting insurance premiums:', error);
      throw error;
    }
  }

  // 事業所の負担比率集計を保存
  async saveDepartmentBurdenRatio(departmentId: string, yearMonth: string, data: any): Promise<void> {
    try {
      const ref = doc(collection(this.firestore, 'departments', departmentId, 'burden_ratios'), yearMonth);
      await setDoc(ref, {
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      console.error('Error saving department burden ratio:', error);
      throw error;
    }
  }
} 