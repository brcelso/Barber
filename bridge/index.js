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
const SyncUtils = require('./SyncUtils'); // <--- Novo utilitário

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const STATUS_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/status';
const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/webhook';
const API_KEY = 'universal-secret-key';
const PORT = 3000;

const app = express();
app.use(cors());
app.use(bodyParser.json());
 
 // --- FILTRO DE RUÍDO NO TERMINAL ---
 // Algumas dependências (como libsignal) usam console.info diretamente, ignorando o logger do pino.
  const originalInfo = console.info;
  const originalLog = console.log;
  
  const filterNoise = (args) => {
      if (typeof args[0] === 'string' && (
          args[0].includes('Closing session:') || 
          args[0].includes('Closing open session') || 
          args[0].includes('Removing old prekey') ||
          args[0].includes('Prekey bundle')
      )) return true;
      return false;
  };

  console.info = function (...args) {
      if (filterNoise(args)) return;
      originalInfo.apply(console, args);
  };
  
  console.log = function (...args) {
      if (filterNoise(args)) return;
      originalLog.apply(console, args);
  };
 
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
    const authFolder = path.join(__dirname, 'auth_sessions', `session_${safeId}`);

    // 1. Tentar baixar do D1 se não existir localmente (apenas se não estivermos solicitando novo pareamento)
    const isPairing = !!(process.env.WA_PAIRING_PHONE || global.pendingPairing?.email === email);
    if (!isPairing) {
        const found = await SyncUtils.downloadSession(email);
        if (!found && fs.existsSync(authFolder)) {
            console.log(`[Session] ⚠️ Nenhuma sessão na nuvem. Limpando lixo local para evitar Erro 405...`);
            fs.rmSync(authFolder, { recursive: true, force: true });
        }
    } else {
        console.log(`[Session] 🆕 Modo Pareamento detectado. Iniciando com pasta limpa.`);
    }

    // 2. Garantir que a pasta existe (agora em local fixo)
    if (isPairing && fs.existsSync(authFolder)) {
        console.log(`[Session] 🧹 Limpando pasta de sessão para Pareamento: ${authFolder}`);
        fs.rmSync(authFolder, { recursive: true, force: true });
    }

    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
        console.log(`[Session] 📂 Pasta de sessão criada: ${authFolder}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        markOnlineOnConnect: false
    });

    console.log(`[Debug] Socket criado com versão: ${version.join('.')}`);
    const credsFile = path.join(authFolder, 'creds.json');
    if (fs.existsSync(credsFile)) {
        console.log(`[Debug] creds.json detectado (Tamanho: ${fs.statSync(credsFile).size} bytes)`);
    } else {
        console.log(`[Debug] Nenhum creds.json encontrado (Pasta Limpa ✅)`);
    }

    // --- PAREAMENTO POR CÓDIGO (MOBILE FIRST) ---
    const envPairPhone = process.env.WA_PAIRING_PHONE;
    if (global.pendingPairing?.email === email || (envPairPhone && email === ADMIN_EMAIL)) {
        let phoneNumber = (global.pendingPairing?.phone || envPairPhone).replace(/\D/g, '');
        
        // Ajuste automático para números do Brasil (Desativado temporariamente para debugar)
        /*
        if (phoneNumber.startsWith('55') && phoneNumber.length === 13) {
            const ddd = parseInt(phoneNumber.substring(2, 4));
            if (ddd < 30) {
                const oldNumber = phoneNumber;
                phoneNumber = phoneNumber.substring(0, 4) + phoneNumber.substring(5);
                console.log(`[Session] 🔄 Ajustando número para pareamento (Removendo 9): ${oldNumber} -> ${phoneNumber}`);
            }
        }
        */

        console.log(`[Session] 📱 Solicitando Código para ${phoneNumber}...`);
        
        setTimeout(async () => {
            if (sock.authState.creds.me) return;

            try {
                const code = await sock.requestPairingCode(phoneNumber);
                if (global.pendingPairing) global.pendingPairing.result = code;
                
                await axios.post(STATUS_URL, {
                    email: email,
                    status: 'awaiting_code',
                    qr: null,
                    pair_code: code
                }).catch(() => {});

                console.log(`\n************************************`);
                console.log(`📡 CÓDIGO ÚNICO: ${code}`);
                console.log(`************************************\n`);
                console.log(`⚠️  Digite o código no seu celular agora.`);
            } catch (e) {
                console.error(`[Session Error] Falha ao gerar código:`, e.message);
                console.log('💡 DICA: Digite Ctrl+C e tente novamente se precisar de novo código.');
            }
        }, 6000); // 6 segundos para garantir que o socket registrou no servidor
    }

    sessions.set(email, sock);

    // --- EVENTOS DE MENSAGEM ---
    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        const msg = m.messages[0];
        if (!msg.message || msg.message.protocolMessage || msg.message.historySyncNotification) return;

        const remoteJid = msg.key.remoteJid || '';
        const altJid = msg.key.remoteJidAlt || ''; // Campo alternativo para LIDs
        const rawMyId = sock.user?.id || '';
        const myNumber = rawMyId.split(':')[0].split('@')[0];
        const myLid = sock.user?.lid || '';
        const cleanMyLid = myLid.split(':')[0].split('@')[0];

        // 1. Identifica se é Self-Chat
        const isSelfChat = (myNumber && (remoteJid.includes(myNumber) || altJid.includes(myNumber))) || 
                           (cleanMyLid && remoteJid.includes(cleanMyLid)) ||
                           (remoteJid.includes('@lid') && msg.key.fromMe);
        const fromMe = msg.key.fromMe;

        // 2. Trava de segurança
        if (fromMe && !isSelfChat) return;

        const text = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.buttonsResponseMessage?.selectedButtonId ||
            msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

        if (text) {
            // Se tiver remoteJidAlt (que geralmente é o número real), usamos ele como remetente no backend
            let sender = remoteJid;
            if (remoteJid.includes('@lid') && altJid) {
                sender = altJid;
            }
            
            if (isSelfChat) {
                sender = `${myNumber}@s.whatsapp.net`;
            }

            let cleanPhone = sender.split('@')[0].split(':')[0].replace(/\D/g, "");

            if (cleanPhone.startsWith("55") && cleanPhone.length > 10) {
                cleanPhone = cleanPhone.substring(2);
            }

            console.log(`[Message] ${isSelfChat ? 'Self-Chat' : 'De: ' + cleanPhone}: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);

            axios.post(WORKER_URL, {
                phone: cleanPhone,
                jid: sender, // Enviar o JID normalizado (PN se possível)
                message: text,
                professional_email: email,
                is_self_chat: isSelfChat
            }).catch((err) => { 
                console.error(`[Bridge] ❌ Erro ao enviar para o Worker:`, err.message);
            });
        }
    });

    // --- CREDENCIAIS ---
    sock.ev.on('creds.update', async () => {
        await saveCreds();
        // Sincroniza com D1 (Throttled via timer ou direto se for o primeiro)
        if (sock.user) {
             SyncUtils.uploadSession(email);
        }
    });

    // --- ATUALIZAÇÃO DE CONEXÃO E QR CODE ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Debug profundo para entender o 401
        if (lastDisconnect?.error) {
            console.log(`[Debug Connection] Update:`, JSON.stringify(update, null, 2));
        }

        if (qr) {
            console.log(`[QR] 📲 Novo código gerado para ${email}. Escaneie abaixo:`);
            qrcodeTerminal.generate(qr, { small: true });

            try {
                const qrImage = await QRCode.toDataURL(qr);
                await axios.post(STATUS_URL, { email, status: 'qr', qr: qrImage, pair_code: null });
            } catch (e) { console.error('Erro ao enviar QR para o Worker:', e.message); }
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`[Session] (${email}) Conexão fechada. Razão: ${reason}`);

            axios.post(STATUS_URL, { email, status: 'disconnected', qr: null, pair_code: null, reason }).catch(() => { });

            // Só deletar a pasta se for um LOGOUT real (quando o usuário desconecta pelo celular)
            // No Baileys, loggedOut costuma ser 401, mas durante o pareamento isso pode confundir.
            if (reason === DisconnectReason.loggedOut && !envPairPhone && !global.pendingPairing) {
                sessions.delete(email);
                const safeId = Buffer.from(email).toString('hex');
                const authFolder = path.join(__dirname, 'auth_sessions', `session_${safeId}`);
                if (fs.existsSync(authFolder)) {
                    // Pequeno delay para o Windows liberar os handles dos arquivos
                    setTimeout(() => {
                        let attempts = 0;
                        const maxAttempts = 3;
                        const tryRemove = () => {
                            try {
                                fs.rmSync(authFolder, { recursive: true, force: true });
                                console.log(`[Session] 🗑️ Arquivos de sessão removidos: ${email}`);
                            } catch (err) {
                                attempts++;
                                if (attempts < maxAttempts && err.code === 'ENOTEMPTY') {
                                    console.log(`[Session] ⏳ Pasta ocupada, tentando novamente (${attempts}/${maxAttempts})...`);
                                    setTimeout(tryRemove, 1000);
                                } else {
                                    console.error(`[Session] ❌ Erro ao remover arquivos:`, err.message);
                                }
                            }
                        };
                        tryRemove();
                    }, 1000);
                }
            } else {
                if (sessions.has(email)) {
                    // SE ESTIVERMOS EM PAREAMENTO, NÃO RECONECTA AUTOMATICAMENTE NO 401
                    // Pois isso gera um loop infinito de novos códigos
                    if (isPairing && reason === 401) {
                        console.log(`[Session] 🛑 Pausa de segurança: 401 detectado durante pareamento. Verifique se o número ${process.env.WA_PAIRING_PHONE} está correto.`);
                        sessions.delete(email);
                        return;
                    }

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
            axios.post(STATUS_URL, { email, status: 'connected', qr: null, pair_code: null }).catch(() => { });
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

// --- ENDPOINT PARA PAREAMENTO POR CÓDIGO (MOBILE) ---
global.pendingPairing = null;

app.post('/api/pair-code', async (req, res) => {
    const { key, email, phone } = req.body;
    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });
    if (!email || !phone) return res.status(400).json({ error: 'Email e telefone são obrigatórios' });

    console.log(`[PairCode] 📱 Solicitação para ${phone} (Email: ${email})`);
    
    // Armazena temporariamente para que o connectToWhatsApp saiba o que fazer
    global.pendingPairing = { email, phone, result: null };

    // Inicia a conexão (que vai disparar o requestPairingCode)
    await connectToWhatsApp(email);

    // Espera até 10 segundos pelo código
    let attempts = 0;
    const checkInterval = setInterval(() => {
        if (global.pendingPairing?.result) {
            clearInterval(checkInterval);
            res.json({ success: true, code: global.pendingPairing.result });
            global.pendingPairing = null;
        }
        if (++attempts > 20) {
            clearInterval(checkInterval);
            res.status(504).json({ error: 'Timeout ao gerar código' });
            global.pendingPairing = null;
        }
    }, 500);
});

app.post('/send-message', async (req, res) => {
    const { key, number, message, professional_email, barber_email: oldBarberEmail } = req.body;
    const targetEmail = professional_email || oldBarberEmail;

    console.log(`Tentando enviar via: ${targetEmail}. Sessões ativas:`, Array.from(sessions.keys()));

    if (key !== API_KEY) return res.status(401).json({ error: 'Chave inválida' });

    const sock = sessions.get(targetEmail || ADMIN_EMAIL);
    if (!sock) return res.status(503).json({ error: 'WhatsApp não conectado' });

    try {
        let jid = number;
        if (!number.includes('@')) {
            let cleanNumber = number.replace(/\D/g, '');
            if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;
            jid = `${cleanNumber}@s.whatsapp.net`;
        }

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
    // 4. Iniciar sessões existentes do disco
    loadExistingSessions();

    // Auto-carregar a sessão do administrador como fallback (se não estiver pareando)
    if (!process.env.WA_PAIRING_PHONE) {
        setTimeout(() => {
            if (sessions.size === 0 && ADMIN_EMAIL) {
                console.log(`[Boot] 🚀 Iniciando sessão padrão do administrador: ${ADMIN_EMAIL}`);
                connectToWhatsApp(ADMIN_EMAIL);
            }
        }, 2000);
    }
});