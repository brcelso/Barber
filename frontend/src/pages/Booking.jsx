import React from 'react';
import { format, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Scissors, Clock, User, Check, ChevronLeft, ChevronRight } from 'lucide-react';

export const BookingPage = ({
    professionals,
    selectedProfessional,
    setSelectedProfessional,
    services,
    selectedService,
    setSelectedService,
    selectedDate,
    setSelectedDate,
    timeSlots,
    selectedTime,
    setSelectedTime,
    busySlots,
    handleBooking,
    loading,
    editingAppointment,
    setEditingAppointment
}) => {
    const handleNextDay = () => setSelectedDate(prev => {
        const next = new Date(prev);
        next.setDate(next.getDate() + 1);
        return next;
    });
    const handlePrevDay = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate > today) {
            setSelectedDate(prev => {
                const next = new Date(prev);
                next.setDate(next.getDate() - 1);
                return next;
            });
        }
    };

    return (
        <main className="fade-in" id="booking-section">
            {editingAppointment && (
                <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid var(--primary)', background: 'rgba(212, 175, 55, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ color: 'var(--primary)' }}>Editando Agendamento</h3>
                            <p style={{ fontSize: '0.8rem' }}>Alterando horário original de {editingAppointment.appointment_time}</p>
                        </div>
                        <button className="btn-icon" onClick={() => setEditingAppointment(null)}><Check size={20} /></button>
                    </div>
                </div>
            )}

            {/* Seleção de Profissional */}
            <section style={{ marginBottom: '3rem' }}>
                <h2 className="section-title"><User size={20} /> Escolha o Profissional</h2>
                <div className="professional-grid">
                    {professionals.length === 0 ? (
                        <div className="glass-card" style={{ width: '100%', textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                            <User size={32} style={{ marginBottom: '1rem' }} />
                            <p>Nenhum profissional disponível no momento.</p>
                        </div>
                    ) : (
                        professionals.map(professional => (
                            <div
                                key={professional.email}
                                className={`professional-card ${selectedProfessional?.email === professional.email ? 'active' : ''}`}
                                onClick={() => setSelectedProfessional(professional)}
                            >
                                <img src={professional.picture} alt={professional.name} />
                                <p>{professional.name}</p>
                                {professional.shop_name && <p style={{ fontSize: '0.6rem', opacity: 0.6 }}>{professional.shop_name}</p>}
                            </div>
                        ))
                    )}
                </div>
            </section>

            {selectedProfessional && (
                <>
                    {/* Seleção de Serviço */}
                    <section style={{ marginBottom: '3rem' }}>
                        <h2 className="section-title"><Scissors size={20} /> O que vamos fazer hoje?</h2>
                        <div className="service-grid">
                            {services.map(service => (
                                <div
                                    key={service.id}
                                    className={`service-card ${selectedService?.id === service.id ? 'active' : ''}`}
                                    onClick={() => setSelectedService(service)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{service.name}</h3>
                                        <div className="price-badge">R$ {service.price}</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        <Clock size={16} /> {service.duration_minutes} min
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Seleção de Data */}
                    <section style={{ marginBottom: '3rem' }}>
                        <h2 className="section-title"><Clock size={20} /> Quando?</h2>
                        <div className="date-nav glass-card">
                            <button className="btn-icon" onClick={handlePrevDay}><ChevronLeft size={20} /></button>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'capitalize' }}>
                                    {selectedDate instanceof Date && !isNaN(selectedDate) ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR }) : 'Data selecionada'}
                                </div>
                                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                                    {isSameDay(selectedDate, new Date()) ? 'Hoje' : 'Selecionado'}
                                </div>
                            </div>
                            <button className="btn-icon" onClick={handleNextDay}><ChevronRight size={20} /></button>
                        </div>

                        {/* Grid de Horários - LOGICA DE BLOQUEIO INTEGRADA */}
                        <div className="time-grid" style={{ marginTop: '2rem' }}>
                            {timeSlots.filter(time => {
                                if (!isSameDay(selectedDate, new Date())) return true;

                                const [hours, minutes] = time.split(':').map(Number);
                                const now = new Date();
                                const slotTime = new Date();
                                slotTime.setHours(hours, minutes, 0, 0);

                                return slotTime > now;
                            }).map(time => {
                                // Busca o slot. Suporta string ou objeto {time, status}
                                const slotData = busySlots && busySlots.find(s => {
                                    const slotTime = typeof s === 'string' ? s : (s.time || s.appointment_time);
                                    return slotTime?.trim() === time.trim();
                                });

                                const isBusy = !!slotData;
                                const isBlocked = slotData?.status === 'blocked';

                                return (
                                    <button
                                        key={time}
                                        disabled={isBusy}
                                        className={`time-slot ${selectedTime === time ? 'active' : ''}`}
                                        style={isBlocked ? {
                                            backgroundColor: '#dc2626', // Vermelho para bloqueio do WhatsApp
                                            borderColor: '#991b1b',
                                            color: 'white',
                                            opacity: 0.9,
                                            cursor: 'not-allowed'
                                        } : {}}
                                        onClick={() => setSelectedTime(time)}
                                    >
                                        {isBlocked ? '🚫' : time}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Rodapé com Botão de Finalizar */}
                    <div className="booking-footer fade-in">
                        <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem' }}>
                            <div>
                                {selectedService && selectedTime ? (
                                    <>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{selectedService.name} às {selectedTime}</p>
                                        <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>Total: R$ {selectedService.price}</p>
                                    </>
                                ) : (
                                    <p style={{ color: 'var(--text-muted)' }}>Selecione serviço e horário</p>
                                )}
                            </div>
                            <button
                                className="btn-primary"
                                disabled={!selectedService || !selectedTime || loading}
                                onClick={handleBooking}
                            >
                                {loading ? 'Processando...' : (editingAppointment ? 'Confirmar Alteração' : 'Finalizar Agendamento')}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </main>
    );
};