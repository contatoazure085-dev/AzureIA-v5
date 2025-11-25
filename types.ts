
export type ItemType = 'MATERIAL' | 'MAO_DE_OBRA' | 'VERBA';

export const CONSTRUCTION_CATEGORIES = [
  'SERVIÇOS PRELIMINARES',
  'INFRAESTRUTURA / FUNDAÇÃO',
  'SUPERESTRUTURA',
  'ALVENARIA E VEDAÇÕES',
  'ESQUADRIAS',
  'COBERTURA',
  'INSTALAÇÕES ELÉTRICAS',
  'INSTALAÇÕES HIDROSSANITÁRIAS',
  'REVESTIMENTOS DE PAREDE',
  'REVESTIMENTOS DE PISO',
  'FORROS',
  'PINTURA',
  'LOUÇAS E METAIS',
  'SERVIÇOS COMPLEMENTARES'
] as const;

export type ConstructionCategory = typeof CONSTRUCTION_CATEGORIES[number] | string;

export interface BudgetItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  source: 'SEINFRA' | 'MERCADO' | 'ESTIMADO';
  type: ItemType;
  category: ConstructionCategory;
  isOptimized?: boolean; // Flag to indicate if item was modified by AI
  dailyProductivity?: number; // How many units per day a standard team can execute
}

export interface OptimizationSuggestion {
  title: string;
  description: string;
  potentialSavings: string;
  action: string;
}

export interface OptimizationStrategy {
  id: string;
  type: 'ROUNDING' | 'MATERIAL_SWAP' | 'LABOR_DISCOUNT';
  title: string;
  description: string;
  savings: number;
  isSelected: boolean;
  targetIds?: string[];
}

export interface BudgetConfig {
  useSeinfra: boolean;
  useMarket: boolean;
  includeMaterial: boolean;
}

export interface DatabaseItem {
  id: string;
  description: string;
  unidade: string;
  precoSeinfra: number;
  precoMercadoFortaleza: number;
  tipo: ItemType;
  categoria: ConstructionCategory;
  produtividadeDiaria?: number; // Benchmark TCPO/SEINFRA
}

export type ScheduleStatus = 'PLANEJADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'ATRASADO';

export interface ScheduleTask {
  id: string;
  budgetItemId?: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  durationDays: number;
  status: ScheduleStatus;
  category: ConstructionCategory;
}

export interface SavedBudget {
  id: string;
  clientName: string;
  items: BudgetItem[];
  totalValue: number;
  date: string;
  status: 'Rascunho' | 'Enviado' | 'Aprovado';
  paymentTerms: string;
  schedule: ScheduleTask[];
}
