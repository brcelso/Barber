import { getSmartContext } from './rag.js';

// Mock DB
const mockDB = {
    prepare: (sql) => ({
        bind: () => ({
            all: async () => {
                if (sql.includes('services')) return { results: [{ id: 'corte', name: 'Corte', price: 50, duration_minutes: 30 }] };
                if (sql.includes('users WHERE is_admin = 1')) return { results: [{ name: 'Unidade Alpha', email: 'alpha@test.com', plan: 'pro' }, { name: 'Unidade Beta', email: 'beta@test.com', plan: 'standard' }] };
                if (sql.includes('appointments')) return { results: [{ appointment_date: '2024-03-20', appointment_time: '14:00', service_name: 'Corte', status: 'confirmed' }] };
                return { results: [] };
            },
            first: async () => {
                if (sql.includes('users WHERE is_admin = 1')) return { total_units: 2 };
                return null;
            }
        }),
        all: async () => {
             if (sql.includes('users WHERE is_admin = 1')) return { results: [{ name: 'Unidade Alpha', email: 'alpha@test.com', plan: 'pro' }, { name: 'Unidade Beta', email: 'beta@test.com', plan: 'standard' }] };
             return { results: [] };
        },
        first: async () => {
             if (sql.includes('COUNT(*)')) return { total_units: 2 };
             return null;
        }
    })
};

async function testRAG() {
    console.log('🧪 Testando RAG (Role-Based)...');

    // 1. Cliente Normal (Busca serviços da unidade)
    console.log('\n--- Teste 1: Cliente Normal ---');
    const clientContext = await getSmartContext(mockDB, "Quais os serviços?", "unidade@teste.com");
    console.log(clientContext);
    if (clientContext.includes('CATÁLOGO DE SERVIÇOS') && clientContext.includes('Corte')) {
        console.log('✅ RAG Cliente: OK');
    } else {
        console.log('❌ RAG Cliente: FALHOU');
    }

    // 2. Master (Busca unidades globais)
    console.log('\n--- Teste 2: Master (Global) ---');
    const masterContext = await getSmartContext(mockDB, "Quais as unidades?", "celsosilvajunior90@gmail.com");
    console.log(masterContext);
    if (masterContext.includes('UNIDADES DO ECOSSISTEMA') && masterContext.includes('Unidade Alpha')) {
        console.log('✅ RAG Master (Unidades): OK');
    } else {
        console.log('❌ RAG Master (Unidades): FALHOU');
    }

    // 4. Histórico (Novo!)
    console.log('\n--- Teste 4: Histórico do Cliente ---');
    const historyContext = await getSmartContext(mockDB, "Qual meu último horário?", "unidade@teste.com", "cliente@teste.com");
    console.log(historyContext);
    if (historyContext.includes('HISTÓRICO DO CLIENTE')) {
        console.log('✅ RAG Histórico: OK');
    } else {
        console.log('❌ RAG Histórico: FALHOU');
    }
}

testRAG().catch(console.error);
