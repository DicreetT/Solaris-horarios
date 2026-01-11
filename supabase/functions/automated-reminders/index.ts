import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const USERS_TO_REMIND = [
    "thalia",
    "contable",
    "anabella",
    "07d58adc-8c82-458d-ba48-f733ec706c7c", // Esteban
    "itzi",
    "fer"
];

Deno.serve(async (req) => {
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const message = "¡Hora de comer! 🥗 Recuerda marcar tu descanso en el control de horario. ¡Buen provecho!";

    const notifications = USERS_TO_REMIND.map((userId) => ({
        user_id: userId,
        message,
        read: false,
        created_at: new Date().toISOString()
    }));

    const { error } = await supabase
        .from("notifications")
        .insert(notifications);

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    return new Response(JSON.stringify({ success: true, count: USERS_TO_REMIND.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
});
