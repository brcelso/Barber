import React from 'react';
import { MessageSquare } from 'lucide-react';

export const PhoneSetupModal = ({ show, onSave, loading }) => {
    if (!show) return null;

    return (
        <div className="modal-overlay">
            <div className="glass-card modal-content" style={{ textAlign: 'center' }}>
                <MessageSquare size={48} className="text-primary" style={{ marginBottom: '1.5rem' }} />
                <h2 style={{ marginBottom: '1rem' }}>Falta pouco!</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                    Para agendar seus horários, precisamos do seu número de WhatsApp para confirmações.
                </p>
                <input
                    type="tel"
                    placeholder="(11) 99999-9999"
                    id="phoneInputModal"
                    className="glass-card"
                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '12px', color: 'white', fontSize: '1.2rem', textAlign: 'center', marginBottom: '1.5rem' }}
                />
                <button
                    className="btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => {
                        const val = document.getElementById('phoneInputModal').value;
                        if (val.length < 10) return alert('Por favor, insira um número válido');
                        onSave(val);
                    }}
                    disabled={loading}
                >
                    {loading ? 'Salvando...' : 'Salvar e Continuar'}
                </button>
            </div>
        </div>
    );
};
