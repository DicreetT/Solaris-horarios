import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "https://esm.sh/web-push@3.6.6"

const PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")
const PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")

webpush.setVapidDetails(
    "mailto:example@yourdomain.com",
    PUBLIC_KEY!,
    PRIVATE_KEY!
)

serve(async (req) => {
    const { user_id, title, message, url } = await req.json()

    // Initialize Supabase client
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // Fetch subscriptions for this user
    const { data: subscriptions, error } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", user_id)

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    const notifications = subscriptions.map((sub: any) => {
        return webpush.sendNotification(
            sub.subscription,
            JSON.stringify({
                title,
                body: message,
                url: url || "/dashboard"
            })
        ).catch((err: any) => {
            console.error("Error sending push:", err)
            // If subscription is invalid (404 or 410), delete it
            if (err.statusCode === 404 || err.statusCode === 410) {
                return supabase
                    .from("push_subscriptions")
                    .delete()
                    .match({ subscription: sub.subscription })
            }
        })
    })

    await Promise.all(notifications)

    return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
    })
})
