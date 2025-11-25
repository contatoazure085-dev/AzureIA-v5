
import React, { useState, useEffect } from 'react';
import { Sparkles, FileDown, Settings2, Save, History, PlusCircle, Edit3, Trash2, Calendar, User, Wand2, CalendarDays } from 'lucide-react';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';
import Header from './components/Header';
import BudgetTable from './components/BudgetTable';
import OptimizationModal from './components/OptimizationModal';
import LoginPage from './components/LoginPage';
import ImageUpload from './components/ImageUpload';
import ScheduleView from './components/ScheduleView';
import { BudgetItem, BudgetConfig, SavedBudget, CONSTRUCTION_CATEGORIES, ConstructionCategory, OptimizationStrategy, ScheduleTask } from './types';
import { generateBudgetFromDescription } from './services/geminiService';
import { searchDatabaseItem, database } from './data/database';

const App: React.FC = () => {
  // --- Authentication State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Navigation State
  const [currentView, setCurrentView] = useState<'create' | 'history'>('create');
  // Sub-view for Loaded Budget (Details vs Schedule)
  const [activeTab, setActiveTab] = useState<'budget' | 'schedule'>('budget');

  // Data State
  const [savedBudgets, setSavedBudgets] = useState<SavedBudget[]>([]);

  // Budget Creation State
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<BudgetConfig>({
    useSeinfra: true,
    useMarket: true,
    includeMaterial: true
  });
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleTask[]>([]);
  
  // Image Assets State
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);

  // Autocomplete & Manual Add State
  const [manualItemSearch, setManualItemSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ConstructionCategory>(CONSTRUCTION_CATEGORIES[0]);
  const [suggestionsList, setSuggestionsList] = useState<typeof database>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Payment Terms State
  const DEFAULT_PAYMENT_TERMS = `F O R M A   D E   P A G A M E N T O:
Pagamento pode ser feito via PIX, 70% inicio e 30% final, ou valor integral com 4% de desconto, ou em até 12x no cartão de credito (Com acréscimo da maquina) ou medições semanais, de acordo com o avanço da obra, disposto no cronograma de acompanhamento.

Banco: Santander
Agência: 1584
Conta corrente: 13.004331-3
CNPJ: 53.515.575/0001-03
Nome: AZURE PROJETOS E CONSTRUÇÕES LTDA
Chave Pix: 53.515.575/0001-03`;

  const [paymentTerms, setPaymentTerms] = useState(DEFAULT_PAYMENT_TERMS);
  
  // Optimization Modal State
  const [isOptModalOpen, setIsOptModalOpen] = useState(false);
  const [strategies, setStrategies] = useState<OptimizationStrategy[]>([]);

  // --- Effects ---

  // Check Authentication & Load Data on Mount
  useEffect(() => {
    // Check Auth
    const token = localStorage.getItem('azure_auth_token');
    if (token === 'valid-token-123') {
        setIsAuthenticated(true);
    }

    // Load Data
    const saved = localStorage.getItem('azure_budgets');
    if (saved) {
        try {
            setSavedBudgets(JSON.parse(saved));
        } catch (e) {
            console.error("Erro ao carregar histórico", e);
        }
    }
  }, []);

  // Recalculate prices when source changes
  useEffect(() => {
    setBudgetItems(prevItems => prevItems.map(item => {
        const dbItem = database.find(db => db.description === item.description);
        
        if (dbItem && !item.isOptimized) { // Do not overwrite optimized items
            const newPrice = config.useSeinfra ? dbItem.precoSeinfra : dbItem.precoMercadoFortaleza;
            const newSource = config.useSeinfra ? 'SEINFRA' : 'MERCADO';
            
            return {
                ...item,
                unitPrice: newPrice,
                total: item.quantity * newPrice,
                source: newSource,
                dailyProductivity: dbItem.produtividadeDiaria // Ensure productivity is synced
            };
        }
        return item;
    }));
  }, [config.useSeinfra]);

  // --- Logic: Schedule Generation ---

  const PRODUCTIVITY_BENCHMARKS: Record<string, number> = {
      'ALVENARIA E VEDAÇÕES': 8, // m2/dia
      'PINTURA': 30,             // m2/dia
      'REVESTIMENTOS DE PISO': 10, // m2/dia
      'REVESTIMENTOS DE PAREDE': 12, // m2/dia
      'INFRAESTRUTURA / FUNDAÇÃO': 3, // m3/dia (Concreto)
      'SUPERESTRUTURA': 3, // m3/dia
      'COBERTURA': 15, // m2/dia
      'INSTALAÇÕES ELÉTRICAS': 6, // pts/dia
      'INSTALAÇÕES HIDROSSANITÁRIAS': 4, // pts/dia
      'SERVIÇOS PRELIMINARES': 50, // m2/dia (limpeza/locação)
      'ESQUADRIAS': 5, // un/dia
      'FORROS': 15, // m2/dia
      'LOUÇAS E METAIS': 8, // un/dia
      'SERVIÇOS COMPLEMENTARES': 20
  };

  const generateInitialSchedule = (items: BudgetItem[]): ScheduleTask[] => {
    const tasks: ScheduleTask[] = [];
    let currentDate = new Date();
    
    // Sort items by Category Order to create a waterfall effect
    const sortedItems = [...items].sort((a, b) => {
        const idxA = CONSTRUCTION_CATEGORIES.indexOf(a.category as any);
        const idxB = CONSTRUCTION_CATEGORIES.indexOf(b.category as any);
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });

    sortedItems.forEach(item => {
        // Determine Productivity
        let productivity = item.dailyProductivity;
        
        // If not explicit, try to match via DB description
        if (!productivity) {
             const dbMatch = database.find(db => db.description === item.description);
             if (dbMatch) productivity = dbMatch.produtividadeDiaria;
        }

        // If still not found (e.g. AI Item), use Category Benchmark
        if (!productivity) {
            productivity = PRODUCTIVITY_BENCHMARKS[item.category] || 10;
        }

        // Calculate Duration in Days
        let estimatedDays = 1;
        
        if (item.unit.toLowerCase() === 'h' || item.unit.toLowerCase() === 'horas') {
            // Logic for Hourly rates: 1 day = 8 hours
            estimatedDays = Math.ceil(item.quantity / 8.0);
        } else {
            // Logic for Production rates: Qty / Productivity
            estimatedDays = Math.ceil(item.quantity / productivity);
        }

        estimatedDays = Math.max(1, estimatedDays); // Minimum 1 day
        
        // Calculate End Date
        const startDate = new Date(currentDate);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + estimatedDays);

        tasks.push({
            id: `task-${item.id}`,
            budgetItemId: item.id,
            description: item.description,
            category: item.category,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            durationDays: estimatedDays,
            status: 'PLANEJADO'
        });

        // Waterfall: Next task starts after this one finishes
        currentDate = new Date(endDate);
        // Check if weekend? For prototype, let's keep it simple +1 day sequential
        currentDate.setDate(currentDate.getDate() + 1); 
    });

    return tasks;
  };

  const handleUpdateScheduleTask = (taskId: string, field: keyof ScheduleTask, value: any) => {
      setSchedule(prev => prev.map(task => {
          if (task.id === taskId) {
              return { ...task, [field]: value };
          }
          return task;
      }));
  };

  const handleReportIssue = (taskId: string, daysDelay: number, reason: string) => {
      const taskIndex = schedule.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return;

      const updatedSchedule = [...schedule];
      const impactedTask = updatedSchedule[taskIndex];

      // 1. Extend current task
      const oldEndDate = new Date(impactedTask.endDate);
      const newEndDate = new Date(oldEndDate);
      newEndDate.setDate(newEndDate.getDate() + daysDelay);
      
      updatedSchedule[taskIndex] = {
          ...impactedTask,
          endDate: newEndDate.toISOString().split('T')[0],
          durationDays: impactedTask.durationDays + daysDelay,
          status: 'ATRASADO'
      };

      // 2. Ripple Effect (Domino)
      // Shift all subsequent tasks by the delay amount
      for (let i = taskIndex + 1; i < updatedSchedule.length; i++) {
          const task = updatedSchedule[i];
          const tStart = new Date(task.startDate);
          const tEnd = new Date(task.endDate);

          tStart.setDate(tStart.getDate() + daysDelay);
          tEnd.setDate(tEnd.getDate() + daysDelay);

          updatedSchedule[i] = {
              ...task,
              startDate: tStart.toISOString().split('T')[0],
              endDate: tEnd.toISOString().split('T')[0]
          };
      }

      setSchedule(updatedSchedule);
      alert(`Cronograma atualizado! Ocorrência "${reason}" adicionou ${daysDelay} dias ao prazo final.`);
  };

  // --- Handlers: Authentication ---

  const handleLogin = (email: string, password: string): boolean => {
      if (email === 'admin@azure.com' && password === '123') {
          setIsAuthenticated(true);
          localStorage.setItem('azure_auth_token', 'valid-token-123');
          return true;
      }
      return false;
  };

  const handleLogout = () => {
      setIsAuthenticated(false);
      localStorage.removeItem('azure_auth_token');
  };

  // --- Handlers: Generation & Editing ---

  const handleGenerateBudget = async () => {
    if (!description.trim()) return;
    
    setLoading(true);
    try {
      const items = await generateBudgetFromDescription(description, config);
      setBudgetItems(prev => [...prev, ...items]);
      setDescription(''); 
    } catch (error) {
      alert("Erro ao gerar orçamento. Verifique se a API Key está configurada ou tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setManualItemSearch(val);
      if (val.length > 1) {
          const results = searchDatabaseItem(val);
          setSuggestionsList(results);
          setShowSuggestions(true);
      } else {
          setShowSuggestions(false);
      }
  };

  const handleSelectSuggestion = (dbItem: typeof database[0]) => {
      const price = config.useSeinfra ? dbItem.precoSeinfra : dbItem.precoMercadoFortaleza;
      const source = config.useSeinfra ? 'SEINFRA' : 'MERCADO';

      const newItem: BudgetItem = {
          id: crypto.randomUUID(),
          description: dbItem.description,
          unit: dbItem.unidade,
          quantity: 1, 
          unitPrice: price,
          total: price * 1,
          source: source,
          type: dbItem.tipo,
          category: dbItem.categoria,
          dailyProductivity: dbItem.produtividadeDiaria 
      };

      setBudgetItems(prev => [...prev, newItem]);
      setManualItemSearch('');
      setShowSuggestions(false);
  };

  const handleAddManualGeneric = () => {
    if(!manualItemSearch.trim()) return;
    
    const newItem: BudgetItem = {
        id: crypto.randomUUID(),
        description: manualItemSearch,
        unit: 'vb',
        quantity: 1,
        unitPrice: 0,
        total: 0,
        source: 'ESTIMADO',
        type: 'VERBA',
        category: selectedCategory,
        dailyProductivity: 1 // Default fallback for manual generic items
    };
    
    setBudgetItems(prev => [...prev, newItem]);
    setManualItemSearch('');
  }

  const handleUpdateItem = (id: string, field: keyof BudgetItem, value: any) => {
    setBudgetItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
           updated.total = updated.quantity * updated.unitPrice;
        }
        return updated;
      }
      return item;
    }));
  };

  const handleDeleteItem = (id: string) => {
    setBudgetItems(prev => prev.filter(item => item.id !== id));
  };

  // --- Logic: Optimization Simulation ---

  const handleCalculateOptimization = () => {
      const currentTotal = budgetItems.reduce((acc, i) => acc + i.total, 0);
      const generatedStrategies: OptimizationStrategy[] = [];

      // Regra 2: Material Premium (15% reduction)
      const premiumItems = budgetItems.filter(i => 
          i.type === 'MATERIAL' && 
          !i.isOptimized &&
          /premium|tipo a|porcelanato/i.test(i.description)
      );

      premiumItems.forEach(item => {
          const savings = item.total * 0.15;
          generatedStrategies.push({
              id: `swap-${item.id}`,
              type: 'MATERIAL_SWAP',
              title: `Substituição: ${item.description}`,
              description: 'Trocar por linha Standard equivalente com melhor custo-benefício (-15%).',
              savings: savings,
              isSelected: true,
              targetIds: [item.id]
          });
      });

      // Regra 3: Redução de BDI em Mão de Obra (5% linear)
      const laborItems = budgetItems.filter(i => i.type === 'MAO_DE_OBRA' && !i.isOptimized);
      if (laborItems.length > 0) {
          const laborTotal = laborItems.reduce((acc, i) => acc + i.total, 0);
          const savings = laborTotal * 0.05;
          generatedStrategies.push({
              id: 'labor-bdi',
              type: 'LABOR_DISCOUNT',
              title: 'Ajuste de BDI (Mão de Obra)',
              description: 'Redução estratégica de 5% na margem de mão de obra para competitividade.',
              savings: savings,
              isSelected: true,
              targetIds: laborItems.map(i => i.id)
          });
      }

      // Regra 1: Arredondamento (Negotiation Margin)
      const remainder = currentTotal % 100;
      if (remainder > 0 && currentTotal > 500) {
          generatedStrategies.push({
              id: 'rounding',
              type: 'ROUNDING',
              title: 'Arredondamento Técnico',
              description: `Desconto comercial para fechar o valor em ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentTotal - remainder)}.`,
              savings: remainder,
              isSelected: true
          });
      }

      setStrategies(generatedStrategies);
      setIsOptModalOpen(true);
  };

  const handleApplyOptimization = (selectedStrategies: OptimizationStrategy[]) => {
      let newItems = [...budgetItems];

      selectedStrategies.forEach(strategy => {
          if (strategy.type === 'MATERIAL_SWAP' && strategy.targetIds) {
              newItems = newItems.map(item => {
                  if (strategy.targetIds?.includes(item.id)) {
                      return {
                          ...item,
                          description: item.description.replace(/Premium|Tipo A|Porcelanato/gi, 'Standard'),
                          unitPrice: item.unitPrice * 0.85,
                          total: item.total * 0.85,
                          isOptimized: true
                      };
                  }
                  return item;
              });
          }

          if (strategy.type === 'LABOR_DISCOUNT' && strategy.targetIds) {
              newItems = newItems.map(item => {
                  if (strategy.targetIds?.includes(item.id)) {
                      return {
                          ...item,
                          unitPrice: item.unitPrice * 0.95,
                          total: item.total * 0.95,
                          isOptimized: true
                      };
                  }
                  return item;
              });
          }

          if (strategy.type === 'ROUNDING') {
              // Add a discount item
              const discountItem: BudgetItem = {
                  id: crypto.randomUUID(),
                  description: 'Desconto Comercial (Arredondamento)',
                  unit: 'vb',
                  quantity: 1,
                  unitPrice: -strategy.savings,
                  total: -strategy.savings,
                  source: 'ESTIMADO',
                  type: 'VERBA',
                  category: 'SERVIÇOS COMPLEMENTARES',
                  isOptimized: true
              };
              newItems.push(discountItem);
          }
      });

      setBudgetItems(newItems);
      setIsOptModalOpen(false);
  };


  // --- Handlers: Persistence ---

  const handleSaveBudget = () => {
    if (budgetItems.length === 0) {
        alert("Adicione itens ao orçamento antes de salvar.");
        return;
    }

    const clientName = window.prompt("Digite o nome do Cliente ou da Obra:");
    if (!clientName) return;

    const totalValue = budgetItems.reduce((acc, curr) => acc + curr.total, 0);

    // Auto-generate schedule if it doesn't exist
    const itemsSchedule = schedule.length > 0 ? schedule : generateInitialSchedule(budgetItems);
    setSchedule(itemsSchedule);

    const newBudget: SavedBudget = {
        id: Date.now().toString(),
        clientName,
        items: budgetItems,
        totalValue,
        date: new Date().toLocaleDateString('pt-BR'),
        status: 'Rascunho',
        paymentTerms: paymentTerms,
        schedule: itemsSchedule
    };

    // Remove existing if it's an update (simple logic: check if client name exists? No, always new ID for now)
    // Better: Update existing logic? We'll append for simplicity or overwrite if we had an ID.
    // For this prototype, we just push to top.
    const updatedList = [newBudget, ...savedBudgets];
    setSavedBudgets(updatedList);
    localStorage.setItem('azure_budgets', JSON.stringify(updatedList));
    alert("Orçamento e Cronograma salvos com sucesso!");
  };

  const handleDeleteSavedBudget = (id: string) => {
      if (window.confirm("Tem certeza que deseja excluir este orçamento do histórico?")) {
          const updatedList = savedBudgets.filter(b => b.id !== id);
          setSavedBudgets(updatedList);
          localStorage.setItem('azure_budgets', JSON.stringify(updatedList));
      }
  };

  const handleLoadBudget = (savedBudget: SavedBudget) => {
      setBudgetItems(savedBudget.items);
      setPaymentTerms(savedBudget.paymentTerms || DEFAULT_PAYMENT_TERMS);
      // Load or Generate schedule
      if (savedBudget.schedule && savedBudget.schedule.length > 0) {
          setSchedule(savedBudget.schedule);
      } else {
          const gen = generateInitialSchedule(savedBudget.items);
          setSchedule(gen);
      }
      setCurrentView('create');
      setActiveTab('budget'); // Default to budget view
  };

  // --- Handlers: Export ---

  const handleExportPDF = (itemsOverride?: BudgetItem[], termsOverride?: string, clientNameOverride?: string, scheduleOverride?: ScheduleTask[]) => {
    const itemsToPrint = itemsOverride || budgetItems;
    const termsToPrint = termsOverride || paymentTerms;
    const scheduleToPrint = scheduleOverride || schedule;
    
    if (itemsToPrint.length === 0) {
        alert("Não há itens para exportar.");
        return;
    }

    const doc = new jsPDF();
    const azureBlue = '#0F172A'; 
    const gold = '#DAA520';     
    
    // --- PAGE 1: BUDGET ---

    // Header Helper
    const drawHeader = (pageTitle: string) => {
        if (logoImage) {
            try {
                doc.addImage(logoImage, 'PNG', 15, 15, 25, 25);
            } catch (e) {
                console.error("Erro ao adicionar logo no PDF", e);
            }
        } else {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.setTextColor(azureBlue);
            doc.text("AZURE", 15, 25);
            doc.setTextColor(gold);
            doc.text("AI", 53, 25); 

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(azureBlue);
            doc.text("Azure Projetos e Construções Ltda", 15, 31);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(azureBlue);
        doc.text(pageTitle, 195, 25, { align: "right" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 195, 31, { align: "right" });
        
        if (clientNameOverride) {
            doc.text(`Cliente: ${clientNameOverride}`, 195, 36, { align: "right" });
        }
    }

    drawHeader("ORÇAMENTO DE OBRA");

    // Table Grouped
    const tableColumn = ["Item / Descrição", "Und.", "Qtd.", "Preço Unit.", "Total"];
    const tableBody: any[] = [];

    const groups: Record<string, BudgetItem[]> = {};
    CONSTRUCTION_CATEGORIES.forEach(cat => groups[cat] = []);
    groups['OUTROS'] = [];
    
    itemsToPrint.forEach(item => {
        const cat = item.category && CONSTRUCTION_CATEGORIES.includes(item.category as any) ? item.category : 'OUTROS';
        if(!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });

    Object.entries(groups).forEach(([category, catItems]) => {
        if (catItems.length > 0) {
            tableBody.push([{
                content: category,
                colSpan: 5,
                styles: { 
                    fillColor: [240, 240, 240], 
                    textColor: [30, 41, 59], 
                    fontStyle: 'bold',
                    halign: 'left'
                }
            }]);
            catItems.forEach(item => {
                tableBody.push([
                    item.description,
                    item.unit,
                    item.quantity.toString().replace('.', ','),
                    item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    item.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                ]);
            });
        }
    });

    // @ts-ignore 
    doc.autoTable({
        startY: 50,
        head: [tableColumn],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 128], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
        columnStyles: {
            0: { cellWidth: 'auto' }, 
            1: { cellWidth: 15, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 35, halign: 'right' } 
        }
    });

    // Footer Page 1
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY + 10;
    const totalAmount = itemsToPrint.reduce((acc, curr) => acc + curr.total, 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(azureBlue);
    doc.text(`VALOR TOTAL: ${totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, 195, finalY, { align: 'right' });

    const footerContentY = finalY + 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 128); 
    doc.text("Condições de Pagamento e Dados Bancários", 15, footerContentY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60); 

    const maxTextWidth = qrCodeImage ? 130 : 180;
    const splitText = doc.splitTextToSize(termsToPrint, maxTextWidth);
    doc.text(splitText, 15, footerContentY + 7);

    if (qrCodeImage) {
        try {
            const qrSize = 35;
            const qrX = 210 - 15 - qrSize;
            const qrY = footerContentY + 2;
            doc.addImage(qrCodeImage, 'PNG', qrX, qrY, qrSize, qrSize);
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text("Escaneie para Pagar (Pix)", qrX + (qrSize / 2), qrY + qrSize + 4, { align: "center" });
        } catch (e) {
            console.error("Error adding QR", e);
        }
    }

    // --- PAGE 2: SCHEDULE ---
    if (scheduleToPrint.length > 0) {
        doc.addPage();
        drawHeader("CRONOGRAMA DE EXECUÇÃO");

        const schedColumns = ["Etapa / Tarefa", "Início", "Fim", "Dias", "Status"];
        const schedBody = scheduleToPrint.map(t => [
            t.description,
            new Date(t.startDate).toLocaleDateString('pt-BR'),
            new Date(t.endDate).toLocaleDateString('pt-BR'),
            t.durationDays,
            t.status
        ]);

        // @ts-ignore
        doc.autoTable({
            startY: 50,
            head: [schedColumns],
            body: schedBody,
            theme: 'grid',
            headStyles: { fillColor: [218, 165, 32], textColor: [255, 255, 255], fontStyle: 'bold' }, // Gold Header
            styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 25, halign: 'center' },
                2: { cellWidth: 25, halign: 'center' },
                3: { cellWidth: 15, halign: 'center' },
                4: { cellWidth: 30, halign: 'center' }
            }
        });

        // Signature
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        const pageHeight = doc.internal.pageSize.height;
        doc.text("______________________________________________________", 105, pageHeight - 30, { align: "center" });
        doc.text("De acordo (Cliente)", 105, pageHeight - 25, { align: "center" });
    }

    // --- GLOBAL FOOTER (All Pages) ---
    const pageCount = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(68, 68, 68); // Dark Gray #444444

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.text(
            "contatoazure085@gmail.com  |  (85) 98991-8866  |  R. André Chaves, 590 - Jardim América",
            pageWidth / 2,
            pageHeight - 10,
            { align: "center" }
        );
    }

    const fileName = clientNameOverride 
        ? `Orcamento_${clientNameOverride.replace(/\s+/g, '_')}.pdf`
        : `Orcamento_Azure_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
        
    doc.save(fileName);
  };

  // --- RENDER ---
  
  if (!isAuthenticated) {
      return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
            <div className="bg-white p-1 rounded-lg shadow-sm border border-gray-200 inline-flex">
                <button
                    onClick={() => { setCurrentView('create'); setActiveTab('budget'); }}
                    className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        currentView === 'create' 
                        ? 'bg-azure-900 text-white shadow' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Novo Orçamento
                </button>
                <button
                    onClick={() => setCurrentView('history')}
                    className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        currentView === 'history' 
                        ? 'bg-azure-900 text-white shadow' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <History className="w-4 h-4 mr-2" />
                    Histórico
                </button>
            </div>
        </div>

        {/* --- VIEW: CREATE/EDIT BUDGET --- */}
        {currentView === 'create' && (
        <>
            <div className="md:flex md:items-start md:justify-between mb-8">
                {/* Header Title + Logo Upload Area */}
                <div className="flex gap-6 items-start">
                    <ImageUpload 
                        label="Logo da Empresa (Opcional)" 
                        image={logoImage} 
                        onImageChange={setLogoImage} 
                        className="hidden sm:block"
                    />

                    <div className="mt-2">
                        <h2 className="text-2xl font-bold leading-7 text-azure-900 sm:truncate sm:text-3xl sm:tracking-tight">
                        Gerador de Orçamento
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                        Utilize a IA para compor preços e cronogramas.
                        </p>
                        <div className="sm:hidden mt-4">
                            <ImageUpload 
                                label="Logo da Empresa" 
                                image={logoImage} 
                                onImageChange={setLogoImage} 
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 md:ml-4 md:mt-2">
                    <button
                        onClick={handleSaveBudget}
                        className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-azure-900 shadow-sm ring-1 ring-inset ring-gold-500 hover:bg-gold-50"
                    >
                        <Save className="-ml-0.5 mr-1.5 h-5 w-5 text-gold-500" aria-hidden="true" />
                        Salvar
                    </button>
                    <button
                        onClick={() => handleExportPDF()}
                        className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                        <FileDown className="-ml-0.5 mr-1.5 h-5 w-5 text-gray-400" aria-hidden="true" />
                        Exportar PDF
                    </button>
                </div>
            </div>

            {/* Sub-tabs for Details vs Schedule */}
            {budgetItems.length > 0 && (
                <div className="border-b border-gray-200 mb-6">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button
                            onClick={() => setActiveTab('budget')}
                            className={`${activeTab === 'budget' ? 'border-gold-500 text-gold-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                        >
                            <Settings2 className="w-4 h-4 mr-2" />
                            Detalhes do Orçamento
                        </button>
                        <button
                            onClick={() => {
                                if(schedule.length === 0) setSchedule(generateInitialSchedule(budgetItems));
                                setActiveTab('schedule');
                            }}
                            className={`${activeTab === 'schedule' ? 'border-gold-500 text-gold-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                        >
                            <CalendarDays className="w-4 h-4 mr-2" />
                            Cronograma Inteligente
                        </button>
                    </nav>
                </div>
            )}

            {/* TAB CONTENT: BUDGET DETAILS */}
            {activeTab === 'budget' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Input Panel */}
                    <div className="lg:col-span-1 space-y-6">
                        
                        {/* Source Selection */}
                        <div className="bg-white shadow rounded-lg p-6 border-l-4 border-gold-400">
                            <h3 className="text-base font-semibold leading-6 text-gray-900 flex items-center mb-4">
                                <Settings2 className="w-5 h-5 mr-2 text-gray-400" />
                                Fonte de Referência
                            </h3>
                            
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setConfig(prev => ({ ...prev, useSeinfra: true, useMarket: false }))}
                                    className={`flex-1 flex flex-col items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${config.useSeinfra ? 'bg-white text-azure-900 shadow-sm ring-1 ring-gold-400' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <span className="font-bold">SEINFRA IA</span>
                                    <span className="text-[10px] opacity-70">Tabela Oficial CE</span>
                                </button>
                                <button
                                    onClick={() => setConfig(prev => ({ ...prev, useSeinfra: false, useMarket: true }))}
                                    className={`flex-1 flex flex-col items-center justify-center py-2 text-sm font-medium rounded-md transition-all ${!config.useSeinfra ? 'bg-white text-azure-900 shadow-sm ring-1 ring-gold-400' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <span className="font-bold">BaseFOR IA</span>
                                    <span className="text-[10px] opacity-70">Mercado Fortaleza</span>
                                </button>
                            </div>
                        </div>

                        {/* Input Area AI */}
                        <div className="bg-white shadow rounded-lg p-6">
                            <label htmlFor="service-description" className="block text-sm font-medium leading-6 text-gray-900">
                                Descrição para IA
                            </label>
                            <div className="mt-2">
                                <textarea
                                    id="service-description"
                                    rows={4}
                                    className="block w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gold-600 focus:ring-1 focus:ring-gold-600 sm:text-sm sm:leading-6"
                                    placeholder="Ex: Construção de muro de alvenaria com 20m de comprimento e 2m de altura, com chapisco e reboco."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className="mt-4">
                                <button
                                    onClick={handleGenerateBudget}
                                    disabled={loading || !description}
                                    className={`w-full flex justify-center items-center rounded-md px-3 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-600 ${loading || !description ? 'bg-azure-800 opacity-70 cursor-not-allowed' : 'bg-azure-900 hover:bg-azure-800'}`}
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin -ml-1 mr-2 h-4 w-4 text-white">
                                                <svg className="circle" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                </svg>
                                            </div>
                                            Processando...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2 text-gold-400" />
                                            Gerar via IA
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Manual Add with Autocomplete */}
                        <div className="bg-white shadow rounded-lg p-6 relative">
                            <label className="block text-sm font-medium leading-6 text-gray-900 mb-2">
                                Adicionar Item Manualmente
                            </label>
                            
                            {/* Category Selector */}
                            <div className="mb-3">
                                <label htmlFor="manual-category" className="block text-xs font-medium text-gray-500 mb-1">Categoria (Etapa)</label>
                                <select
                                    id="manual-category"
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-gray-900 focus:border-gold-500 focus:outline-none focus:ring-gold-500 sm:text-sm"
                                >
                                    {CONSTRUCTION_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="relative">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        id="manual-item"
                                        className="block w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-gold-600 focus:ring-1 focus:ring-gold-600 sm:text-sm"
                                        placeholder="Digite para buscar..."
                                        value={manualItemSearch}
                                        onChange={handleManualSearchChange}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddManualGeneric()}
                                    />
                                    <button 
                                        onClick={handleAddManualGeneric}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md px-3 border border-gray-300"
                                        title="Adicionar"
                                    >
                                        <PlusCircle className="w-5 h-5" />
                                    </button>
                                </div>
                                
                                {showSuggestions && suggestionsList.length > 0 && (
                                    <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                        {suggestionsList.map((item) => (
                                            <li
                                                key={item.id}
                                                className="relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-gray-100 text-gray-900 border-b border-gray-50 last:border-0"
                                                onClick={() => handleSelectSuggestion(item)}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <span className="block truncate font-medium">{item.description}</span>
                                                        <span className="text-xs text-gray-500 bg-gray-100 px-1 rounded">{item.categoria}</span>
                                                    </div>
                                                    <span className="text-gray-500 text-xs ml-2">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(config.useSeinfra ? item.precoSeinfra : item.precoMercadoFortaleza)}
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Results Panel */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white shadow rounded-lg overflow-hidden min-h-[500px] flex flex-col">
                            <div className="px-4 py-5 border-b border-gray-200 sm:px-6 bg-gray-50 flex justify-between items-center">
                                <h3 className="text-base font-semibold leading-6 text-gray-900">
                                    Composição Analítica
                                </h3>
                                <div className="flex items-center gap-4">
                                    <div className="flex bg-gray-200 p-0.5 rounded-lg">
                                        <button
                                            onClick={() => setConfig(prev => ({ ...prev, includeMaterial: false }))}
                                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!config.includeMaterial ? 'bg-white text-azure-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Só Mão de Obra
                                        </button>
                                        <button
                                            onClick={() => setConfig(prev => ({ ...prev, includeMaterial: true }))}
                                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${config.includeMaterial ? 'bg-white text-azure-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            + Material
                                        </button>
                                    </div>
                                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                        {budgetItems.length} Itens
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 p-4">
                                <BudgetTable 
                                    items={budgetItems} 
                                    onUpdate={handleUpdateItem}
                                    onDelete={handleDeleteItem}
                                    onOptimize={handleCalculateOptimization}
                                />
                            </div>
                        </div>

                        {/* Payment Conditions */}
                        <div className="bg-white shadow rounded-lg p-6 relative group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-azure-900 rounded-l-lg"></div>
                            <h3 className="text-base font-bold text-azure-900 mb-3 pl-2">
                                Dados de Pagamento
                            </h3>
                            
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1">
                                    <textarea
                                        rows={8}
                                        className="block w-full h-full rounded-md border border-gray-300 bg-white p-3 text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-gold-600 focus:outline-none focus:ring-1 focus:ring-gold-600 sm:text-sm leading-relaxed"
                                        value={paymentTerms}
                                        onChange={(e) => setPaymentTerms(e.target.value)}
                                    />
                                </div>

                                <div className="flex-shrink-0">
                                    <ImageUpload 
                                        label="QR Code Pix (Opcional)"
                                        image={qrCodeImage}
                                        onImageChange={setQrCodeImage}
                                        className="w-full md:w-auto"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-2 max-w-[128px] text-center mx-auto">
                                        Aparecerá ao lado dos dados bancários no PDF.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: SCHEDULE */}
            {activeTab === 'schedule' && (
                <div className="bg-white shadow rounded-lg p-6 min-h-[500px]">
                     <ScheduleView 
                        schedule={schedule}
                        onUpdateTask={handleUpdateScheduleTask}
                        onReportIssue={handleReportIssue}
                     />
                </div>
            )}
        </>
        )}

        {/* --- VIEW: HISTORY --- */}
        {currentView === 'history' && (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-azure-900">Orçamentos Salvos</h2>
                    <span className="text-gray-500 text-sm">{savedBudgets.length} registros encontrados</span>
                </div>

                {savedBudgets.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-lg shadow-sm border border-gray-200">
                        <History className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum orçamento gravado ainda</h3>
                        <p className="mt-1 text-sm text-gray-500">Crie seu primeiro orçamento e clique em "Salvar".</p>
                        <div className="mt-6">
                            <button
                                onClick={() => setCurrentView('create')}
                                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-azure-900 hover:bg-azure-800"
                            >
                                <PlusCircle className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                                Novo Orçamento
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {savedBudgets.map((budget) => (
                            <div key={budget.id} className="bg-white overflow-hidden shadow rounded-lg border-l-4 border-azure-900 hover:shadow-md transition-shadow">
                                <div className="px-4 py-5 sm:p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center text-sm text-gray-500">
                                            <Calendar className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                                            {budget.date}
                                        </div>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800`}>
                                            {budget.status}
                                        </span>
                                    </div>
                                    
                                    <div className="flex items-center mb-2">
                                        <User className="h-5 w-5 text-gold-500 mr-2" />
                                        <h3 className="text-lg leading-6 font-medium text-azure-900 truncate" title={budget.clientName}>
                                            {budget.clientName}
                                        </h3>
                                    </div>
                                    
                                    <p className="mt-1 text-2xl font-semibold text-gray-900">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget.totalValue)}
                                    </p>
                                    
                                    <div className="mt-4 text-sm text-gray-500">
                                        {budget.items.length} itens orçados
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-4 py-4 sm:px-6 flex justify-between items-center border-t border-gray-200">
                                    <button 
                                        onClick={() => handleExportPDF(budget.items, budget.paymentTerms, budget.clientName, budget.schedule)}
                                        className="text-gray-600 hover:text-azure-900 text-sm font-medium flex items-center"
                                    >
                                        <FileDown className="w-4 h-4 mr-1" /> PDF
                                    </button>
                                    <div className="flex space-x-3">
                                        <button 
                                            onClick={() => handleDeleteSavedBudget(budget.id)}
                                            className="text-red-400 hover:text-red-600 transition-colors p-1"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleLoadBudget(budget)}
                                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-azure-700 bg-azure-100 hover:bg-azure-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-azure-500"
                                        >
                                            <Edit3 className="w-3 h-3 mr-1.5" />
                                            Gerir Obra
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* Modal */}
        <OptimizationModal 
            isOpen={isOptModalOpen}
            onClose={() => setIsOptModalOpen(false)}
            strategies={strategies}
            currentTotal={budgetItems.reduce((acc, i) => acc + i.total, 0)}
            onApply={handleApplyOptimization}
        />

      </main>
    </div>
  );
};

export default App;
