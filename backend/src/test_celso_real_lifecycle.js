/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
import 'dotenv/config'; 
import { handleClientFlow } from './bot/clientHandler.js';
import { createMPPreference } from './utils/paymentUtils.js';
import { execSync } from 'child_process';

// --- VALIDAÇÃO ---
const MP_TOKEN = process.env.MP_ACCESS_TOKEN?.trim();
const EMAIL_TESTE = process.env.TEST_USER_EMAIL?.trim();
const JID_TESTE = process.env.TEST_USER_JID?.trim();
const DB_NAME = process.env.D1_DB_NAME || 'barber-db';

if (!EMAIL_TESTE || !MP_TOKEN) {
    console.error("❌ ERRO: Verifique TEST_USER_EMAIL e MP_ACCESS_TOKEN no .env");
    process.exit(1);
}

// --- UTILS D1 (PADRÃO WINDOWS) ---
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
    } catch (err) { return mode === 'all' ? { results: [] } : null; }
};

const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => executeSql(sql, args, 'run'),
            all: async () => executeSql(sql, args, 'all'),
            first: async () => executeSql(sql, args, 'first')
        })
    })
};

// --- MOCK DA IA ---
let step = 0;
const mockAI = {
    run: async () => {
        step++;
        if (step === 1) return {
            tool_calls: [{ id: 'c1', name: 'agendar_cliente', arguments: { user_email: EMAIL_TESTE, professional_email: EMAIL_TESTE, service_id: 'corte-simples', date: '2026-03-24', time: '10:00' } }]
        };
        
        if (step === 2) {
            console.log("\n🔗 [PAGAMENTO] Gerando link com detalhamento...");
            
            const appt = await remoteDB.prepare(`
                SELECT a.id, a.appointment_date, a.appointment_time, s.name as service_name, s.price 
                FROM appointments a 
                JOIN services s ON a.service_id = s.id 
                WHERE a.user_email = ? 
                ORDER BY a.created_at DESC LIMIT 1
            `).bind(EMAIL_TESTE).first();

            if (!appt) return { response: "Ops, não encontrei seu agendamento." };

            // Formatação da data para o padrão brasileiro (DD/MM)
            const [ano, mes, dia] = appt.appointment_date.split('-');
            const dataFormatada = `${dia}/${mes}`;
            const precoFinal = parseFloat(appt.price).toFixed(2);

            try {
                // Chamada Direta à API do Mercado Pago
                const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${MP_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        items: [{
                            title: `Agendamento: ${appt.service_name}`,
                            quantity: 1,
                            unit_price: Number(precoFinal),
                            currency_id: 'BRL'
                        }],
                        back_urls: {
                            success: process.env.FRONTEND_URL || "https://google.com",
                            failure: process.env.FRONTEND_URL || "https://google.com"
                        },
                        auto_return: 'approved',
                        external_reference: appt.id
                    })
                });

                const data = await response.json();

                if (data.init_point) {
                    console.log("✅ LINK GERADO COM SUCESSO!");
                    
                    // RESPOSTA DETALHADA PARA O CLIENTE
                    return { 
                        response: `✅ *Agendamento Confirmado!*\n\n` +
                                  `📍 *Serviço:* ${appt.service_name}\n` +
                                  `📅 *Data:* ${dataFormatada}\n` +
                                  `⏰ *Horário:* ${appt.appointment_time}h\n` +
                                  `💰 *Valor:* R$ ${precoFinal.replace('.', ',')}\n\n` +
                                  `Clique no link abaixo para realizar o pagamento:\n🔗 ${data.init_point}`
                    };
                } else {
                    console.error("❌ ERRO MP:", JSON.stringify(data));
                    return { response: "⚠️ Erro ao gerar link de pagamento no Mercado Pago." };
                }
            } catch (err) {
                console.error("❌ ERRO NO FETCH:", err.message);
                return { response: "⚠️ Falha técnica ao processar pagamento." };
            }
        }
        return { response: "Processo concluído." };
    }
};

const mockEnv = {
    DB: remoteDB, AI: mockAI,
    WA_BRIDGE_KEY: process.env.WA_BRIDGE_KEY,
    WA_BRIDGE_URL: process.env.WA_BRIDGE_URL,
    MP_ACCESS_TOKEN: MP_TOKEN, // Backup se a função não achar no DB
    FRONTEND_URL: process.env.FRONTEND_URL,
    sendMessage: async (e, to, text) => console.log(`\n[WHATSAPP]:\n${text}\n-------------------------`)
};

async function runCelsoTest() {
    const userInDb = { email: EMAIL_TESTE, name: 'Celso Silva Junior', phone: JID_TESTE.split('@')[0] };
    console.log("🚀 INICIANDO TESTE REAL: CELSO\n");
    await handleClientFlow(JID_TESTE, "Quero agendar", "agendar", null, userInDb, EMAIL_TESTE, mockEnv);
    const session = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(JID_TESTE).first();
    await handleClientFlow(JID_TESTE, "Confirmar", "ok", session, userInDb, EMAIL_TESTE, mockEnv);
}

runCelsoTest().catch(console.error);