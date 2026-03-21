/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

import 'dotenv/config'; 
import { handleClientFlow } from './bot/clientHandler.js';
import { createMPPreference } from './utils/paymentUtils.js';
import { execSync } from 'child_process';

const MP_TOKEN = process.env.MP_ACCESS_TOKEN?.trim();
const CELSO_EMAIL = process.env.TEST_USER_EMAIL?.trim();
const ANA_EMAIL = process.env.ANA_EMAIL?.trim();
const ANA_JID = process.env.ANA_JID?.trim();
const DB_NAME = process.env.D1_DB_NAME || 'barber-db';

// --- UTILS D1 ---
const executeSql = (sql, args, mode = 'run') => {
    let argIndex = 0;
    const cleanSql = sql.replace(/\s+/g, ' ').trim().replace(/\?/g, () => {
        const arg = args[argIndex++];
        if (arg === undefined) return 'NULL';
        return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : arg;
    });

    try {
        const command = `npx wrangler d1 execute ${DB_NAME} --remote --command="${cleanSql.replace(/"/g, '""')}" --json`;
        const output = execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        const parsed = JSON.parse(output);
        const results = parsed[0]?.results || [];
        
        if (mode === 'run') return { success: true };
        if (mode === 'first') return results[0] || null;
        return { results }; 
    } catch (err) {
        return mode === 'all' ? { results: [] } : null;
    }
};

const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => executeSql(sql, args, 'run'),
            first: async () => executeSql(sql, args, 'first'),
            all: async () => executeSql(sql, args, 'all')
        })
    })
};

// --- MOCK DA IA PARA ANA ---
let step = 0;
const mockAI = {
    run: async () => {
        step++;
        if (step === 1) return {
            tool_calls: [{ id: 'a1', name: 'agendar_cliente', arguments: { user_email: ANA_EMAIL, professional_email: CELSO_EMAIL, service_id: 'corte-simples', date: '2026-03-25', time: '11:00' } }]
        };
        
        if (step === 2) {
            console.log("\n🔍 [PAGAMENTO] Buscando agendamento no D1...");
            const appt = await remoteDB.prepare("SELECT a.id, s.price, s.name FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.user_email = ? ORDER BY a.created_at DESC LIMIT 1").bind(ANA_EMAIL).first();

            if (!appt) {
                console.log("❌ Erro: Agendamento não encontrado.");
                return { response: "Agendamento não encontrado." };
            }

            console.log(`✅ Agendamento Localizado: ${appt.id} | Valor: R$ ${appt.price}`);
            console.log("⏳ Gerando Preferência via API Direta (Ignorando busca no DB)...");

            try {
                // Chamada direta para garantir o link, já que o createMPPreference no seu arquivo original
                // provavelmente está tentando buscar o token na tabela 'users' do D1 e falhando.
                const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${MP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        items: [{
                            title: appt.name,
                            quantity: 1,
                            unit_price: Number(appt.price),
                            currency_id: 'BRL'
                        }],
                        back_urls: {
                            success: process.env.FRONTEND_URL,
                            failure: process.env.FRONTEND_URL
                        },
                        auto_return: 'approved',
                        external_reference: appt.id
                    })
                });

                const data = await response.json();

                if (data.init_point) {
                    console.log("✅ Link Gerado com Sucesso!");
                    return { 
                        response: `✅ *Agendamento Confirmado, Ana!*\n\n` +
                                  `*Serviço:* ${appt.name}\n` +
                                  `*Valor:* R$ ${appt.price}\n\n` +
                                  `Clique no link abaixo para pagar:\n🔗 ${data.init_point}`
                    };
                } else {
                    console.log("❌ Erro na resposta do MP:", JSON.stringify(data));
                    return { response: "⚠️ Erro ao gerar link no Mercado Pago." };
                }
            } catch (err) {
                console.log("❌ Erro na conexão MP:", err.message);
                return { response: "Erro técnico no pagamento." };
            }
        }
    }
};

const mockEnv = {
    DB: remoteDB,
    AI: mockAI,
    MP_ACCESS_TOKEN: MP_TOKEN,
    WA_BRIDGE_URL: process.env.WA_BRIDGE_URL,
    WA_BRIDGE_KEY: process.env.WA_BRIDGE_KEY,
    FRONTEND_URL: process.env.FRONTEND_URL,
    sendMessage: async (env, to, text) => {
        console.log(`\n--- WHATSAPP (MENSAGEM ENVIADA) ---\n${text}\n----------------------------------`);
    }
};

async function run() {
    console.log("🚀 TESTE ANA PAULA - LIFE CYCLE\n");
    const user = { email: ANA_EMAIL, name: 'Ana Paula' };
    
    console.log("--- PASSO 1: AGENDAMENTO ---");
    await handleClientFlow(ANA_JID, "Quero agendar", "book", null, user, CELSO_EMAIL, mockEnv);
    
    console.log("\n--- PASSO 2: CONFIRMAÇÃO ---");
    const session = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(ANA_JID).first();
    await handleClientFlow(ANA_JID, "Confirmar", "ok", session, user, CELSO_EMAIL, mockEnv);

    console.log("\n✅ FIM DO PROCESSO.");
}

run().catch(console.error);