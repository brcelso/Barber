const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestWaWebVersion
} = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const QRCode = require('qrcode');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const STATUS_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/status';
const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/webhook';
const API_KEY = 'universal-secret-key';
const PORT = 3000;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const sessions = new Map();
const sessionTimers = new Map();

async function connectToWhatsApp(emailRaw) {
    let email = emailRaw;
    // Remapear e-mail fantasma se ele vier de alguma fonte antiga
    if (email === 'celso@master.com') {
        console.log(`[Session] 🔀 Remapeando e-mail fantasma de ${email} para ${ADMIN_EMAIL}`);
        email = ADMIN_EMAIL;
    }

    if (sessions.has(email)) {
        console.log(`[Session] Sessão já inicializada para ${email}`);
        return;
    }

    console.log(`[Session] 🔄 Iniciando conexão: ${email}`);
    const safeId = Buffer.from(email).toString('hex');
    const authFolder = `auth_sessions/session_${safeId}`;

    if (!fs.existsSync('auth_sessions')) fs.mkdirSync('auth_sessions');

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'info' }),
        auth: state,
        browser: ['Universal App', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true
    });

    sessions.set(email, sock);

    // --- EVENTOS DE MENSAGEM ---
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        const msg = m.messages[0];
        if (!msg.message || msg.message.protocolMessage || msg.message.historySyncNotification) return;

        const remoteJid = msg.key.remoteJid || '';
        const rawMyId = sock.user?.id || '';
        const myNumber = rawMyId.split(':')[0].split('@')[0];

        // 1. Identifica se é Self-Chat
        const isSelfChat = remoteJid.includes(myNumber) || remoteJid.includes('@lid');
        const fromMe = msg.key.fromMe;

        // 2. Trava de segurança
        if (fromMe && !isSelfChat) return;

        const text = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.buttonsResponseMessage?.selectedButtonId ||
            msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

        if (text) {
            const sender = isSelfChat ? `${myNumber}@s.whatsapp.net` : remoteJid;
            let cleanPhone = sender.replace(/\D/g, "");

            if (cleanPhone.startsWith("55") && cleanPhone.length > 10) {
                cleanPhone = cleanPhone.substring(2);
            }

            console.log(`[Message] ${isSelfChat ? 'Self-Chat' : 'De: ' + cleanPhone}: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);

            axios.post(WORKER_URL, {
                phone: cleanPhone,
                message: text,
                professional_email: email,
                is_self_chat: isSelfChat
            }).catch(() => { });
        }
    });

    // --- ATUALIZAÇÃO DE CONEXÃO E QR CODE ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`[QR] 📲 Novo código gerado para ${email}. Escaneie abaixo:`);
            qrcodeTerminal.generate(qr, { small: true });

            try {
                const qrImage = await QRCode.toDataURL(qr);
                await axios.post(STATUS_URL, { email, status: 'qr', qr: qrImage });
            } catch (e) { console.error('Erro ao enviar QR para o Worker:', e.message); }
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`[Session] (${email}) Conexão fechada. Razão: ${reason}`);

            axios.post(STATUS_URL, { email, status: 'disconnected', reason }).catch(() => { });

            if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.connectionReplaced) {
                sessions.delete(email);
                const safeId = Buffer.from(email).toString('hex');
                const authFolder = path.join('auth_sessions', `session_${safeId}`);
                if (fs.existsSync(authFolder)) {
                    try {
                        fs.rmSync(authFolder, { recursive: true, force: true });
                        console.log(`[Session] 🗑️ Arquivos de sessão removidos: ${email}`);
                    } catch (err) { console.error(`[Session] ❌ Erro ao remover arquivos:`, err.message); }
                }
            } else {
                if (sessions.has(email)) {
                    console.log(`[Session] (${email}) Tentando reconectar em 5s...`);
                    setTimeout(() => {
                        if (sessions.has(email)) {
                            sessions.delete(email);
                            connectToWhatsApp(email);
                        }
                    }, 5000);
                }
            }
        } else if (connection === 'open') {
            console.log(`[Session] ✅ ${email} CONECTADO COM SUCESSO! ID: ${sock.user?.id}`);
            fs.appendFileSync('bridge_logs.txt', `[${new Date().toISOString()}] Bot connected as ${sock.user?.id}\n`);
            axios.post(STATUS_URL, { email, status: 'connected' }).catch(() => { });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    const heartbeatParams = setInterval(() => {
        if (sessions.get(email) === sock) {
            axios.post(STATUS_URL, { email, status: 'heartbeat' }).catch(() => { });
        } else {
            clearInterval(heartbeatParams);
        }
    }, 30000);
    sessionTimers.set(email, heartbeatParams);
}

async function loadExistingSessions() {
    const root = 'auth_sessions';
    if (!fs.existsSync(root)) fs.mkdirSync(root);

    const folders = fs.readdirSync(root);
    for (const folder of folders) {
        if (folder.startsWith('session_') && fs.lstatSync(path.join(root, folder)).isDirectory()) {
            const hex = folder.replace('session_', '');
            try {
                const email = Buffer.from(hex, 'hex').toString();
                console.log(`[Boot] 📦 Restaurando: ${email}`);
                connectToWhatsApp(email);
            } catch (e) { console.log(`[Boot] Falha ao ler pasta: ${folder}`); }
        }
    }
}

// Rotas de Controle
app.post('/api/init', async (req, res) => {
    const { key, email } = req.body;
    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });
    if (fs.existsSync('.stop-flag')) fs.unlinkSync('.stop-flag');
    connectToWhatsApp(email);
    res.json({ success: true, message: `Iniciando ${email}` });
});

app.post('/api/stop', async (req, res) => {
    const { key, email } = req.body;
    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });

    if (email === 'ALL') {
        for (const [id, sock] of sessions.entries()) {
            try {
                clearInterval(sessionTimers.get(id));
                sock.end();
            } catch (e) { }
        }
        sessions.clear();
        return res.json({ success: true, message: 'Todos os robôs parados' });
    }

    if (sessions.has(email)) {
        const sock = sessions.get(email);
        clearInterval(sessionTimers.get(email));
        sessions.delete(email);
        sock.end();
        res.json({ success: true, message: `Robô ${email} parado` });
    }
});

app.post('/send-message', async (req, res) => {
    const { key, number, message, professional_email, barber_email: oldBarberEmail } = req.body;
    const targetEmail = professional_email || oldBarberEmail;

    console.log(`Tentando enviar via: ${targetEmail}. Sessões ativas:`, Array.from(sessions.keys()));

    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });

    const sock = sessions.get(targetEmail || ADMIN_EMAIL);
    if (!sock) return res.status(503).json({ error: 'WhatsApp não conectado' });

    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;
        const jid = `${cleanNumber}@s.whatsapp.net`;

        fs.appendFileSync('bridge_logs.txt', `[${new Date().toISOString()}] Checking WhatsApp for ${jid}\n`);
        const [result] = await sock.onWhatsApp(jid);

        if (!result || !result.exists) {
            fs.appendFileSync('bridge_logs.txt', `[${new Date().toISOString()}] Result: Error - Number does not exist on WhatsApp\n`);
            return res.status(404).json({ error: 'Número não existe no WhatsApp' });
        }

        console.log(`[Send] Destinatário Verificado: ${result.jid}, Msg: ${message}`);
        fs.appendFileSync('bridge_logs.txt', `[${new Date().toISOString()}] Verified JID: ${result.jid}. Sending message...\n`);

        await sock.sendMessage(result.jid, { text: message });
        fs.appendFileSync('bridge_logs.txt', `[${new Date().toISOString()}] Result: Success\n`);
        res.json({ success: true });
    } catch (err) {
        fs.appendFileSync('bridge_logs.txt', `[${new Date().toISOString()}] Result: Error - ${err.message}\n`);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Universal Multi-Bridge rodando na porta ${PORT}`);
    loadExistingSessions();

    // Auto-carregar a sessão do administrador se nada foi carregado
    setTimeout(() => {
        if (sessions.size === 0 && ADMIN_EMAIL) {
            console.log(`[Boot] 🚀 Iniciando sessão padrão do administrador: ${ADMIN_EMAIL}`);
            connectToWhatsApp(ADMIN_EMAIL);
        }
    }, 2000);
});