import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDocs, query, where } from '@angular/fire/firestore';
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
    return Number(String(value).replace(/[^\d.-]/g, '')) || 0;
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
          const salaryIdx = 1; // 月額
          const minIdx = 2; // 円以上
          const maxIdx = 4; // E列（円未満）
          const ippanFullIdx = 5; // 一般保険料（全額）
          const ippanHalfIdx = 6; // 一般保険料（折半額）
          const tokuteiFullIdx = 7; // 特定保険料（全額）
          const tokuteiHalfIdx = 8; // 特定保険料（折半額）
          const kihonFullIdx = 9; // 基本保険料（全額）
          const kihonHalfIdx = 10; // 基本保険料（折半額）

          // 11行目（インデックス10）以降がデータ
          const dataRows = allRows.slice(10).filter(row => row[gradeIdx]);

          const premiums: { [key: string]: any } = {};

          for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const gradeId = String(row[gradeIdx]).trim();
            const standardSalary = this.parseNumber(row[salaryIdx]);
            const salaryMin = this.parseNumber(row[minIdx]);
            // salaryMax: E列が空欄なら次の行のC列（円以上）を参照
            let salaryMax = this.parseNumber(row[maxIdx]);
            if ((row[maxIdx] === null || row[maxIdx] === undefined || row[maxIdx] === '') && i + 1 < dataRows.length) {
              salaryMax = this.parseNumber(dataRows[i + 1][minIdx]);
            }
            const ippanFull = this.parseNumber(row[ippanFullIdx]);
            const ippanHalf = this.parseNumber(row[ippanHalfIdx]);
            const tokuteiFull = this.parseNumber(row[tokuteiFullIdx]);
            const tokuteiHalf = this.parseNumber(row[tokuteiHalfIdx]);
            const kihonFull = this.parseNumber(row[kihonFullIdx]);
            const kihonHalf = this.parseNumber(row[kihonHalfIdx]);

            premiums[gradeId] = {
              standardSalary,
              salaryMin,
              salaryMax,
              ippan: { full: ippanFull, half: ippanHalf },
              tokutei: { full: tokuteiFull, half: tokuteiHalf },
              kihon: { full: kihonFull, half: kihonHalf }
            };
          }

          // Firestoreにデータを保存（年度単位でネスト）
          const prefectureCollection = collection(this.firestore, 'prefectures');
          const prefectureDoc = doc(prefectureCollection, prefectureId);
          const yearCollection = collection(prefectureDoc, 'insurance_premiums', year, 'grades');
          for (const [gradeId, premium] of Object.entries(premiums)) {
            // 都道府県ごとの保存（従来通り）
            const gradeDoc = doc(yearCollection, gradeId);
            await setDoc(gradeDoc, premium);

            // 全国共通コレクションへの保存
            const nationalCollection = collection(this.firestore, 'prefectures', '全国', 'insurance_premiums', year, 'grades');
            const nationalDoc = doc(nationalCollection, gradeId);
            await setDoc(nationalDoc, {
              standardSalary: premium.standardSalary,
              salaryMin: premium.salaryMin,
              salaryMax: premium.salaryMax
            });
          }

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
        '標準報酬月額': premium.standardSalary,
        '報酬月額下限': premium.salaryMin,
        '報酬月額上限': premium.salaryMax,
        '一般保険料（全額）': premium.ippan.full,
        '一般保険料（折半額）': premium.ippan.half,
        '特定保険料（全額）': premium.tokutei.full,
        '特定保険料（折半額）': premium.tokutei.half,
        '基本保険料（全額）': premium.kihon.full,
        '基本保険料（折半額）': premium.kihon.half
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
} 