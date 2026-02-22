
/**
 * EXECUTE ESTE SCRIPT PARA SIMULAR UM ATENDIMENTO DE CLIENTE (MOCK)
 */

import fetch from 'node-fetch';

async function simulateClientInteraction() {
    const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev';

    // ATENÇÃO: Use o e-mail gerado pelo script anterior
    const PARTNER_EMAIL = "parceiro_full_1771794968196@teste.com";
    const CLIENT_PHONE = "551188888888";

    console.log(`🤖 Simulando Atendimento de Cliente para: ${PARTNER_EMAIL}\n`);

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataAmanha = amanha.toISOString().split('T')[0];

    console.log(`💬 Cliente: "Quero agendar um Corte Social para o dia ${dataAmanha} às 14:00"`);

    try {
        console.log("📨 Enviando primeira mensagem para iniciar sessão...");
        await fetch(`${WORKER_URL}/api/whatsapp/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: CLIENT_PHONE,
                message: "oi",
                professional_email: PARTNER_EMAIL
            })
        });

        console.log("⏳ Aguardando criação da sessão...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log("📨 Enviando solicitação de agendamento...");
        const res = await fetch(`${WORKER_URL}/api/whatsapp/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: CLIENT_PHONE,
                message: `Quero agendar um Corte Social para o dia ${dataAmanha} às 14:00`,
                professional_email: PARTNER_EMAIL,
                is_self_chat: false
            })
        });

        const text = await res.text();
        console.log("Raw response:", text);

        try {
            const data = JSON.parse(text);
            console.log("\n📥 Resposta do Servidor (IA):", JSON.stringify(data, null, 2));

            if (data.success && data.aiResponse) {
                console.log("\n✅ AGENDAMENTO PROCESSADO PELA IA!");
            } else {
                console.log("\n⚠️ Resposta incompleta ou erro:", data.error || data.message);
            }
        } catch (e) {
            console.log("❌ Resposta não é um JSON válido.");
        }
    } catch (e) {
        console.error("❌ Erro ao conectar com o Worker:", e.message);
    }
}

simulateClientInteraction().catch(console.error);
