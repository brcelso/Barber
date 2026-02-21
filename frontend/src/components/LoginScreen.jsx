import React, { useState, useEffect } from 'react';
import { User, ChevronLeft } from 'lucide-react';

export const LoginScreen = ({ onManualLogin, loading, VITE_GOOGLE_CLIENT_ID }) => {
    const [showManualLogin, setShowManualLogin] = useState(false);

    useEffect(() => {
        let retryCount = 0;
        const initGoogle = () => {
            if (window.google) {
                window.google.accounts.id.initialize({
                    client_id: VITE_GOOGLE_CLIENT_ID,
                    callback: (response) => {
                        const payload = JSON.parse(atob(response.credential.split('.')[1]));
                        onManualLogin({
                            name: payload.name,
                            email: payload.email,
                            picture: payload.picture,
                            token: response.credential,
                        }, true); // isGoogle = true
                    },
                });

                const btnElem = document.getElementById("googleBtn");
                if (btnElem) {
                    window.google.accounts.id.renderButton(btnElem, {
                        theme: "outline",
                        size: "large",
                        shape: "rectangular",
                        width: 280,
                        logo_alignment: "left"
                    });
                }
            } else if (retryCount < 10) {
                retryCount++;
                setTimeout(initGoogle, 500);
            }
        };
        if (!showManualLogin) initGoogle();
    }, [showManualLogin]);

    const handleFormSubmit = (e) => {
        e.preventDefault();
        const data = {
            name: e.target.name.value,
            email: e.target.email.value,
            phone: e.target.phone.value,
            picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(e.target.name.value)}&background=d4af37&color=fff`
        };
        onManualLogin(data, false);
    };

    return (
        <div className="login-screen fade-in">
            <div className="glass-card login-card" style={{ padding: '3rem', textAlign: 'center', width: '100%', maxWidth: '420px' }}>
                <div className="logo-text" style={{ fontSize: '3rem', marginBottom: '1rem' }}>✂️ Barber</div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>O melhor corte da sua vida, a um clique de distância.</p>

                {!showManualLogin ? (
                    <>
                        <div id="googleBtn" className="google-btn-container"></div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>ou continue com seus dados</p>
                        <button
                            className="btn-primary"
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'white', display: 'flex', gap: '10px', justifyContent: 'center' }}
                            onClick={() => setShowManualLogin(true)}
                        >
                            <User size={18} /> Entrar com E-mail e Telefone
                        </button>
                    </>
                ) : (
                    <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input name="name" type="text" placeholder="Seu Nome" className="glass-card" style={{ padding: '1rem', width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '12px' }} required />
                        <input name="email" type="email" placeholder="E-mail" className="glass-card" style={{ padding: '1rem', width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '12px' }} required />
                        <input name="phone" type="tel" placeholder="WhatsApp (ex: 11999999999)" className="glass-card" style={{ padding: '1rem', width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', borderRadius: '12px' }} required />
                        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Entrando...' : 'Entrar agora'}
                        </button>
                        <button
                            type="button"
                            className="btn-icon"
                            style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.9rem' }}
                            onClick={() => setShowManualLogin(false)}
                        >
                            <ChevronLeft size={16} /> Voltar para Login Google
                        </button>
                    </form>
                )}

                <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Ao entrar você concorda com nossos termos.
                </p>
            </div>
        </div>
    );
};
