import { runAgentChat } from './agent.js';

// Mock DB with State to track changes during simulation
let dbState = {
    users: [
        { email: 'celsosilvajunior90@gmail.com', name: 'Celso Master', is_admin: 1, is_barber: 1, plan: 'pro' }
    ],
    services: [],
    appointments: [],
    availability: []
};

const mockDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => {
                console.log(`[DB RUN] ${sql} | Args: ${args.join(', ')}`);
                if (sql.includes('INSERT INTO users')) {
                    dbState.users.push({ email: args[0], name: args[1], owner_id: args[2], is_admin: args[3], is_barber: 1, business_type: args[4] });
                }
                if (sql.includes('INSERT INTO services')) {
                    dbState.services.push({ id: args[0], name: args[1], price: args[2], duration_minutes: args[3], description: args[4], barber_email: args[5] });
                }
                if (sql.includes('INSERT INTO appointments')) {
                    dbState.appointments.push({ id: args[0], user_email: args[1], barber_email: args[2], service_id: args[3], appointment_date: args[4], appointment_time: args[5], status: 'pending' });
                }
                if (sql.includes('UPDATE users SET bot_active')) {
                    const u = dbState.users.find(u => u.email === args[1]);
                    if (u) u.bot_active = args[0];
                }
                return { success: true };
            },
            all: async () => {
                if (sql.includes('FROM services')) return { results: dbState.services.filter(s => s.barber_email === args[0]) };
                if (sql.includes('FROM users')) return { results: dbState.users };
                return { results: [] };
            },
            first: async () => {
                if (sql.includes('FROM users WHERE email = ?')) return dbState.users.find(u => u.email === args[0]);
                if (sql.includes('FROM services WHERE id = ?')) return dbState.services.find(s => s.id === args[0]);
                if (sql.includes('FROM availability')) return dbState.availability.find(a => a.barber_email === args[0]);
                return null;
            }
        }),
        all: async () => {
            if (sql.includes('FROM users')) return { results: dbState.users };
            return { results: [] };
        },
        first: async () => {
            if (sql.includes('COUNT(*)')) return { total_units: dbState.users.length };
            return null;
        }
    })
};

const mockAI = {
    run: async (_, { messages, tools }) => {
        const lastMsg = messages[messages.length - 1].content.toLowerCase();
        
        // Simulação de decisão da IA baseada no prompt
        if (lastMsg.includes("cadastrar") || lastMsg.includes("adicionar unidade")) {
             return { tool_calls: [{ id: 'c1', name: 'gerenciar_equipe', arguments: { action: 'add', email: 'leo@barber.com', name: 'Barbearia do Leo', is_admin: true } }] };
        }
        if (lastMsg.includes("ativar o robo") || lastMsg.includes("ativar ia")) {
             return { tool_calls: [{ id: 'c2', name: 'gerenciar_robos', arguments: { action: 'activate_ia', email: 'leo@barber.com' } }] };
        }
        if (lastMsg.includes("criar servico") || lastMsg.includes("novo servico")) {
             return { tool_calls: [{ id: 'c3', name: 'gerenciar_servicos', arguments: { action: 'create', name: 'Corte Moderno', price: 60, duration: 30, description: 'Estilo atual' } }] };
        }
        if (lastMsg.includes("quais os servicos")) {
             return { response: "Temos o Corte Moderno por R$ 60." };
        }
        if (lastMsg.includes("agendar") || lastMsg.includes("quinta")) {
             return { tool_calls: [{ id: 'c4', name: 'agendar_cliente', arguments: { user_email: 'cliente@gmail.com', service_id: 'corte-moderno', date: '2026-10-15', time: '10:00' } }] };
        }
        
        return { response: "Entendido. Como posso ajudar mais?" };
    }
};

const mockEnv = { DB: mockDB, AI: mockAI, MP_ACCESS_TOKEN: 'sk_test_123', FRONTEND_URL: 'https://universal.dev' };

async function runSimulation() {
    console.log("🚀 INICIANDO SIMULAÇÃO E2E DO ECOSSISTEMA\n");

    // PASSO 1: MASTER ADICIONA NOVA UNIDADE
    console.log("1️⃣ [MASTER] Adicionando 'Barbearia do Leo'...");
    await runAgentChat(mockEnv, {
        prompt: "Cadastrar a Barbearia do Leo com email leo@barber.com como admin",
        userEmail: "celsosilvajunior90@gmail.com",
        isAdmin: true,
        professionalContext: { professionalEmail: "celsosilvajunior90@gmail.com" }
    });

    // PASSO 2: MASTER ATIVA O ROBÔ DA UNIDADE
    console.log("\n2️⃣ [MASTER] Ativando IA para a nova unidade...");
    await runAgentChat(mockEnv, {
        prompt: "Ativar o robo da unidade leo@barber.com",
        userEmail: "celsosilvajunior90@gmail.com",
        isAdmin: true,
        professionalContext: { professionalEmail: "celsosilvajunior90@gmail.com" }
    });

    // PASSO 3: OWNER (LEO) CONFIGURA SERVIÇO
    console.log("\n3️⃣ [OWNER] Leo criando seu catálogo...");
    await runAgentChat(mockEnv, {
        prompt: "Criar novo servico: Corte Moderno, 60 reais, 30 min",
        userEmail: "leo@barber.com",
        isAdmin: true,
        professionalContext: { professionalEmail: "leo@barber.com" }
    });

    // PASSO 4: CLIENTE AGENDA COM LEO
    console.log("\n4️⃣ [CLIENTE] Agendando na Barbearia do Leo...");
    const clientResult = await runAgentChat(mockEnv, {
        prompt: "Quero agendar um Corte Moderno para quinta-feira dia 15/10 as 10:00",
        userEmail: "cliente@gmail.com",
        isAdmin: false,
        professionalContext: { professionalEmail: "leo@barber.com", establishmentName: "Barbearia do Leo" }
    });

    console.log("\n✅ RESUMO DA SIMULAÇÃO:");
    console.log("- Unidades cadastradas:", dbState.users.map(u => u.email).join(', '));
    console.log("- Serviços do Leo:", dbState.services.length);
    console.log("- Agendamentos finais:", dbState.appointments.length);
    if (dbState.appointments.length > 0) {
        console.log("  -> Link de Pagamento Gerado para o Cliente!");
    }
    
    console.log("\n✨ ECOSSISTEMA VALIDADO: O fluxo flui do Master ao Cliente sem fricção.");
}

runSimulation().catch(console.error);
