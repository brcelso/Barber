const { exec, spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// 1. Carregar variáveis do .env (Garante que busca na raiz do projeto)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('📝 Arquivo .env carregado com sucesso.');
} else {
    console.error('❌ ERRO: Arquivo .env não encontrado em: ' + envPath);
}

const API_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api';
const ADMIN_EMAIL = 'celsosilvajunior90@gmail.com'; 
const FIXED_DOMAIN = 'nisi-marbly-maeve.ngrok-free.dev'; // Seu domínio fixo ngrok

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
        env: { ...process.env, ADMIN_EMAIL: ADMIN_EMAIL }
    });

    whatsappProcess.stdout.on('data', (data) => process.stdout.write(`[WhatsApp] ${data}`));
    whatsappProcess.stderr.on('data', (data) => process.stderr.write(`[WhatsApp Error] ${data}`));

    whatsappProcess.on('close', (code) => {
        console.log(`\nPonte fechada (Código: ${code})`);
        whatsappProcess = null;
        if (isActive) {
            console.log('⚠️ Reiniciando serviços em 5s...');
            setTimeout(() => { isActive = false; }, 5000);
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
    console.log(`📍 Admin: ${ADMIN_EMAIL}`);

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
                
                const bridgeUrl = await startNgrok();

                if (bridgeUrl) {
                    try {
                        console.log('📡 Atualizando Cloudflare com a URL da Bridge...');
                        await axios.post(`${API_URL}/admin/bridge/update`, {
                            key: 'universal-secret-key',
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