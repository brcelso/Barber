
/**
 * EXECUTE ESTE SCRIPT PARA SIMULAR UM ONBOARDING COMPLETO (ZERO INTERVENÇÃO)
 * 
 * Este script utiliza o novo endpoint Master para criar todo o ecossistema
 * do parceiro em uma única chamada mockada.
 */

async function simulateFullOnboarding() {
    const fetch = require('node-fetch');
    const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev';
    const TEST_EMAIL = `parceiro_full_${Date.now()}@teste.com`;
    const MASTER_EMAIL = "celsosilvajunior90@gmail.com";

    console.log(`🚀 Iniciando Ativação Instantânea (Zero Intervenção): ${TEST_EMAIL}\n`);

    try {
        const res = await fetch(`${WORKER_URL}/api/master/simulate-onboarding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Email': MASTER_EMAIL // Autenticação via Master
            },
            body: JSON.stringify({
                email: TEST_EMAIL,
                name: "Parceiro Zero Intervenção",
                shopName: "Barbearia Express Automatizada",
                niche: "barbearia",
                phone: "551199999999"
            })
        });

        const data = await res.json();
        console.log("💎 Resultado da API Master:", JSON.stringify(data, null, 2));

        if (data.success) {
            console.log("\n✅ NEGÓCIO 100% OPERACIONAL!");
            console.log(`🤖 Robô Leo Ativado | 💳 Assinatura Pro Validada | ✂️ Catálogo Criado`);
            console.log(`🔗 Acesso: https://universal-scheduler.pages.dev/admin?email=${TEST_EMAIL}`);
        } else {
            console.log("❌ Falha na simulação:", data.error || data.message);
        }
    } catch (e) {
        console.error("❌ Erro ao conectar com o Worker:", e.message);
    }
}

simulateFullOnboarding().catch(console.error);
