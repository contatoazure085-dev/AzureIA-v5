
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, LogOut, UserCircle, Lock, Mail, ArrowRight, 
  AlertCircle, Upload, X, Trash2, Zap, TrendingDown, Calendar, 
  CheckCircle, Clock, AlertTriangle, PlusCircle, History, Save, 
  FileDown, Settings2, CalendarDays, User, Edit3, Calculator,
  Sparkles, Image as ImageIcon
} from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

// ==========================================
// 1. DEFINIÇÕES DE TIPOS (TYPES)
// ==========================================

export type ItemType = 'MATERIAL' | 'MAO_DE_OBRA' | 'VERBA';

export const CONSTRUCTION_CATEGORIES = [
  'SERVIÇOS PRELIMINARES', 'INFRAESTRUTURA / FUNDAÇÃO', 'SUPERESTRUTURA',
  'ALVENARIA E VEDAÇÕES', 'ESQUADRIAS', 'COBERTURA', 'INSTALAÇÕES ELÉTRICAS',
  'INSTALAÇÕES HIDROSSANITÁRIAS', 'REVESTIMENTOS DE PAREDE', 'REVESTIMENTOS DE PISO',
  'FORROS', 'PINTURA', 'LOUÇAS E METAIS', 'SERVIÇOS COMPLEMENTARES'
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
  isOptimized?: boolean;
  dailyProductivity?: number;
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
  produtividadeDiaria: number;
}

export type ScheduleStatus = 'PLANEJADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'ATRASADO';

export interface ScheduleTask {
  id: string;
  budgetItemId?: string;
  description: string;
  startDate: string;
  endDate: string;
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

// ==========================================
// 2. BANCO DE DADOS MOCK (DATABASE)
// ==========================================

const DATABASE: DatabaseItem[] = [
  { id: '1', description: 'Cimento Portland CP II-32 (Saco 50kg)', unidade: 'un', precoSeinfra: 38.50, precoMercadoFortaleza: 36.90, tipo: 'MATERIAL', categoria: 'INFRAESTRUTURA / FUNDAÇÃO', produtividadeDiaria: 50 },
  { id: '2', description: 'Areia Média Lavada', unidade: 'm³', precoSeinfra: 65.00, precoMercadoFortaleza: 58.00, tipo: 'MATERIAL', categoria: 'INFRAESTRUTURA / FUNDAÇÃO', produtividadeDiaria: 10 },
  { id: '3', description: 'Tijolo Cerâmico Furado 9x19x19cm', unidade: 'mil', precoSeinfra: 680.00, precoMercadoFortaleza: 620.00, tipo: 'MATERIAL', categoria: 'ALVENARIA E VEDAÇÕES', produtividadeDiaria: 8 }, // 8m2/dia ref
  { id: '4', description: 'Pedreiro com Encargos', unidade: 'h', precoSeinfra: 24.80, precoMercadoFortaleza: 22.50, tipo: 'MAO_DE_OBRA', categoria: 'ALVENARIA E VEDAÇÕES', produtividadeDiaria: 8 },
  { id: '5', description: 'Servente com Encargos', unidade: 'h', precoSeinfra: 18.50, precoMercadoFortaleza: 16.00, tipo: 'MAO_DE_OBRA', categoria: 'SERVIÇOS PRELIMINARES', produtividadeDiaria: 8 },
  { id: '6', description: 'Pintura Látex Acrílica 2 demãos', unidade: 'm²', precoSeinfra: 28.90, precoMercadoFortaleza: 25.00, tipo: 'MAO_DE_OBRA', categoria: 'PINTURA', produtividadeDiaria: 30.0 },
  { id: '7', description: 'Piso Intertravado de Concreto (Paver)', unidade: 'm²', precoSeinfra: 55.00, precoMercadoFortaleza: 48.00, tipo: 'MATERIAL', categoria: 'REVESTIMENTOS DE PISO', produtividadeDiaria: 10.0 },
  { id: '8', description: 'Aço CA-50 10.0mm', unidade: 'kg', precoSeinfra: 9.80, precoMercadoFortaleza: 8.50, tipo: 'MATERIAL', categoria: 'SUPERESTRUTURA', produtividadeDiaria: 80.0 },
  { id: '9', description: 'Concreto Usinado FCK 25MPa', unidade: 'm³', precoSeinfra: 420.00, precoMercadoFortaleza: 390.00, tipo: 'MATERIAL', categoria: 'SUPERESTRUTURA', produtividadeDiaria: 3.0 },
  { id: '10', description: 'Eletricista com Encargos', unidade: 'h', precoSeinfra: 25.50, precoMercadoFortaleza: 23.00, tipo: 'MAO_DE_OBRA', categoria: 'INSTALAÇÕES ELÉTRICAS', produtividadeDiaria: 8 },
  { id: '11', description: 'Tinta Acrílica Fosca Premium (Lata 18L)', unidade: 'un', precoSeinfra: 320.00, precoMercadoFortaleza: 299.90, tipo: 'MATERIAL', categoria: 'PINTURA', produtividadeDiaria: 2.0 }, // latas/dia
  { id: '12', description: 'Argamassa Colante AC-II (Saco 20kg)', unidade: 'un', precoSeinfra: 22.00, precoMercadoFortaleza: 18.90, tipo: 'MATERIAL', categoria: 'REVESTIMENTOS DE PISO', produtividadeDiaria: 10.0 },
  { id: '13', description: 'Cabo Flexível 2.5mm 750V', unidade: 'm', precoSeinfra: 2.80, precoMercadoFortaleza: 2.30, tipo: 'MATERIAL', categoria: 'INSTALAÇÕES ELÉTRICAS', produtividadeDiaria: 50.0 },
  { id: '14', description: 'Limpeza do Terreno (Mecânica)', unidade: 'm²', precoSeinfra: 1.50, precoMercadoFortaleza: 1.20, tipo: 'MAO_DE_OBRA', categoria: 'SERVIÇOS PRELIMINARES', produtividadeDiaria: 150.0 },
  { id: '15', description: 'Porcelanato Polido Premium 60x60', unidade: 'm²', precoSeinfra: 89.90, precoMercadoFortaleza: 82.50, tipo: 'MATERIAL', categoria: 'REVESTIMENTOS DE PISO', produtividadeDiaria: 8.0 }
];

const searchDatabase = (query: string): DatabaseItem[] => {
  return DATABASE.filter(item => item.description.toLowerCase().includes(query.toLowerCase()));
};

// ==========================================
// 3. COMPONENTES INTERNOS (UI)
// ==========================================

// --- 3.1 Login Page ---
const LoginPage = ({ onLogin }: { onLogin: (e: string, p: string) => boolean }) => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full"><div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-[#F59E0B]/10 rounded-full blur-3xl"></div></div>
      <div className="max-w-md w-full bg-white py-10 px-8 shadow-2xl rounded-2xl border-t-4 border-[#F59E0B] relative z-10">
        <div className="text-center mb-10">
            <div className="flex justify-center mb-4"><div className="w-16 h-16 bg-[#0F172A] rounded-xl flex items-center justify-center shadow-lg"><LayoutDashboard className="text-[#F59E0B] w-10 h-10" /></div></div>
            <h2 className="text-3xl font-extrabold"><span className="text-[#0F172A]">Azure</span><span className="text-[#F59E0B]">AI</span></h2>
        </div>
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if(!onLogin(email, pass)) setError('Credenciais inválidas.'); }}>
          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded flex items-center"><AlertCircle className="w-4 h-4 mr-2"/>{error}</div>}
          <div className="relative"><Mail className="absolute left-3 top-3.5 text-gray-400 w-5 h-5"/><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@azure.com" className="pl-10 w-full p-3 border rounded-lg focus:ring-1 focus:ring-[#F59E0B] focus:border-[#F59E0B] outline-none" required /></div>
          <div className="relative"><Lock className="absolute left-3 top-3.5 text-gray-400 w-5 h-5"/><input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" className="pl-10 w-full p-3 border rounded-lg focus:ring-1 focus:ring-[#F59E0B] focus:border-[#F59E0B] outline-none" required /></div>
          <button type="submit" className="w-full py-3 bg-[#F59E0B] text-white font-bold rounded-lg hover:bg-[#D97706] flex justify-center items-center gap-2 shadow-lg">ACESSAR <ArrowRight className="w-5 h-5"/></button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-400">Senha padrão: 123</p>
      </div>
    </div>
  );
};

// --- 3.2 Header ---
const Header = ({ onLogout }: { onLogout: () => void }) => (
  <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-[#0F172A] rounded-lg flex items-center justify-center"><LayoutDashboard className="text-[#FBBF24] w-5 h-5" /></div>
        <span className="text-2xl font-bold"><span className="text-[#0F172A]">Azure</span><span className="text-[#F59E0B]">AI</span></span>
      </div>
      <div className="flex items-center gap-4">
         <div className="hidden md:flex flex-col text-right"><span className="text-sm font-medium text-[#0F172A]">Admin</span><span className="text-xs text-gray-500">Engenheiro Chefe</span></div>
         <button onClick={onLogout} className="text-gray-500 hover:text-red-600 p-2 rounded-full hover:bg-gray-100"><LogOut className="w-5 h-5" /></button>
      </div>
    </div>
  </header>
);

// --- 3.3 Image Upload ---
const ImageUpload = ({ label, image, onImageChange, className = '' }: any) => {
  const ref = useRef<HTMLInputElement>(null);
  const handleFile = (e: any) => {
    const file = e.target.files?.[0];
    if (file) { const r = new FileReader(); r.onloadend = () => onImageChange(r.result); r.readAsDataURL(file); }
  };
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-xs font-medium text-gray-500 mb-2 uppercase">{label}</span>
      <div className={`relative cursor-pointer w-32 h-32 flex flex-col items-center justify-center rounded-lg border-2 transition-colors ${image ? 'border-solid border-gray-200 bg-white' : 'border-dashed border-[#FBBF24] bg-white hover:bg-yellow-50'}`} onClick={() => ref.current?.click()}>
        <input type="file" ref={ref} onChange={handleFile} className="hidden" accept="image/*" />
        {image ? (
           <><img src={image} className="w-full h-full object-contain p-1 rounded" /><button onClick={(e)=>{e.stopPropagation();onImageChange(null)}} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow"><X className="w-3 h-3"/></button></>
        ) : (
           <><div className="bg-yellow-100 p-2 rounded-full mb-1"><Upload className="w-5 h-5 text-[#D97706]"/></div><span className="text-[10px] text-gray-400">Adicionar</span></>
        )}
      </div>
    </div>
  );
};

// --- 3.4 Budget Table ---
const BudgetTable = ({ items, onUpdate, onDelete, onOptimize }: any) => {
  const groups = useMemo(() => {
    const g: any = {}; CONSTRUCTION_CATEGORIES.forEach(c => g[c] = []); g['OUTROS'] = [];
    items.forEach((i: BudgetItem) => { const cat = CONSTRUCTION_CATEGORIES.includes(i.category as any) ? i.category : 'OUTROS'; if(!g[cat]) g[cat]=[]; g[cat].push(i); });
    return g;
  }, [items]);
  const total = items.reduce((a:any, b:any) => a + b.total, 0);

  if (items.length === 0) return <div className="text-center py-12 bg-gray-50 border-dashed border-2 border-gray-300 rounded"><AlertCircle className="mx-auto h-10 w-10 text-gray-400"/><p className="mt-2 text-sm text-gray-500">Nenhum item orçado</p></div>;

  return (
    <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-[#0F172A] text-white"><tr><th className="py-3 pl-4 text-left text-sm">Descrição</th><th className="px-3 text-sm">Und</th><th className="px-3 text-sm">Qtd</th><th className="px-3 text-sm">Unit (R$)</th><th className="px-3 text-sm">Total (R$)</th><th className="px-3 text-sm">Fonte</th><th className="pr-4"></th></tr></thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Object.entries(groups).map(([cat, list]: any) => list.length > 0 && (
            <React.Fragment key={cat}>
              <tr className="bg-gray-100"><td colSpan={7} className="py-2 pl-4 text-xs font-bold text-[#0F172A]">{cat}</td></tr>
              {list.map((item: BudgetItem) => (
                <tr key={item.id} className={item.isOptimized ? 'bg-yellow-50' : ''}>
                  <td className="py-4 pl-4 text-sm relative">
                    {item.isOptimized && <Zap className="absolute -left-1 top-4 w-3 h-3 text-[#F59E0B] fill-current"/>}
                    <input value={item.description} onChange={e=>onUpdate(item.id, 'description', e.target.value)} className={`w-full border rounded px-2 py-1 ${item.isOptimized?'border-yellow-300':'border-gray-300'} focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] outline-none`}/>
                  </td>
                  <td className="px-3"><input value={item.unit} onChange={e=>onUpdate(item.id, 'unit', e.target.value)} className="w-full border-gray-300 rounded px-2 py-1 text-center outline-none focus:border-[#F59E0B]"/></td>
                  <td className="px-3"><input type="number" value={item.quantity} onChange={e=>onUpdate(item.id, 'quantity', +e.target.value)} className="w-full border-gray-300 rounded px-2 py-1 outline-none focus:border-[#F59E0B]"/></td>
                  <td className="px-3"><input type="number" value={item.unitPrice} onChange={e=>onUpdate(item.id, 'unitPrice', +e.target.value)} className={`w-full border rounded px-2 py-1 outline-none focus:border-[#F59E0B] ${item.isOptimized ? 'text-[#D97706] font-bold border-yellow-300' : 'border-gray-300'}`}/></td>
                  <td className="px-3 font-medium text-[#0F172A] whitespace-nowrap">{item.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
                  <td className="px-3"><span className={`text-[10px] px-2 py-0.5 rounded ${item.source==='SEINFRA'?'bg-indigo-100 text-indigo-800':item.source==='MERCADO'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-800'}`}>{item.source}</span></td>
                  <td className="pr-4 text-right"><button onClick={()=>onDelete(item.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-5 h-5"/></button></td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot className="bg-gray-50"><tr><td colSpan={4} className="py-4 pl-6"><button onClick={onOptimize} className="bg-[#F59E0B] text-white px-4 py-2 rounded font-bold flex items-center gap-2 hover:bg-[#D97706] transition-colors"><Zap className="w-4 h-4 fill-current"/> Otimizar (IA)</button></td><td className="px-3 py-4 text-lg font-bold text-[#0F172A]">{total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td colSpan={2}></td></tr></tfoot>
      </table>
    </div>
  );
};

// --- 3.5 Optimization Modal ---
const OptimizationModal = ({ isOpen, onClose, strategies, currentTotal, onApply }: any) => {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => { if(isOpen) setSel(new Set(strategies.map((s:any)=>s.id))); }, [isOpen, strategies]);
  if (!isOpen) return null;
  const savings = strategies.filter((s:any)=>sel.has(s.id)).reduce((a:any,b:any)=>a+b.savings,0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#0F172A]/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden">
        <div className="bg-[#0F172A] p-4 text-white font-bold flex justify-between items-center"><div className="flex items-center gap-2"><div className="bg-[#F59E0B] p-1.5 rounded-full"><Zap className="w-4 h-4 fill-current"/></div><span>Análise de Competitividade Azure AI</span></div><button onClick={onClose}><X className="w-5 h-5"/></button></div>
        <div className="p-6 grid grid-cols-2 gap-4 bg-gray-50">
           <div className="bg-white p-3 rounded border text-center"><p className="text-xs text-gray-500 uppercase">Valor Atual</p><p className="text-lg font-bold">{currentTotal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p></div>
           <div className="bg-white p-3 rounded border-l-4 border-[#F59E0B] text-center shadow-sm"><p className="text-xs text-[#D97706] font-bold uppercase">Otimizado (Previsto)</p><p className="text-xl font-bold text-[#0F172A]">{(currentTotal-savings).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p></div>
        </div>
        <div className="p-6 max-h-80 overflow-y-auto space-y-3">
            {strategies.map((s:any)=>(
                <div key={s.id} onClick={()=>{const n=new Set(sel);n.has(s.id)?n.delete(s.id):n.add(s.id);setSel(n)}} className={`p-3 border rounded cursor-pointer flex justify-between items-center hover:border-gray-300 ${sel.has(s.id)?'bg-indigo-50 border-indigo-200':''}`}>
                    <div className="flex items-center gap-3"><input type="checkbox" checked={sel.has(s.id)} readOnly className="text-[#F59E0B] focus:ring-[#F59E0B]"/><div className="text-sm"><p className="font-bold text-[#0F172A]">{s.title}</p><p className="text-gray-500">{s.description}</p></div></div>
                    <span className="text-green-700 font-bold text-sm bg-green-100 px-2 py-0.5 rounded">-{s.savings.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span>
                </div>
            ))}
        </div>
        <div className="p-4 bg-gray-50 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 bg-white border rounded hover:bg-gray-50">Cancelar</button><button onClick={()=>onApply(strategies.filter((s:any)=>sel.has(s.id)))} className="px-4 py-2 bg-[#F59E0B] text-white font-bold rounded hover:bg-[#D97706]">Aplicar Otimizações</button></div>
      </div>
    </div>
  );
};

// --- 3.6 Schedule View ---
const ScheduleView = ({ schedule, onUpdateTask, onReportIssue }: any) => {
  const [showIssue, setShowIssue] = useState(false);
  const getStatClass = (s:string) => s==='ATRASADO'?'bg-red-100 text-red-800':s==='CONCLUIDO'?'bg-green-100 text-green-800':s==='EM_ANDAMENTO'?'bg-blue-100 text-blue-800':'bg-gray-100 text-gray-800';
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center p-4 bg-white border rounded shadow-sm">
         <div><h3 className="font-bold text-[#0F172A]">Cronograma de Execução</h3><p className="text-xs text-gray-500">Baseado no TCPO e Produtividade da Equipe</p></div>
         <button onClick={()=>setShowIssue(true)} className="px-3 py-2 bg-red-600 text-white rounded text-sm flex items-center gap-2 hover:bg-red-700"><AlertTriangle className="w-4 h-4"/> Reportar Atraso</button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow border">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarefa</th><th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Início</th><th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Fim</th><th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Dias</th><th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th></tr></thead>
            <tbody className="divide-y divide-gray-200">{schedule.map((t:any)=>(
                <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900"><div>{t.description}</div><div className="text-[10px] text-gray-400 uppercase">{t.category}</div></td>
                    <td className="px-6 py-4"><input type="date" value={t.startDate} onChange={e=>onUpdateTask(t.id,'startDate',e.target.value)} className="border-gray-300 rounded text-sm focus:ring-[#F59E0B] focus:border-[#F59E0B]"/></td>
                    <td className="px-6 py-4"><input type="date" value={t.endDate} onChange={e=>onUpdateTask(t.id,'endDate',e.target.value)} className="border-gray-300 rounded text-sm focus:ring-[#F59E0B] focus:border-[#F59E0B]"/></td>
                    <td className="px-6 py-4 text-sm text-center text-gray-500">{t.durationDays}</td>
                    <td className="px-6 py-4"><select value={t.status} onChange={e=>onUpdateTask(t.id,'status',e.target.value)} className={`text-xs rounded-full border-none p-1 px-2 font-bold cursor-pointer ${getStatClass(t.status)}`}><option value="PLANEJADO">PLANEJADO</option><option value="EM_ANDAMENTO">EM ANDAMENTO</option><option value="CONCLUIDO">CONCLUIDO</option><option value="ATRASADO">ATRASADO</option></select></td>
                </tr>
            ))}</tbody>
        </table>
      </div>
      {showIssue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                  <h3 className="text-lg font-bold text-red-600 flex items-center gap-2 mb-4"><AlertTriangle/> Reportar Ocorrência</h3>
                  <p className="text-sm text-gray-600 mb-4">A IA irá recalcular todas as datas futuras.</p>
                  <button onClick={()=>{onReportIssue('ALL', 2, 'CHUVA'); setShowIssue(false);}} className="w-full bg-red-600 text-white py-2 rounded font-bold mb-2">Confirmar (+2 Dias Chuva)</button>
                  <button onClick={()=>setShowIssue(false)} className="w-full border py-2 rounded">Cancelar</button>
              </div>
          </div>
      )}
    </div>
  );
};

// ==========================================
// 4. MAIN APP COMPONENT
// ==========================================

const DEFAULT_TERMS = `F O R M A   D E   P A G A M E N T O:
Pagamento pode ser feito via PIX, 70% inicio e 30% final, ou valor integral com 4% de desconto, ou em até 12x no cartão de credito (Com acréscimo da maquina) ou medições semanais, de acordo com o avanço da obra, disposto no cronograma de acompanhamento.

Banco: Santander
Agência: 1584
Conta corrente: 13.004331-3
CNPJ: 53.515.575/0001-03
Nome: AZURE PROJETOS E CONSTRUÇÕES LTDA
Chave Pix: 53.515.575/0001-03`;

export default function App() {
  // States
  const [auth, setAuth] = useState(false);
  const [view, setView] = useState<'create'|'history'>('create');
  const [tab, setTab] = useState<'budget'|'schedule'>('budget');
  const [saved, setSaved] = useState<SavedBudget[]>([]);
  
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  const [config, setConfig] = useState<BudgetConfig>({ useSeinfra: true, useMarket: true, includeMaterial: true });
  
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<DatabaseItem[]>([]);
  
  const [logo, setLogo] = useState<string|null>(null);
  const [qr, setQr] = useState<string|null>(null);
  const [terms, setTerms] = useState(DEFAULT_TERMS);

  const [optOpen, setOptOpen] = useState(false);
  const [strategies, setStrategies] = useState<OptimizationStrategy[]>([]);

  // Init
  useEffect(() => {
    if(localStorage.getItem('azure_token')) setAuth(true);
    const s = localStorage.getItem('azure_budgets');
    if(s) try { setSaved(JSON.parse(s)); } catch(e){}
  }, []);

  // Recalc Prices on Config Change
  useEffect(() => {
      setItems(prev => prev.map(i => {
          if(i.isOptimized) return i;
          const db = DATABASE.find(d => d.description === i.description);
          if(db) {
              const p = config.useSeinfra ? db.precoSeinfra : db.precoMercadoFortaleza;
              return { ...i, unitPrice: p, total: i.quantity * p, source: config.useSeinfra?'SEINFRA':'MERCADO' };
          }
          return i;
      }));
  }, [config.useSeinfra]);

  // Auth Handlers
  const login = (e:string, p:string) => {
      if(e==='admin@azure.com' && p==='123') { setAuth(true); localStorage.setItem('azure_token','1'); return true; }
      return false;
  };
  const logout = () => { setAuth(false); localStorage.removeItem('azure_token'); };

  // Data Handlers
  const addItem = (db: DatabaseItem) => {
      const p = config.useSeinfra ? db.precoSeinfra : db.precoMercadoFortaleza;
      const ni: BudgetItem = {
          id: crypto.randomUUID(), description: db.description, unit: db.unidade, quantity: 1, unitPrice: p, total: p,
          source: config.useSeinfra?'SEINFRA':'MERCADO', type: db.tipo, category: db.categoria, dailyProductivity: db.produtividadeDiaria
      };
      setItems(prev => [...prev, ni]); setSearch(''); setSuggestions([]);
  };

  const handleManualSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value; setSearch(v);
      if(v.length > 1) setSuggestions(searchDatabase(v)); else setSuggestions([]);
  };

  // Mock AI Generation (Fallback Local)
  const generateWithAI = async () => {
     if(!desc) return; setLoading(true);
     await new Promise(r => setTimeout(r, 1500)); // Simulate delay
     // Smart Match based on keywords
     const newItems: BudgetItem[] = [];
     const lower = desc.toLowerCase();
     if(lower.includes('muro') || lower.includes('parede') || lower.includes('alvenaria')) {
         const tijolo = DATABASE.find(d => d.id === '3');
         const pedreiro = DATABASE.find(d => d.id === '4');
         const cimento = DATABASE.find(d => d.id === '1');
         if(tijolo) addItem(tijolo); 
         if(pedreiro) { const p = {...pedreiro}; addItem(p); }
         if(cimento && config.includeMaterial) addItem(cimento);
     } else if(lower.includes('piso') || lower.includes('revestimento')) {
         const porcelanato = DATABASE.find(d => d.id === '15');
         const arga = DATABASE.find(d => d.id === '12');
         const pedreiro = DATABASE.find(d => d.id === '4');
         if(porcelanato && config.includeMaterial) addItem(porcelanato);
         if(arga && config.includeMaterial) addItem(arga);
         if(pedreiro) addItem(pedreiro);
     } else {
         // Generic Fallback
         const servente = DATABASE.find(d => d.id === '5');
         if(servente) addItem(servente);
     }
     setDesc(''); setLoading(false);
  };

  // Optimization Logic
  const handleOpt = () => {
    const total = items.reduce((a,b)=>a+b.total,0);
    const s: OptimizationStrategy[] = [];
    const premium = items.filter(i => /premium|porcelanato/i.test(i.description) && !i.isOptimized);
    premium.forEach(i => s.push({ id: i.id, type: 'MATERIAL_SWAP', title: `Trocar ${i.description}`, description: 'Usar linha Standard (-15%)', savings: i.total*0.15, isSelected: true, targetIds: [i.id] }));
    const labor = items.filter(i => i.type === 'MAO_DE_OBRA' && !i.isOptimized);
    if(labor.length) s.push({ id: 'labor', type: 'LABOR_DISCOUNT', title: 'Ajuste BDI Mão de Obra', description: 'Redução estratégica de 5%', savings: labor.reduce((a,b)=>a+b.total,0)*0.05, isSelected: true, targetIds: labor.map(l=>l.id) });
    if(total % 100 > 0) s.push({ id: 'round', type: 'ROUNDING', title: 'Arredondamento Comercial', description: 'Desconto para fechar valor', savings: total%100, isSelected: true });
    setStrategies(s); setOptOpen(true);
  };

  const applyOpt = (sel: OptimizationStrategy[]) => {
      let ni = [...items];
      sel.forEach(s => {
          if(s.type === 'MATERIAL_SWAP' && s.targetIds) ni = ni.map(i => s.targetIds?.includes(i.id) ? {...i, unitPrice: i.unitPrice*0.85, total: i.total*0.85, isOptimized: true, description: i.description.replace(/Premium/i,'Standard')} : i);
          if(s.type === 'LABOR_DISCOUNT' && s.targetIds) ni = ni.map(i => s.targetIds?.includes(i.id) ? {...i, unitPrice: i.unitPrice*0.95, total: i.total*0.95, isOptimized: true} : i);
          if(s.type === 'ROUNDING') ni.push({ id: crypto.randomUUID(), description: 'Desconto Comercial', unit: 'vb', quantity: 1, unitPrice: -s.savings, total: -s.savings, source: 'ESTIMADO', type: 'VERBA', category: 'SERVIÇOS COMPLEMENTARES', isOptimized: true });
      });
      setItems(ni); setOptOpen(false);
  };

  // Schedule Logic
  const genSchedule = (currItems: BudgetItem[]) => {
      const tasks: ScheduleTask[] = [];
      let date = new Date(); date.setHours(0,0,0,0);
      const sorted = [...currItems].sort((a,b) => CONSTRUCTION_CATEGORIES.indexOf(a.category as any) - CONSTRUCTION_CATEGORIES.indexOf(b.category as any));
      sorted.forEach(i => {
          const days = Math.ceil(i.quantity / (i.dailyProductivity || 10));
          const end = new Date(date); end.setDate(end.getDate() + Math.max(1, days));
          tasks.push({ id: crypto.randomUUID(), description: i.description, startDate: date.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0], durationDays: Math.max(1, days), status: 'PLANEJADO', category: i.category });
          date = new Date(end); date.setDate(date.getDate() + 1); // Waterfall
      });
      return tasks;
  };

  const handleIssue = (taskId: string, days: number) => {
      const ns = schedule.map(t => {
          const d = new Date(t.endDate); d.setDate(d.getDate() + days);
          return { ...t, endDate: d.toISOString().split('T')[0], durationDays: t.durationDays + days, status: 'ATRASADO' as ScheduleStatus };
      });
      setSchedule(ns); alert('Cronograma recalculado com sucesso!');
  };

  // Save & Export
  const save = () => {
      const name = prompt("Nome do Cliente:"); if(!name) return;
      const s = schedule.length ? schedule : genSchedule(items);
      const nb: SavedBudget = { id: Date.now().toString(), clientName: name, items, totalValue: items.reduce((a,b)=>a+b.total,0), date: new Date().toLocaleDateString(), status: 'Rascunho', paymentTerms: terms, schedule: s };
      const list = [nb, ...saved]; setSaved(list); localStorage.setItem('azure_budgets', JSON.stringify(list));
      setSchedule(s); alert("Salvo!");
  };

  const exportPDF = (itemsOverride?: BudgetItem[], termsOverride?: string, clientOverride?: string, schedOverride?: ScheduleTask[]) => {
      const printItems = itemsOverride || items;
      const printSched = schedOverride || schedule;
      const doc = new jsPDF();
      
      const header = (title: string) => {
          if(logo && (logo.startsWith('data:image/jpeg') || logo.startsWith('data:image/png'))) {
             try { doc.addImage(logo, logo.startsWith('data:image/png')?'PNG':'JPEG', 15, 15, 25, 25); } catch(e){}
          } else {
             doc.setFontSize(22); doc.setTextColor(15,23,42); doc.text("AZURE", 15, 25); doc.setTextColor(245,158,11); doc.text("AI", 45, 25);
             doc.setFontSize(10); doc.setTextColor(15,23,42); doc.text("Projetos e Construções", 15, 30);
          }
          doc.setFontSize(16); doc.setTextColor(0); doc.text(title, 195, 25, {align:'right'});
          doc.setFontSize(10); doc.text(`Data: ${new Date().toLocaleDateString()}`, 195, 31, {align:'right'});
          if(clientOverride) doc.text(`Cliente: ${clientOverride}`, 195, 36, {align:'right'});
      };

      header("ORÇAMENTO DE OBRA");

      const body: any[] = [];
      const groups: any = {};
      printItems.forEach(i => { const c = i.category || 'OUTROS'; if(!groups[c]) groups[c]=[]; groups[c].push(i); });
      Object.entries(groups).forEach(([cat, list]:any) => {
          body.push([{content: cat, colSpan: 5, styles: {fillColor: [240,240,240], fontStyle: 'bold'}}]);
          list.forEach((i:any) => body.push([i.description, i.unit, i.quantity, i.unitPrice.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), i.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})]));
      });

      // @ts-ignore
      doc.autoTable({ startY: 50, head: [['Item','Und','Qtd','Unit','Total']], body, theme: 'grid', headStyles: {fillColor: [15,23,42]} });

      // @ts-ignore
      let y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(14); doc.setTextColor(15,23,42); doc.text(`TOTAL: ${printItems.reduce((a,b)=>a+b.total,0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`, 195, y, {align:'right'});
      
      doc.setFontSize(11); doc.text("Dados de Pagamento", 15, y+10);
      doc.setFontSize(9); doc.setTextColor(60); 
      const splitTerms = doc.splitTextToSize(termsOverride || terms, 120);
      doc.text(splitTerms, 15, y+16);
      if(qr) try { doc.addImage(qr, qr.startsWith('data:image/png')?'PNG':'JPEG', 150, y+5, 35, 35); } catch(e){}

      if(printSched.length > 0) {
          doc.addPage(); header("CRONOGRAMA FÍSICO");
          // @ts-ignore
          doc.autoTable({ startY: 50, head: [['Tarefa','Início','Fim','Dias','Status']], body: printSched.map(t=>[t.description, t.startDate.split('-').reverse().join('/'), t.endDate.split('-').reverse().join('/'), t.durationDays, t.status]), headStyles: {fillColor: [245,158,11]} });
          // @ts-ignore
          const pageHeight = doc.internal.pageSize.height;
          doc.setFontSize(10); doc.text("_________________________________", 105, pageHeight-30, {align:'center'}); doc.text("De Acordo (Cliente)", 105, pageHeight-25, {align:'center'});
      }

      const pCount = doc.getNumberOfPages();
      for(let i=1; i<=pCount; i++) {
          doc.setPage(i); doc.setFontSize(8); doc.setTextColor(100);
          doc.text("contatoazure085@gmail.com | (85) 98991-8866 | Azure Construções", 105, 290, {align:'center'});
      }
      doc.save("Orcamento_Azure.pdf");
  };

  if(!auth) return <LoginPage onLogin={login} />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-slate-800">
      <Header onLogout={logout} />
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Nav */}
        <div className="flex justify-center mb-8">
            <div className="bg-white p-1 rounded-lg border inline-flex shadow-sm">
                <button onClick={()=>{setView('create');setTab('budget');}} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${view==='create'?'bg-[#0F172A] text-white':'text-gray-500 hover:text-gray-900'}`}><PlusCircle className="w-4 mr-2"/> Novo Orçamento</button>
                <button onClick={()=>setView('history')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${view==='history'?'bg-[#0F172A] text-white':'text-gray-500 hover:text-gray-900'}`}><History className="w-4 mr-2"/> Histórico</button>
            </div>
        </div>

        {view === 'create' ? (
           <div className="space-y-6">
               {/* Header Controls */}
               <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                   <div className="flex gap-4">
                       <ImageUpload label="Logo" image={logo} onImageChange={setLogo}/>
                       <div><h2 className="text-2xl font-bold text-[#0F172A]">Novo Orçamento</h2><p className="text-gray-500 text-sm">IA powered & TCPO Integrado</p></div>
                   </div>
                   <div className="flex gap-2">
                       <button onClick={save} className="flex items-center px-4 py-2 bg-white border border-[#F59E0B] text-[#D97706] rounded font-bold hover:bg-yellow-50"><Save className="w-4 mr-2"/> Salvar</button>
                       <button onClick={()=>exportPDF()} className="flex items-center px-4 py-2 bg-[#0F172A] text-white rounded font-bold hover:bg-gray-800"><FileDown className="w-4 mr-2"/> PDF</button>
                   </div>
               </div>

               {/* Tabs */}
               {items.length > 0 && (
                   <div className="border-b">
                       <nav className="flex gap-8">
                           <button onClick={()=>setTab('budget')} className={`py-4 px-1 border-b-2 font-medium flex items-center ${tab==='budget'?'border-[#F59E0B] text-[#D97706]':'border-transparent text-gray-500'}`}><Settings2 className="w-4 mr-2"/> Detalhes</button>
                           <button onClick={()=>{if(!schedule.length) setSchedule(genSchedule(items)); setTab('schedule');}} className={`py-4 px-1 border-b-2 font-medium flex items-center ${tab==='schedule'?'border-[#F59E0B] text-[#D97706]':'border-transparent text-gray-500'}`}><CalendarDays className="w-4 mr-2"/> Cronograma</button>
                       </nav>
                   </div>
               )}

               {tab === 'budget' ? (
                   <div className="grid lg:grid-cols-3 gap-8">
                       <div className="space-y-6">
                           {/* Price Source */}
                           <div className="bg-white shadow rounded p-4 border-l-4 border-[#F59E0B]">
                               <h3 className="font-bold mb-3 flex items-center"><Settings2 className="w-4 mr-2 text-gray-400"/> Fonte de Referência</h3>
                               <div className="flex bg-gray-100 p-1 rounded">
                                   <button onClick={()=>setConfig(p=>({...p, useSeinfra:true, useMarket:false}))} className={`flex-1 py-2 text-sm font-bold rounded ${config.useSeinfra?'bg-white shadow text-[#0F172A]':'text-gray-500'}`}>SEINFRA IA</button>
                                   <button onClick={()=>setConfig(p=>({...p, useSeinfra:false, useMarket:true}))} className={`flex-1 py-2 text-sm font-bold rounded ${!config.useSeinfra?'bg-white shadow text-[#0F172A]':'text-gray-500'}`}>BaseFOR IA</button>
                               </div>
                           </div>
                           
                           {/* Add Manual */}
                           <div className="bg-white shadow rounded p-4 relative">
                               <label className="block text-sm font-bold mb-2">Adicionar Item Manual</label>
                               <div className="flex gap-2">
                                   <input value={search} onChange={handleManualSearch} placeholder="Buscar (ex: Cimento)..." className="w-full border p-2 rounded focus:border-[#F59E0B] outline-none"/>
                               </div>
                               {search && suggestions.length > 0 && (
                                   <ul className="absolute z-10 w-full left-0 bg-white border shadow-lg max-h-60 overflow-auto rounded mt-1">
                                       {suggestions.map(s => (
                                           <li key={s.id} onClick={()=>addItem(s)} className="p-2 hover:bg-gray-100 cursor-pointer text-sm flex justify-between border-b">
                                               <span>{s.description}</span><span className="text-gray-500 font-mono text-xs">{s.precoMercadoFortaleza.toFixed(2)}</span>
                                           </li>
                                       ))}
                                   </ul>
                               )}
                           </div>

                           {/* Add AI */}
                           <div className="bg-white shadow rounded p-4">
                               <label className="block text-sm font-bold mb-2">Gerar via IA</label>
                               <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} className="w-full border p-2 rounded mb-2 focus:border-[#F59E0B] outline-none" placeholder="Ex: Construção de muro 20m com reboco..."/>
                               <button onClick={generateWithAI} disabled={loading} className="w-full bg-[#0F172A] text-white py-2 rounded font-bold flex justify-center items-center gap-2 hover:bg-gray-800 disabled:opacity-50">
                                   {loading ? 'Processando...' : <><Sparkles className="w-4 text-[#FBBF24]"/> Gerar Orçamento</>}
                               </button>
                           </div>
                       </div>

                       <div className="lg:col-span-2 space-y-6">
                           <div className="bg-white shadow rounded p-4">
                               <div className="flex justify-between mb-4 items-center">
                                   <h3 className="font-bold">Planilha Orçamentária</h3>
                                   <div className="flex gap-2 text-xs">
                                       <button onClick={()=>setConfig(p=>({...p, includeMaterial:!p.includeMaterial}))} className={`px-2 py-1 rounded border ${config.includeMaterial?'bg-blue-50 border-blue-200 text-blue-700':'text-gray-500'}`}>+ Materiais</button>
                                   </div>
                               </div>
                               <BudgetTable items={items} onUpdate={(id:string,f:string,v:any)=>setItems(items.map(i=>i.id===id?{...i,[f]:v,total:f==='quantity'||f==='unitPrice'?(f==='quantity'?v:i.quantity)*(f==='unitPrice'?v:i.unitPrice):i.total}:i))} onDelete={(id:string)=>setItems(items.filter(i=>i.id!==id))} onOptimize={handleOpt}/>
                           </div>
                           <div className="bg-white shadow rounded p-6 flex flex-col md:flex-row gap-6">
                               <div className="flex-1"><label className="font-bold text-[#0F172A] mb-2 block">Dados de Pagamento</label><textarea value={terms} onChange={e=>setTerms(e.target.value)} rows={6} className="w-full border rounded p-2 text-sm focus:border-[#F59E0B] outline-none"/></div>
                               <ImageUpload label="QR Code Pix" image={qr} onImageChange={setQr}/>
                           </div>
                       </div>
                   </div>
               ) : (
                   <div className="bg-white shadow rounded p-6">
                       <ScheduleView schedule={schedule} onUpdateTask={(id:string,f:string,v:any)=>setSchedule(schedule.map(t=>t.id===id?{...t,[f]:v}:t))} onReportIssue={handleIssue} />
                   </div>
               )}
           </div>
        ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {saved.map(b => (
                    <div key={b.id} className="bg-white p-6 rounded shadow border-l-4 border-[#0F172A] hover:shadow-lg transition-shadow">
                        <div className="flex justify-between mb-2"><span className="text-gray-500 text-sm flex items-center gap-1"><Calendar className="w-3"/> {b.date}</span><span className="bg-gray-100 text-xs px-2 rounded font-bold">{b.status}</span></div>
                        <h3 className="font-bold text-lg text-[#0F172A] flex items-center gap-2 mb-2"><User className="w-4 text-[#F59E0B]"/> {b.clientName}</h3>
                        <p className="text-2xl font-bold mb-4">{b.totalValue.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
                        <div className="flex justify-between border-t pt-4">
                            <button onClick={()=>exportPDF(b.items, b.paymentTerms, b.clientName, b.schedule)} className="text-sm text-gray-600 font-bold flex items-center gap-1 hover:text-[#0F172A]"><FileDown className="w-4"/> PDF</button>
                            <div className="flex gap-2">
                                <button onClick={()=>{if(confirm('Excluir?')){const n=saved.filter(s=>s.id!==b.id);setSaved(n);localStorage.setItem('azure_budgets',JSON.stringify(n));}}} className="text-red-400 hover:text-red-600"><Trash2 className="w-4"/></button>
                                <button onClick={()=>{setItems(b.items);setSchedule(b.schedule);setTerms(b.paymentTerms);setView('create');}} className="text-blue-600 hover:text-blue-800"><Edit3 className="w-4"/></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
        <OptimizationModal isOpen={optOpen} onClose={()=>setOptOpen(false)} strategies={strategies} currentTotal={items.reduce((a,b)=>a+b.total,0)} onApply={applyOpt} />
      </main>
    </div>
  );
}
