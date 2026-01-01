import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CalendarGrid from '../components/CalendarGrid';
import DayDetailsModal from '../components/DayDetailsModal';
import { useTimeData } from '../hooks/useTimeData';
import { useTraining } from '../hooks/useTraining';
import { useAbsences } from '../hooks/useAbsences';
import { useTodos } from '../hooks/useTodos';
import { useMeetings } from '../hooks/useMeetings';
import { toDateKey } from '../utils/dateUtils';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useCalendarOverrides } from '../hooks/useCalendarOverrides';

/**
 * Calendar page
 * Main calendar view with day details modal
 */
function CalendarPage() {
    const { currentUser } = useAuth();
    const [monthDate, setMonthDate] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [showDayDetails, setShowDayDetails] = useState(false);

    const { timeData } = useTimeData();
    const { trainingRequests } = useTraining(currentUser);
    const { absenceRequests } = useAbsences(currentUser);
    const { todos } = useTodos(currentUser);
    const { meetingRequests } = useMeetings(currentUser);
    const { overrides, toggleDayStatus } = useCalendarOverrides();

    const handleDateClick = (date: Date) => {
        setSelectedDate(date);
        setShowDayDetails(true);
    };

    // Prepare events for the selected day
    const getDayEvents = () => {
        if (!selectedDate || !currentUser) return null;

        const dKey = toDateKey(selectedDate);
        const dayData = timeData[dKey] || {};
        const myRecord = dayData[currentUser.id]?.[0];
        const isAdmin = currentUser?.isAdmin;
        const override = overrides.find(o => o.date_key === dKey);

        // For non-admins: only show their own items
        // For admins: show all items (will be marked in the modal)

        // Get absences
        const absences = absenceRequests.filter(
            r => {
                const start = r.date_key;
                const end = r.end_date || r.date_key;
                return dKey >= start && dKey <= end &&
                    r.status !== 'rejected' &&
                    (isAdmin || r.created_by === currentUser.id);
            }
        );

        // Get trainings
        const trainings = trainingRequests.filter(
            r => (r.scheduled_date_key === dKey || (!r.scheduled_date_key && r.requested_date_key === dKey)) &&
                r.status !== 'rejected' &&
                (isAdmin || currentUser?.isTrainingManager || r.user_id === currentUser.id)
        );

        // Get tasks
        const tasks = todos.filter(
            t => t.due_date_key === dKey &&
                !t.completed_by.includes(currentUser.id) &&
                (isAdmin || t.assigned_to.includes(currentUser.id))
        );

        // Get meetings
        const meetings = meetingRequests.filter(
            m => m.scheduled_date_key === dKey &&
                m.status === 'scheduled' &&
                (isAdmin || m.participants?.includes(currentUser.id) || m.created_by === currentUser.id)
        );

        return {
            timeEntry: myRecord?.entry ? myRecord : null,
            absences,
            trainings,
            tasks,
            meetings,
            isAdmin,
            isTrainingManager: currentUser?.isTrainingManager,
            override // Pass override info
        };
    };

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-5rem)] flex flex-col">{/* Header */}
            <div className="mb-6 flex items-center gap-4">
                <div className="p-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-primary">
                    <CalendarIcon size={32} />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                        Calendario
                    </h1>
                    <p className="text-gray-500 font-medium">
                        Gestiona tus eventos, reuniones y ausencias. Haz clic en un día para ver detalles.
                    </p>
                </div>
            </div>

            {/* Calendar */}
            <div className="flex-1 min-h-0">
                <CalendarGrid
                    monthDate={monthDate}
                    selectedDate={selectedDate}
                    onChangeMonth={setMonthDate}
                    onSelectDate={handleDateClick}
                    overrides={overrides}
                />
            </div>

            {/* Day Details Modal */}
            {showDayDetails && (
                <DayDetailsModal
                    date={selectedDate}
                    events={getDayEvents()}
                    onClose={() => setShowDayDetails(false)}
                    onToggleDayStatus={toggleDayStatus} // Pass toggle function
                />
            )}
        </div>
    );
}

export default CalendarPage;
