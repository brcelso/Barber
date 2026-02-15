const { exec } = require('child_process');
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
            headers: { 'X-User-Email': ADMIN_EMAIL },
            timeout: 10000
        });
        return res.data;
    } catch (e) {
        console.error(`❌ Falha na conexão (${new Date().toLocaleTimeString()}):`, e.code === 'ENOTFOUND' ? 'Servidor Offline ou Sem Internet' : e.message);
        return null;
    }
}

function startNgrok() {
    return new Promise((resolve) => {
        console.log('🌐 Iniciando Túnel Ngrok...');

        // Usar exec para evitar problemas de PATH e avisos de shell no Windows
        ngrokProcess = exec('ngrok http 3000');

        ngrokProcess.on('error', (err) => {
            console.error(`❌ Falha ao iniciar Ngrok:`, err.message);
            resolve(null);
        });

        // Aguarda o ngrok subir e obter a URL
        setTimeout(async () => {
            try {
                const res = await axios.get('http://127.0.0.1:4040/api/tunnels');
                const url = res.data.tunnels[0].public_url;
                console.log(`✅ Túnel Ativo: ${url}`);
                resolve(url);
            } catch (e) {
                console.error('❌ Erro ao capturar URL do Ngrok. Verifique se ele já está rodando.');
                resolve(null);
            }
        }, 5000);
    });
}

async function startWhatsApp() {
    console.log('📱 Iniciando Ponte WhatsApp...');
    whatsappProcess = exec('node index.js');

    whatsappProcess.stdout.on('data', (data) => process.stdout.write(data));
    whatsappProcess.stderr.on('data', (data) => process.stderr.write(data));

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

    let isActive = false;

    while (true) {
        const license = await checkLicense();

        // Se falhou a rede, não faz nada e tenta de novo no próximo ciclo
        if (license === null) {
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        if (license.isActive) {
            if (!isActive) {
                console.log(`\n✅ Assinatura Ativada! (Restam ${license.daysLeft} dias)`);
                console.log('🚀 Iniciando serviços...');
                await startNgrok();
                await startWhatsApp();
                isActive = true;
            }
        } else {
            if (isActive) {
                console.log('\n⚠️ Assinatura expirou ou foi cancelada no servidor. Desligando...');
                if (ngrokProcess) ngrokProcess.kill();
                if (whatsappProcess) whatsappProcess.kill();
                isActive = false;
            } else {
                process.stdout.write(`\r⏳ Aguardando assinatura ativa... [${new Date().toLocaleTimeString()}]`);
            }
        }

        // Espera 30 segundos antes de checar novamente
        await new Promise(r => setTimeout(r, 30000));
    }
}

process.on('SIGINT', stopAll);
run();
