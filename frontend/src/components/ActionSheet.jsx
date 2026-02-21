import React from 'react';
import { Calendar, MessageSquare, Edit2, CreditCard, CheckCircle, Clock, X, ChevronLeft } from 'lucide-react';

export const ActionSheet = ({
    selectedActionAppt,
    setSelectedActionAppt,
    sheetView,
    setSheetView,
    handleEditStart,
    handleWhatsAppNotify,
    updateStatus,
    updatePayment,
    user
}) => {
    if (!selectedActionAppt) return null;

    return (
        <div className="bottom-sheet-overlay" onClick={() => { setSelectedActionAppt(null); setSheetView('main'); }}>
            <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
                <div className="sheet-header"></div>

                {sheetView === 'main' ? (
                    <>
                        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Ações para {selectedActionAppt.user_name}</h3>
                        <div className="action-list">
                            <button className="action-item" onClick={() => { handleEditStart(selectedActionAppt); setSelectedActionAppt(null); }}>
                                <Calendar size={20} className="text-primary" /> Reagendar / Mudar Serviço
                            </button>
                            <button className="action-item" onClick={() => { handleWhatsAppNotify(selectedActionAppt); setSelectedActionAppt(null); }}>
                                <MessageSquare size={20} color="#25D366" /> Enviar WhatsApp
                            </button>

                            {(user.isAdmin || user.isBarber) && (
                                <>
                                    <button className="action-item" onClick={() => setSheetView('status')}>
                                        <Edit2 size={20} color="#3498db" /> Alterar Status do Agendamento
                                    </button>
                                    <button className="action-item" onClick={() => setSheetView('payment')}>
                                        <CreditCard size={20} color="#2ecc71" /> Alterar Pagamento
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                ) : sheetView === 'status' ? (
                    <>
                        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Definir Status</h3>
                        <div className="action-list">
                            {[
                                { id: 'pending', label: 'Pendente', icon: <Edit2 size={18} /> },
                                { id: 'confirmed', label: 'Confirmado', icon: <CheckCircle size={18} /> },
                                { id: 'cancelled', label: 'Cancelado', icon: <X size={18} /> }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    className="action-item"
                                    onClick={() => updateStatus(opt.id)}
                                >
                                    {opt.icon} {opt.label}
                                </button>
                            ))}
                            <button className="action-item" style={{ marginTop: '10px', background: 'rgba(255,255,255,0.05)' }} onClick={() => setSheetView('main')}>
                                <ChevronLeft size={18} /> Voltar
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--primary)' }}>Alterar Pagamento</h3>
                        <div className="action-list">
                            <button
                                className="action-item"
                                onClick={() => updatePayment('paid')}
                            >
                                <CheckCircle size={18} color="#2ecc71" /> Marcar como PAGO (Local)
                            </button>
                            <button
                                className="action-item"
                                onClick={() => updatePayment('pending')}
                            >
                                <Clock size={18} color="rgba(255,255,255,0.4)" /> Marcar como PENDENTE
                            </button>
                            <button className="action-item" style={{ marginTop: '10px', background: 'rgba(255,255,255,0.05)' }} onClick={() => setSheetView('main')}>
                                <ChevronLeft size={18} /> Voltar
                            </button>
                        </div>
                    </>
                )}

                <button className="btn-close-sheet" onClick={() => { setSelectedActionAppt(null); setSheetView('main'); }}>Fechar</button>
            </div>
        </div>
    );
};
