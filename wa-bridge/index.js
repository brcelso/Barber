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

const app = express();
app.use(bodyParser.json());

const PORT = 3000;
const API_KEY = 'barber-secret-key';

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    console.log(`Usando versão do WhatsApp Web: ${version}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Barber Bridge', 'Chrome', '1.0.0'],
        printQRInTerminal: false,
        markOnlineOnConnect: true
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
