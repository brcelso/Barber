/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */

import 'dotenv/config'; 
import { handleClientFlow } from './bot/clientHandler.js';
import { createMPPreference } from './utils/paymentUtils.js'; 
import { execSync } from 'child_process';

// --- VALIDAÇÃO ---
if (!process.env.RICARDO_EMAIL || !process.env.MP_ACCESS_TOKEN) {
    console.error("❌ ERRO: Verifique RICARDO_EMAIL e MP_ACCESS_TOKEN no .env");
    process.exit(1);
}

const DB_NAME = process.env.D1_DB_NAME || 'barber-db';

// --- UTILITÁRIOS D1 (ANTI-CRASH WINDOWS) ---
const executeSql = (sql, args, mode = 'run') => {
    const cleanSql = sql.replace(/\s+/g, ' ').trim().replace(/\?/g, () => {
        const arg = args.shift();
        if (arg === undefined) return 'NULL';
        return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : arg;
    });

    try {
        const command = `npx wrangler d1 execute ${DB_NAME} --remote --command="${cleanSql.replace(/"/g, '""')}" --json`;
        const output = execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        if (mode === 'run') return { success: true };
        const parsed = JSON.parse(output);
        const results = parsed[0]?.results || [];
        return mode === 'first' ? (results[0] || null) : { results };
    } catch (err) {
        return mode === 'first' ? null : { results: [] };
    }
};

const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => executeSql(sql, [...args], 'run'),
            all: async () => executeSql(sql, [...args], 'all'),
            first: async () => executeSql(sql, [...args], 'first')
        })
    })
};

// --- MOCK IA REFINADO PARA RICARDO ---
let step = 0;
let lastApptId = '';

const mockAI = {
    run: async (input) => { 
        step++;
        const ricardoEmail = process.env.RICARDO_EMAIL;
        const celsoEmail = process.env.TEST_USER_EMAIL; 

        if (step === 1) { // SOLICITAÇÃO DE AGENDAMENTO
            return {
                tool_calls: [{
                    id: 'ricardo_c1',
                    name: 'agendar_cliente',
                    arguments: {
                        user_email: ricardoEmail,
                        professional_email: celsoEmail,
                        service_id: 'corte-simples',
                        date: '2026-03-23',
                        time: '14:00'
                    }
                }]
            };
        }
        
        if (step === 2) { // CONFIRMAÇÃO COM DETALHES + LINK
            console.log("\n🔗 [PAGAMENTO] Gerando link para Ricardo...");
            
            const appt = await remoteDB.prepare(`
                SELECT a.id, a.appointment_date, a.appointment_time, s.name as service_name, s.price 
                FROM appointments a 
                JOIN services s ON a.service_id = s.id 
                WHERE a.user_email = ? AND a.status = 'pending'
                ORDER BY a.created_at DESC LIMIT 1
            `).bind(ricardoEmail).first();

            if (!appt) return { response: "Ricardo, houve um erro ao processar seu agendamento no banco." };

            const mpResult = await createMPPreference(mockEnv, remoteDB, appt.id);
            const link = mpResult.paymentUrl || "Link indisponível no momento";
            
            const [y, m, d] = appt.appointment_date.split('-');

            return { 
                response: `✅ *Agendamento Confirmado, Ricardo!*\n\n` +
                          `*Serviço:* ${appt.service_name}\n` +
                          `*Valor:* R$ ${appt.price}\n` +
                          `*Data:* ${d}/${m}\n` +
                          `*Horário:* ${appt.appointment_time}h\n\n` +
                          `Para finalizar, pague pelo link abaixo:\n🔗 ${link}`
            };
        }

        if (step === 3) { // REAGENDAMENTO
            return {
                tool_calls: [
                    {
                        id: 'ric_cancel',
                        name: 'alterar_status_agendamento',
                        arguments: { appointment_id: lastApptId, status: 'cancelled' }
                    },
                    {
                        id: 'ric_new',
                        name: 'agendar_cliente',
                        arguments: {
                            user_email: ricardoEmail,
                            professional_email: celsoEmail,
                            service_id: 'corte-simples',
                            date: '2026-03-23',
                            time: '16:00'
                        }
                    }
                ]
            };
        }
        
        return { response: "Ricardo, seu horário foi alterado para as 16h! O link anterior foi invalidado." };
    }
};

const mockEnv = {
    DB: remoteDB,
    AI: mockAI,
    WA_BRIDGE_KEY: process.env.WA_BRIDGE_KEY,
    WA_BRIDGE_URL: process.env.WA_BRIDGE_URL,
    MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
    FRONTEND_URL: process.env.FRONTEND_URL,
    sendMessage: async (env, to, text, profEmail) => {
        console.log(`\n[WHATSAPP PARA RICARDO]:\n${text}\n-------------------------`);
        return { success: true };
    }
};

async function runRicardoTest() {
    console.log("🚀 TESTE E2E COMPLETO: RICARDO ZACCHI\n");
    
    const ricardoJid = process.env.RICARDO_JID;
    const ricardoEmail = process.env.RICARDO_EMAIL;
    const celsoEmail = process.env.TEST_USER_EMAIL;
    const userInDb = { email: ricardoEmail, name: 'Ricardo Zacchi' };

    console.log("--- PASSO 1: AGENDAMENTO E LINK ---");
    // Primeiro contato para agendar
    await handleClientFlow(ricardoJid, "Quero um corte para segunda às 14h", "book", null, userInDb, celsoEmail, mockEnv);

    // Pegar ID do agendamento
    const lastAppt = await remoteDB.prepare("SELECT id FROM appointments WHERE user_email = ? ORDER BY created_at DESC LIMIT 1").bind(ricardoEmail).first();
    lastApptId = lastAppt?.id;

    if (lastApptId) {
        console.log("\n--- PASSO 2: MUDANÇA DE PLANOS ---");
        const session = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(ricardoJid).first();
        step = 2; // Prepara o Mock AI para o Passo 3 do código (Reagendamento)
        await handleClientFlow(ricardoJid, "Consegue mudar para as 16h?", "reschedule", session, userInDb, celsoEmail, mockEnv);
    }

    console.log("\n✅ TESTE DO RICARDO FINALIZADO.");
}

runRicardoTest().catch(console.error);