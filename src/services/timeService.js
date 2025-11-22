import { supabase } from '../lib/supabase';

/**
 * Fichajes en Supabase:
 * Tabla: time_entries
 * Campos: date_key (text), user_id (text), entry (text), exit (text), status (text), note (text/null)
 */
export async function fetchTimeDataFromSupabase() {
    const { data, error } = await supabase.from("time_entries").select("*");

    if (error) {
        console.error("Error loading time_entries from Supabase", error);
        return {};
    }

    const result = {};
    for (const row of data) {
        const { date_key, user_id, entry, exit, status, note } = row;
        if (!result[date_key]) result[date_key] = {};
        result[date_key][user_id] = {
            entry: entry || "",
            exit: exit || "",
            status: status || "",
            note: note || "",
        };
    }
    return result;
}

export async function deleteTimeEntryFromSupabase(dateKey, userId) {
    const { error } = await supabase
        .from("time_entries")
        .delete()
        .eq("date_key", dateKey)
        .eq("user_id", userId);

    if (error) {
        console.error("Error deleting time entry:", error);
    }
}

export async function saveTimeEntryToSupabase(dateKey, userId, record) {
    const payload = {
        date_key: dateKey,
        user_id: userId,
        entry: record.entry || null,
        exit: record.exit || null,
        status: record.status || null,
        note: record.note || null,
    };

    const { error } = await supabase.from("time_entries").upsert(payload);

    if (error) {
        console.error("Error saving to Supabase:", error);
    }
}
