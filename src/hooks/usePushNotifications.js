import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications(currentUser) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subscription, setSubscription] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setIsLoading(false);
            return;
        }

        const checkAndSubscribe = async () => {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                setIsLoading(false);
                return;
            }

            try {
                const registration = await navigator.serviceWorker.ready;
                const existingSubscription = await registration.pushManager.getSubscription();

                if (existingSubscription) {
                    setSubscription(existingSubscription);
                    setIsSubscribed(true);
                } else if (Notification.permission === 'granted') {
                    // If permission is already granted, auto-subscribe
                    await subscribeToPush();
                } else if (Notification.permission !== 'denied') {
                    // If permission is default, try to subscribe (might need user gesture in some browsers)
                    // We'll attempt it, but if it fails, the user can use the button.
                    subscribeToPush().catch(err => console.log('Auto-subscribe failed (likely needs gesture):', err));
                }
            } catch (error) {
                console.error('Error in auto-subscription check:', error);
            } finally {
                setIsLoading(false);
            }
        };

        checkAndSubscribe();
    }, [currentUser]);

    const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const subscribeToPush = async () => {
        if (!currentUser) return;
        setIsLoading(true);
        setError(null);

        try {
            if (!VAPID_PUBLIC_KEY) {
                throw new Error('VAPID Public Key is missing in environment variables.');
            }

            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            setSubscription(sub);
            setIsSubscribed(true);

            // Save subscription to Supabase
            const { error: dbError } = await supabase
                .from('push_subscriptions')
                .upsert({
                    user_id: currentUser.id,
                    subscription: sub,
                    user_agent: navigator.userAgent,
                }, { onConflict: 'user_id, user_agent' });

            if (dbError) throw dbError;

        } catch (err) {
            console.error('Failed to subscribe to push notifications:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const unsubscribeFromPush = async () => {
        if (!subscription) return;
        setIsLoading(true);

        try {
            await subscription.unsubscribe();

            // Remove from Supabase
            if (currentUser) {
                await supabase
                    .from('push_subscriptions')
                    .delete()
                    .match({
                        user_id: currentUser.id,
                        user_agent: navigator.userAgent
                    });
            }

            setSubscription(null);
            setIsSubscribed(false);
        } catch (err) {
            console.error('Error unsubscribing', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isSubscribed,
        subscription,
        subscribeToPush,
        unsubscribeFromPush,
        isLoading,
        error
    };
}
