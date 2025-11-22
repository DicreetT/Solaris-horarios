import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CalendarGrid from '../components/CalendarGrid';

/**
 * Calendar page
 * Main calendar view
 */
function CalendarPage() {
    const { currentUser } = useAuth();
    const [monthDate, setMonthDate] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState(() => new Date());

    return (
        <div className="max-w-7xl">
            {/* Calendar */}
            <CalendarGrid
                monthDate={monthDate}
                selectedDate={selectedDate}
                onChangeMonth={setMonthDate}
                onSelectDate={setSelectedDate}
                isAdminView={false}
            />
        </div>
    );
}

export default CalendarPage;

