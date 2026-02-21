import React from 'react';
import { CreditCard, CheckCircle, Smartphone, X } from 'lucide-react';

export const PaymentModal = ({ appointment, onProcess, onClose, loading }) => {
    if (!appointment) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card modal-content" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                <button className="btn-icon" style={{ position: 'absolute', top: '15px', right: '15px' }} onClick={onClose}><X size={20} /></button>

                <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Pagamento</h2>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                    Selecione como deseja confirmar o pagamento de <strong>R$ {appointment.price}</strong> para <strong>{appointment.service_name}</strong>.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '60px' }}
                        onClick={() => onProcess('real')}
                        disabled={loading}
                    >
                        <CreditCard size={20} /> Cartão ou Pix (Mercado Pago)
                    </button>

                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '60px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'white' }}
                        onClick={() => onProcess('local')}
                        disabled={loading}
                    >
                        <Smartphone size={20} /> Pagar Local (Dinheiro/Maquininha)
                    </button>

                    <button
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '60px', background: 'transparent', border: '1px solid rgba(46, 204, 113, 0.3)', color: '#2ecc71' }}
                        onClick={() => onProcess('mock')}
                        disabled={loading}
                    >
                        <CheckCircle size={20} /> Simular Pagamento (Teste)
                    </button>
                </div>
            </div>
        </div>
    );
};
