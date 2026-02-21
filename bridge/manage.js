const { exec } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const API_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api';
const ADMIN_EMAIL = 'celsosilvajunior90@gmail.com'; // Admin fixo para licenciamento

let ngrokProcess = null;
let whatsappProcess = null;
let isActive = false;

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
    whatsappProcess = exec('node index.js', {
        env: { ...process.env, ADMIN_EMAIL: ADMIN_EMAIL }
    });

    whatsappProcess.stdout.on('data', (data) => process.stdout.write(data));
    whatsappProcess.stderr.on('data', (data) => process.stderr.write(data));

    whatsappProcess.on('close', (code) => {
        console.log(`Ponte fechada (Código: ${code})`);
        whatsappProcess = null;
        if (isActive) {
            console.log('⚠️ Processo do WhatsApp fechou inesperadamente. Reiniciando serviços...');
            isActive = false;
            if (ngrokProcess) ngrokProcess.kill();
            ngrokProcess = null;
        }
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



    while (true) {
        const license = await checkLicense();

        // Se falhou a rede, não faz nada e tenta de novo no próximo ciclo
        if (license === null) {
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        if (license.isActive) {
            // Se existir a flag de parada manual, não liga nada
            // Se existir a flag de parada manual, apenas loga que está em modo "Standby"
            // O index.js que deve tratar de não conectar as sessões, mas o servidor precisa ficar ON para receber o comando de volta
            if (fs.existsSync('.stop-flag')) {
                if (!isActive) {
                    process.stdout.write(`\r🛑 Sistema Pausado (API Online)... [${new Date().toLocaleTimeString()}]`);
                    // Se caiu por algum motivo, levanta de novo para manter a API no ar
                    if (!whatsappProcess) {
                        console.log('\n🔄 Reiniciando servidor em modo Standby...');
                        await startNgrok();
                        await startWhatsApp();
                        isActive = true;
                    }
                } else {
                    process.stdout.write(`\r🛑 Sistema Pausado (API Online)... [${new Date().toLocaleTimeString()}]`);
                }
            } else if (!isActive) {
                console.log(`\n✅ Assinatura Ativada! (Restam ${license.daysLeft} dias)`);
                console.log('🚀 Iniciando serviços...');
                // Garante que não tem flag antiga
                if (fs.existsSync('.stop-flag')) fs.unlinkSync('.stop-flag');

                const bridgeUrl = await startNgrok();

                if (bridgeUrl) {
                    try {
                        console.log('📡 Atualizando Backend com nova URL da Bridge...');
                        // Update Bridge URL
                        await axios.post(`${API_URL}/admin/bridge/update`, {
                            key: 'barber-secret-key',
                            url: bridgeUrl,
                            email: ADMIN_EMAIL
                        });

                        // Force Disconnected Status on Start (Clean Slate)
                        await axios.post(`${API_URL}/whatsapp/status`, {
                            email: ADMIN_EMAIL,
                            status: 'disconnected'
                        });

                        console.log('✅ Backend atualizado com sucesso.');
                    } catch (e) {
                        console.error('⚠️ Falha ao atualizar URL no Backend:', e.message);
                    }
                }

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
