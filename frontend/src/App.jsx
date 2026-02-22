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
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('universal_user') || 'null'));
  const [view, setView] = useState('book');
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(startOfToday());
  const [selectedTime, setSelectedTime] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedProfessional, setSelectedProfessional] = useState(null);
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
  const [masterFilter, setMasterFilter] = useState('');
  const [botSettings, setBotSettings] = useState({
    bot_name: 'Leo',
    business_type: 'barbearia',
    bot_tone: 'prestativo e amigável',
    welcome_message: '',
    msg_welcome: '',
    msg_choose_professional: '',
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

  const fetchProfessionals = useCallback(async () => {
    try {
      const data = await api.getProfessionals();
      setProfessionals(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 1) setSelectedProfessional(data[0]);
    } catch { console.error('Error fetching professionals'); setProfessionals([]); }
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    if (!user?.email) return;
    try {
      const data = await api.getTeamMembers(user.email);
      setTeamMembers(Array.isArray(data) ? data : []);
    } catch { console.error('Error fetching team'); setTeamMembers([]); }
  }, [user]);

  const fetchServices = useCallback(async (ts = '') => {
    try {
      const data = await api.getServices(selectedProfessional?.email, ts);
      setServices(Array.isArray(data) ? data : []);
    } catch {
      console.error('Error fetching services');
      setServices([]);
    }
  }, [selectedProfessional?.email]);

  const fetchAppointments = useCallback(async (ts = '') => {
    if (!user) return;
    try {
      const data = await api.getAppointments(user.email, ts);
      setAppointments(data || []);
    } catch { console.error('Error fetching appointments'); }
  }, [user]);

  const fetchAdminAppointments = useCallback(async (ts = '') => {
    if (!user?.isAdmin && !user?.isProfessional) return;
    try {
      const data = await api.getAdminAppointments(user.email, ts);
      setAdminAppointments(data || []);
    } catch { console.error('Error fetching admin appts'); }
  }, [user]);

  const fetchBusySlots = useCallback(async (date, professional, ts = '') => {
    const effectiveProfessional = professional || (user?.isProfessional ? user : null);

    if (!effectiveProfessional || !date) {
      setBusySlots([]);
      return;
    }

    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const data = await api.getBusySlots(dateStr, effectiveProfessional.email, ts);

      const dataArray = Array.isArray(data) ? data : [];

      // CORREÇÃO TELA PRETA: Mapeamento blindado para evitar erro de undefined
      const slots = dataArray
        .filter(slot => slot !== null && slot !== undefined)
        .map(slot => {
          if (typeof slot === 'string') return slot;
          return {
            time: slot.time || slot.appointment_time,
            status: slot.status
          };
        })
        .filter(slot => (typeof slot === 'string' ? slot : slot.time));

      setBusySlots(slots);
    } catch (error) {
      console.error('Error fetching busy slots:', error);
      setBusySlots([]);
    }
  }, [user]);

  const fetchSubscription = useCallback(async (ts = '') => {
    if (!user?.isAdmin && !user?.isProfessional) return;
    try {
      const data = await api.getSubscription(user.email, ts);
      setSubscription(data);
      if ((data.isMaster && !user.isMaster) || (data.isProfessional && !user.isProfessional)) {
        const updatedUser = { ...user, isMaster: data.isMaster, isProfessional: data.isProfessional };
        setUser(updatedUser);
        localStorage.setItem('universal_user', JSON.stringify(updatedUser));
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
        fetchProfessionals(),
        fetchTeamMembers(),
        fetchBusySlots(selectedDate, selectedProfessional || user, ts)
      ]);
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
        const slots = dataArray
          .filter(slot => slot !== null && slot !== undefined)
          .map(slot => {
            if (typeof slot === 'string') return slot.trim();
            return {
              time: (slot.time || slot.appointment_time)?.trim(),
              status: slot.status
            };
          })
          .filter(s => (typeof s === 'string' ? s : s.time));

        setBusySlots(slots);

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
    const effectiveProfessional = selectedProfessional || (user?.isProfessional ? user : null);

    if (!effectiveProfessional) {
      alert("Selecione um profissional primeiro.");
      return;
    }

    setLoading(true);
    try {
      // 2. Executa o bloqueio/liberação enviando o e-mail do profissional alvo
      await api.toggleBlock(user.email, {
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: time,
        professionalEmail: effectiveProfessional.email
      });

      // 3. Aguarda a atualização dos slots
      await fetchBusySlots(selectedDate, effectiveProfessional);

      // 4. Atualiza a lista de agendamentos admin
      fetchAdminAppointments();

    } catch {
      alert('Erro ao processar o bloqueio ou liberação do horário.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeamMember = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('memberName'),
      email: formData.get('memberEmail')
    };
    setLoading(true);
    try {
      await api.addTeamMember(user.email, data);
      await Promise.all([fetchProfessionals(), fetchTeamMembers()]);
      e.target.reset();
    } catch {
      alert('Erro ao adicionar membro.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecruitProfessional = async () => {
    const select = document.getElementById('recruitSelect');
    const email = select.value;
    if (!email) return;
    setLoading(true);
    try {
      await api.recruitProfessional(user.email, email);
      await Promise.all([fetchProfessionals(), fetchTeamMembers()]);
    } catch {
      alert('Erro ao recrutar profissional.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTeamMember = async (memberEmail) => {
    if (!confirm('Tem certeza que deseja remover este membro?')) return;
    setLoading(true);
    try {
      await api.removeTeamMember(user.email, memberEmail);
      await Promise.all([fetchProfessionals(), fetchTeamMembers()]);
    } catch {
      alert('Erro ao remover membro.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTeamMember = async (memberEmail, updates) => {
    setLoading(true);
    try {
      await api.updateTeamMember(user.email, memberEmail, updates);
      await Promise.all([fetchProfessionals(), fetchTeamMembers()]);
    } catch {
      alert('Erro ao atualizar membro da equipe.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBotSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.updateBotSettings(user.email, botSettings);
      alert('Configurações do Bot atualizadas!');
    } catch {
      alert('Erro ao atualizar configurações.');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterUpdate = async (targetEmail, updates) => {
    setLoading(true);
    try {
      await api.masterUpdateUser(user.email, targetEmail, updates);
      await fetchMasterData();
    } catch {
      alert('Erro ao atualizar usuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterDelete = async (targetEmail) => {
    if (!confirm('Tem certeza?')) return;
    setLoading(true);
    try {
      await api.masterDeleteUser(user.email, targetEmail);
      await fetchMasterData();
    } catch {
      alert('Erro ao deletar usuário.');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterRestartBot = async (targetEmail) => {
    setLoading(true);
    try {
      await api.startBot(user.email, targetEmail);
      alert('Bot reiniciado!');
    } catch {
      alert('Erro ao reiniciar bot.');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterStopBot = async (targetEmail) => {
    setLoading(true);
    try {
      await api.stopBot(user.email, targetEmail);
      alert('Bot parado!');
    } catch {
      alert('Erro ao parar bot.');
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
        localStorage.setItem('universal_user', JSON.stringify(res.user));
        if (!res.user.phone) setShowPhoneSetup(true);
      }
    } catch { alert('Erro no login'); }
    finally { setLoading(false); }
  }, []);

  const handleBooking = async () => {
    if (!selectedService || !selectedTime || !user || !selectedProfessional) {
      alert('Por favor, selecione o profissional, o serviço e o horário.');
      return;
    }

    setLoading(true);
    try {
      const bookingData = {
        email: user.email,
        professionalEmail: selectedProfessional.email,
        serviceId: selectedService.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime
      };

      const res = await api.book(user.email, bookingData);
      if (res.error) {
        alert(`Erro: ${res.error}`);
        return;
      }

      alert('Agendado com sucesso! 🎉');
      await fetchAppointments();
      setView('history');
    } catch {
      alert('Erro de conexão ao tentar agendar.');
    } finally {
      setLoading(false);
    }
  };

  // --- EFFECTS ---
  useEffect(() => { fetchProfessionals(); }, [fetchProfessionals]);

  useEffect(() => {
    if (user) {
      if (user.isAdmin || user.isProfessional) {
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
    if (user?.isAdmin || user?.isProfessional) {
      fetchWaStatus();
      fetchBotSettings();
      fetchTeamMembers();
      if (user.isMaster) fetchMasterData();
    }
  }, [user, fetchBotSettings, fetchMasterData, fetchWaStatus, fetchTeamMembers]);

  useEffect(() => {
    const professional = selectedProfessional || (user?.isProfessional ? user : null);
    if (professional) {
      fetchServices();
      fetchBusySlots(selectedDate, professional);
    }
  }, [selectedProfessional, selectedDate, user, fetchBusySlots, fetchServices]);

  if (!user) return <LoginScreen onManualLogin={handleLogin} loading={loading} VITE_GOOGLE_CLIENT_ID={import.meta.env.VITE_GOOGLE_CLIENT_ID} />;

  return (
    <div className="container">
      <Header
        user={user} view={view} setView={setView} loading={loading}
        handleRefresh={handleRefresh} handleLogout={() => { setUser(null); localStorage.removeItem('universal_user'); }}
        subscription={subscription} setShowPlanSelection={setShowPlanSelection} isAdminMode={isAdminMode}
      />

      {view === 'book' && (
        <BookingPage
          key={`book-${selectedProfessional?.email || 'none'}-${selectedDate.getTime()}`}
          user={user} professionals={professionals} selectedProfessional={selectedProfessional} setSelectedProfessional={setSelectedProfessional}
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
            const professional = professionals.find(p => p.email === appt.barber_email);
            if (professional) setSelectedProfessional(professional);
            setSelectedService({ id: appt.service_id, name: appt.service_name, price: appt.price });
            setView('book');
          }}
        />
      )}
      {view === 'admin' && (user.isAdmin || user.isProfessional) && (
        <AdminPanel
          key={`admin-${busySlots.length}-${selectedDate.getTime()}`}
          user={user} adminTab={adminTab} setAdminTab={setAdminTab}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          timeSlots={timeSlots} busySlots={busySlots} adminAppointments={adminAppointments}
          handleToggleBlock={handleToggleBlock} handleToggleFullDay={handleToggleFullDay}
          setSelectedActionAppt={setSelectedActionAppt} handleRefresh={handleRefresh}
          professionals={professionals} teamMembers={teamMembers} loading={loading} waStatus={waStatus} botSettings={botSettings}
          setBotSettings={setBotSettings} handleUpdateBotSettings={handleUpdateBotSettings}
          handleAddTeamMember={handleAddTeamMember} handleRecruitProfessional={handleRecruitProfessional}
          handleRemoveTeamMember={handleRemoveTeamMember} handleUpdateTeamMember={handleUpdateTeamMember}
          masterStats={masterStats} masterUsers={masterUsers} masterFilter={masterFilter} setMasterFilter={setMasterFilter}
          handleMasterUpdate={handleMasterUpdate} handleMasterDelete={handleMasterDelete}
          handleMasterRestartBot={handleMasterRestartBot} handleMasterStopBot={handleMasterStopBot}
        />
      )}

      {/* MODAIS */}
      <PaymentModal appointment={paymentSelectionAppt} onClose={() => setPaymentSelectionAppt(null)} onProcess={() => { }} loading={loading} />
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