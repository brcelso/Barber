const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'https://barber-server.celsosilvajunior90.workers.dev/api';
const BRIDGE_KEY = process.env.WA_BRIDGE_KEY || 'universal-secret-key';

class SyncUtils {
    /**
     * Faz download da sessão do D1 e salva localmente
     */
    static async downloadSession(email) {
        try {
            console.log(`[Sync] 📥 Baixando sessão para ${email}...`);
            const res = await axios.get(`${BACKEND_URL}/admin/bridge/session`, {
                params: { key: BRIDGE_KEY, email: email }
            });

            if (res.data && res.data.payload) {
                const safeId = Buffer.from(email).toString('hex');
                const sessionPath = path.join(__dirname, 'auth_sessions', `session_${safeId}`);
                if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

                const payload = JSON.parse(Buffer.from(res.data.payload, 'base64').toString());
                
                // Salva os arquivos (creds.json e outros)
                for (const [filename, content] of Object.entries(payload)) {
                    fs.writeFileSync(path.join(sessionPath, filename), JSON.stringify(content));
                }
                console.log(`[Sync] ✅ Sessão restaurada para ${email}`);
                return true;
            }
            console.log(`[Sync] ℹ️ Nenhuma sessão encontrada no D1 para ${email}`);
            return false;
        } catch (e) {
            console.error(`[Sync Error] Falha ao baixar sessão:`, e.message);
            return false;
        }
    }

    /**
     * Faz upload da sessão local para o D1
     */
    static async uploadSession(email) {
        try {
            const safeId = Buffer.from(email).toString('hex');
            const sessionPath = path.join(__dirname, 'auth_sessions', `session_${safeId}`);
            if (!fs.existsSync(sessionPath)) return;

            const files = fs.readdirSync(sessionPath);
            const payload = {};

            // Pegamos apenas arquivos JSON (creds.json, etc)
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const content = fs.readFileSync(path.join(sessionPath, file), 'utf8');
                    payload[file] = JSON.parse(content);
                }
            }

            const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

            console.log(`[Sync] 📤 Subindo sessão de ${email} para o D1...`);
            await axios.post(`${BACKEND_URL}/admin/bridge/session`, {
                key: BRIDGE_KEY,
                email: email,
                payload: base64Payload
            });
            console.log(`[Sync] ✅ Sessão sincronizada no D1.`);
        } catch (e) {
            console.error(`[Sync Error] Falha ao subir sessão:`, e.message);
        }
    }
}

module.exports = SyncUtils;
