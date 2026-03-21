/**
 * Phase 1 Verification Script
 * Testa as melhorias de RAG, Prompt CoT e Output Shield.
 */

import { getSmartContext } from './rag.js';
import { TOOL_ACTIONS } from './toolActions.js';

// MOCK DO BANCO DE DADOS D1
const mockDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            all: async () => {
                if (sql.includes("FROM services")) return { results: [{ id: 'corte-123', name: 'Corte Social', price: 50, duration_minutes: 30 }] };
                if (sql.includes("FROM users")) return { results: [{ name: 'Celso', email: 'celso@exemplo.com' }] };
                if (sql.includes("FROM availability")) return { results: [{ day_of_week: 1, start_time: '08:00', end_time: '18:00' }] };
                return { results: [] };
            },
            first: async () => {
                if (sql.includes("FROM services") && args[0] === 'corte-123') return { id: 'corte-123' };
                if (sql.includes("FROM users") && args[0] === 'celso@exemplo.com') return { email: 'celso@exemplo.com' };
                return null;
            },
            run: async () => ({ success: true })
        })
    })
};

const mockEnv = {
    MP_ACCESS_TOKEN: 'test_token',
    FRONTEND_URL: 'https://test.dev'
};

async function runTests() {
    console.log("🧪 Iniciando Testes de Verificação - Fase 1\n");

    // 1. Teste de RAG (Contexto Inteligente)
    console.log("1. Testando RAG...");
    const context = await getSmartContext(mockDB, "Quais serviços você tem e qual o preço?", "celso@exemplo.com");
    if (context.includes("Corte Social") && context.includes("R$ 50")) {
        console.log("✅ RAG injetou contexto de serviços corretamente.");
    } else {
        console.log("❌ Falha no teste de RAG.");
    }

    // 2. Teste de Output Shield (Serviço Inexistente)
    console.log("\n2. Testando Output Shield (Serviço Inexistente)...");
    const resError = await TOOL_ACTIONS.agendar_cliente({
        args: { service_id: "servico-que-nao-existe", date: "2026-10-10", time: "14:00", user_email: "cliente@teste.com" },
        DB: mockDB,
        env: mockEnv,
        emailReal: "celso@exemplo.com"
    });
    if (resError.status === "erro" && resError.msg.includes("não foi encontrado")) {
        console.log("✅ Output Shield bloqueou serviço inexistente.");
    } else {
        console.log("❌ Falha ao bloquear serviço inexistente.");
    }

    // 3. Teste de Output Shield (Data Passada)
    console.log("\n3. Testando Output Shield (Data Passada)...");
    const resPast = await TOOL_ACTIONS.agendar_cliente({
        args: { service_id: "corte-123", date: "2020-01-01", time: "10:00", user_email: "cliente@teste.com" },
        DB: mockDB,
        env: mockEnv,
        emailReal: "celso@exemplo.com"
    });
    if (resPast.status === "erro" && resPast.msg.includes("já passaram")) {
        console.log("✅ Output Shield bloqueou agendamento no passado.");
    } else {
        console.log("❌ Falha ao bloquear agendamento no passado.");
    }

    // 4. Teste de Sucesso
    console.log("\n4. Testando Sucesso de Agendamento...");
    const resSuccess = await TOOL_ACTIONS.agendar_cliente({
        args: { service_id: "corte-123", date: "2026-12-25", time: "15:00", user_email: "cliente@teste.com" },
        DB: mockDB,
        env: mockEnv,
        emailReal: "celso@exemplo.com"
    });
    if (resSuccess.status === "sucesso" && resSuccess.id.startsWith("appt_")) {
        console.log("✅ Agendamento válido processado com sucesso.");
    } else {
        console.log("❌ Falha ao processar agendamento válido.");
    }

    console.log("\n✨ Verificação concluída.");
}

runTests().catch(err => console.error("💥 Erro durante os testes:", err));
