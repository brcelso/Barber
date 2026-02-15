const { exec, spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const API_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api';
const ADMIN_EMAIL = 'celsosilvajunior90@gmail.com'; // Admin fixo para licenciamento

let ngrokProcess = null;
let whatsappProcess = null;

async function checkLicense() {
    try {
        const res = await axios.get(`${API_URL}/admin/subscription`, {
            headers: { 'X-User-Email': ADMIN_EMAIL }
        });
        return res.data;
    } catch (e) {
        console.error('❌ Falha ao verificar licença:', e.message);
        return { isActive: false, daysLeft: 0 };
    }
}

function startNgrok() {
    return new Promise((resolve) => {
        console.log('🌐 Iniciando Túnel Ngrok...');
        ngrokProcess = spawn('ngrok', ['http', '3000']);

        setTimeout(async () => {
            try {
                const res = await axios.get('http://127.0.0.1:4040/api/tunnels');
                const url = res.data.tunnels[0].public_url;
                console.log(`✅ Túnel Ativo: ${url}`);
                resolve(url);
            } catch (e) {
                console.error('❌ Erro ao pegar URL do Ngrok. Verifique se ele está no PATH.');
                resolve(null);
            }
        }, 3000);
    });
}

async function startWhatsApp() {
    console.log('📱 Iniciando Ponte WhatsApp...');
    whatsappProcess = spawn('node', ['index.js'], { stdio: 'inherit' });

    whatsappProcess.on('close', (code) => {
        console.log(`Ponte fechada (Código: ${code})`);
        whatsappProcess = null;
    });
}

function stopAll() {
    console.log('\n🛑 Desligando serviços...');
    if (ngrokProcess) ngrokProcess.kill();
    if (whatsappProcess) whatsappProcess.kill();
    process.exit();
}

async function run() {
    console.log('--- GERENCIADOR BARBER BRIDGE ---');

    const license = await checkLicense();

    if (!license.isActive) {
        console.log('\n❌ ASSINATURA VENCIDA! ❌');
        console.log('Por favor, realize o pagamento no painel administrativo para liberar o serviço.');
        process.exit();
    }

    console.log(`✅ Assinatura Ativa (Restam ${license.daysLeft} dias)`);

    await startNgrok();
    await startWhatsApp();

    // Loop de verificação a cada 1 hora
    setInterval(async () => {
        const check = await checkLicense();
        if (!check.isActive) {
            console.log('\n⚠️ Assinatura expirou enquanto o serviço rodava. Desligando...');
            stopAll();
        }
    }, 3600 * 1000);
}

process.on('SIGINT', stopAll);
run();
