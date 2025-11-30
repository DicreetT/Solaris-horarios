// Application-wide type definitions

export interface User {
    id: string;
    name: string;
    email: string;
    password?: string;
    isTrainingManager?: boolean;
    isAdmin?: boolean;
}

export interface DriveFolder {
    id: string;
    label: string;
    description: string;
    emoji: string;
    url: string;
    users: string[];
}

export interface TimeEntry {
    id: number;
    date_key: string;
    user_id: string;
    entry: string | null;
    exit: string | null;
    status: string | null;
    note: string | null;
    inserted_at: string;
    updated_at?: string;
}

export interface TrainingComment {
    by: string;
    text: string;
    at: string;
}

export interface Attachment {
    name: string;
    url: string;
    type: string;
    size: number;
}

export interface Training {
    id: number;
    user_id: string;
    requested_date_key: string;
    scheduled_date_key: string | null;
    status: 'rescheduled' | 'accepted' | 'pending' | 'rejected';
    comments: TrainingComment[]; // jsonb
    attachments?: Attachment[]; // jsonb
    created_at: string;
}

export interface Meeting {
    id: number;
    created_by: string;
    title: string;
    description: string | null;
    preferred_date_key: string | null;
    preferred_slot: string | null;
    participants: string[]; // jsonb
    status: 'pending' | 'rejected' | 'scheduled';
    scheduled_date_key: string | null;
    scheduled_time: string | null;
    response_message: string | null;
    attachments?: Attachment[]; // jsonb
    comments?: Comment[]; // jsonb
    created_at: string;
}

export interface Absence {
    id: number;
    created_by: string; // was user_id in interface but created_by in DB
    date_key: string;
    reason: string | null;
    status: 'pending' | 'approved' | 'rejected';
    type: 'absence' | 'vacation';
    response_message: string | null;
    attachments?: Attachment[]; // jsonb
    created_at: string;
}

export interface Comment {
    id: string;
    user_id: string;
    text: string;
    attachments: Attachment[];
    created_at: string;
}

export interface Todo {
    id: number;
    title: string;
    description: string | null;
    created_by: string;
    assigned_to: string[]; // jsonb
    due_date_key: string | null;
    completed_by: string[]; // jsonb
    attachments?: Attachment[]; // jsonb
    comments?: Comment[]; // jsonb
    created_at: string;
}

export interface Notification {
    id: number;
    user_id: string;
    message: string;
    read: boolean;
    created_at: string;
}

// Organized time data structure
export interface TimeDataByDate {
    [dateKey: string]: {
        [userId: string]: TimeEntry[];
    };
}

// Component prop types
export interface CalendarDayData {
    date: Date;
    dateKey: string;
    isToday: boolean;
    isCurrentMonth: boolean;
    events: {
        timeEntries: TimeEntry[];
        trainings: Training[];
        meetings: Meeting[];
        absences: Absence[];
    };
}

// Modal props
export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Export configuration
export interface ExportConfig {
    startDate: Date;
    endDate: Date;
    userId?: string;
    format: 'csv' | 'excel' | 'pdf';
}

export interface DailyStatus {
    id: number;
    user_id: string;
    date_key: string;
    status: 'in_person' | 'remote';
    created_at: string;
}
