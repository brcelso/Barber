import { handleClientFlow } from './bot/clientHandler.js';
import { createMPPreference } from './utils/paymentUtils.js'; // Sua função de produção
import { execSync } from 'child_process';

// --- UTILITÁRIOS DE BANCO REMOTO (D1 via Wrangler) ---
const sanitizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();

const remoteDB = {
    prepare: (sql) => ({
        bind: (...args) => ({
            run: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL EXEC] ${cleanSql}`);
                const shellSql = cleanSql.replace(/"/g, '""'); 
                execSync(`npx wrangler d1 execute barber-db --remote --command="${shellSql}"`, { encoding: 'utf-8', stdio: 'inherit' });
                return { success: true };
            },
            all: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL QUERY] ${cleanSql}`);
                const shellSql = cleanSql.replace(/"/g, '""');
                const output = execSync(`npx wrangler d1 execute barber-db --remote --command="${shellSql}" --json`, { encoding: 'utf-8' });
                const parsed = JSON.parse(output);
                return { results: parsed[0]?.results || [] };
            },
            first: async () => {
                const cleanSql = sanitizeSql(sql).replace(/\?/g, () => {
                    const arg = args.shift();
                    return typeof arg === 'string' ? `'${arg.replace(/'/g, "''")}'` : (arg === null ? 'NULL' : arg);
                });
                console.log(`[SQL FIRST] ${cleanSql}`);
                const output = execSync(`npx wrangler d1 execute barber-db --remote --command="${cleanSql.replace(/"/g, '""')}" --json`, { encoding: 'utf-8' });
                const parsed = JSON.parse(output);
                return parsed[0]?.results[0] || null;
            }
        })
    })
};

// --- MOCK DA IA COM INTEGRAÇÃO DE PAGAMENTO REAL ---
let step = 0;
let lastApptId = '';

const mockAI = {
    run: async () => {
        step++;
        
        if (step === 1) { // Passo 1: IA decide agendar
            return {
                tool_calls: [{
                    id: 'c1',
                    name: 'agendar_cliente',
                    arguments: {
                        user_email: 'celsosilvajunior90@gmail.com',
                        professional_email: 'celsosilvajunior90@gmail.com',
                        service_id: 'corte-simples',
                        date: '2026-03-24',
                        time: '10:00'
                    }
                }]
            };
        }
        
        if (step === 2) { // Passo 2: IA responde com o LINK REAL
            console.log("\n🔗 [PAGAMENTO] Gerando link real via API do Mercado Pago...");
            
            // Chama sua função de produção para obter o init_point real
            const mpResult = await createMPPreference(mockEnv, remoteDB, lastApptId);
            const linkReal = mpResult.paymentUrl || "Erro ao gerar link";

            return { 
                response: `Excelente! Agendei seu Corte de Cabelo. Segue o link real de pagamento: ${linkReal}`
            };
        }

        if (step === 3) { // Passo 3: Reagendamento
            return {
                tool_calls: [
                    { id: 'c2_c', name: 'alterar_status_agendamento', arguments: { appointment_id: lastApptId, status: 'cancelled' } },
                    { id: 'c2_b', name: 'agendar_cliente', arguments: { 
                        user_email: 'celsosilvajunior90@gmail.com', 
                        professional_email: 'celsosilvajunior90@gmail.com', 
                        service_id: 'corte-simples', 
                        date: '2026-03-24', 
                        time: '11:00' 
                    } }
                ]
            };
        }
        
        return { response: "Tudo pronto! Seu horário foi atualizado." };
    }
};

// --- CONFIGURAÇÃO DO AMBIENTE ---
const mockEnv = {
    DB: remoteDB,
    AI: mockAI,
    WA_BRIDGE_KEY: 'universal-secret-key', // A chave que o seu wa-bridge exige
    WA_BRIDGE_URL: 'https://nisi-marbly-maeve.ngrok-free.dev', // URL real do seu bridge
    // Use um token real do MP (começando com APP_USR- ou TEST-)
    MP_ACCESS_TOKEN: 'APP_USR-6057655577759400-032115-f4387f31592e76678407673647474556-398452977', 
    FRONTEND_URL: 'https://brcelso.github.io/Universal-Scheduler/',
    
    // Injeção manual da função sendMessage caso o import do index.js falhe no ambiente de teste
    sendMessage: async (env, to, text, professionalEmail) => {
        console.log(`\n[BRIDGE SEND] Tentando enviar para ${to}...`);
        try {
            const res = await fetch(`${env.WA_BRIDGE_URL}/send`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${env.WA_BRIDGE_KEY}`,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    to: to, 
                    text: text, 
                    professionalEmail: professionalEmail 
                })
            });
            const data = await res.json();
            console.log(`[BRIDGE RESPONSE] Status: ${res.status}`, data);
            return data;
        } catch (err) {
            console.error(`[BRIDGE ERROR] Falha ao conectar no bridge: ${err.message}`);
        }
    }
};

// --- EXECUÇÃO DO TESTE ---
async function runCelsoTest() {
    console.log("🚀 INICIANDO TESTE REAL PARA CELSO (CONEXÃO D1 + MERCADO PAGO)\n");
    
    const celsoJid = '5511972509876@s.whatsapp.net';
    const celsoEmail = 'celsosilvajunior90@gmail.com';
    const userInDb = { email: celsoEmail, name: 'Celso Silva Junior', phone: '11972509876' };

    // 1. OI
    console.log("\n--- PASSO 1: OI ---");
    await handleClientFlow(celsoJid, "Oi", "oi", null, userInDb, celsoEmail, mockEnv);

    // 2. AGENDAR
    console.log("\n--- PASSO 2: AGENDAR ---");
    const session1 = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(celsoJid).first();
    await handleClientFlow(celsoJid, "Quero um corte amanhã às 10h", "agendar", session1, userInDb, celsoEmail, mockEnv);
    
    // Capturar o ID gerado para que a função de pagamento possa usá-lo no Mock Step 2
    const appt = await remoteDB.prepare("SELECT id FROM appointments WHERE user_email = ? ORDER BY created_at DESC LIMIT 1").bind(celsoEmail).first();
    lastApptId = appt?.id;

    // 3. REAGENDAR (IA vai chamar o Passo 2 do Mock e gerar o link real)
    console.log("\n--- PASSO 3: GERAR LINK E RESPONDER ---");
    const session2 = await remoteDB.prepare("SELECT * FROM whatsapp_sessions WHERE phone = ?").bind(celsoJid).first();
    await handleClientFlow(celsoJid, "Confirmar agendamento", "ok", session2, userInDb, celsoEmail, mockEnv);

    console.log("\n✅ TESTE FINALIZADO COM SUCESSO.");
}

runCelsoTest();