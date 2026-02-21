import React, { useState, useEffect, useCallback } from 'react';
import { format, startOfToday } from 'date-fns';

// Services
import { api } from './services/api';

// Components
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { ActionSheet } from './components/ActionSheet';
import { PaymentModal } from './components/PaymentModal';
import { PlanSelectionModal } from './components/PlanSelectionModal';
import { PhoneSetupModal } from './components/PhoneSetupModal';

// Pages
import { BookingPage } from './pages/Booking';
import { HistoryPage } from './pages/History';
import { AdminPanel } from './pages/Admin/AdminPanel';

function App() {
  // --- ESTADOS ---
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('barber_user') || 'null'));
  const [view, setView] = useState('book'); 
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [selectedTime, setSelectedTime] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [busySlots, setBusySlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [subscription, setSubscription] = useState({ daysLeft: 0, isActive: false, expires: null });
  const [showPhoneSetup, setShowPhoneSetup] = useState(false);
  
  // CORREÇÃO LINT: Removidas variáveis 'editingAppointment' e 'masterFilter' que não estavam sendo usadas
  
  const [paymentSelectionAppt, setPaymentSelectionAppt] = useState(null);
  const [selectedActionAppt, setSelectedActionAppt] = useState(null);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', qr: null });
  const [masterStats, setMasterStats] = useState(null);
  const [masterUsers, setMasterUsers] = useState([]);
  const [botSettings, setBotSettings] = useState({
    bot_name: 'Leo',
    business_type: 'barbearia',
    bot_tone: 'prestativo e amigável',
    welcome_message: '',
    msg_welcome: '',
    msg_choose_barber: '',
    msg_choose_service: '',
    msg_confirm_booking: ''
  });
  const [adminTab, setAdminTab] = useState('agenda');
  const [sheetView, setSheetView] = useState('main');

  const timeSlots = [
    "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"
  ];

  // --- BUSCA DE DADOS (API) ---

  const fetchBarbers = useCallback(async () => {
    try {
      const data = await api.getBarbers();
      setBarbers(data || []);
      if (data?.length === 1) setSelectedBarber(data[0]);
    } catch { console.error('Error fetching barbers'); }
  }, []);

  const fetchServices = useCallback(async (ts = '') => {
    try {
      const data = await api.getServices(selectedBarber?.email, ts);
      setServices(data || []);
    } catch {
      console.error('Error fetching services');
    }
  }, [selectedBarber?.email]);

  const fetchAppointments = useCallback(async (ts = '') => {
    if (!user) return;
    try {
      const data = await api.getAppointments(user.email, ts);
      setAppointments(data || []);
    } catch { console.error('Error fetching appointments'); }
  }, [user]);

  const fetchAdminAppointments = useCallback(async (ts = '') => {
    if (!user?.isAdmin && !user?.isBarber) return;
    try {
      const data = await api.getAdminAppointments(user.email, ts);
      setAdminAppointments(data || []);
    } catch { console.error('Error fetching admin appts'); }
  }, [user]);

 const fetchBusySlots = useCallback(async (date, barber, ts = '') => {
    const effectiveBarber = barber || (user?.isBarber ? user : null);
    
    if (!effectiveBarber || !date) {
      setBusySlots([]);
      return;
    }

    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const data = await api.getBusySlots(dateStr, effectiveBarber.email, ts);
      
      const dataArray = Array.isArray(data) ? data : [];

      // CORREÇÃO TELA PRETA: Mapeamento blindado para evitar erro de undefined
      const slotsOnly = dataArray
      .filter(slot => slot !== null && slot !== undefined) 
      .map(slot => {
        if (typeof slot === 'string') return slot;
        if (slot && slot.appointment_time) return slot.appointment_time;
        return null; 
      })
      .filter(slot => slot !== null); 
      
      setBusySlots(slotsOnly);
    } catch (error) { 
      console.error('Error fetching busy slots:', error); 
      setBusySlots([]); 
    }
  }, [user]);

  const fetchSubscription = useCallback(async (ts = '') => {
    if (!user?.isAdmin && !user?.isBarber) return;
    try {
      const data = await api.getSubscription(user.email, ts);
      setSubscription(data);
      if ((data.isMaster && !user.isMaster) || (data.isBarber && !user.isBarber)) {
        const updatedUser = { ...user, isMaster: data.isMaster, isBarber: data.isBarber };
        setUser(updatedUser);
        localStorage.setItem('barber_user', JSON.stringify(updatedUser));
      }
    } catch { console.error('Subscription fail'); }
  }, [user]);

  const fetchWaStatus = useCallback(async () => {
    if (!user?.email) return;
    try {
      const data = await api.getWaStatus(user.email);
      setWaStatus(data);
    } catch { console.error('WA status error'); }
  }, [user]);

  const fetchBotSettings = useCallback(async () => {
    if (!user?.email) return;
    try {
      const data = await api.getBotSettings(user.email);
      if (data) setBotSettings(prev => ({ ...prev, ...data }));
    } catch { console.error('Bot settings error'); }
  }, [user]);

  const fetchMasterData = useCallback(async () => {
    if (!user?.isMaster) return;
    try {
      const [stats, users] = await Promise.all([
        api.getMasterStats(user.email),
        api.getMasterUsers(user.email)
      ]);
      setMasterStats(stats);
      setMasterUsers(users || []);
    } catch { console.error('Master data error'); }
  }, [user]);

  // --- HANDLERS DE UI ---

  const handleRefresh = async () => {
    setLoading(true);
    const ts = Date.now();
    try {
      await Promise.all([
        fetchSubscription(ts),
        fetchAppointments(ts),
        fetchAdminAppointments(ts),
        fetchWaStatus(),
        fetchBarbers(),
        fetchBusySlots(selectedDate, selectedBarber || user, ts)
      ]);
      // CORREÇÃO LINT: Alterado catch para não usar a variável 'e' se não for necessário
    } catch { console.error("Refresh error"); }
    finally { setLoading(false); }
  };

const handleToggleFullDay = async () => {
    const isBlocking = busySlots.length < timeSlots.length;
    const action = isBlocking ? 'block' : 'unblock';
    
    setLoading(true);
    try {
      const res = await api.bulkToggleBlock(user.email, {
        date: format(selectedDate, 'yyyy-MM-dd'),
        action,
        times: timeSlots,
        scope: user.ownerId ? 'individual' : 'shop'
      });

      if (res.status) {
        // 1. Limpa o estado local para garantir que a interface reaja
        setBusySlots([]); 
        
        // 2. Busca os dados atualizados do servidor
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const newData = await api.getBusySlots(dateStr, user.email);
        
        // 3. Normalização Inteligente: mapeia 'time' ou 'appointment_time'
        const dataArray = Array.isArray(newData) ? newData : [];
        const slotsOnly = dataArray
          .filter(slot => slot !== null && slot !== undefined)
          .map(slot => {
            if (typeof slot === 'string') return slot.trim();
            // Tenta pegar a chave 'time' que o seu backend está enviando agora
            const value = slot.time || slot.appointment_time;
            return value ? value.trim() : null;
          })
          .filter(Boolean); // Remove nulos e garante array limpo

        setBusySlots(slotsOnly);
        
        alert(isBlocking ? 'Dia bloqueado com sucesso!' : 'Dia liberado!');
      }
    } catch {
      // Removido o '(e)' para evitar erro de 'unused variable' no deploy
      alert('Erro ao alterar o dia. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

const handleToggleBlock = async (time) => {
    // 1. Define o profissional alvo (quem será bloqueado)
    const effectiveBarber = selectedBarber || (user?.isBarber ? user : null);
    
    if (!effectiveBarber) {
      alert("Selecione um barbeiro primeiro.");
      return;
    }

    setLoading(true);
    try {
      // 2. Executa o bloqueio/liberação enviando o e-mail do barbeiro alvo
      // O Worker modularizado costuma exigir o barberEmail no corpo do POST
      await api.toggleBlock(user.email, { 
        date: format(selectedDate, 'yyyy-MM-dd'), 
        time: time,
        barberEmail: effectiveBarber.email 
      });
      
      // 3. Aguarda a atualização dos slots para garantir que a cor mude na interface
      // Importante: Passamos o effectiveBarber para buscar os slots dele
      await fetchBusySlots(selectedDate, effectiveBarber);
      
      // 4. Atualiza a lista de agendamentos (admin) em segundo plano
      fetchAdminAppointments();
      
    } catch {
      // Catch limpo para evitar erros de Lint (variável não usada)
      alert('Erro ao processar o bloqueio ou liberação do horário.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = useCallback(async (data) => {
    setLoading(true);
    try {
      const res = await api.login(data);
      if (res.user) {
        setUser(res.user);
        localStorage.setItem('barber_user', JSON.stringify(res.user));
        if (!res.user.phone) setShowPhoneSetup(true);
      }
    } catch { alert('Erro no login'); }
    finally { setLoading(false); }
  }, []);

const handleBooking = async () => {
  // 1. Validação básica
  if (!selectedService || !selectedTime || !user || !selectedBarber) {
    alert('Por favor, selecione o barbeiro, o serviço e o horário.');
    return;
  }

  setLoading(true);
  try {
    // 2. O objeto DEVE ter exatamente estes nomes de chaves:
    const bookingData = {
      email: user.email,          // O Worker espera 'email' para o cliente
      barberEmail: selectedBarber.email, 
      serviceId: selectedService.id,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedTime
    };

    // 3. Chamada da API
    const res = await api.book(user.email, bookingData);

    // Verificação de erro (O Worker retorna {error: '...'})
    if (res.error) {
      alert(`Erro: ${res.error}`);
      return;
    }

    alert('Agendado com sucesso! ✂️');
    
    // Atualiza a lista e vai para o histórico
    await fetchAppointments();
    setView('history');
    
  } catch {
    // Catch limpo para o seu Lint
    alert('Erro de conexão ao tentar agendar.');
  } finally {
    setLoading(false);
  }
};

  // --- EFFECTS ---
  useEffect(() => { fetchBarbers(); }, [fetchBarbers]);

  useEffect(() => {
    if (user) {
      if (user.isAdmin || user.isBarber) {
        setIsAdminMode(true);
        setView('admin');
        fetchSubscription();
        fetchAdminAppointments();
      } else {
        setView('book');
      }
      fetchAppointments();
    }
  }, [user, fetchAdminAppointments, fetchAppointments, fetchSubscription]);

  useEffect(() => {
    if (user?.isAdmin || user?.isBarber) {
      fetchWaStatus();
      fetchBotSettings();
      if (user.isMaster) fetchMasterData();
    }
  }, [user, fetchBotSettings, fetchMasterData, fetchWaStatus]);

  useEffect(() => {
    const barber = selectedBarber || (user?.isBarber ? user : null);
    if (barber) {
      fetchServices();
      fetchBusySlots(selectedDate, barber);
    }
  }, [selectedBarber, selectedDate, user, fetchBusySlots, fetchServices]);

  if (!user) return <LoginScreen onManualLogin={handleLogin} loading={loading} VITE_GOOGLE_CLIENT_ID={import.meta.env.VITE_GOOGLE_CLIENT_ID} />;

  return (
    <div className="container">
      <Header 
        user={user} view={view} setView={setView} loading={loading} 
        handleRefresh={handleRefresh} handleLogout={() => { setUser(null); localStorage.removeItem('barber_user'); }}
        subscription={subscription} setShowPlanSelection={setShowPlanSelection} isAdminMode={isAdminMode}
      />

      {view === 'book' && (
        <BookingPage 
          user={user} barbers={barbers} selectedBarber={selectedBarber} setSelectedBarber={setSelectedBarber}
          services={services} selectedService={selectedService} setSelectedService={setSelectedService}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate} timeSlots={timeSlots}
          selectedTime={selectedTime} setSelectedTime={setSelectedTime} busySlots={busySlots}
          handleBooking={handleBooking} loading={loading}
        />
      )}

      {view === 'history' && (
        <HistoryPage 
          appointments={appointments} 
          loading={loading} 
          handleCancel={(id) => api.cancelAppointment(user.email, id).then(handleRefresh)}
          handleDelete={(id) => api.deleteAppointment(user.email, id).then(handleRefresh)}
          handlePayment={(appt) => setPaymentSelectionAppt(appt)}
          handleEditStart={(appt) => {
            const barber = barbers.find(b => b.email === appt.barber_email);
            if (barber) setSelectedBarber(barber);
            setSelectedService({ id: appt.service_id, name: appt.service_name, price: appt.price });
            setView('book');
          }}
        />
      )}
      {view === 'admin' && (user.isAdmin || user.isBarber) && (
        <AdminPanel 
          key={`admin-${busySlots.length}-${selectedDate.getTime()}`}
          user={user} adminTab={adminTab} setAdminTab={setAdminTab}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          timeSlots={timeSlots} busySlots={busySlots} adminAppointments={adminAppointments}
          handleToggleBlock={handleToggleBlock} handleToggleFullDay={handleToggleFullDay}
          setSelectedActionAppt={setSelectedActionAppt} handleRefresh={handleRefresh}
          barbers={barbers} loading={loading} waStatus={waStatus} botSettings={botSettings}
          setBotSettings={setBotSettings} masterStats={masterStats} masterUsers={masterUsers}
        />
      )}

      {/* MODAIS */}
      <PaymentModal appointment={paymentSelectionAppt} onClose={() => setPaymentSelectionAppt(null)} onProcess={() => {}} loading={loading} />
      <PlanSelectionModal show={showPlanSelection} onClose={() => setShowPlanSelection(false)} onSelect={(p) => api.subscriptionPayment(user.email, p)} loading={loading} />
      <PhoneSetupModal show={showPhoneSetup} loading={loading} onSave={(p) => api.updateProfile(user.email, p).then(() => setShowPhoneSetup(false))} />
      
      <ActionSheet 
        selectedActionAppt={selectedActionAppt} setSelectedActionAppt={setSelectedActionAppt}
        sheetView={sheetView} setSheetView={setSheetView} user={user}
        updateStatus={(s) => api.updateStatus(user.email, selectedActionAppt.id, s).then(handleRefresh)}
      />
    </div>
  );
}

export default App;