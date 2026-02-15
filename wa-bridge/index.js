const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestWaWebVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PORT = 3000;
const API_KEY = 'barber-secret-key';
const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/webhook';

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307], isLatest: false }));
    console.log(`Usando versão do WhatsApp Web: ${version} (Latest: ${isLatest})`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'], // More common browser string
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

        if (text) {
            console.log(`[Recebido] De: ${sender} - Msg: ${text}`);
            // Encaminha para a IA no Worker
            axios.post(WORKER_URL, {
                phone: sender,
                message: text
            }).catch(e => {
                if (e.response && e.response.data) {
                    console.error('❌ ERRO NO WORKER:', e.response.data.error || e.message);
                } else {
                    console.error('❌ ERRO AO CHAMAR WEBHOOK:', e.message);
                }
            });
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- NOVO QR CODE GERADO. ESCANEIE ABAIXO ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log('Conexão fechada. Razão:', reason);

            if (reason === DisconnectReason.loggedOut) {
                console.log('Sessão encerrada pelo celular. Delete a pasta auth_info_baileys e escaneie de novo.');
            } else if (reason === 440) {
                console.log('⚠️ Erro de Stream (440). Tentando reconectar limpando buffer...');
                setTimeout(connectToWhatsApp, 2000);
            } else {
                console.log('Tentando reconectar em 5 segundos...');
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('\n✅ WhatsApp Conectado e Pronto para Enviar!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

app.post('/send-message', async (req, res) => {
    const { key, number, message } = req.body;

    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });
    if (!sock) return res.status(503).json({ error: 'WhatsApp não inicializado' });

    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;
        const jid = `${cleanNumber}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });
        console.log(`[OK] Mensagem enviada para ${cleanNumber}`);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ ERRO NO ENVIO:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Ponte ativo na porta ${PORT}`);
    connectToWhatsApp();
});
