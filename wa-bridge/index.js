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
const QRCode = require('qrcode');
const cors = require('cors');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const STATUS_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/status';

const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const API_KEY = 'barber-secret-key';
const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/webhook';

const sessions = new Map();

async function connectToWhatsApp(email) {
    if (sessions.has(email)) {
        console.log(`[Session] Sessão já inicializada para ${email}`);
        return;
    }

    console.log(`[Session] 🔄 Iniciando conexão: ${email}`);
    // Usar base64 para o nome da pasta ser seguro e reversível se necessário
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
        printQRInTerminal: false,
        markOnlineOnConnect: true
    });

    sessions.set(email, sock);

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

        if (text) {
            console.log(`[Recebido] (${email}) De: ${sender} - Msg: ${text}`);
            axios.post(WORKER_URL, {
                phone: sender,
                message: text,
                barber_email: email // Crucial para o Worker saber qual bot respondeu
            }).catch(e => console.error('❌ ERRO NO WORKER:', e.message));
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`[QR] Novo código para ${email}`);
            try {
                const qrImage = await QRCode.toDataURL(qr);
                await axios.post(STATUS_URL, { email, status: 'qr', qr: qrImage });
            } catch (e) { console.error('Erro ao enviar QR:', e.message); }
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`[Session] (${email}) Conexão fechada: ${reason}`);

            axios.post(STATUS_URL, { email, status: 'disconnected', reason }).catch(() => { });

            if (reason === DisconnectReason.loggedOut) {
                sessions.delete(email);
                console.log(`[Session] (${email}) LogOUT - Removendo sessão.`);
            } else {
                setTimeout(() => {
                    sessions.delete(email);
                    connectToWhatsApp(email);
                }, 5000);
            }
        } else if (connection === 'open') {
            console.log(`[Session] ✅ ${email} CONECTADO!`);
            axios.post(STATUS_URL, { email, status: 'connected' }).catch(() => { });

            // Notificar o próprio barbeiro no chat dele
            try {
                setTimeout(async () => {
                    const jid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    console.log(`[Notify] Enviando ativação para: ${jid}`);
                    await sock.sendMessage(jid, {
                        text: "✅ *Robô Barber Ativado!* \n\nOlá! O robô da sua barbearia acaba de ser iniciado e já está pronto para automatizar seus agendamentos. ✂️💈"
                    });
                }, 3000);
            } catch (e) {
                console.error(`[Notify] Erro ao enviar msg de ativação para ${email}:`, e.message);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Heartbeat to keep status updated in Worker
    setInterval(() => {
        if (sessions.get(email) === sock) {
            axios.post(STATUS_URL, { email, status: 'heartbeat' }).catch(() => { });
        }
    }, 30000);
}

// Carregar sessões existentes ao iniciar
async function loadExistingSessions() {
    const root = 'auth_sessions';
    if (!fs.existsSync(root)) fs.mkdirSync(root);

    const folders = fs.readdirSync(root);
    for (const folder of folders) {
        if (folder.startsWith('session_') && fs.lstatSync(path.join(root, folder)).isDirectory()) {
            const hex = folder.replace('session_', '');
            try {
                const email = Buffer.from(hex, 'hex').toString();
                console.log(`[Boot] Restaurando sessão: ${email}`);
                connectToWhatsApp(email);
            } catch (e) {
                console.log(`[Boot] Erro ao restaurar pasta: ${folder}`);
            }
        }
    }
}

app.post('/api/restart', async (req, res) => {
    const { key, email } = req.body;
    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });
    if (!email) return res.status(400).json({ error: 'Email necessário' });

    if (email === 'ALL') {
        console.log('[Global Restart] Reiniciando TODOS os robôs...');
        for (const [id, sock] of sessions.entries()) {
            try {
                sock.ev.removeAllListeners('connection.update');
                sock.end();
            } catch (e) { }
        }
        sessions.clear();
        setTimeout(() => loadExistingSessions(), 1000);
        return res.json({ success: true, message: 'Reiniciando todos os robôs do sistema' });
    }

    if (sessions.has(email)) {
        console.log(`[Restart] Terminando sessão antiga para ${email}...`);
        try {
            const sock = sessions.get(email);
            sock.ev.removeAllListeners('connection.update');
            sock.end();
        } catch (e) { }
        sessions.delete(email);
    }

    setTimeout(() => {
        connectToWhatsApp(email);
        res.json({ success: true, message: `Reiniciando robô para ${email}` });
    }, 1000);
});

app.post('/api/init', async (req, res) => {
    const { key, email } = req.body;
    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });
    if (!email) return res.status(400).json({ error: 'Email necessário' });

    connectToWhatsApp(email);
    res.json({ success: true, message: `Iniciando sessão para ${email}` });
});

app.post('/api/stop', async (req, res) => {
    const { key, email } = req.body;
    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });
    if (!email) return res.status(400).json({ error: 'Email necessário' });

    if (email === 'ALL') {
        console.log('[Global Stop] Parando TODOS os robôs...');
        for (const [id, sock] of sessions.entries()) {
            try {
                await sock.sendMessage(sock.user.id, {
                    text: "🛑 *Sistema Geral Desativado* \n\nTodos os robôs do sistema estão sendo desligados agora pelo Mestre. Nenhuma mensagem automática será enviada."
                }).catch(() => { });
                sock.ev.removeAllListeners('connection.update');
                sock.end();
            } catch (e) { }
        }
        sessions.clear();
        return res.json({ success: true, message: 'Todos os robôs foram parados' });
    }

    if (sessions.has(email)) {
        console.log(`[Stop] Parando robô para ${email}...`);
        try {
            const sock = sessions.get(email);

            // Notificar antes de desligar
            await sock.sendMessage(sock.user.id, {
                text: "🛑 *Robô Barber Desativado* \n\nO robô foi desligado manualmente através do seu painel de controle. Ele não responderá mais mensagens automáticas até ser religado."
            }).catch(() => { });

            sock.ev.removeAllListeners('connection.update');
            sock.end();
            sessions.delete(email);

            // Forçar atualização de status no servidor
            axios.post(STATUS_URL, { email, status: 'disconnected' }).catch(() => { });

        } catch (e) {
            console.error(`[Stop Error] Falha ao parar ${email}:`, e.message);
            // Garante limpeza mesmo com erro
            sessions.delete(email);
            axios.post(STATUS_URL, { email, status: 'disconnected' }).catch(() => { });
        }
        res.json({ success: true, message: `Robô parado para ${email}` });
    } else {
        // Mesmo se não achar sessão, força status desconectado no servidor para corrigir UI
        axios.post(STATUS_URL, { email, status: 'disconnected' }).catch(() => { });
        res.json({ success: true, message: `Nenhum robô ativo encontrado, status forçado para desconectado.` });
    }
});

app.post('/send-message', async (req, res) => {
    const { key, number, message, barber_email } = req.body;

    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });

    const targetEmail = barber_email || ADMIN_EMAIL;
    const sock = sessions.get(targetEmail);

    if (!sock) return res.status(503).json({ error: `WhatsApp não conectado para ${targetEmail}` });

    try {
        let cleanNumber = number.replace(/\D/g, '');
        if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;
        const jid = `${cleanNumber}@s.whatsapp.net`;

        await sock.sendMessage(jid, { text: message });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Barber Multi-Bridge ativo na porta ${PORT}`);
    loadExistingSessions();
});
