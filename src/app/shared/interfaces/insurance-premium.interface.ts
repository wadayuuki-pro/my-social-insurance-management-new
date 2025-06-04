export interface SalaryRange {
  min: number;
  max: number;
}

export interface PremiumAmount {
  full: number;
  half: number;
}

export interface InsurancePremium {
  year_month: string;
  grade: string;
  standard_salary: number;
  standardSalary: number;
  salaryMin: number;
  salaryMax: number;
  age: number;
  birth_date: string;
  premiums: {
    ippan: {
      full: number;
      half: number;
      is_applicable: boolean;
      is_initial: boolean;
    };
    tokutei: {
      full: number;
      half: number;
      is_applicable: boolean;
    };
    kousei: {
      full: number;
      half: number;
      is_applicable: boolean;
    };
    kaigo: {
      full: number;
      half: number;
      is_applicable: boolean;
    };
  };
  total: number;
  created_at: Date;
  updated_at: Date;
}

export interface PremiumGrade {
  [gradeId: string]: InsurancePremium;
}

export interface PrefecturePremiums {
  premiums: PremiumGrade;
} 