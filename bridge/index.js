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
const API_KEY = 'barber-secret-key';
const PORT = 3000;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const sessions = new Map();
const sessionTimers = new Map();

async function connectToWhatsApp(email) {
    // BLOQUEIO DE SEGURANÇA (COMENTADO PARA PERMITIR BOOT SEMPRE)
    /*
    if (fs.existsSync('.stop-flag')) {
        console.log(`[Session] 🛑 Bloqueado por .stop-flag: ${email}`);
        return;
    }
    */

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
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Barber App', 'Chrome', '1.0.0'],
        markOnlineOnConnect: true
        // printQRInTerminal removido por estar obsoleto
    });

    sessions.set(email, sock);

    // Eventos de Mensagem
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        const msg = m.messages[0];
        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid || '';
        const isLid = remoteJid.endsWith('@lid');

        const rawMyId = sock.user?.id || '';
        const myNumber = rawMyId.split(':')[0].split('@')[0];
        const isSelfChat = remoteJid.startsWith(myNumber);

        // Se a mensagem foi enviada pelo bot/celular (fromMe):
        // Só processamos se for um comando enviado via LID ou conversando consigo mesmo.
        // Se o bot mandou mensagem para outra pessoa, ignoramos aqui para evitar LOOP.
        if (msg.key.fromMe && !isLid && !isSelfChat) return;

        const isSelfAdminCmd = msg.key.fromMe || isLid;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

        if (text) {
            const sender = (isLid || isSelfChat) ? `${myNumber}@s.whatsapp.net` : remoteJid;
            const tag = isSelfAdminCmd ? '[ADMIN CMD]' : '[Recebido]';
            console.log(`${tag} (${email}) De: ${sender} - Msg: ${text}`);
            axios.post(WORKER_URL, {
                phone: sender,
                message: text,
                barber_email: email
            }).catch(e => console.error('❌ ERRO NO WORKER:', e.message));
        }
    });

    // Atualização de Conexão e QR Code
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`[QR] 📲 Novo código gerado para ${email}. Escaneie abaixo:`);
            // Renderiza o QR no terminal manualmente
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
                console.log(`[Session] (${email}) Sessão encerrada permanentemente. Limpando arquivos...`);

                // Limpa a pasta de autenticação para permitir novo login
                const safeId = Buffer.from(email).toString('hex');
                const authFolder = path.join('auth_sessions', `session_${safeId}`);
                if (fs.existsSync(authFolder)) {
                    try {
                        fs.rmSync(authFolder, { recursive: true, force: true });
                        console.log(`[Session] 🗑️ Arquivos de sessão removidos: ${email}`);
                    } catch (err) {
                        console.error(`[Session] ❌ Erro ao remover arquivos de sessão:`, err.message);
                    }
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
            console.log(`[Session] ✅ ${email} CONECTADO COM SUCESSO!`);
            axios.post(STATUS_URL, { email, status: 'connected' }).catch(() => { });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Heartbeat
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
    const { key, number, message, barber_email } = req.body;

    console.log(`Tentando enviar via: ${barber_email}. Sessões ativas:`, Array.from(sessions.keys()));

    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });

    const sock = sessions.get(barber_email || ADMIN_EMAIL);
    if (!sock) return res.status(503).json({ error: 'WhatsApp não conectado' });

    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;
        await sock.sendMessage(`${cleanNumber}@s.whatsapp.net`, { text: message });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
    console.log(`🚀 Barber Multi-Bridge rodando na porta ${PORT}`);
    loadExistingSessions();
});