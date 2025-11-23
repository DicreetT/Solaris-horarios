import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.1'

console.log('Push Notification Function Started')

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
)

Deno.serve(async (req) => {
    try {
        const payload = await req.json()

        // Expecting database webhook payload
        const { record } = payload

        if (!record || !record.user_id || !record.message) {
            return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 })
        }

        console.log(`Processing notification for user: ${record.user_id}`)

        // Fetch subscriptions for the user
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('subscription')
            .eq('user_id', record.user_id)

        if (error) {
            console.error('Error fetching subscriptions:', error)
            return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        }

        if (!subscriptions || subscriptions.length === 0) {
            console.log('No subscriptions found for user')
            return new Response(JSON.stringify({ message: 'No subscriptions found' }), { status: 200 })
        }

        const notificationPayload = JSON.stringify({
            title: 'Lunaris',
            body: record.message,
            url: '/', // Or specific URL based on notification type
        })

        const promises = subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(sub.subscription, notificationPayload)
                return { success: true }
            } catch (err) {
                console.error('Error sending push notification:', err)
                if (err.statusCode === 410) {
                    // Subscription is gone, remove it
                    // Ideally we would delete it from DB here, but we need the ID or full matching record
                    // For now, we just log it.
                    console.log('Subscription expired/gone')
                }
                return { success: false, error: err }
            }
        })

        await Promise.all(promises)

        return new Response(JSON.stringify({ message: 'Notifications processed' }), {
            headers: { 'Content-Type': 'application/json' },
        })

    } catch (err) {
        console.error('Unexpected error:', err)
        return new Response(JSON.stringify({ error: err.message }), { status: 500 })
    }
})
