/**
 * AI Flow Verification - Sequence Test
 */
import { runAgentChat } from './agent.js';

const mockDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            all: async () => {
                if (sql.includes("FROM services")) return { results: [{ id: 'corte-1', name: 'Corte', price: 50 }] };
                if (sql.includes("FROM users")) return { results: [{ name: 'Celso', email: 'celso@exemplo.com' }] };
                if (sql.includes("FROM availability")) return { results: [{ day_of_week: 1, start_time: '08:00', end_time: '18:00' }] };
                if (sql.includes("FROM appointments")) return { results: [] };
                return { results: [] };
            },
            first: async () => {
                if (sql.includes("FROM services")) return { id: 'corte-1' };
                if (sql.includes("FROM users")) return { email: 'celso@exemplo.com', is_barber: 1 };
                return null;
            },
            run: async () => ({ success: true })
        })
    })
};

const mockAI = {
    run: async (model, { messages, tools }) => {
        // Simular que o modelo quer verificar a agenda primeiro
        if (messages.length < 5) {
            return {
                tool_calls: [{
                    id: 'call_1',
                    name: 'consultar_agenda',
                    arguments: { appointment_date: '2026-10-10', professional_email: 'celso@exemplo.com' }
                }]
            };
        }
        // Simular que após o resultado da ferramenta, o modelo quer agendar
        if (messages.some(m => m.role === 'tool' && m.name === 'consultar_agenda')) {
             return {
                tool_calls: [{
                    id: 'call_2',
                    name: 'agendar_cliente',
                    arguments: { 
                        user_email: 'cliente@teste.com',
                        professional_email: 'celso@exemplo.com',
                        service_id: 'corte-1',
                        date: '2026-10-10',
                        time: '14:00'
                    }
                }]
            };
        }
        return { response: "Agendado! Aqui está o link: https://test.dev/pay/appt_123" };
    }
};

const mockEnv = {
    DB: mockDB,
    AI: mockAI,
    MP_ACCESS_TOKEN: 'test_token',
    FRONTEND_URL: 'https://test.dev'
};

async function testFlow() {
    console.log("🧪 Testando Fluxo de IA...");
    const result = await runAgentChat(mockEnv, {
        prompt: "Quero agendar um corte com o Celso dia 10/10 as 14h",
        userEmail: "cliente@teste.com",
        isAdmin: false,
        professionalContext: { professionalEmail: "celso@exemplo.com", establishmentName: "Barbearia", bName: "Bot", bTone: "amigável" }
    });

    console.log("Response text:", result.text);
    if (result.tool_calls.some(c => c.name === 'consultar_agenda')) {
        console.log("✅ Primeiro passo: Consultou a agenda.");
    }
    
    // Simular a segunda parte (após o resultado da ferramenta)
    // No código real, runAgentChat chama a IA de novo automaticamente se houver tool_calls.
    // O retorno de runAgentChat contém as tool_calls e tool_results.
    
    if (result.tool_calls.some(c => c.name === 'agendar_cliente')) {
        console.log("✅ Segundo passo: Realizou o agendamento.");
    }

    if (result.tool_results.some(r => r.name === 'agendar_cliente' && r.content.includes("complemento"))) {
        console.log("✅ Sucesso: O resultado da ferramenta contém o link de pagamento.");
    }

    console.log("✨ Teste de fluxo concluído.");
}

testFlow().catch(console.error);
