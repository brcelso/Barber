const { exec, spawn } = require('child_process');
const readline = require('readline');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// 1. Carregar variáveis do .env (Garante que busca na raiz do projeto)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const API_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'celsosilvajunior90@gmail.com'; 
const FIXED_DOMAIN = 'nisi-marbly-maeve.ngrok-free.dev'; // Seu domínio fixo ngrok

// --- GERENCIADOR DE INPUT ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// --- PARSE ARGUMENTOS ---
let PAIR_PHONE = process.argv.find(arg => arg.startsWith('--pair='))?.split('=')[1];

let ngrokProcess = null;
let whatsappProcess = null;
let isActive = false;

// --- FUNÇÃO DE LICENCIAMENTO ---
async function checkLicense() {
    try {
        const res = await axios.get(`${API_URL}/admin/subscription`, {
            headers: { 'X-User-Email': ADMIN_EMAIL },
            timeout: 10000
        });
        return res.data;
    } catch (e) {
        console.error(`❌ Falha na conexão (${new Date().toLocaleTimeString()}):`, e.message);
        return null;
    }
}

// --- FUNÇÃO DE LIMPEZA (ROBUSTEZ) ---
function cleanupOldProcesses() {
    return new Promise((resolve) => {
        console.log('🧹 Limpando processos antigos (Ngrok/Node)...');
        const isWin = process.platform === 'win32';
        
        // No Windows, mata ngrok.exe. No Linux/Mac, mata apenas no final se necessário.
        const cmd = isWin 
            ? 'taskkill /F /IM ngrok.exe /T 2>nul & taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*" /T 2>nul' 
            : 'pkill -f ngrok || true';

        exec(cmd, (err) => {
            // Ignoramos erros se não houver nada para matar
            resolve();
        });
    });
}

// --- FUNÇÃO NGROK (COM CORREÇÃO DE DOMÍNIO E AUTH) ---
function startNgrok() {
    return new Promise((resolve) => {
        console.log('🌐 Iniciando Túnel Ngrok...');

        const authtoken = process.env.NGROK_AUTHTOKEN;
        
        // Comando: ngrok http 3000 --domain=... --authtoken=...
        const args = ['http', '3000', `--domain=${FIXED_DOMAIN}`];
        
        if (authtoken) {
            console.log('🔑 Usando Authtoken do .env');
            args.push('--authtoken', authtoken);
        } else {
            console.warn('⚠️ NGROK_AUTHTOKEN não encontrado no .env! O domínio fixo pode falhar.');
        }

        const ngrokExe = process.env.NGROK_PATH || 'ngrok';
        ngrokProcess = spawn(ngrokExe, args);

        ngrokProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('online')) console.log('✅ Ngrok está ONLINE.');
        });

        ngrokProcess.stderr.on('data', (data) => {
            const err = data.toString();
            if (err.includes('ERR_NGROK')) {
                console.error(`❌ Erro Crítico Ngrok: ${err.trim()}`);
            }
        });

        // Espera o Ngrok estabilizar e pega a URL da API interna dele
        setTimeout(async () => {
            try {
                const res = await axios.get('http://127.0.0.1:4040/api/tunnels');
                const url = res.data.tunnels[0].public_url;
                console.log(`🚀 Túnel Ativo: ${url}`);
                resolve(url);
            } catch (e) {
                console.error('❌ Erro ao capturar URL. Verifique se a porta 4040 está livre.');
                resolve(null);
            }
        }, 5000);
    });
}

// --- FUNÇÃO WHATSAPP (PONTE) ---
async function startWhatsApp() {
    console.log('📱 Iniciando Ponte WhatsApp (index.js)...');
    const nodeExe = process.env.NODE_PATH || 'node';
    
    // Executa o index.js da ponte
    whatsappProcess = exec(`"${nodeExe}" index.js`, {
        env: { 
            ...process.env, 
            ADMIN_EMAIL: ADMIN_EMAIL,
            WA_PAIRING_PHONE: PAIR_PHONE // <--- Passa o número se existir
        }
    });

    whatsappProcess.stdout.on('data', (data) => process.stdout.write(`[WhatsApp] ${data}`));
    whatsappProcess.stderr.on('data', (data) => process.stderr.write(`[WhatsApp Error] ${data}`));

    whatsappProcess.on('close', (code) => {
        console.log(`\nPonte fechada (Código: ${code})`);
        whatsappProcess = null;
        if (isActive) {
            console.log('⚠️ Serviço interrompido. Verifique o terminal para erros.');
            console.log('⏳ Reiniciando gerenciador em 30s...');
            setTimeout(() => { isActive = false; }, 30000);
        }
    });
}

function stopAll() {
    console.log('\n🛑 Desligando serviços...');
    if (ngrokProcess) ngrokProcess.kill();
    if (whatsappProcess) whatsappProcess.kill();
    process.exit();
}

// --- LOOP PRINCIPAL ---
async function run() {
    console.log('--- GERENCIADOR UNIVERSAL BRIDGE ---');
    
    // Verificação de Sessão Existente para o Admin
    const safeId = Buffer.from(ADMIN_EMAIL).toString('hex');
    const sessionDir = path.join(__dirname, 'auth_sessions', `session_${safeId}`);
    const hasSession = fs.existsSync(sessionDir);

    if (!PAIR_PHONE) {
        console.log(`\n📍 Admin: ${ADMIN_EMAIL}`);
        if (hasSession) {
            console.log(`✅ Sessão anterior encontrada.`);
            console.log(`[0] Continuar conexão existente (Padrão)`);
            console.log(`[1] Novo QR Code (Desconectar e gerar novo)`);
            console.log(`[2] Novo Código de Pareamento (Desconectar e gerar código Mobile)`);
            
            const choice = await question('\nDigite sua opção (0, 1 ou 2) [Enter para 0]: ');
            if (choice === '1' || choice === '2') {
                console.log('🧹 Limpando sessão anterior para nova conexão...');
                fs.rmSync(sessionDir, { recursive: true, force: true });
                if (choice === '2') {
                    PAIR_PHONE = await question('Digite o número do WhatsApp (ex: 5511999998888): ');
                }
            }
        } else {
            console.log(`👋 Nenhuma sessão encontrada para ${ADMIN_EMAIL}`);
            console.log(`[1] QR Code (Desktop)`);
            console.log(`[2] Código de Pareamento (Mobile)`);
            const choice = await question('\nDigite sua opção (1 ou 2): ');
            if (choice === '2') {
                PAIR_PHONE = await question('Digite o número do WhatsApp (ex: 5511999998888): ');
            }
        }
    }

    // Detecção de Nuvem (Railway/Render)
    const IS_CLOUD = process.env.RAILWAY_STATIC_URL || process.env.RENDER || process.env.PORT;
    const CLOUD_URL = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null;

    console.log(`📍 Admin: ${ADMIN_EMAIL}`);
    console.log(`🌍 Modo: ${IS_CLOUD ? 'Nuvem (Cloud)' : 'Local (Ngrok)'}`);

    while (true) {
        const license = await checkLicense();
        if (license === null) {
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        if (license.isActive) {
            if (fs.existsSync('.stop-flag')) {
                process.stdout.write(`\r🛑 Sistema Pausado via .stop-flag... [${new Date().toLocaleTimeString()}]`);
            } else if (!isActive) {
                console.log(`\n✅ Assinatura Ativa!`);
                
                let bridgeUrl = CLOUD_URL;

                if (!IS_CLOUD) {
                    await cleanupOldProcesses();
                    bridgeUrl = await startNgrok();
                } else {
                    console.log('☁️ Ambientes de Nuvem detectado. Pulando Ngrok.');
                    // Na nuvem, o index.js já roda na porta do processo, a URL é a da plataforma
                }

                if (bridgeUrl) {
                    try {
                        const bridgeKey = process.env.WA_BRIDGE_KEY || 'universal-secret-key';
                        console.log(`📡 Atualizando Cloudflare com a URL: ${bridgeUrl}`);
                        await axios.post(`${API_URL}/admin/bridge/update`, {
                            key: bridgeKey,
                            url: bridgeUrl,
                            email: ADMIN_EMAIL
                        });
                        console.log('✅ Cloudflare atualizado.');
                    } catch (e) {
                        console.error('⚠️ Falha ao avisar o Cloudflare:', e.message);
                    }
                }

                await startWhatsApp();
                isActive = true;
            }
        } else {
            console.log('\r⏳ Aguardando assinatura ativa...');
            if (isActive) stopAll();
        }

        await new Promise(r => setTimeout(r, 30000));
    }
}

process.on('SIGINT', stopAll);
run();