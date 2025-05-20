export interface SalaryRange {
  min: number;
  max: number;
}

export interface PremiumAmount {
  full: number;
  half: number;
}

export interface InsurancePremium {
  standardSalary: number;
  salaryMin: number;
  salaryMax: number;
  ippan: { full: number; half: number };
  tokutei: { full: number; half: number };
  kihon: { full: number; half: number };
}

export interface PremiumGrade {
  [gradeId: string]: InsurancePremium;
}

export interface PrefecturePremiums {
  premiums: PremiumGrade;
} 