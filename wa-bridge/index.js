const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
app.use(bodyParser.json());

const PORT = 3000;
const API_KEY = 'barber-secret-key'; // Mude para algo seguro

// Store para manter dados em memória
const store = makeInMemoryStore({});
store.readFromFile('./baileys_store.json');
setInterval(() => {
    store.writeToFile('./baileys_store.json');
}, 10000);

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('--- ESCANEIE O QR CODE ABAIXO ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ?
                lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut : true;
            console.log('Conexão fechada. Motivo:', lastDisconnect.error, 'Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Conectado com Sucesso!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Endpoint para receber ordens do App de Barbearia
    app.post('/send-message', async (req, res) => {
        const { key, number, message } = req.body;

        if (key !== API_KEY) {
            return res.status(401).json({ error: 'Chave de API inválida' });
        }

        if (!number || !message) {
            return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
        }

        try {
            // Formatar número: remove caracteres, garante 55 e termina com @s.whatsapp.net
            let jid = number.replace(/\D/g, '');
            if (!jid.startsWith('55')) jid = '55' + jid;
            jid = jid + '@s.whatsapp.net';

            await sock.sendMessage(jid, { text: message });
            console.log(`[Enviado] Para: ${jid} Mensagem: ${message}`);
            res.json({ success: true });
        } catch (err) {
            console.error('Erro ao enviar mensagem:', err);
            res.status(500).json({ error: 'Falha ao enviar mensagem' });
        }
    });

    return sock;
}

app.listen(PORT, () => {
    console.log(`🚀 Script Ponte rodando na porta ${PORT}`);
    console.log(`Chave de API: ${API_KEY}`);
    connectToWhatsApp();
});
